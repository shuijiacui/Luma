import { useCallback, useEffect, useRef } from 'react'

import { requestNiloStroke, type NiloStrokeSpec } from '@/lib/api/lumaApi'
import { createLocalNiloStroke, nextCodrawIntent, type CodrawMode } from '../niloCodraw'

/** 一人一笔：停笔后很快接上（配合落笔时预取，基本是秒回） */
const TURN_REVEAL_DELAY_MS = 450
/** 停笔询问：停笔约 2 秒后问孩子要不要 Nilo 接一笔 */
const ASK_DELAY_MS = 2000
/** 模型还没回来就先本地兜底，孩子不等待 */
const MODEL_WAIT_MS = 1200
/** 预取节流：孩子连续画时不要每一笔都请求模型 */
const PREFETCH_MIN_INTERVAL_MS = 4000
/** 孩子拒绝后，20 秒内不再追问 */
const ASK_COOLDOWN_MS = 20000
/** 单次请求上限（服务端另有 2.6s 兜底） */
const REQUEST_TIMEOUT_MS = 9000

interface Options {
  mode: CodrawMode
  token?: string
  getSnapshot: () => string | null
  drawStroke: (spec: NiloStrokeSpec) => Promise<void> | void
  onSpeech: (text: string | null) => void
  onAsk: (open: boolean) => void
  onDrawn: () => void
  /** 孩子最后一笔（让 Nilo 呼应/延伸） */
  getLastStroke?: () => { points: { x: number; y: number }[]; color: string; width: number } | null
  /** 画面内容分布 4×4（让 Nilo 贴着内容下笔） */
  getInkGrid?: () => number[] | null
  /** 隐藏 Nilo 时：不讲话、不弹询问（turn 模式仍可安静地添笔） */
  silent?: boolean
}

/**
 * Nilo 共创回合逻辑：
 * - turn（一人一笔）：孩子每次停笔后由 Nilo 接一笔；落笔/停笔都会预取，模型慢就用本地规则笔触；
 * - ask（停笔询问）：停笔约 2 秒后问孩子"要不要 Nilo 接一笔"，同意才画；
 * - 连续作画期间保持安静，不会打断孩子。
 */
