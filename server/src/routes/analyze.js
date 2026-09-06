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
import { retrieveReferences, buildReferenceFilterPrompt, validateReferenceFilter } from '../services/referenceRag.js'

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
    const { imageBase64, submissionKey = null, source = null } = req.body ?? {}
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
    const existing = () => db && req.auth && submissionKey
      ? db.prepare('SELECT * FROM analyses WHERE child_id = ? AND submission_key = ?').get(req.auth.accountId, submissionKey) : null
    const returnExisting = row => {
      if (row.image_sha256 !== sha) return res.status(409).json({ error: 'submission key belongs to another image' })
      const stored = JSON.parse(row.features_json)
      return res.json({ features: stored, feedbackText: buildFeedback(stored), followUp: FOLLOW_UP, analysisId: row.id })
    }
    const previous = existing()
    if (previous) return returnExisting(previous)
    let features
    try {
      features = await extractFeatures(encoded, { chatWithImage })
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
      let writtenFile = null
      try {
        const concurrent = existing()
        if (concurrent) return returnExisting(concurrent)
        const match = imageBase64.match(/^data:(image\/(?:png|jpeg|jpg|webp));base64,(.+)$/i)
        const encoded = match ? match[2] : imageBase64
        const buffer = Buffer.from(encoded, 'base64')
        if (!buffer.length || buffer.length > 10 * 1024 * 1024) throw new Error('invalid image size')
        const mime = match?.[1]?.toLowerCase() ?? 'image/png'
        fs.mkdirSync(uploadDir, { recursive: true })
        const fileName = `${crypto.randomUUID()}.bin`
        fs.writeFileSync(path.join(uploadDir, fileName), buffer, { flag: 'wx' })
        writtenFile = path.join(uploadDir, fileName)
        analysisId = insertAnalysis(db, {
          childId: req.auth.accountId, familyId: req.auth.familyId, features,
          submissionKey,
          feedbackText: buildFeedback(features), followUp: FOLLOW_UP,
          image: { path: fileName, mime, size: buffer.length, sha256: crypto.createHash('sha256').update(buffer).digest('hex') },
        })
      } catch (err) {
        if (writtenFile) fs.rmSync(writtenFile, { force: true })
        log.error('analyze', { msg: `analysis persistence failed: ${err.message}` })
        return res.status(500).json({ error: 'analysis_persistence_failed' })
      }
    }
    traceNode('analyze_features', { elements: features.elements ?? [], darkRatio: features.colors?.darkRatio ?? null, dropped: features.droppedDimensions ?? [] })
    res.json({ features, feedbackText: buildFeedback(features), followUp: FOLLOW_UP, ...(analysisId && { analysisId }) })
  }))

  router.post('/report', asyncRoute(async (req, res) => {
    const { features: clientFeatures, analysisId = null, childAge = null } = req.body ?? {}
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
    const text = (prompt, opts) => bounded(() => chatText(prompt, { ...opts, signal: controller.signal }))
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
    const report = buildReport(result)
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
    const enrichedReport = { ...report }
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
