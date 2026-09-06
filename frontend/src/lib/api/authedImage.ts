// 受保护图片的取用：/api/analyses/:id/image 需要登录，但 <img> 发不出 Authorization 头。
// 曾经用 ?token= 查询参数绕过，代价是令牌进入访问日志、浏览器历史与 Referer；
// 现改为 fetch 带头部取 blob，再交给 <img> 用 object URL 渲染，令牌不出现在任何 URL 里。
import { env } from '@/config/env'
import { ApiError } from '@/lib/api/client'
import { refreshTokens, currentToken } from '@/lib/api/authFetch'
import { getStoredSession } from '@/features/auth/storage'

/**
 * 后端返回的是 `/api/analyses/<id>/image` 绝对路径，而 apiBaseUrl 可能是 `/api`
 * 或 `https://host/api`。这里统一剥掉重复的 `/api` 前缀再拼，两种部署都成立。
 */
function resolveImagePath(path: string): string {
  if (/^https?:\/\//i.test(path)) return path
  const base = env.apiBaseUrl.replace(/\/+$/, '')
  const rel = path.startsWith('/api/') ? path.slice('/api'.length) : path
  return `${base}${rel.startsWith('/') ? rel : `/${rel}`}`
}

async function requestBlob(url: string, token?: string): Promise<Blob> {
  const response = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!response.ok) throw new ApiError(response.status, `image request failed: ${response.status}`)
  return response.blob()
}

/**
 * 取受保护图片并返回 object URL。调用方负责在不再使用时 URL.revokeObjectURL，
 * 否则 blob 会一直留在内存里（useAuthedImage 已代为处理）。
 * 401 时复用 authFetch 的轮换逻辑刷新一次并重试，与其它接口行为一致。
 */
export async function fetchAuthedObjectUrl(path: string, token?: string): Promise<string> {
  const url = resolveImagePath(path)
  const owner = getStoredSession()?.id
  try {
    return URL.createObjectURL(await requestBlob(url, currentToken(token)))
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) throw error
    if (!token || getStoredSession()?.id !== owner) throw error
    if (!getStoredSession()?.refreshToken) throw error // 游客无 refresh，不重试
    const pair = await refreshTokens()
    return URL.createObjectURL(await requestBlob(url, pair.token))
  }
}
