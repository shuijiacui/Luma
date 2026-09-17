import { useCallback, useEffect, useRef, useState } from 'react'

import { encourageLines } from '../components/otter'
import type { NiloPraise } from '../niloPraise'

/** 停笔后等待多久才说一句（避开连续作画） */
export const NILO_IDLE_DELAY_MS = 2600
/** 两次鼓励之间的最小间隔，避免说话太频繁 */
export const NILO_MIN_GAP_MS = 9000
/** 两次"看图夸奖"AI 请求之间的最小间隔 */
const AI_MIN_GAP_MS = 25000

export type NiloTalkKind = 'praise' | 'suggestion'

/** 没有本地分析时的建议兜底（夸奖/建议交替时会用到） */
const SUGGESTION_FALLBACK = [
  '可以试着画一条小鱼。',
  '要不要在旁边加一个小太阳？',
  '给它画一个好朋友吧。',
  '可以试试添一朵小花。',
]

interface Options {
  idleDelayMs?: number
  minGapMs?: number
  /** 关闭时完全不说鼓励语（例如 Nilo 正在陪伴作画 / 被隐藏） */
  enabled?: boolean
  /** 本地即时夸奖/建议：根据孩子最后一笔生成 */
  describe?: () => NiloPraise | null
  /** 模型看图夸奖 + 建议；返回 null 表示失败，保留本地内容 */
  requestPraise?: () => Promise<NiloPraise | null>
}

/**
 * 停笔后的 Nilo 说话：连续作画时保持安静，停笔一小会儿才说话。
 * 夸奖与建议**交替出现**（一次夸奖、一次建议），先本地即时回应，模型回来再替换成更贴合画面的那句。
 */
export function useIdleEncouragement({
  idleDelayMs = NILO_IDLE_DELAY_MS,
  minGapMs = NILO_MIN_GAP_MS,
  enabled = true,
  describe,
  requestPraise,
}: Options = {}) {
  const [line, setLine] = useState<string | null>(null)
  const [lineKind, setLineKind] = useState<NiloTalkKind>('praise')
  const timerRef = useRef<number | null>(null)
  const indexRef = useRef(-1)
  const turnRef = useRef(0)
  const lastSpokenAtRef = useRef(-Infinity)
  const lastAiAtRef = useRef(-Infinity)
  const aiTokenRef = useRef(0)

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  /** 落笔 / 重新开始：立刻收起提示，并取消待说的话与在途的 AI 请求 */
  const reset = useCallback(() => {
    clearTimer()
    aiTokenRef.current += 1
    setLine(null)
  }, [clearTimer])

  /** 一笔画完：安排「停笔一小会儿」之后说一句 */
  const onStrokeEnd = useCallback(() => {
    if (!enabled) return
    clearTimer()
    const sinceLastMs = Date.now() - lastSpokenAtRef.current
    const delayMs = Math.max(idleDelayMs, minGapMs - sinceLastMs)
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null
      lastSpokenAtRef.current = Date.now()
      // 夸奖与建议交替：第 1、3、5… 次夸；第 2、4、6… 次给建议
      turnRef.current += 1
      const praiseTurn = turnRef.current % 2 === 1
      const local = describe?.() ?? null
      if (praiseTurn) {
        if (local?.praise) {
          setLine(local.praise)
        } else {
          indexRef.current = (indexRef.current + 1) % encourageLines.length
          setLine(encourageLines[indexRef.current])
        }
        setLineKind('praise')
      } else {
        const suggestion = local?.suggestion
          ?? SUGGESTION_FALLBACK[Math.abs(turnRef.current) % SUGGESTION_FALLBACK.length]
        setLine(suggestion)
        setLineKind('suggestion')
      }

      // 模型看图：节流请求，回来时如果孩子还在停笔就替换成本地那句
      if (!requestPraise || Date.now() - lastAiAtRef.current < AI_MIN_GAP_MS) return
      lastAiAtRef.current = Date.now()
      const token = aiTokenRef.current
      requestPraise()
        .then(result => {
          if (!result || aiTokenRef.current !== token) return
          if (praiseTurn) {
            setLine(result.praise || result.suggestion)
            setLineKind('praise')
          } else {
            setLine(result.suggestion || result.praise)
            setLineKind('suggestion')
          }
        })
        .catch(() => { /* 模型失败时保留本地这 句 */ })
    }, delayMs)
  }, [clearTimer, describe, enabled, idleDelayMs, minGapMs, requestPraise])

  useEffect(() => clearTimer, [clearTimer])
  useEffect(() => { if (!enabled) reset() }, [enabled, reset])

  return { line, lineKind, onStrokeStart: reset, onStrokeEnd, reset }
}
