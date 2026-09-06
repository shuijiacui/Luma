// 账号/家庭/历史 API（server /api/auth/*，Bearer token 会话 + 自动 refresh）
import { apiClient } from '@/lib/api/client'
import { authFetch } from '@/lib/api/authFetch'
import type { ReportResponse } from '@/lib/api/lumaApi'
import type { AuthSession } from '@/features/auth/types'

export interface AuthApiResponse {
  token: string
  refreshToken: string
  session: AuthSession
  family: { inviteCode: string }
}

export interface MeResponse {
  session: AuthSession
  family: { inviteCode: string }
  children: { id: string; nickname: string; createdAt: string; birthDate?: string | null }[]
}

export interface AnalysisSummary {
  id: string
  createdAt: string
  imageUrl: string | null
  rawDescription: string | null
  feedback: { feedbackText: string; followUp: string | null } | null
  summary: {
    elements: string[]
    darkRatio: number | null
    distortions: string[]
  }
  /**
   * 与 POST /api/report 的响应同构（后端 historyService.listAnalyses 按同一组字段投影），
   * 因此可直接复用 ReportResponse，无需在消费侧强转。audit 只在历史接口出现。
   */
  report: (ReportResponse & {
    audit?: { knowledgeVersion: string; matchedEntryIds: string[]; conflicts: string[]; dropped: unknown[]; reason: string } | null
  }) | null
}

export interface TrendResponse {
  total: number
  withReport: number
  direction: 'insufficient' | 'stable' | 'watch'
  counts: Record<string, number>
  points: { createdAt: string; emotion: string; confidence: number }[]
}

export function registerParentApi(details: { name: string; email: string; password: string }) {
  return apiClient<AuthApiResponse>('/auth/parent/register', { method: 'POST', body: details })
}

export function loginParentApi(details: { email: string; password: string }) {
  return apiClient<AuthApiResponse>('/auth/parent/login', { method: 'POST', body: details })
}

export function registerChildApi(details: { nickname: string; creationCode: string; inviteCode: string }) {
  return apiClient<AuthApiResponse>('/auth/child/register', { method: 'POST', body: details })
}

export function loginChildApi(details: { nickname: string; creationCode: string }) {
  return apiClient<AuthApiResponse>('/auth/child/login', { method: 'POST', body: details })
}

export function fetchMe(token: string) {
  return authFetch<MeResponse>('/auth/me', { token })
}

export function logoutApi(token: string) {
  return authFetch<{ ok: boolean }>('/auth/logout', { method: 'POST', token })
}

export async function listAnalyses(childId: string, token: string) {
  const analyses: AnalysisSummary[] = []
  let offset: number | null = 0
  while (offset !== null) {
    const page: { analyses: AnalysisSummary[]; nextOffset: number | null } = await authFetch(
      `/children/${encodeURIComponent(childId)}/analyses?limit=100&offset=${offset}`, { token })
    analyses.push(...page.analyses)
    if (page.nextOffset !== null && page.nextOffset <= offset) throw new Error('invalid pagination')
    offset = page.nextOffset
  }
  return { analyses: Array.from(new Map(analyses.map(a => [a.id, a])).values()) }
}

export function fetchTrend(childId: string, token: string) {
  return authFetch<TrendResponse>(`/children/${childId}/trend`, { token })
}
