// 安全中间件：CORS 白名单 + 滑动窗口限流（零依赖）

// CORS：仅允许 CORS_ORIGINS（逗号分隔）中的来源；生产同源部署时无需 CORS
export function corsMiddleware(allowedOrigins) {
  const allowed = new Set(allowedOrigins)
  return (req, res, next) => {
    const origin = req.headers.origin
    if (origin && allowed.has(origin)) {
      res.set('Access-Control-Allow-Origin', origin)
      res.set('Vary', 'Origin')
      res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
      res.set('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS')
    }
    // 不允许的来源：不发 CORS 头，浏览器自行拦截（预检直接 204 但不带许可头）
    if (req.method === 'OPTIONS') return res.sendStatus(204)
    next()
  }
}

// 限流：滑动窗口计数，按 key（默认 IP）隔离
export function rateLimit({ windowMs, max, message = '请求太频繁，请稍后再试' }) {
  const hits = new Map() // key -> number[]（时间戳）
  // 定期清理，防内存泄漏
  const timer = setInterval(() => {
    const cutoff = Date.now() - windowMs
    for (const [key, list] of hits) {
      const fresh = list.filter(t => t > cutoff)
      if (fresh.length) hits.set(key, fresh)
      else hits.delete(key)
    }
  }, windowMs)
  timer.unref?.()

  return (req, res, next) => {
    const key = req.ip ?? req.socket.remoteAddress ?? 'unknown'
    const now = Date.now()
    const list = (hits.get(key) ?? []).filter(t => t > now - windowMs)
    if (list.length >= max) {
      res.set('Retry-After', String(Math.ceil(windowMs / 1000)))
      return res.status(429).json({ error: message })
    }
    list.push(now)
    hits.set(key, list)
    next()
  }
}

// 默认限流档位（env 可覆盖，测试可注入）
export function defaultLimits(env = process.env) {
  return {
    global: { windowMs: 15 * 60_000, max: num(env.RATE_LIMIT_GLOBAL, 600) },
    auth: { windowMs: 15 * 60_000, max: num(env.RATE_LIMIT_AUTH, 20), message: '尝试次数太多，请 15 分钟后再试' },
    analyze: { windowMs: 3600_000, max: num(env.RATE_LIMIT_ANALYZE, 60), message: '分析次数达到上限，请稍后再试' },
  }
}

function num(v, fallback) {
  const n = parseInt(v ?? '', 10)
  return Number.isFinite(n) && n > 0 ? n : fallback
}
