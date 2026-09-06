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
import { chatText } from './services/llmClient.js'
import { bochaSearch } from './services/webSearch.js'
import { startReportScheduler } from './services/periodReports.js'

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
  const dispatchConfig = loadJsonSafe(new URL('dispatch.config.json', KNOWLEDGE_DIR))
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
    l23Cap: dispatchConfig?.tiers?.['2']?.groupEvidenceCap ?? DEFAULT_CONFIG.l23Cap,
  }

  const app = express()
  const uploadDir = path.resolve(deps.uploadDir ?? process.env.UPLOAD_DIR ?? 'uploads')
  app.locals.closeBackgroundJobs = startReportScheduler(db, {
    enabled: deps.periodReportsEnabled ?? (process.env.NODE_ENV !== 'test' && process.env.PERIOD_REPORTS_ENABLED !== '0'),
  })
  if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1) // 反代（Caddy/nginx）后取真实 IP 用于限流
  app.use(express.json({ limit: '15mb' }))
  app.use(corsMiddleware(corsOrigins))
  app.use('/api', rateLimit(limits.global))

  // Bearer token → req.auth（可选；游客/匿名调用 analyze/report 不需要登录）
  // 只认 Authorization 头。查询参数形式的 token 会进入访问日志、浏览器历史和 Referer，
  // 因此不再受理；<img> 无法携带头部，改由前端 fetch + blob URL 取图（见 useAuthedImage）
  app.use('/api', (req, res, next) => {
    const match = /^Bearer (.+)$/.exec(req.headers.authorization ?? '')
    req.token = match?.[1] ?? null
    req.auth = authenticate(db, req.token)
    if (req.headers.authorization && !req.auth && !['/auth/refresh', '/auth/logout'].includes(req.path)) {
      return res.status(401).json({ error: '登录已过期，请重新登录。' })
    }
    next()
  })

  app.get('/api/health', (_req, res) => res.json({ ok: true }))
  // 登录/注册是撞库与暴力破解目标，限流最严
  app.use('/api/auth', rateLimit(limits.auth))
  app.use('/api', createAuthRouter({ db, uploadDir }))
  app.use('/api/analyze', rateLimit(limits.analyze)) // LLM 成本保护
  app.use('/api/report', rateLimit(limits.analyze))
  app.use('/api', createApiRouter({
    chatWithImage: deps.chatWithImage ?? undefined,
    chatText: deps.chatText ?? (process.env.NODE_ENV === 'test' ? null : chatText),
    webSearch: deps.webSearch ?? (process.env.NODE_ENV === 'test' ? null : bochaSearch),
    retrieveReferences: deps.retrieveReferences ?? (process.env.NODE_ENV === 'test' ? async () => ({ results: [] }) : undefined),
    entries,
    constraints: constraints ?? {},
    scoreConfig,
    db,
    kbVersion: `entries-${entries.length}${constraints?.version ? `+constraints-${constraints.version}` : ''}`,
    uploadDir,
  }))

  // 生产模式：托管前端构建产物（SPA 回退到 index.html），单进程同域部署免 CORS
  const staticDir = deps.staticDir ?? process.env.FRONTEND_DIST
  if (staticDir && fs.existsSync(staticDir)) {
    app.use(express.static(staticDir))
    app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(staticDir, 'index.html')))
  }
  app.use((err, _req, res, _next) => {
    const status = Number.isInteger(err.status) && err.status >= 400 && err.status <= 599 ? err.status : 500
    if (status === 500) console.error('[request]', err.message)
    res.status(status).json({ error: status === 500 ? 'internal_server_error' : err.message })
  })
  return app
}
