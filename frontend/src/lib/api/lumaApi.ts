// Luma 判定服务 API（docs/API契约.md，base 默认 /api，由 vite proxy 转发到 localhost:3001）
import { apiClient } from '@/lib/api/client'

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
}

export type Emotion =
  | '乐观平稳'
  | '未见明显风险信号'
  | '焦虑倾向'
  | '低落倾向'
  | '需要关注'
  | '信息不足'

export interface ReportResponse {
  emotion: Emotion
  confidence: number
  evidence: { entryId: string; summary: string }[]
  parentAdvice: string[]
}

export function analyzeDrawing(
  imageBase64: string,
  priorFeatures: FeatureJSON | null = null,
): Promise<AnalyzeResponse> {
  return apiClient<AnalyzeResponse>('/analyze', {
    method: 'POST',
    body: { imageBase64, priorFeatures },
  })
}

export function fetchReport(features: FeatureJSON): Promise<ReportResponse> {
  return apiClient<ReportResponse>('/report', {
    method: 'POST',
    body: { features },
  })
}
