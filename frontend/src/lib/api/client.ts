import { env } from '@/config/env'

type RequestOptions = Omit<RequestInit, 'body'> & {
  body?: unknown
}

export async function apiClient<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const response = await fetch(`${env.apiBaseUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  })

  if (!response.ok) {
    // 后端统一错误格式 { error: '...' }，优先透传服务端文案
    let message = `Request failed with status ${response.status}`
    try {
      const body = (await response.json()) as { error?: string }
      if (body.error) message = body.error
    } catch { /* 非 JSON 错误体，保留默认文案 */ }
    throw new Error(message)
  }

  return response.json() as Promise<T>
}
