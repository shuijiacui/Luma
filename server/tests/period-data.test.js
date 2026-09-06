import { afterEach, expect, test, vi } from 'vitest'
import request from 'supertest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createDb } from '../src/db.js'
import { createApp } from '../src/app.js'
import { registerParent, registerChild } from '../src/services/authService.js'
import { insertAnalysis, attachReport } from '../src/services/historyService.js'
import { generateChildReports, periodBounds, startReportScheduler } from '../src/services/periodReports.js'

const cleanup = []
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); while (cleanup.length) cleanup.pop()() })
function setup(deps = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'luma-period-'))
  const db = createDb(':memory:')
  cleanup.push(() => { db.close(); if (path.resolve(dir).startsWith(path.resolve(os.tmpdir()) + path.sep)) fs.rmSync(dir, { force: true, recursive: true }) })
  const parent = registerParent(db, { name: 'Parent', email: 'p@test.dev', password: 'secret123' })
  const child = registerChild(db, { nickname: 'Child', creationCode: '1234', inviteCode: parent.family.inviteCode })
  const auth = { role: 'parent', accountId: parent.session.id, familyId: parent.session.familyId }
  const app = createApp({ db, uploadDir: dir, entries: [], ...deps })
  const add = (createdAt, elements = ['tree']) => {
    const id = insertAnalysis(db, { childId: child.session.id, familyId: parent.session.familyId, features: { elements } })
    db.prepare('UPDATE analyses SET created_at = ? WHERE id = ?').run(createdAt, id)
    return id
  }
  const get = (token = parent.token, query = '') => request(app).get(`/api/children/${child.session.id}/digests${query}`).set('Authorization', `Bearer ${token}`)
  const remove = (token = parent.token, body = { password: 'secret123', confirmation: '删除整个家庭' }) => request(app).post('/api/auth/family/delete').set('Authorization', `Bearer ${token}`).send(body)
  return { db, app, dir, parent, child, auth, add, get, remove }
}

test('calendar boundaries use Shanghai, Monday weeks, leap months, and year rollover', () => {
  expect(periodBounds('2026-09-06T15:59:59Z', 'weekly')).toEqual({ start: '2026-08-30T16:00:00.000Z', end: '2026-09-06T16:00:00.000Z' })
  expect(periodBounds('2026-09-06T16:00:00Z', 'weekly').start).toBe('2026-09-06T16:00:00.000Z')
  expect(periodBounds('2024-02-29T12:00:00Z', 'monthly')).toEqual({ start: '2024-01-31T16:00:00.000Z', end: '2024-02-29T16:00:00.000Z' })
  expect(periodBounds('2025-12-31T16:00:00Z', 'monthly').end).toBe('2026-01-31T16:00:00.000Z')
})

test('only completed nonempty periods; counts, day dedup, advice and sources remain factual', () => {
  const { db, add, child, auth } = setup()
  add('2026-08-23T17:00:00.000Z') // previous week
  const first = add('2026-08-30T16:00:00.000Z', ['tree', 'tree'])
  add('2026-08-31T00:00:00.000Z', ['tree', 'sun']) // same Shanghai date
  add('2026-09-06T16:00:00.000Z') // current week
  attachReport(db, first, { emotion: '信息不足', confidence: 0, parentAdvice: ['聊聊画中的树'] }, auth)
  generateChildReports(db, child.session.id, new Date('2026-09-07T00:00:00Z'))
  const rows = db.prepare("SELECT * FROM period_reports WHERE kind = 'weekly' ORDER BY period_start DESC").all()
  expect(rows).toHaveLength(2)
  const summary = JSON.parse(rows[0].summary_json)
  expect(summary).toMatchObject({ artworkCount: 2, activeDays: 1, previousArtworkCount: 1, artworkCountChange: 1, withReport: 1, insufficientReports: 1, parentAdvice: ['聊聊画中的树'] })
  expect(summary.elements.find(x => x.name === 'tree').count).toBe(2)
  expect(summary.sources).toHaveLength(2)
  expect(db.prepare("SELECT COUNT(*) AS n FROM period_reports WHERE kind = 'monthly'").get().n).toBe(1)
})

test('generation is idempotent and removed or changed sources cannot survive in reports', () => {
  const { db, add, child } = setup()
  const id = add('2024-01-15T00:00:00.000Z')
  generateChildReports(db, child.session.id, new Date('2024-03-01T00:00:00Z'))
  const before = db.prepare('SELECT * FROM period_reports ORDER BY id').all()
  generateChildReports(db, child.session.id, new Date('2024-03-02T00:00:00Z'))
  expect(db.prepare('SELECT * FROM period_reports ORDER BY id').all()).toEqual(before)
  db.prepare('UPDATE analyses SET features_json = ? WHERE id = ?').run('{"elements":["sun"]}', id)
  generateChildReports(db, child.session.id, new Date('2024-03-03T00:00:00Z'))
  expect(JSON.parse(db.prepare('SELECT summary_json FROM period_reports LIMIT 1').get().summary_json).elements).toEqual([{ name: 'sun', count: 1 }])
  db.prepare('DELETE FROM analyses WHERE id = ?').run(id)
  generateChildReports(db, child.session.id)
  expect(db.prepare('SELECT COUNT(*) AS n FROM period_reports').get().n).toBe(0)
})

