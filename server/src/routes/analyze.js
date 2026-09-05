// POST /api/analyze + POST /api/report（docs/API契约.md）
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { Router } from 'express'
import { extractFeatures, mergeFeatures } from '../services/extractFeatures.js'
import { dispatchEntries } from '../services/kbDispatcher.js'
import { score } from '../services/score.js'
import { buildReport, buildFeedback, FOLLOW_UP, buildParentNarrativePrompt, validateParentNarrative, buildWebAdvicePrompt, validateWebAdvice, buildEvidencePlainPrompt, validateEvidencePlain } from '../services/report.js'
import { bochaSearch, searchQueryFor } from '../services/webSearch.js'
import { insertAnalysis, attachReport } from '../services/historyService.js'
import { log } from '../services/logger.js'
import { traceNode } from '../services/tracing.js'
import { retrieveReferences, buildReferenceFilterPrompt, validateReferenceFilter } from '../services/referenceRag.js'

export function createApiRouter({ chatWithImage, chatText = null, webSearch = null, entries, constraints = {}, scoreConfig, db, kbVersion = 'unknown', uploadDir = path.resolve('uploads') }) {
  const router = Router()

  router.get('/analyses/:analysisId/image', (req, res) => {
    if (!req.auth) return res.status(401).json({ error: 'login required' })
    const row = db.prepare('SELECT child_id, family_id, image_path, image_mime FROM analyses WHERE id = ?').get(req.params.analysisId)
    if (!row?.image_path) return res.status(404).json({ error: 'image not found' })
    const allowed = (req.auth.role === 'child' && req.auth.accountId === row.child_id)
      || (req.auth.role === 'parent' && req.auth.familyId === row.family_id)
    if (!allowed) return res.status(403).json({ error: 'forbidden' })
    // 兼容旧绝对路径与新相对文件名，保证数据库可跨机器移植
    const imagePath = path.isAbsolute(row.image_path)
      ? row.image_path
      : path.join(uploadDir, row.image_path)
    if (!fs.existsSync(imagePath)) return res.status(404).json({ error: 'image not found' })
    res.type(row.image_mime || 'image/png').sendFile(imagePath)
  })

  router.post('/analyze', async (req, res) => {
    const { imageBase64, priorFeatures = null } = req.body ?? {}
    if (typeof imageBase64 !== 'string' || !imageBase64.trim()) {
      return res.status(400).json({ error: 'imageBase64 required' })
    }
    let features
    try {
      const fresh = await extractFeatures(imageBase64, { chatWithImage })
      features = priorFeatures ? mergeFeatures(priorFeatures, fresh) : fresh
    } catch (err) {
      log.error('analyze', { msg: `feature extraction failed: ${err.message}` })
      return res.status(502).json({ error: 'feature_extraction_failed' })
    }
    // 登录孩子：分析落库，保存受控图片副本供家长端查看
    let analysisId = null
    if (db && req.auth?.role === 'child') {
      try {
        const match = imageBase64.match(/^data:(image\/(?:png|jpeg|jpg|webp));base64,(.+)$/i)
        const encoded = match ? match[2] : imageBase64
        const buffer = Buffer.from(encoded, 'base64')
        if (!buffer.length || buffer.length > 10 * 1024 * 1024) throw new Error('invalid image size')
        const mime = match?.[1]?.toLowerCase() ?? 'image/png'
        fs.mkdirSync(uploadDir, { recursive: true })
        const fileName = `${crypto.randomUUID()}.bin`
        fs.writeFileSync(path.join(uploadDir, fileName), buffer, { flag: 'wx' })
        analysisId = insertAnalysis(db, {
          childId: req.auth.accountId, familyId: req.auth.familyId, features,
          feedbackText: buildFeedback(features), followUp: FOLLOW_UP,
          image: { path: fileName, mime, size: buffer.length, sha256: crypto.createHash('sha256').update(buffer).digest('hex') },
        })
      } catch (err) {
        log.error('analyze', { msg: `analysis persistence failed: ${err.message}` })
        return res.status(500).json({ error: 'analysis_persistence_failed' })
      }
    }
    traceNode('analyze_features', { elements: features.elements ?? [], darkRatio: features.colors?.darkRatio ?? null, dropped: features.droppedDimensions ?? [] })
    res.json({ features, feedbackText: buildFeedback(features), followUp: FOLLOW_UP, ...(analysisId && { analysisId }) })
  })

  router.post('/report', async (req, res) => {
    const { features: clientFeatures, analysisId = null, childAge = null } = req.body ?? {}
    if (!clientFeatures || typeof clientFeatures !== 'object') {
      return res.status(400).json({ error: 'features required' })
    }
    let features = clientFeatures
    if (analysisId && req.auth) {
      const saved = db.prepare('SELECT child_id, family_id, features_json FROM analyses WHERE id = ?').get(analysisId)
      if (!saved) return res.status(404).json({ error: 'analysis not found' })
      const allowed = (req.auth.role === 'child' && req.auth.accountId === saved.child_id)
        || (req.auth.role === 'parent' && req.auth.familyId === saved.family_id)
      if (!allowed) return res.status(403).json({ error: 'forbidden' })
      features = JSON.parse(saved.features_json)
    }
    // 调度器：年龄调制 → 标签匹配 → L3 共现门槛 → 冲突处置（知识库调度.md）
    const { hits: matches, conflicts, dropped } = dispatchEntries({
      features, entries, constraints,
      childAge: Number.isInteger(childAge) ? childAge : null,
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
        const raw = await chatText(buildParentNarrativePrompt(result, report), { maxTokens: 900 })
        narrative = validateParentNarrative(raw)
      } catch (err) {
        log.error('report_narrative', { msg: `narrative generation failed: ${err.message}` })
      }
    }
    // 把知识库证据改写成家长能读懂的人话（保留 entryId 可追溯）
    let evidencePlain = null
    if (chatText && report.evidence.length > 0) {
      try {
        const raw = await chatText(buildEvidencePlainPrompt(report.evidence), { maxTokens: 600 })
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
        const retrieved = (await retrieveReferences(query)).results ?? []
        if (retrieved.length) {
          const filtered = validateReferenceFilter(await chatText(buildReferenceFilterPrompt(query, retrieved), { maxTokens: 700 }), retrieved)
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
        const pages = await webSearch(searchQueryFor(result.emotion))
        if (pages && pages.length > 0) {
          const rawAdvice = await chatText(buildWebAdvicePrompt(pages), { maxTokens: 500 })
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
    // 登录用户带 analysisId：报告回写历史记录（归属校验失败静默跳过，不影响返回）
    if (db && req.auth && analysisId) {
      attachReport(db, analysisId, enrichedReport, req.auth, {
        knowledgeVersion: kbVersion,
        matchedEntryIds: matches.map(m => m.id),
        conflicts,
        dropped,
        reason: result.reason,
      })
    }
    res.json(enrichedReport)
  })

  return router
}
