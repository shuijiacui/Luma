import express from 'express'
import fs from 'node:fs'
import { createApiRouter } from './routes/analyze.js'
import { createAuthRouter } from './routes/auth.js'
import { loadEntries } from './services/retrieve.js'
import { DEFAULT_CONFIG } from './services/score.js'
import { createDb } from './db.js'
import { authenticate } from './services/authService.js'

const KNOWLEDGE_DIR = new URL('../../knowledge/', import.meta.url)

function loadJsonSafe(url) {
  try { return JSON.parse(fs.readFileSync(url, 'utf8')) } catch { return null }
}

function envNum(name) {
  const v = parseFloat(process.env[name] ?? '')
  return Number.isFinite(v) ? v : undefined
}

// deps 注入便于测试：{ chatWithImage, entries, scoreConfig, db }
export function createApp(deps = {}) {
  const entries = deps.entries ?? loadEntries(new URL('entries.jsonl', KNOWLEDGE_DIR))
  const constraints = loadJsonSafe(new URL('constraints.json', KNOWLEDGE_DIR))
  const db = deps.db ?? createDb()
  const scoreConfig = deps.scoreConfig ?? {
    ...DEFAULT_CONFIG,
    threshold: envNum('CONFIDENCE_THRESHOLD') ?? DEFAULT_CONFIG.threshold,
    ceiling: envNum('CONFIDENCE_CEILING') ?? DEFAULT_CONFIG.ceiling,
    fpr: envNum('FALSE_POSITIVE_RATE') ?? DEFAULT_CONFIG.fpr,
    priors: {
      ...DEFAULT_CONFIG.priors,
      低落倾向: envNum('PRIOR_DISTRESS') ?? DEFAULT_CONFIG.priors.低落倾向,
      焦虑倾向: envNum('PRIOR_DISTRESS') ?? DEFAULT_CONFIG.priors.焦虑倾向,
      乐观平稳: envNum('PRIOR_POSITIVE') ?? DEFAULT_CONFIG.priors.乐观平稳,
    },
    validIds: new Set(entries.map(e => e.id)),
    redLineWords: constraints?.redLineWords ?? DEFAULT_CONFIG.redLineWords,
  }

  const app = express()
  app.use(express.json({ limit: '15mb' }))
  // Demo 联调用宽松 CORS（SPA 同源经 vite proxy，跨源仅本地开发）
  app.use((req, res, next) => {
    res.set('Access-Control-Allow-Origin', '*')
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    res.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
    if (req.method === 'OPTIONS') return res.sendStatus(204)
    next()
  })

  // Bearer token → req.auth（可选；游客/匿名调用 analyze/report 不需要登录）
  app.use('/api', (req, _res, next) => {
    const match = /^Bearer (.+)$/.exec(req.headers.authorization ?? '')
    req.token = match?.[1] ?? null
    req.auth = authenticate(db, req.token)
    next()
  })

  app.get('/api/health', (_req, res) => res.json({ ok: true }))
  app.use('/api', createAuthRouter({ db }))
  app.use('/api', createApiRouter({
    chatWithImage: deps.chatWithImage ?? undefined,
    entries,
    scoreConfig,
    db,
  }))
  return app
}
