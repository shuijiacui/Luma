// /api/auth/*：注册/登录/会话；/api/children/:id/analyses：画作历史
import { Router } from 'express'
import {
  AuthError, registerParent, loginParent, registerChild, loginChild, logout, getMe,
} from '../services/authService.js'
import { listAnalyses } from '../services/historyService.js'

function handle(fn) {
  return (req, res) => {
    try {
      res.status(201).json(fn(req.body ?? {}))
    } catch (err) {
      if (err instanceof AuthError) return res.status(err.status).json({ error: err.message })
      throw err
    }
  }
}

function requireAuth(req, res) {
  if (!req.auth) {
    res.status(401).json({ error: 'login required' })
    return false
  }
  return true
}

export function createAuthRouter({ db }) {
  const router = Router()

  router.post('/auth/parent/register', handle(body => registerParent(db, body)))
  router.post('/auth/parent/login', handle(body => loginParent(db, body)))
  router.post('/auth/child/register', handle(body => registerChild(db, body)))
  router.post('/auth/child/login', handle(body => loginChild(db, body)))

  router.post('/auth/logout', (req, res) => {
    logout(db, req.token)
    res.json({ ok: true })
  })

  router.get('/auth/me', (req, res) => {
    if (!requireAuth(req, res)) return
    res.json(getMe(db, req.auth))
  })

  router.get('/children/:childId/analyses', (req, res) => {
    if (!requireAuth(req, res)) return
    const rows = listAnalyses(db, req.params.childId, req.auth)
    if (!rows) return res.status(403).json({ error: 'forbidden' })
    res.json({ analyses: rows })
  })

  return router
}
