// 账号/家庭/历史 API（server /api/auth/*，Bearer token 会话）
import { apiClient } from '@/lib/api/client'
import type { AuthSession } from '@/features/auth/types'

export interface AuthApiResponse {
  token: string
  session: AuthSession
  family: { inviteCode: string }
}

export interface MeResponse {
  session: AuthSession
  family: { inviteCode: string }
  children: { id: string; nickname: string; createdAt: string }[]
}

export interface AnalysisSummary {
  id: string
  createdAt: string
  summary: {
    elements: string[]
    darkRatio: number | null
    distortions: string[]
  }
  report: {
    emotion: string
    confidence: number
    evidence: { entryId: string; summary: string }[]
    parentAdvice: string[]
  } | null
}

const authHeaders = (token: string) => ({ Authorization: `Bearer ${token}` })

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
  return apiClient<MeResponse>('/auth/me', { headers: authHeaders(token) })
}

export function logoutApi(token: string) {
  return apiClient<{ ok: boolean }>('/auth/logout', { method: 'POST', headers: authHeaders(token) })
}

export function listAnalyses(childId: string, token: string) {
  return apiClient<{ analyses: AnalysisSummary[] }>(`/children/${childId}/analyses`, {
    headers: authHeaders(token),
  })
}
