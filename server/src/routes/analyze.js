// POST /api/analyze + POST /api/report（docs/API契约.md）
import { Router } from 'express'
import { extractFeatures, mergeFeatures } from '../services/extractFeatures.js'
import { dispatchEntries } from '../services/kbDispatcher.js'
import { score } from '../services/score.js'
import { buildReport, buildFeedback, FOLLOW_UP } from '../services/report.js'
import { insertAnalysis, attachReport } from '../services/historyService.js'
import { log } from '../services/logger.js'

export function createApiRouter({ chatWithImage, entries, constraints = {}, scoreConfig, db, kbVersion = 'unknown' }) {
  const router = Router()

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
    // 登录孩子：分析落库，返回 analysisId 供 report 关联（游客不落库）
    let analysisId = null
    if (db && req.auth?.role === 'child') {
      analysisId = insertAnalysis(db, { childId: req.auth.accountId, familyId: req.auth.familyId, features })
    }
    res.json({ features, feedbackText: buildFeedback(features), followUp: FOLLOW_UP, ...(analysisId && { analysisId }) })
  })

  router.post('/report', (req, res) => {
    const { features, analysisId = null, childAge = null } = req.body ?? {}
    if (!features || typeof features !== 'object') {
      return res.status(400).json({ error: 'features required' })
    }
    // 调度器：年龄调制 → 标签匹配 → L3 共现门槛 → 冲突处置（知识库调度.md）
    const { hits: matches, conflicts, dropped } = dispatchEntries({
      features, entries, constraints,
      childAge: Number.isInteger(childAge) ? childAge : null,
    })
    const result = score(matches, features, scoreConfig)
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
    // 登录用户带 analysisId：报告回写历史记录（归属校验失败静默跳过，不影响返回）
    if (db && req.auth && analysisId) {
      attachReport(db, analysisId, report, req.auth)
    }
    res.json(report)
  })

  return router
}
