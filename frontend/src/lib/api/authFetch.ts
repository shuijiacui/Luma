// 带自动 token 轮换的请求封装：
// 401 → 用 localStorage 里的 refreshToken 换新 token 对 → 重试一次（旋转式，旧 refresh 作废）
// 游客（无 refreshToken）直接透传，不触发刷新
import { apiClient, ApiError } from '@/lib/api/client'
import { getStoredSession, saveSession } from '@/features/auth/storage'

interface RefreshResponse {
  token: string
  refreshToken: string
}

type RequestOptions = Omit<RequestInit, 'body'> & { body?: unknown }

const authHeaders = (token?: string): Record<string, string> =>
  token ? { Authorization: `Bearer ${token}` } : {}

let refreshing: Promise<RefreshResponse> | null = null // 并发请求共享同一次刷新

async function refreshTokens(): Promise<RefreshResponse> {
  const stored = getStoredSession()
  if (!stored?.refreshToken) throw new ApiError(401, 'login required')
  refreshing ??= apiClient<RefreshResponse>('/auth/refresh', {
    method: 'POST',
    body: { refreshToken: stored.refreshToken },
  }).finally(() => { refreshing = null })
  const pair = await refreshing
  saveSession({ ...stored, token: pair.token, refreshToken: pair.refreshToken })
  return pair
}

export async function authFetch<T>(
  path: string,
  options: RequestOptions & { token?: string } = {},
): Promise<T> {
  const { token, ...rest } = options
  const send = (t?: string) =>
    apiClient<T>(path, { ...rest, headers: { ...authHeaders(t), ...rest.headers } })
  try {
    return await send(token)
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) throw error
    const stored = getStoredSession()
    if (!stored?.refreshToken) throw error // 游客/无 refresh，直接失败
    const pair = await refreshTokens()
    return send(pair.token)
  }
}
