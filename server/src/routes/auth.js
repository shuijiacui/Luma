// /api/auth/*：注册/登录/会话；/api/children/:id/analyses：画作历史
import { Router } from 'express'
import {
  AuthError, registerParent, loginParent, registerChild, loginChild, logout, getMe, refresh, verifyParentPassword,
} from '../services/authService.js'
import { listAnalyses, trendSummary } from '../services/historyService.js'
import { generateChildReports, REPORT_TIME_ZONE } from '../services/periodReports.js'
import { deleteFamily } from '../services/familyDeletion.js'

function handle(fn) {
  return (req, res) => {
    try {
      const body = req.body ?? {}
      if (typeof body !== 'object' || Array.isArray(body) || Object.values(body).some(v => typeof v !== 'string' || v.length > 1024)) {
        return res.status(400).json({ error: 'invalid request fields' })
      }
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

export function createAuthRouter({ db, uploadDir }) {
  const router = Router()

  router.post('/auth/parent/register', handle(body => registerParent(db, body)))
  router.post('/auth/parent/login', handle(body => loginParent(db, body)))
  router.post('/auth/child/register', handle(body => registerChild(db, body)))
  router.post('/auth/child/login', handle(body => loginChild(db, body)))

  // refresh token 轮换：旧 refresh 作废，返回新 token 对
  router.post('/auth/refresh', (req, res) => {
    try {
      if (typeof req.body?.refreshToken !== 'string' || req.body.refreshToken.length > 256) return res.status(400).json({ error: 'invalid refreshToken' })
      res.json(refresh(db, req.body?.refreshToken))
    } catch (err) {
      if (err instanceof AuthError) return res.status(err.status).json({ error: err.message })
      throw err
    }
  })

  router.post('/auth/logout', (req, res) => {
    logout(db, req.token)
    res.json({ ok: true })
  })

  router.get('/auth/me', (req, res) => {
    if (!requireAuth(req, res)) return
    res.json(getMe(db, req.auth))
  })

  router.post('/auth/family/delete', (req, res) => {
    if (!requireAuth(req, res)) return
    if (req.auth.role !== 'parent') return res.status(403).json({ error: 'parent account required' })
    if (req.body?.confirmation !== '删除整个家庭') return res.status(400).json({ error: '请输入“删除整个家庭”确认注销' })
    // 403 avoids treating an incorrect reauthentication password as an expired session.
    if (!verifyParentPassword(db, req.auth, req.body?.password)) return res.status(403).json({ error: '密码不正确，未删除任何数据' })
    res.json(deleteFamily(db, req.auth.familyId, uploadDir))
  })

  router.get('/children/:childId/digests', (req, res) => {
    if (!requireAuth(req, res)) return
    const child = db.prepare("SELECT family_id FROM accounts WHERE id = ? AND role = 'child'").get(req.params.childId)
    if (req.auth.role !== 'parent' || child?.family_id !== req.auth.familyId) return res.status(403).json({ error: 'forbidden' })
    const kind = req.query.kind ?? 'weekly'
    const limit = Number(req.query.limit ?? 12)
    const offset = Number(req.query.offset ?? 0)
    if (!['weekly', 'monthly'].includes(kind) || !Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0) return res.status(400).json({ error: 'invalid report query' })
    generateChildReports(db, req.params.childId)
    const reports = db.prepare('SELECT * FROM period_reports WHERE child_id = ? AND kind = ? ORDER BY period_start DESC LIMIT ? OFFSET ?').all(req.params.childId, kind, limit, offset)
      .map(row => ({ id: row.id, kind: row.kind, periodStart: row.period_start, periodEnd: row.period_end, generatedAt: row.generated_at, summary: JSON.parse(row.summary_json) }))
    const total = db.prepare('SELECT COUNT(*) AS n FROM period_reports WHERE child_id = ? AND kind = ?').get(req.params.childId, kind).n
    res.json({ reports, timeZone: REPORT_TIME_ZONE, total, nextOffset: offset + reports.length < total ? offset + reports.length : null })
  })

  router.post('/children/:childId/profile', (req, res) => {
    if (!requireAuth(req, res)) return
    const child = db.prepare("SELECT family_id FROM accounts WHERE id = ? AND role = 'child'").get(req.params.childId)
    if (req.auth.role !== 'parent' || child?.family_id !== req.auth.familyId) return res.status(403).json({ error: 'forbidden' })
    const birthDate = req.body?.birthDate
    const date = typeof birthDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(birthDate) ? new Date(birthDate) : null
    if (birthDate !== null && (!date || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== birthDate || date > new Date() || date.getTime() < Date.now() - 19 * 366 * 86400000)) {
      return res.status(400).json({ error: '请输入有效的儿童出生日期' })
    }
    db.prepare('UPDATE accounts SET birth_date = ? WHERE id = ?').run(birthDate, req.params.childId)
    res.json({ ok: true })
  })

  router.get('/children/:childId/analyses', (req, res) => {
    if (!requireAuth(req, res)) return
    const limit = Number(req.query.limit ?? 50)
    const offset = Number(req.query.offset ?? 0)
    if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0) return res.status(400).json({ error: 'invalid pagination' })
    const rows = listAnalyses(db, req.params.childId, req.auth, { limit, offset })
    if (!rows) return res.status(403).json({ error: 'forbidden' })
    const total = db.prepare('SELECT COUNT(*) AS n FROM analyses WHERE child_id = ?').get(req.params.childId).n
    res.json({ analyses: rows, total, nextOffset: offset + rows.length < total ? offset + rows.length : null })
  })

  router.get('/children/:childId/trend', (req, res) => {
    if (!requireAuth(req, res)) return
    const trend = trendSummary(db, req.params.childId, req.auth)
    if (!trend) return res.status(403).json({ error: 'forbidden' })
    res.json(trend)
  })

  return router
}
