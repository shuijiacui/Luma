import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { authFetch, refreshTokens } from '@/lib/api/authFetch'
import { saveSession, getStoredSession, removeSession } from '@/features/auth/storage'

beforeEach(() => saveSession({ id: 'child', role: 'child', familyId: 'family', displayName: 'C', isGuest: false, token: 'old', refreshToken: 'refresh-old' }))
afterEach(() => { localStorage.clear(); vi.unstubAllGlobals() })
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

test('expired request refreshes once, updates session, next request uses the current token', async () => {
  let refreshCount = 0
  const sent: string[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, opts: RequestInit) => {
    if (url.endsWith('/auth/refresh')) { refreshCount++; return json({ token: 'new', refreshToken: 'refresh-new' }) }
    const token = (opts.headers as Record<string, string>).Authorization
    sent.push(token)
    return token === 'Bearer old' ? json({ error: 'expired' }, 401) : json({ ok: true })
  }))
  await Promise.all([authFetch('/protected', { token: 'old' }), authFetch('/protected', { token: 'old' })])
  expect(refreshCount).toBe(1)
  expect(getStoredSession()?.token).toBe('new')
  await authFetch('/protected', { token: 'old' })
  expect(sent.at(-1)).toBe('Bearer new')
  expect(refreshCount).toBe(1)
})

test('in-flight refresh cannot restore a logged out session', async () => {
  let finish: (value: Response) => void = () => {}
  vi.stubGlobal('fetch', vi.fn(() => new Promise(resolve => { finish = resolve })))
  const pending = refreshTokens()
  removeSession()
  finish(json({ token: 'new', refreshToken: 'refresh-new' }))
  await expect(pending).rejects.toThrow('session changed')
  expect(getStoredSession()).toBeNull()
})
