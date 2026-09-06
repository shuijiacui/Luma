// Luma 判定服务 API（docs/API契约.md，base 默认 /api，由 vite proxy 转发到 localhost:3001）
import { authFetch } from '@/lib/api/authFetch'

export interface FeatureJSON {
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
): Promise<AnalyzeResponse> {
  return authFetch<AnalyzeResponse>('/analyze', {
    method: 'POST',
    token,
    body: { imageBase64, priorFeatures, submissionKey, source: 'digital_canvas' },
  })
}

export function fetchReport(
  features: FeatureJSON | null,
  opts: { token?: string; analysisId?: string } = {},
): Promise<ReportResponse> {
  return authFetch<ReportResponse>('/report', {
    method: 'POST',
    token: opts.token,
    body: { features, analysisId: opts.analysisId ?? null },
  })
}
