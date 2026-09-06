// 带自动 token 轮换的请求封装：
// 401 → 用 localStorage 里的 refreshToken 换新 token 对 → 重试一次（旋转式，旧 refresh 作废）
// 游客（无 refreshToken）直接透传，不触发刷新
import { apiClient, ApiError } from '@/lib/api/client'
import { getStoredSession, saveSession, removeSession } from '@/features/auth/storage'

interface RefreshResponse {
  token: string
  refreshToken: string
}

type RequestOptions = Omit<RequestInit, 'body'> & { body?: unknown }

const authHeaders = (token?: string): Record<string, string> =>
  token ? { Authorization: `Bearer ${token}` } : {}

let refreshing: Promise<RefreshResponse> | null = null // 并发请求共享同一次刷新
let refreshingFor: string | undefined
const rotatedOwners = new Map<string, string>()

export function currentToken(fallback?: string) {
  if (!fallback) return undefined
  const stored = getStoredSession()
  if (!stored?.token) throw new ApiError(401, 'session changed')
  if (fallback !== stored.token && rotatedOwners.get(fallback) !== stored.id) throw new ApiError(401, 'session changed')
  return stored.token
}

/** 供图片等非 JSON 请求复用同一套轮换逻辑（见 lib/api/authedImage.ts） */
export async function refreshTokens(): Promise<RefreshResponse> {
  const stored = getStoredSession()
  if (!stored?.refreshToken) throw new ApiError(401, 'login required')
  if (!refreshing || refreshingFor !== stored.refreshToken) {
    refreshingFor = stored.refreshToken
    const pending = apiClient<RefreshResponse>('/auth/refresh', {
    method: 'POST',
    body: { refreshToken: stored.refreshToken },
    }).finally(() => { if (refreshing === pending) refreshing = null })
    refreshing = pending
  }
  let pair: RefreshResponse
  try { pair = await refreshing } catch (error) {
    if (error instanceof ApiError && error.status === 401 && getStoredSession()?.refreshToken === stored.refreshToken) removeSession()
    throw error
  }
  const current = getStoredSession()
  if (current?.id !== stored.id || (current.refreshToken !== stored.refreshToken && current.refreshToken !== pair.refreshToken)) throw new ApiError(401, 'session changed')
  if (stored.token) rotatedOwners.set(stored.token, stored.id)
  if (rotatedOwners.size > 100) rotatedOwners.delete(rotatedOwners.keys().next().value!)
  if (current.token !== pair.token) saveSession({ ...current, token: pair.token, refreshToken: pair.refreshToken })
  return pair
}

export async function authFetch<T>(
  path: string,
  options: RequestOptions & { token?: string } = {},
): Promise<T> {
  const { token, ...rest } = options
  const owner = getStoredSession()?.id
  const send = (t?: string) =>
    apiClient<T>(path, { ...rest, headers: { ...authHeaders(t), ...rest.headers } })
  try {
    return await send(currentToken(token))
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) throw error
    const stored = getStoredSession()
    if (stored?.id !== owner || !token) throw error
    if (!stored?.refreshToken) throw error // 游客/无 refresh，直接失败
    const pair = await refreshTokens()
    return send(pair.token)
  }
}