export function useNiloCodraw(options: Options) {
  const ref = useRef(options)
  ref.current = options
  const modeRef = useRef(options.mode)
  modeRef.current = options.mode

  const drawingRef = useRef(false)
  const busyRef = useRef(false)
  const strokeCountRef = useRef(0)
  const revealTimerRef = useRef<number | null>(null)
  const askTimerRef = useRef<number | null>(null)
  const declinedAtRef = useRef(-Infinity)
  // 最近画过的形状（最多 4 个）：让 Nilo 换着来，别总是星星
  const recentKindsRef = useRef<string[]>([])
  const prefetchRef = useRef<{ key: string; at: number; promise: Promise<NiloStrokeSpec | null> } | null>(null)
  // 模型返回较慢（约 5-6s）：迟到的结果先存起来，下一回合直接用，不浪费
  const readyRef = useRef<{ spec: NiloStrokeSpec; at: number } | null>(null)

  const clearTimers = useCallback(() => {
    if (revealTimerRef.current !== null) { window.clearTimeout(revealTimerRef.current); revealTimerRef.current = null }
    if (askTimerRef.current !== null) { window.clearTimeout(askTimerRef.current); askTimerRef.current = null }
  }, [])

  const reset = useCallback(() => {
    clearTimers()
    prefetchRef.current = null
    busyRef.current = false
    drawingRef.current = false
    ref.current.onAsk(false)
    ref.current.onSpeech(null)
  }, [clearTimers])

  useEffect(() => clearTimers, [clearTimers])
  useEffect(() => { reset() }, [options.mode, reset])

  /** 预取下一笔：同一张画面或节流窗口内复用，避免重复请求模型 */
  const prefetch = useCallback((): Promise<NiloStrokeSpec | null> => {
    const snapshot = ref.current.getSnapshot()
    if (!snapshot) return Promise.resolve(null)
    const now = Date.now()
    const existing = prefetchRef.current
    if (existing && (existing.key === snapshot || now - existing.at < PREFETCH_MIN_INTERVAL_MS)) {
      return existing.promise
    }
    const base64 = snapshot.includes(',') ? (snapshot.split(',')[1] ?? '') : snapshot
    const promise = requestNiloStroke(base64, {
      token: ref.current.token,
      mode: modeRef.current === 'ask' ? 'ask' : 'turn',
      strokes: strokeCountRef.current,
      lastStroke: ref.current.getLastStroke?.() ?? null,
      inkGrid: ref.current.getInkGrid?.() ?? [],
      intent: nextCodrawIntent(strokeCountRef.current),
      recentKinds: [...recentKindsRef.current],
      signal: typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(REQUEST_TIMEOUT_MS) : undefined,
    })
      .then(res => {
        const spec = res.stroke ?? null
        if (spec) readyRef.current = { spec, at: Date.now() }
        return spec
      })
      .catch(() => null)
    prefetchRef.current = { key: snapshot, promise, at: now }
    return promise
  }, [])

  /** 让 Nilo 落一笔：模型没及时回来就用本地规则笔触 */
  const runTurn = useCallback(async () => {
    if (busyRef.current || drawingRef.current) return
    busyRef.current = true
    ref.current.onAsk(false)
    if (!ref.current.silent) ref.current.onSpeech('Nilo 想一想…')
    const spec = await Promise.race([
      prefetch(),
      new Promise<null>(resolve => { window.setTimeout(() => resolve(null), MODEL_WAIT_MS) }),
    ])
    // 模型还没回来时：先用上一回合迟到的 AI 结果；再没有才用本地规则笔触
    const cached = readyRef.current && Date.now() - readyRef.current.at < 60000 ? readyRef.current.spec : null
    if (cached) readyRef.current = null
    const stroke = spec ?? cached ?? createLocalNiloStroke(strokeCountRef.current, {
      inkGrid: ref.current.getInkGrid?.() ?? null,
      intent: nextCodrawIntent(strokeCountRef.current),
      avoidKinds: [...recentKindsRef.current],
    })
    recentKindsRef.current = [...recentKindsRef.current, stroke.kind].slice(-4)
    try {
      await ref.current.drawStroke(stroke)
    } catch {
      /* 画布不可用时静默忽略，下一回合再试 */
    }
    if (!ref.current.silent) ref.current.onSpeech(stroke.say ?? null)
    ref.current.onDrawn()
    busyRef.current = false
  }, [prefetch])

  /** 孩子落笔：收起提示、取消待接的一笔（连续作画不打扰） */
  const onStrokeStart = useCallback(() => {
    drawingRef.current = true
    clearTimers()
    // 孩子落笔时就预取：等他停笔时模型往往已经想好了（真正秒回）
    if (modeRef.current !== 'off') void prefetch()
    ref.current.onAsk(false)
    ref.current.onSpeech(null)
  }, [clearTimers, prefetch])

  /** 孩子停笔：预取下一笔；turn 模式稍后接一笔，ask 模式约 2 秒后询问 */
  const onStrokeEnd = useCallback(() => {
    drawingRef.current = false
    strokeCountRef.current += 1
    if (modeRef.current === 'off') return
    if (ref.current.silent && modeRef.current === 'ask') return
    void prefetch()
    if (modeRef.current === 'turn') {
      revealTimerRef.current = window.setTimeout(() => {
        revealTimerRef.current = null
        void runTurn()
      }, TURN_REVEAL_DELAY_MS)
      return
    }
    askTimerRef.current = window.setTimeout(() => {
      askTimerRef.current = null
      if (ref.current.silent) return
      if (drawingRef.current || busyRef.current) return
      if (Date.now() - declinedAtRef.current < ASK_COOLDOWN_MS) return
      ref.current.onSpeech(null)
      ref.current.onAsk(true)
    }, ASK_DELAY_MS)
  }, [prefetch, runTurn])

  const accept = useCallback(() => {
    ref.current.onAsk(false)
    void runTurn()
  }, [runTurn])

  const decline = useCallback(() => {
    declinedAtRef.current = Date.now()
    ref.current.onAsk(false)
    ref.current.onSpeech(null)
  }, [])

  return { onStrokeStart, onStrokeEnd, accept, decline, reset }
}
