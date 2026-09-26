import { Router } from 'express'
import { asyncRoute } from '../services/http.js'
import { rateLimit } from '../services/security.js'
import { createCommunicationService } from '../services/communicationGuides.js'

export function createCommunicationRouter({ db, chatText, timeoutMs, limits }) {
  const router = Router()
  const guides = createCommunicationService({ db, chatText, timeoutMs })
  router.post('/children/:childId/communication', (req, res, next) => {
    if (!req.auth) return res.status(401).json({ error: 'login required' })
    if (req.auth.role !== 'parent') return res.status(403).json({ error: 'parent account required' })
    next()
  }, rateLimit(limits.analyze), asyncRoute(async (req, res) => {
    const locale = req.body?.locale ?? 'zh'
    if (!['zh', 'en'].includes(locale)) return res.status(400).json({ error: 'invalid locale' })
    res.set('Cache-Control', 'no-store').json(await guides(req.params.childId, req.auth, locale))
  }))
  return router
}
