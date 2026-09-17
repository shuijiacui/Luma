// POST /api/nilo/stroke —— Nilo 添一笔（结构化指令）
// POST /api/nilo/praise —— Nilo 看着孩子的画说一句具体夸奖 + 下一步建议
import { Router } from 'express'
import { asyncRoute } from '../services/http.js'
import { NILO_STROKE_KINDS, generateNiloPraise, generateNiloStroke } from '../services/niloCompanion.js'

const MAX_IMAGE_BYTES = 10 * 1024 * 1024

function sanitizeLastStroke(stroke) {
  if (!stroke || typeof stroke !== 'object' || !Array.isArray(stroke.points)) return null
  const points = stroke.points.slice(0, 24).flatMap(point => {
    const x = Number(point?.x)
    const y = Number(point?.y)
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) return []
    return [{ x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 }]
  })
  if (points.length < 2) return null
  const width = Number(stroke.width)
  return {
    points,
    color: typeof stroke.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(stroke.color) ? stroke.color : '#6fa8d8',
    width: Number.isFinite(width) ? Math.min(40, Math.max(1, Math.round(width))) : 6,
  }
}

function safeContext(mode, context = {}) {
  return {
    mode: mode === 'ask' ? 'ask' : 'turn',
    locale: context?.locale === 'en' ? 'en' : 'zh',
    strokes: Math.max(0, Math.min(500, Math.trunc(Number(context?.strokes) || 0))),
    recentColors: Array.isArray(context?.recentColors)
      ? context.recentColors.filter(c => typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c)).slice(0, 6)
      : [],
    lastStroke: sanitizeLastStroke(context?.lastStroke),
    inkGrid: Array.isArray(context?.inkGrid)
      ? context.inkGrid.slice(0, 25).map(value => {
          const n = Number(value)
          return Number.isFinite(n) ? Math.min(1, Math.max(0, Math.round(n * 100) / 100)) : 0
        })
      : [],
    intent: ['companion', 'detail', 'echo'].includes(context?.intent) ? context.intent : 'companion',
    recentKinds: Array.isArray(context?.recentKinds)
      ? context.recentKinds.filter(kind => typeof kind === 'string' && NILO_STROKE_KINDS.includes(kind)).slice(0, 4)
      : [],
  }
}

/** 图片校验（两个接口共用）：返回 { encoded } 或 { error } */
function readImage(body) {
  const { imageBase64 } = body ?? {}
  if (typeof imageBase64 !== 'string' || !imageBase64.trim()) return { error: 'imageBase64 required', status: 400 }
  const encoded = imageBase64.replace(/^data:image\/(?:png|jpeg|jpg|webp);base64,/i, '')
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length % 4 !== 0) return { error: 'invalid imageBase64', status: 400 }
  const buffer = Buffer.from(encoded, 'base64')
  if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) return { error: 'invalid image size', status: 400 }
  return { encoded }
}

export function createNiloRouter({
  chatWithImage,
  generate = generateNiloStroke,
  generatePraise = generateNiloPraise,
  timeoutMs,
} = {}) {
  const router = Router()

  router.post('/stroke', asyncRoute(async (req, res) => {
    // 与 /analyze 一致：允许游客，但登录后必须是儿童账号
    if (req.auth && req.auth.role !== 'child') return res.status(403).json({ error: 'child account required' })
    const image = readImage(req.body)
    if (image.error) return res.status(image.status).json({ error: image.error })

    let result
    try {
      result = await generate({
        imageBase64: image.encoded,
        context: safeContext(req.body?.mode, req.body?.context),
        chatWithImage,
        timeoutMs,
      })
    } catch {
      result = { stroke: null }
    }
    if (!result?.stroke) return res.json({ stroke: null, fallback: true })
    return res.json({ stroke: result.stroke })
  }))

  router.post('/praise', asyncRoute(async (req, res) => {
    if (req.auth && req.auth.role !== 'child') return res.status(403).json({ error: 'child account required' })
    const image = readImage(req.body)
    if (image.error) return res.status(image.status).json({ error: image.error })

    let result
    try {
      result = await generatePraise({
        imageBase64: image.encoded,
        context: safeContext('turn', req.body?.context),
        chatWithImage,
        timeoutMs,
      })
    } catch {
      result = { praise: null }
    }
    if (!result?.praise) return res.json({ praise: null, fallback: true })
    return res.json({ praise: result.praise, suggestion: result.suggestion ?? '' })
  }))

  return router
}
