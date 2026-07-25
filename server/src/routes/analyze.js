// POST /api/analyze + POST /api/report（docs/API契约.md）
import { Router } from 'express'
import { extractFeatures, mergeFeatures } from '../services/extractFeatures.js'
import { retrieve } from '../services/retrieve.js'
import { score } from '../services/score.js'
import { buildReport, buildFeedback, FOLLOW_UP } from '../services/report.js'

export function createApiRouter({ chatWithImage, entries, scoreConfig }) {
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
      console.error('[analyze] feature extraction failed:', err.message)
      return res.status(502).json({ error: 'feature_extraction_failed' })
    }
    res.json({ features, feedbackText: buildFeedback(features), followUp: FOLLOW_UP })
  })

  router.post('/report', (req, res) => {
    const { features } = req.body ?? {}
    if (!features || typeof features !== 'object') {
      return res.status(400).json({ error: 'features required' })
    }
    const matches = retrieve(features, entries)
    const result = score(matches, features, scoreConfig)
    console.info(`[report] emotion=${result.emotion} confidence=${result.confidence} reason=${result.reason} hits=${matches.map(m => m.id).join(',') || '-'}`)
    res.json(buildReport(result))
  })

  return router
}
