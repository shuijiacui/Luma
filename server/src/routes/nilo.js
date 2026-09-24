// POST /api/nilo/stroke —— Nilo 添一笔（结构化指令）
// POST /api/nilo/praise —— Nilo 看着孩子的画说一句具体夸奖 + 下一步建议
import { Router } from 'express'
import { asyncRoute } from '../services/http.js'
import { NILO_STROKE_KINDS, generateNiloPraise, generateNiloStroke } from '../services/niloCompanion.js'
import { generateNiloDialogue, sanitizeDialogueContext, validateBounds } from '../services/niloDialogue.js'
import { voiceCapabilities, voiceConfig, transcribeVoice, synthesizeVoice } from '../services/voice.js'
import { defaultLimits, rateLimit } from '../services/security.js'
import { interpretVoiceEdit } from '../services/niloVoiceIntent.js'
import { ageBandForBirthDate } from '../services/niloAgeGuidance.js'

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
  db,
  chatWithImage,
  chatText,
  generate = generateNiloStroke,
  generatePraise = generateNiloPraise,
  generateDialogue = generateNiloDialogue,
  voice = {},
  timeoutMs,
  limits = {},
} = {}) {
  const router = Router()
  const configuredLimits = { ...defaultLimits(), ...limits }
  // One conversation may use ASR, drawing and TTS; each has its own finite cost bucket.
  // Read-only capabilities must not consume any model-call allowance.
  const drawingLimit = rateLimit(configuredLimits.nilo)
  const asrLimit = rateLimit(configuredLimits.niloVoiceAsr)
  const ttsLimit = rateLimit(configuredLimits.niloVoiceTts)
  const capabilitiesLimit = rateLimit(configuredLimits.niloCapabilities)

  const childOnly = (req, res, next) => req.auth && req.auth.role !== 'child'
    ? res.status(403).json({ error: 'child account required' }) : next()
  const cancellable = run => asyncRoute(async (req, res) => {
    const controller = new AbortController()
    const abort = () => { if (!res.writableEnded) controller.abort() }
    req.once('aborted', abort)
    res.once('close', abort)
    try {
      const result = await run(req, controller.signal)
      if (!controller.signal.aborted) res.json(result)
    } finally {
      req.off('aborted', abort)
      res.off('close', abort)
    }
  })

  router.post('/companion', childOnly, drawingLimit, cancellable(async (req, signal) => {
    if (!req.body?.context || typeof req.body.context !== 'object' || Array.isArray(req.body.context)) {
      throw Object.assign(new Error('context required'), { status: 400 })
    }
    let imageBase64
    if (req.body.imageBase64 !== undefined) {
      // Companion requests use a small snapshot; do not send a full-resolution export.
      if (typeof req.body.imageBase64 !== 'string' || req.body.imageBase64.length > 2 * 1024 * 1024) throw Object.assign(new Error('image too large'), { status: 400 })
      const image = readImage(req.body)
      if (image.error) throw Object.assign(new Error(image.error), { status: image.status })
      imageBase64 = image.encoded
    }
    let focusImage
    if (req.body.focusImage !== undefined) {
      const focus = req.body.focusImage
      const bounds = validateBounds(focus?.bounds)
      if (!imageBase64 || !bounds || typeof focus?.imageBase64 !== 'string' || focus.imageBase64.length > 1024 * 1024) {
        throw Object.assign(new Error('invalid focus image'), { status: 400 })
      }
      const image = readImage(focus)
      if (image.error) throw Object.assign(new Error(image.error), { status: image.status })
      focusImage = { imageBase64: image.encoded, bounds }
    }
    const context = sanitizeDialogueContext(req.body.context)
    // The child's verified profile is the only age source. Guests and children
    // without a birth date receive the general, non-assessing conversation style.
    const birthDate = req.auth?.role === 'child' && db
      ? db.prepare("SELECT birth_date FROM accounts WHERE id = ? AND role = 'child'").get(req.auth.accountId)?.birth_date
      : null
    context.ageBand = ageBandForBirthDate(birthDate)
    return generateDialogue({ imageBase64, focusImage, context, chatWithImage, chatText, timeoutMs, signal })
  }))

  router.get('/voice/config', childOnly, capabilitiesLimit, (_req, res) => {
    res.set('Cache-Control', 'no-store')
    res.json(voiceCapabilities(voice.config ?? voiceConfig()))
  })
  router.post('/voice/interpret', childOnly, drawingLimit, cancellable((req, signal) => interpretVoiceEdit(req.body, { chatText, signal })))
  router.post('/voice/transcribe', childOnly, asrLimit, cancellable((req, signal) => transcribeVoice(req.body, { ...voice, signal })))
  router.post('/voice/speak', childOnly, ttsLimit, cancellable((req, signal) => synthesizeVoice(req.body, { ...voice, signal })))

  router.post('/stroke', childOnly, drawingLimit, asyncRoute(async (req, res) => {
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

  router.post('/praise', childOnly, drawingLimit, asyncRoute(async (req, res) => {
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
