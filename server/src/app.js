import express from 'express'
import fs from 'node:fs'
import path from 'node:path'
import { createApiRouter } from './routes/analyze.js'
import { createAuthRouter } from './routes/auth.js'
import { loadEntries } from './services/retrieve.js'
import { DEFAULT_CONFIG } from './services/score.js'
import { createDb } from './db.js'
import { authenticate } from './services/authService.js'
import { corsMiddleware, rateLimit, defaultLimits } from './services/security.js'

const KNOWLEDGE_DIR = new URL('../../knowledge/', import.meta.url)

function loadJsonSafe(url) {
  try { return JSON.parse(fs.readFileSync(url, 'utf8')) } catch { return null }
}

function envNum(name) {
  const v = parseFloat(process.env[name] ?? '')
  return Number.isFinite(v) ? v : undefined
}

// deps 注入便于测试：{ chatWithImage, entries, scoreConfig, db, limits, corsOrigins, staticDir }
export function createApp(deps = {}) {
  const entries = deps.entries ?? loadEntries(new URL('entries.jsonl', KNOWLEDGE_DIR))
  const constraints = loadJsonSafe(new URL('constraints.json', KNOWLEDGE_DIR))
  const db = deps.db ?? createDb()
  const limits = deps.limits ?? defaultLimits()
  const corsOrigins = deps.corsOrigins
    ?? (process.env.CORS_ORIGINS || 'http://localhost:5173').split(',').map(s => s.trim()).filter(Boolean)
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
  if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1) // 反代（Caddy/nginx）后取真实 IP 用于限流
  app.use(express.json({ limit: '15mb' }))
  app.use(corsMiddleware(corsOrigins))
  app.use('/api', rateLimit(limits.global))

  // Bearer token → req.auth（可选；游客/匿名调用 analyze/report 不需要登录）
  app.use('/api', (req, _res, next) => {
    const match = /^Bearer (.+)$/.exec(req.headers.authorization ?? '')
    req.token = match?.[1] ?? null
    req.auth = authenticate(db, req.token)
    next()
  })

  app.get('/api/health', (_req, res) => res.json({ ok: true }))
  // 登录/注册是撞库与暴力破解目标，限流最严
  app.use('/api/auth', rateLimit(limits.auth))
  app.use('/api', createAuthRouter({ db }))
  app.use('/api/analyze', rateLimit(limits.analyze)) // LLM 成本保护
  app.use('/api', createApiRouter({
    chatWithImage: deps.chatWithImage ?? undefined,
    entries,
    scoreConfig,
    db,
    kbVersion: `entries-${entries.length}${constraints?.version ? `+constraints-${constraints.version}` : ''}`,
  }))

  // 生产模式：托管前端构建产物（SPA 回退到 index.html），单进程同域部署免 CORS
  const staticDir = deps.staticDir ?? process.env.FRONTEND_DIST
  if (staticDir && fs.existsSync(staticDir)) {
    app.use(express.static(staticDir))
    app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(staticDir, 'index.html')))
  }
  return app
}
