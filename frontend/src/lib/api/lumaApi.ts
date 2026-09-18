// Luma 判定服务 API（docs/API契约.md，base 默认 /api，由 vite proxy 转发到 localhost:3001）
import { authFetch } from '@/lib/api/authFetch'
import { getLocale } from '@/i18n/store'
import type { BrushKind } from '@/features/child/brushes'

export interface FeatureJSON {
  provenance?: 'child' | 'co-created' | 'unknown'
  analysisScope?: 'child-only'
  rawDescription: string
  elements: string[]
  colors: { dominant: string[]; darkRatio: number } | null
  composition: {
    size: 'small' | 'normal' | 'large'
    position: 'center' | 'corner' | 'edge'
    pressure: 'light' | 'normal' | 'heavy'
  } | null
  distortions: string[]
  erasureMarks: number
  confidence: Record<string, number>
  droppedDimensions?: string[]
}

export interface AnalyzeResponse {
  features: FeatureJSON
  feedbackText: string
  followUp: string
  feedbackTextEn?: string
  followUpEn?: string
  /** 登录孩子时返回：本次分析已落库，report 凭此回写历史 */
  analysisId?: string
}

export type Emotion =
  | '乐观平稳'
  | '未见明显风险信号'
  | '焦虑倾向'
  | '低落倾向'
  | '需要关注'
  | '信息不足'

export interface ReportResponse {
  language?: 'zh' | 'en'
  narrative?: string
  emotion: Emotion
  confidence: number
  evidence: { entryId: string; summary: string; clusterLabel?: string; plain?: string | null }[]
  parentAdvice: string[]
  webAdvice?: string[]
  webAdviceSource?: string
  referenceEvidence?: { sourceFile: string; text: string; limitation: string; role: string }[]
  referenceEvidenceSource?: string
}

export function analyzeDrawing(
  imageBase64: string,
  priorFeatures: FeatureJSON | null = null,
  token?: string,
  submissionKey?: string,
  provenance: 'child' | 'co-created' | 'unknown' = 'child',
  display?: { artworkId?: string; revision?: number; displayImageBase64?: string },
): Promise<AnalyzeResponse> {
  return authFetch<AnalyzeResponse>('/analyze', {
    method: 'POST',
    token,
    body: { imageBase64, priorFeatures, submissionKey, source: 'digital_canvas', provenance,
      artworkId: display?.artworkId, artworkRevision: display?.revision, displayImageBase64: display?.displayImageBase64 },
  })
}

export interface NiloStrokePoint {
  x: number
  y: number
}

/** Nilo 帮孩子添的一笔（AI 决策，前端负责动画落笔） */
export interface NiloStrokeSpec {
  kind: string
  points: NiloStrokePoint[]
  color: string
  width: number
  brushKind?: BrushKind
  say?: string
}

export interface NiloStrokeResponse {
  stroke: NiloStrokeSpec | null
  /** true 表示模型超时/失败，由前端本地规则笔触兜底 */
  fallback?: boolean
}

/**
 * 请求 Nilo 的下一笔：把孩子当前画面交给后端模型，只返回结构化笔迹指令。
 * 模型慢/失败时返回 { stroke: null }，前端自动用本地规则笔触，孩子不会等待。
 */
export function requestNiloStroke(
  imageBase64: string,
  opts: {
    token?: string
    mode: 'turn' | 'ask'
    strokes?: number
    recentColors?: string[]
    /** 孩子最后一笔（归一化坐标），让 Nilo 呼应/延伸 */
    lastStroke?: { points: { x: number; y: number }[]; color: string; width: number } | null
    /** 画面内容分布（4×4=16 个 0-1），让 Nilo 贴着内容下笔 */
    inkGrid?: number[] | null
    /** 本轮意图：陪一个伙伴 / 补细节 / 呼应最后一笔 */
    intent?: 'companion' | 'detail' | 'echo'
    /** 最近已经画过的形状：让模型换着来，别老是星星 */
    recentKinds?: string[]
    locale?: 'zh' | 'en'
    signal?: AbortSignal
  },
): Promise<NiloStrokeResponse> {
  return authFetch<NiloStrokeResponse>('/nilo/stroke', {
    method: 'POST',
    token: opts.token,
    signal: opts.signal,
    body: {
      imageBase64,
      mode: opts.mode,
      context: {
        locale: opts.locale ?? getLocale(),
        strokes: opts.strokes ?? 0,
        recentColors: opts.recentColors ?? [],
        lastStroke: opts.lastStroke ?? null,
        inkGrid: opts.inkGrid ?? [],
        intent: opts.intent ?? 'companion',
        recentKinds: opts.recentKinds ?? [],
      },
    },
  })
}

export interface NiloPraiseResponse {
  praise: string
  suggestion: string
}

/** 让 Nilo 看着孩子的画说一句具体的夸奖 + 下一步建议（模型慢/失败时前端用本地分析兜底） */
export function requestNiloPraise(
  imageBase64: string,
  opts: {
    token?: string
    strokes?: number
    recentColors?: string[]
    lastStroke?: { points: { x: number; y: number }[]; color: string; width: number } | null
    inkGrid?: number[] | null
    locale?: 'zh' | 'en'
    signal?: AbortSignal
  } = {},
): Promise<NiloPraiseResponse> {
  return authFetch<NiloPraiseResponse>('/nilo/praise', {
    method: 'POST',
    token: opts.token,
    signal: opts.signal,
    body: {
      imageBase64,
      context: {
        locale: opts.locale ?? getLocale(),
        strokes: opts.strokes ?? 0,
        recentColors: opts.recentColors ?? [],
        lastStroke: opts.lastStroke ?? null,
        inkGrid: opts.inkGrid ?? [],
      },
    },
  })
}

export function fetchReport(
  features: FeatureJSON | null,
  opts: { token?: string; analysisId?: string } = {},
): Promise<ReportResponse> {
  return authFetch<ReportResponse>('/report', {
    method: 'POST',
    token: opts.token,
    body: { features, analysisId: opts.analysisId ?? null, locale: getLocale() },
  })
}
