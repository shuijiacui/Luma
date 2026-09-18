// POST /api/analyze + POST /api/report（docs/API契约.md）
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { Router } from 'express'
import { extractFeatures, validateFeatures, gateFeatures } from '../services/extractFeatures.js'
import { asyncRoute } from '../services/http.js'
import { managedImagePath } from '../services/media.js'
import { dispatchEntries } from '../services/kbDispatcher.js'
import { score } from '../services/score.js'
import { buildReport, buildFeedback, FOLLOW_UP, buildParentNarrativePrompt, validateParentNarrative, buildWebAdvicePrompt, validateWebAdvice, buildEvidencePlainPrompt, validateEvidencePlain } from '../services/report.js'
import { bochaSearch, searchQueryFor } from '../services/webSearch.js'
import { insertAnalysis, attachReport } from '../services/historyService.js'
import { log } from '../services/logger.js'
import { traceNode } from '../services/tracing.js'
import { localeOf, localizeReport, englishFeedback, ENGLISH_FOLLOW_UP, ENGLISH_PROMPT } from '../services/localization.js'
import { retrieveReferences, buildReferenceFilterPrompt, validateReferenceFilter } from '../services/referenceRag.js'

function displayPng(value) {
  if (typeof value !== 'string') return null
  const encoded = value.replace(/^data:image\/png;base64,/i, '')
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) return null
  const buffer = Buffer.from(encoded, 'base64')
  if (buffer.length < 24 || buffer.length > 10 * 1024 * 1024 || buffer.toString('base64') !== encoded
    || buffer.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || buffer.toString('ascii', 12, 16) !== 'IHDR'
    || buffer.readUInt32BE(16) < 1 || buffer.readUInt32BE(20) < 1 || buffer.readUInt32BE(16) * buffer.readUInt32BE(20) > 32_000_000) return null
  return buffer
}