test('digest API authorizes before generation, validates queries, and paginates', async () => {
  const { db, parent, child, add, get } = setup()
  add('2024-01-01T00:00:00.000Z'); add('2024-02-01T00:00:00.000Z')
  const stranger = registerParent(db, { name: 'Other', email: 'o@test.dev', password: 'secret123' })
  expect((await get(child.token)).status).toBe(403)
  expect((await get(stranger.token)).status).toBe(403)
  expect(db.prepare('SELECT COUNT(*) AS n FROM period_reports').get().n).toBe(0)
  expect((await get(parent.token, '?kind=invalid')).status).toBe(400)
  expect((await get(parent.token, '?limit=-1')).status).toBe(400)
  const page = await get(parent.token, '?kind=monthly&limit=1')
  expect(page.body).toMatchObject({ timeZone: 'Asia/Shanghai', total: 2, nextOffset: 1 })
  expect(page.body.reports[0].summary.periodLabel).toContain('2024-02-01')
  expect((await get(parent.token, '?kind=monthly&limit=1&offset=1')).body.nextOffset).toBeNull()
})

test('scheduler catches up on startup and hourly and stops cleanly', () => {
  const { db, add } = setup()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2024-02-01T00:00:00Z'))
  add('2024-01-01T00:00:00.000Z')
  const stop = startReportScheduler(db)
  expect(db.prepare('SELECT COUNT(*) AS n FROM period_reports').get().n).toBe(2)
  add('2024-01-15T00:00:00.000Z')
  vi.advanceTimersByTime(3600000)
  expect(db.prepare('SELECT COUNT(*) AS n FROM period_reports').get().n).toBe(3)
  stop()
  expect(vi.getTimerCount()).toBe(0)
})

test('deleting artwork invalidates persisted digests immediately', async () => {
  const { db, app, parent, add, get } = setup()
  const id = add('2024-01-01T00:00:00.000Z')
  await get()
  expect((await request(app).post(`/api/analyses/${id}/delete`).set('Authorization', `Bearer ${parent.token}`)).status).toBe(200)
  expect(db.prepare('SELECT COUNT(*) AS n FROM period_reports').get().n).toBe(0)
  expect((await get()).body.reports).toEqual([])
})

test('family deletion requires password and explicit confirmation; removes only own data and revokes all tokens', async () => {
  const { db, app, dir, parent, child, add, get, remove } = setup()
  const id = add('2024-01-01T00:00:00.000Z')
  fs.writeFileSync(path.join(dir, 'a.bin'), 'image')
  db.prepare('UPDATE analyses SET image_path = ? WHERE id = ?').run('a.bin', id)
  const other = registerParent(db, { name: 'Other', email: 'o@test.dev', password: 'secret123' })
  await get()
  expect((await remove(child.token)).status).toBe(403)
  expect((await remove(parent.token, { password: 'bad', confirmation: '删除整个家庭' })).status).toBe(403)
  expect((await remove(parent.token, { password: 'secret123' })).status).toBe(400)
  expect(fs.existsSync(path.join(dir, 'a.bin'))).toBe(true)
  expect((await remove()).body).toEqual({ ok: true, pendingMedia: 0 })
  expect(fs.readdirSync(dir)).toEqual([])
  expect(db.prepare('SELECT COUNT(*) AS n FROM analyses').get().n).toBe(0)
  expect(db.prepare('SELECT COUNT(*) AS n FROM period_reports').get().n).toBe(0)
  expect(db.prepare('SELECT id FROM accounts').all().map(r => r.id)).toEqual([other.session.id])
  expect((await request(app).get('/api/auth/me').set('Authorization', `Bearer ${child.token}`)).status).toBe(401)
  expect((await request(app).post('/api/auth/refresh').send({ refreshToken: parent.refreshToken })).status).toBe(401)
  expect(() => insertAnalysis(db, { childId: child.session.id, familyId: parent.session.familyId, features: {} })).toThrow('no longer exists')
})

test('database failure rolls family deletion and staged image moves back', async () => {
  const { db, dir, add, remove, parent } = setup()
  const id = add('2024-01-01T00:00:00.000Z')
  fs.writeFileSync(path.join(dir, 'a.bin'), 'image')
  db.prepare('UPDATE analyses SET image_path = ? WHERE id = ?').run('a.bin', id)
  db.exec("CREATE TRIGGER refuse_delete BEFORE DELETE ON accounts BEGIN SELECT RAISE(ABORT, 'test failure'); END")
  expect((await remove()).status).toBe(500)
  expect(fs.readFileSync(path.join(dir, 'a.bin'), 'utf8')).toBe('image')
  expect(fs.readdirSync(dir)).toEqual(['a.bin'])
  expect(db.prepare('SELECT id FROM analyses').get().id).toBe(id)
  expect(db.prepare('SELECT id FROM families').get().id).toBe(parent.session.familyId)
})
