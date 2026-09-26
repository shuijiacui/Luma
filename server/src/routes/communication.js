import { Router } from 'express'
import { asyncRoute } from '../services/http.js'
import { rateLimit } from '../services/security.js'
import { createCommunicationService } from '../services/communicationGuides.js'
import { chatSnapshot, createParentChatService, resetChat } from '../services/parentChat.js'

export function createCommunicationRouter({ db, chatText, chatMessages, timeoutMs, chatTimeoutMs, limits }) {
  const router = Router()
  const guides = createCommunicationService({ db, chatText, timeoutMs })
  const send = createParentChatService({ db, chatMessages, timeoutMs: chatTimeoutMs })
  router.get('/children/:childId/chat', (req, res) => {
    const locale = req.query.locale ?? 'zh'
    if (!['zh', 'en'].includes(locale)) return res.status(400).json({ error: 'invalid locale' })
    res.set('Cache-Control', 'no-store').json({ ...chatSnapshot(db, req.params.childId, req.auth, locale), available: Boolean(chatMessages) })
  })
  router.post('/children/:childId/chat', rateLimit(limits.parentChat ?? limits.analyze), asyncRoute(async (req, res) => {
    res.set('Cache-Control', 'no-store').json(await send(req.params.childId, req.auth, req.body))
  }))
  router.post('/children/:childId/chat/reset', (req, res) => {
    res.set('Cache-Control', 'no-store').json(resetChat(db, req.params.childId, req.auth, req.body?.revision))
  })
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