export function createApiRouter({ chatWithImage, chatText = null, webSearch = null, retrieveReferences: retrieveReferencesImpl = retrieveReferences, entries, constraints = {}, scoreConfig, db, kbVersion = 'unknown', uploadDir = path.resolve('uploads') }) {
  uploadDir = path.resolve(uploadDir)
  const router = Router()

  router.post('/analyses/:analysisId/delete', asyncRoute(async (req, res) => {
    if (!req.auth) return res.status(401).json({ error: 'login required' })
    const row = db.prepare('SELECT child_id, family_id, image_path FROM analyses WHERE id = ?').get(req.params.analysisId)
    if (!row) return res.status(404).json({ error: 'analysis not found' })
    if (req.auth.role !== 'parent' || req.auth.familyId !== row.family_id) return res.status(403).json({ error: 'forbidden' })
    const original = row.image_path ? managedImagePath(uploadDir, row.image_path) : null
    const staged = original && fs.existsSync(original) ? `${original}.deleting` : null
    if (staged) fs.renameSync(original, staged)
    db.exec('BEGIN IMMEDIATE')
    try {
      db.prepare('DELETE FROM period_reports WHERE child_id = ?').run(row.child_id)
      db.prepare('DELETE FROM analyses WHERE id = ?').run(req.params.analysisId)
      db.exec('COMMIT')
    } catch (error) { db.exec('ROLLBACK'); if (staged) fs.renameSync(staged, original); throw error }
    if (staged) { try { fs.rmSync(staged) } catch (error) { log.error('media_cleanup', { msg: error.message }) } }
    res.json({ ok: true })
  }))

  router.get('/analyses/:analysisId/image', (req, res) => {
    if (!req.auth) return res.status(401).json({ error: 'login required' })
    const row = db.prepare('SELECT child_id, family_id, image_path, image_mime FROM analyses WHERE id = ?').get(req.params.analysisId)
    if (!row?.image_path) return res.status(404).json({ error: 'image not found' })
    const allowed = (req.auth.role === 'child' && req.auth.accountId === row.child_id)
      || (req.auth.role === 'parent' && req.auth.familyId === row.family_id)
    if (!allowed) return res.status(403).json({ error: 'forbidden' })
    // 兼容旧绝对路径与新相对文件名，保证数据库可跨机器移植
    const imagePath = managedImagePath(uploadDir, row.image_path)
    if (!fs.existsSync(imagePath)) return res.status(404).json({ error: 'image not found' })
    res.type(row.image_mime || 'image/png').sendFile(imagePath)
  })

  router.post('/analyze', asyncRoute(async (req, res) => {
    const { imageBase64, submissionKey = null, source = null, provenance = 'child', artworkId, artworkRevision, displayImageBase64 } = req.body ?? {}
    if (!['child', 'co-created', 'unknown'].includes(provenance)) return res.status(400).json({ error: 'invalid provenance' })
    if (provenance === 'unknown') return res.status(422).json({ error: 'unknown_artwork_authorship', message: '无法区分旧画作中孩子与 AI 的笔迹，已保留作品，不进行儿童特征分析。' })
    if (typeof imageBase64 !== 'string' || !imageBase64.trim()) {
      return res.status(400).json({ error: 'imageBase64 required' })
    }
    if (submissionKey !== null && (typeof submissionKey !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(submissionKey))) {
      return res.status(400).json({ error: 'invalid submissionKey' })
    }
    if (req.auth && req.auth.role !== 'child') return res.status(403).json({ error: 'child account required' })
    const encoded = imageBase64.replace(/^data:image\/(?:png|jpeg|jpg|webp);base64,/i, '')
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length % 4 !== 0) return res.status(400).json({ error: 'invalid imageBase64' })
    const buffer = Buffer.from(encoded, 'base64')
    if (!buffer.length || buffer.length > 10 * 1024 * 1024) return res.status(400).json({ error: 'invalid image size' })
    const sha = crypto.createHash('sha256').update(buffer).digest('hex')
    let displayBuffer = buffer
    let displayMime = imageBase64.match(/^data:(image\/(?:png|jpeg|jpg|webp));base64,/i)?.[1]?.toLowerCase() ?? 'image/png'
    if (artworkId !== undefined || artworkRevision !== undefined) {
      if (displayImageBase64 !== undefined || typeof artworkId !== 'string' || !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(artworkId)
        || !Number.isSafeInteger(artworkRevision) || artworkRevision < 1) return res.status(400).json({ error: 'invalid artwork reference' })
      if (!db || req.auth?.role !== 'child') return res.status(401).json({ error: 'login required for artwork reference' })
      const saved = db.prepare('SELECT image_base64, revision, provenance FROM artworks WHERE id = ? AND child_id = ?').get(artworkId, req.auth.accountId)
      if (!saved) return res.status(404).json({ error: 'artwork not found' })
      if (saved.revision !== artworkRevision || saved.provenance !== provenance) return res.status(409).json({ error: 'artwork version or provenance changed' })
      displayBuffer = displayPng(saved.image_base64)
      if (!displayBuffer) return res.status(400).json({ error: 'invalid saved artwork image' })
      displayMime = 'image/png'
    } else if (displayImageBase64 !== undefined) {
      if (req.auth) return res.status(400).json({ error: 'use a saved artwork reference for the display image' })
      displayBuffer = displayPng(displayImageBase64)
      if (!displayBuffer) return res.status(400).json({ error: 'invalid display image' })
      displayMime = 'image/png'
    }
    const displaySha = crypto.createHash('sha256').update(displayBuffer).digest('hex')
    const existing = () => db && req.auth && submissionKey
      ? db.prepare('SELECT * FROM analyses WHERE child_id = ? AND submission_key = ?').get(req.auth.accountId, submissionKey) : null
    const returnExisting = row => {
      const stored = JSON.parse(row.features_json)
      if ((stored.analysisImageSha256 ?? row.image_sha256) !== sha) return res.status(409).json({ error: 'submission key belongs to another image' })
      if ((stored.provenance ?? 'child') !== provenance) return res.status(409).json({ error: 'submission key belongs to another provenance' })
      if ((stored.displayImageSha256 ?? row.image_sha256) !== displaySha
        || (stored.artworkId ?? null) !== (artworkId ?? null)
        || (stored.artworkRevision ?? null) !== (artworkRevision ?? null)) return res.status(409).json({ error: 'submission key belongs to another artwork display' })
      return res.json({ features: stored, feedbackText: buildFeedback(stored), followUp: FOLLOW_UP, feedbackTextEn: englishFeedback(stored), followUpEn: ENGLISH_FOLLOW_UP, analysisId: row.id })
    }
    const previous = existing()
    if (previous) return returnExisting(previous)
    let features
    try {
      features = await extractFeatures(encoded, { chatWithImage })
      features.provenance = provenance
      features.analysisScope = 'child-only'
      features.analysisImageSha256 = sha
      features.displayImageSha256 = displaySha
      features.displayScope = artworkId !== undefined || displayImageBase64 !== undefined ? 'composite' : 'child-only'
      if (artworkId !== undefined) { features.artworkId = artworkId; features.artworkRevision = artworkRevision }
      if (source === 'digital_canvas') features.source = 'digital_canvas'
    } catch (err) {
      log.error('analyze', { msg: `feature extraction failed: ${err.message}` })
      return res.status(502).json({ error: 'feature_extraction_failed' })
    }
    // 登录孩子：分析落库，保存受控图片副本供家长端查看
    let analysisId = null
    if (db && req.auth?.role === 'child') {
      if (!db.prepare("SELECT 1 FROM accounts WHERE id = ? AND family_id = ? AND role = 'child'").get(req.auth.accountId, req.auth.familyId)) {
        return res.status(401).json({ error: 'account no longer exists' })
      }
      if (artworkId !== undefined) {
        const latest = db.prepare('SELECT revision, provenance FROM artworks WHERE id = ? AND child_id = ?').get(artworkId, req.auth.accountId)
        if (!latest || latest.revision !== artworkRevision || latest.provenance !== provenance) return res.status(409).json({ error: 'artwork changed during analysis' })
      }
      let writtenFile = null
      try {
        const concurrent = existing()
        if (concurrent) return returnExisting(concurrent)
        fs.mkdirSync(uploadDir, { recursive: true })
        const fileName = `${crypto.randomUUID()}.bin`
        fs.writeFileSync(path.join(uploadDir, fileName), displayBuffer, { flag: 'wx' })
        writtenFile = path.join(uploadDir, fileName)
        analysisId = insertAnalysis(db, {
          childId: req.auth.accountId, familyId: req.auth.familyId, features,
          submissionKey,
          feedbackText: buildFeedback(features), followUp: FOLLOW_UP,
          // The media checksum matches retained bytes for backups; analysisImageSha256 deduplicates the child-only input.
          image: { path: fileName, mime: displayMime, size: displayBuffer.length, sha256: displaySha },
        })
      } catch (err) {
        if (writtenFile) fs.rmSync(writtenFile, { force: true })
        log.error('analyze', { msg: `analysis persistence failed: ${err.message}` })
        return res.status(500).json({ error: 'analysis_persistence_failed' })
      }
    }
    traceNode('analyze_features', { elements: features.elements ?? [], darkRatio: features.colors?.darkRatio ?? null, dropped: features.droppedDimensions ?? [] })
    res.json({ features, feedbackText: buildFeedback(features), followUp: FOLLOW_UP, feedbackTextEn: englishFeedback(features), followUpEn: ENGLISH_FOLLOW_UP, ...(analysisId && { analysisId }) })
  }))

  router.post('/report', asyncRoute(async (req, res) => {
    const { features: clientFeatures, analysisId = null, childAge = null } = req.body ?? {}
    const locale = localeOf(req.body?.locale)
    if (req.auth?.role === 'child') return res.status(403).json({ error: 'parent account required' })
    if (analysisId !== null && (typeof analysisId !== 'string' || analysisId.length > 100)) return res.status(400).json({ error: 'invalid analysisId' })
    if (analysisId && !req.auth) return res.status(401).json({ error: 'login required' })
    if (req.auth && !analysisId) return res.status(400).json({ error: 'analysisId required' })
    if (!analysisId && !clientFeatures) {
      return res.status(400).json({ error: 'features required' })
    }
    let features = clientFeatures
    let age = Number.isInteger(childAge) && childAge >= 0 && childAge <= 18 ? childAge : null
    if (analysisId && req.auth) {
      const saved = db.prepare('SELECT a.child_id, a.family_id, a.features_json, c.birth_date FROM analyses a JOIN accounts c ON c.id = a.child_id WHERE a.id = ?').get(analysisId)
      if (!saved) return res.status(404).json({ error: 'analysis not found' })
      const allowed = (req.auth.role === 'child' && req.auth.accountId === saved.child_id)
        || (req.auth.role === 'parent' && req.auth.familyId === saved.family_id)
      if (!allowed) return res.status(403).json({ error: 'forbidden' })
      features = JSON.parse(saved.features_json)
      if (saved.birth_date) {
        const birth = new Date(saved.birth_date)
        const now = new Date()
        age = now.getUTCFullYear() - birth.getUTCFullYear()
        if (now.getUTCMonth() < birth.getUTCMonth() || (now.getUTCMonth() === birth.getUTCMonth() && now.getUTCDate() < birth.getUTCDate())) age--
      } else age = null
    }
    try { validateFeatures(features, { gated: true }) } catch { return res.status(400).json({ error: 'invalid features' }) }
    features = gateFeatures(features).features
    const controller = new AbortController()
    const budgetMs = Math.max(100, Math.min(30000, Number(process.env.REPORT_BUDGET_MS) || 20000))
    const timer = setTimeout(() => controller.abort(), budgetMs)
    res.once('close', () => { clearTimeout(timer); controller.abort() })
    const bounded = async fn => {
      controller.signal.throwIfAborted()
      let abort
      try {
        return await Promise.race([fn(), new Promise((_, reject) => {
          abort = () => reject(new Error('report enhancement budget exceeded'))
          controller.signal.addEventListener('abort', abort, { once: true })
        })])
      } finally { if (abort) controller.signal.removeEventListener('abort', abort) }
    }
    const text = (prompt, opts) => bounded(() => chatText(prompt + (locale === 'en' ? ENGLISH_PROMPT : ''), { ...opts, signal: controller.signal }))
    // 调度器：年龄调制 → 标签匹配 → L3 共现门槛 → 冲突处置（知识库调度.md）
    const { hits: matches, conflicts, dropped } = dispatchEntries({
      features, entries, constraints,
      childAge: age,
    })
    const result = score(matches, features, scoreConfig)
    traceNode('report_score', { emotion: result.emotion, confidence: result.confidence, reason: result.reason, hits: matches.map(m => m.id), conflicts, dropped, kbVersion })
    // 判定审计快照（dispatch.config.json loading.auditSnapshot）：命中条目 ID + 知识库版本 + 冲突/丢弃
    log.audit(
      {
        emotion: result.emotion,
        confidence: result.confidence,
        reason: result.reason,
        hits: matches.map(m => m.id),
        conflicts,
        dropped,
        kbVersion,
      },
      { accountId: req.auth?.accountId ?? null, analysisId },
    )
    log.info('report', { msg: `emotion=${result.emotion} confidence=${result.confidence} reason=${result.reason} hits=${matches.map(m => m.id).join(',') || '-'}` })
    const report = localizeReport(buildReport(result), locale)
    let narrative = null
    if (chatText && report.evidence.length > 0) {
      try {
        const raw = await text(buildParentNarrativePrompt(result, report), { maxTokens: 900 })
        narrative = validateParentNarrative(raw)
      } catch (err) {
        log.error('report_narrative', { msg: `narrative generation failed: ${err.message}` })
      }
    }
    // 把知识库证据改写成家长能读懂的人话（保留 entryId 可追溯）
    let evidencePlain = null
    if (chatText && report.evidence.length > 0) {
      try {
        const raw = await text(buildEvidencePlainPrompt(report.evidence), { maxTokens: 600 })
        evidencePlain = validateEvidencePlain(raw, report.evidence.length)
      } catch (err) {
        log.error('report_evidence_plain', { msg: `evidence plain failed: ${err.message}` })
      }
    }
    // PDF 文献 RAG：只生成研究背景，不进入确定性评分链
    let referenceEvidence = null
    if (chatText && matches.length > 0) {
      try {
        const query = `${matches.map(m => m.cluster ?? m.id).join('、')} 儿童绘画研究局限`
        const retrieved = (await bounded(() => retrieveReferencesImpl(query, { signal: controller.signal }))).results ?? []
        if (retrieved.length) {
          const filtered = validateReferenceFilter(await text(buildReferenceFilterPrompt(query, retrieved), { maxTokens: 700 }), retrieved)
          if (filtered) referenceEvidence = filtered
        }
      } catch (err) {
        log.error('report_reference_rag', { msg: `reference RAG failed: ${err.message}` })
      }
    }
    // 联网搜索 → 家长沟通建议（只补陪伴类内容，标注来源，失败静默降级）
    let webAdvice = null
    if (webSearch && chatText) {
      try {
        const pages = await bounded(() => webSearch(searchQueryFor(result.emotion), { signal: controller.signal }))
        if (pages && pages.length > 0) {
          const rawAdvice = await text(buildWebAdvicePrompt(pages), { maxTokens: 500 })
          webAdvice = validateWebAdvice(rawAdvice)
        }
      } catch (err) {
        log.error('report_web_advice', { msg: `web advice failed: ${err.message}` })
      }
    }
    const enrichedReport = { ...report, provenance: features.provenance ?? 'unknown', analysisScope: features.analysisScope ?? 'legacy' }
    if (narrative) {
      enrichedReport.narrative = narrative.summary
      enrichedReport.parentAdvice = narrative.advice
    }
    if (evidencePlain) {
      enrichedReport.evidence = enrichedReport.evidence.map((e, i) => ({ ...e, plain: evidencePlain[i] ?? null }))
    }
    if (referenceEvidence) {
      enrichedReport.referenceEvidence = referenceEvidence
      enrichedReport.referenceEvidenceSource = 'PDF 文献检索（仅供研究背景参考）'
    }
    if (webAdvice) {
      enrichedReport.webAdvice = webAdvice
      enrichedReport.webAdviceSource = '网络搜索（仅供参考）'
    }
    if (features.provenance === 'co-created') {
      enrichedReport.provenanceNote = locale === 'en'
        ? 'Co-created with Nilo. This observation uses only the child’s strokes; their choices may still reflect the shared activity. It does not represent fully independent drawing.'
        : '这是一幅与 Nilo 合作完成的作品。本次观察只使用孩子自己的笔迹；创作选择仍可能受到共创过程影响，不代表完全独立绘画。'
      enrichedReport.parentAdvice = [enrichedReport.provenanceNote, ...(enrichedReport.parentAdvice ?? [])]
    }
    // The source can be removed while optional enrichment awaits an external service.
    if (db && req.auth && analysisId) {
      const saved = attachReport(db, analysisId, enrichedReport, req.auth, {
        knowledgeVersion: kbVersion,
        matchedEntryIds: matches.map(m => m.id),
        conflicts,
        dropped,
        reason: result.reason,
      })
      if (!saved) return res.status(404).json({ error: 'analysis no longer exists' })
    }
    res.json(enrichedReport)
  }))

  return router
}
