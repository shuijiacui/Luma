import { test, expect, vi, afterEach } from 'vitest'
import request from 'supertest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { createApp } from '../src/app.js'
import { createDb } from '../src/db.js'
import { chatWithImage } from '../src/services/llmClient.js'
import { backupDb } from '../scripts/backup.mjs'

afterEach(() => vi.unstubAllGlobals())

function makeApp(overrides = {}) {
  return createApp({
    chatWithImage: async () => ({}),
    entries: [],
    db: createDb(':memory:'),
    ...overrides,
  })
}

// ---- CORS 白名单 ----
test('CORS: 白名单来源放行，其他来源不发许可头', async () => {
  const app = makeApp()
  const allowed = await request(app).get('/api/health').set('Origin', 'http://localhost:5173')
  expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173')

  const evil = await request(app).get('/api/health').set('Origin', 'https://evil.example.com')
  expect(evil.headers['access-control-allow-origin']).toBeUndefined()

  const preflight = await request(app).options('/api/report').set('Origin', 'https://evil.example.com')
  expect(preflight.headers['access-control-allow-origin']).toBeUndefined()
})

// ---- 限流 ----
test('rate limit: auth 端点超限返回 429 + Retry-After', async () => {
  const app = makeApp({ limits: { global: { windowMs: 60_000, max: 100 }, auth: { windowMs: 60_000, max: 3 }, analyze: { windowMs: 60_000, max: 100 } } })
  for (let i = 0; i < 3; i += 1) {
    await request(app).post('/api/auth/parent/login').send({ email: 'x@x.com', password: 'badbad' })
  }
  const blocked = await request(app).post('/api/auth/parent/login').send({ email: 'x@x.com', password: 'badbad' })
  expect(blocked.status).toBe(429)
  expect(blocked.headers['retry-after']).toBeTruthy()
  // 非 auth 端点不受 auth 档位影响
  expect((await request(app).get('/api/health')).status).toBe(200)
})

// ---- token 轮换 ----
test('refresh 轮换：旧 refresh 一次性作废，新 access 可用', async () => {
  const app = makeApp()
  const reg = await request(app).post('/api/auth/parent/register')
    .send({ name: 'A', email: 'a@example.com', password: 'secret6' })
  expect(reg.body.refreshToken).toBeTruthy()

  const refreshed = await request(app).post('/api/auth/refresh')
    .send({ refreshToken: reg.body.refreshToken })
  expect(refreshed.status).toBe(200)
  expect(refreshed.body.token).not.toBe(reg.body.token)

  // 旧 refresh 重放 → 401
  const replay = await request(app).post('/api/auth/refresh')
    .send({ refreshToken: reg.body.refreshToken })
  expect(replay.status).toBe(401)

  // 新 access token 可用
  const me = await request(app).get('/api/auth/me')
    .set('Authorization', `Bearer ${refreshed.body.token}`)
  expect(me.status).toBe(200)
})

test('access token 过期 → 401；logout 同时吊销 refresh token', async () => {
  const db = createDb(':memory:')
  const app = makeApp({ db })
  const reg = await request(app).post('/api/auth/parent/register')
    .send({ name: 'B', email: 'b@example.com', password: 'secret6' })

  // 手动把 access token 改为已过期
  db.prepare("UPDATE sessions SET expires_at = '2000-01-01T00:00:00.000Z' WHERE token = ?").run(reg.body.token)
  expect((await request(app).get('/api/auth/me').set('Authorization', `Bearer ${reg.body.token}`)).status).toBe(401)
  // refresh 仍然有效（access 过期 ≠ 登出）
  expect((await request(app).post('/api/auth/refresh').send({ refreshToken: reg.body.refreshToken })).status).toBe(200)

  // logout 后 refresh 也被吊销
  const reg2 = await request(app).post('/api/auth/parent/register')
    .send({ name: 'C', email: 'c@example.com', password: 'secret6' })
  await request(app).post('/api/auth/logout').set('Authorization', `Bearer ${reg2.body.token}`)
  expect((await request(app).post('/api/auth/refresh').send({ refreshToken: reg2.body.refreshToken })).status).toBe(401)
})

// ---- LLM 重试 ----
test('llmClient: 5xx 重试后成功；4xx 不重试', async () => {
  const flaky = vi.fn()
    .mockResolvedValueOnce({ ok: false, status: 500, text: async () => 'boom' })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ choices: [{ message: { content: '{"ok":1}' } }] }) })
  vi.stubGlobal('fetch', flaky)
  const out = await chatWithImage('img', 'prompt')
  expect(out).toEqual({ ok: 1 })
  expect(flaky).toHaveBeenCalledTimes(2)

  const clientErr = vi.fn().mockResolvedValue({ ok: false, status: 400, text: async () => 'bad request' })
  vi.stubGlobal('fetch', clientErr)
  await expect(chatWithImage('img', 'prompt')).rejects.toThrow(/400/)
  expect(clientErr).toHaveBeenCalledTimes(1)
}, 15_000)

// ---- 备份 ----
test('backup: VACUUM INTO 生成快照 + 超龄备份清理', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'luma-backup-'))
  const dbPath = path.join(dir, 'data.sqlite')
  const db = new DatabaseSync(dbPath)
  db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)')
  db.prepare('INSERT INTO t (v) VALUES (?)').run('hello')
  db.close()

  const backupDir = path.join(dir, 'backups')
  const { target } = backupDb({ dbPath, backupDir, retentionDays: 14 })
  expect(fs.existsSync(target)).toBe(true)
  const restored = new DatabaseSync(target, { readOnly: true })
  expect(restored.prepare('SELECT v FROM t').get().v).toBe('hello')
  restored.close()

  // 造一个 20 天前的旧备份 → 应被清理
  const old = path.join(backupDir, 'luma-2000-01-01T00-00-00.sqlite')
  fs.copyFileSync(target, old)
  fs.utimesSync(old, new Date('2000-01-01'), new Date('2000-01-01'))
  const { removed } = backupDb({ dbPath, backupDir, retentionDays: 14 })
  expect(removed).toContain('luma-2000-01-01T00-00-00.sqlite')
  fs.rmSync(dir, { recursive: true, force: true })
})
