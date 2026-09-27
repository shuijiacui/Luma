import crypto from 'node:crypto'
import { Router } from 'express'
import {
  normalizeParentQuestionnaireAnswers,
  scoreParentQuestionnaire,
} from '../../../shared/parentQuestionnaire.mjs'

const AGE_MIN = 5
const AGE_MAX = 12
const PAGE_SIZE = 24

function serialize(row) {
  return {
    id: row.id,
    revision: row.revision,
    childAge: row.child_age,
    answers: JSON.parse(row.answers_json),
    scores: JSON.parse(row.scores_json),
    createdAt: row.created_at,
  }
}

export function createParentQuestionnaireRouter({ db }) {
  const router = Router()
  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store')
    if (!req.auth) return res.status(401).json({ error: 'login required' })
    if (req.auth.role !== 'parent') return res.status(403).json({ error: 'parent account required' })
    next()
  })

  router.get('/', (req, res) => {
    const row = db.prepare(`SELECT * FROM parent_questionnaire_versions
      WHERE parent_id = ? ORDER BY revision DESC LIMIT 1`).get(req.auth.accountId)
    res.json({ response: row ? serialize(row) : null })
  })

  router.get('/history', (req, res) => {
    const offset = Number(req.query.offset ?? 0)
    if (!Number.isSafeInteger(offset) || offset < 0) return res.status(400).json({ error: 'invalid pagination' })
    const rows = db.prepare(`SELECT * FROM parent_questionnaire_versions
      WHERE parent_id = ? ORDER BY revision DESC LIMIT ? OFFSET ?`).all(
      req.auth.accountId,
      PAGE_SIZE + 1,
      offset,
    )
    res.json({
      responses: rows.slice(0, PAGE_SIZE).map(serialize),
      nextOffset: rows.length > PAGE_SIZE ? offset + PAGE_SIZE : null,
    })
  })

  router.post('/', (req, res) => {
    const answers = normalizeParentQuestionnaireAnswers(req.body?.answers)
    const childAge = Number(req.body?.childAge)
    const revision = req.body?.revision
    if (!answers || !Number.isInteger(childAge) || childAge < AGE_MIN || childAge > AGE_MAX) {
      return res.status(400).json({ error: 'invalid parent questionnaire' })
    }
    if (!Number.isSafeInteger(revision) || revision < 0) {
      return res.status(400).json({ error: 'invalid revision' })
    }

    const latest = db.prepare(`SELECT revision FROM parent_questionnaire_versions
      WHERE parent_id = ? ORDER BY revision DESC LIMIT 1`).get(req.auth.accountId)
    const currentRevision = latest?.revision ?? 0
    if (revision !== currentRevision) {
      return res.status(409).json({ error: '问卷已在其他页面更新，请刷新后再试。', currentRevision })
    }

    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    const scores = scoreParentQuestionnaire(answers)
    try {
      db.prepare(`INSERT INTO parent_questionnaire_versions
        (id, parent_id, family_id, revision, child_age, answers_json, scores_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
        id,
        req.auth.accountId,
        req.auth.familyId,
        revision + 1,
        childAge,
        JSON.stringify(answers),
        JSON.stringify(scores),
        now,
      )
    } catch (error) {
      if (String(error?.message).includes('UNIQUE')) {
        return res.status(409).json({ error: '问卷已在其他页面更新，请刷新后再试。', currentRevision })
      }
      throw error
    }

    const row = db.prepare('SELECT * FROM parent_questionnaire_versions WHERE id = ?').get(id)
    res.status(201).json(serialize(row))
  })

  return router
}
