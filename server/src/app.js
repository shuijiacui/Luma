import express from 'express'
import fs from 'node:fs'
import path from 'node:path'
import { createApiRouter } from './routes/analyze.js'
import { createAuthRouter } from './routes/auth.js'
import { createArtworkRouter } from './routes/artworks.js'
import { createNiloRouter } from './routes/nilo.js'
import { createCommunicationRouter } from './routes/communication.js'
import { createDb } from './db.js'
import { authenticate } from './services/authService.js'
import { corsMiddleware, rateLimit, defaultLimits } from './services/security.js'
import { chatText, chatMessages, llmConfig } from './services/llmClient.js'
import { startReportScheduler } from './services/periodReports.js'

// deps 注入便于测试：{ chatWithImage, db, limits, corsOrigins, staticDir }
export function createApp(deps = {}) {
  const db = deps.db ?? createDb()
  const limits = deps.limits ?? defaultLimits()
  const corsOrigins = deps.corsOrigins
    ?? (process.env.CORS_ORIGINS || 'http://localhost:5173').split(',').map(s => s.trim()).filter(Boolean)
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
  app.use('/api/artworks', createArtworkRouter({ db }))
  app.use('/api', createCommunicationRouter({
    db, limits, timeoutMs: deps.communicationTimeoutMs,
    chatText: deps.communicationChatText ?? (process.env.NODE_ENV !== 'test' && llmConfig().apiKey ? chatText : null),
    chatMessages: deps.parentChatMessages ?? (process.env.NODE_ENV !== 'test' && llmConfig().apiKey ? chatMessages : null),
    chatTimeoutMs: deps.parentChatTimeoutMs,
  }))
  app.use('/api/analyze', rateLimit(limits.analyze)) // LLM 成本保护
  app.use('/api/report', rateLimit(limits.analyze))
  // Nilo routes split drawing, transcription, speech and capability quotas; global still applies.
  app.use('/api/nilo', createNiloRouter({
    db,
    chatWithImage: deps.chatWithImage ?? undefined,
    chatText: deps.chatText ?? (process.env.NODE_ENV === 'test' ? null : chatText),
    timeoutMs: deps.niloTimeoutMs,
    voice: deps.voice,
    limits,
  }))
  app.use('/api', createApiRouter({
    chatWithImage: deps.chatWithImage ?? undefined,
    db,
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
