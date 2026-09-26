import { afterEach, expect, test, vi } from 'vitest'
import request from 'supertest'
import { createDb } from '../src/db.js'
import { createApp } from '../src/app.js'
import { registerParent, registerChild } from '../src/services/authService.js'
import { insertAnalysis, attachReport } from '../src/services/historyService.js'
import { buildObservationReport } from '../src/services/observationReport.js'
import { createCommunicationService, validateGuideWording } from '../src/services/communicationGuides.js'

const databases = []
afterEach(() => { for (const db of databases.splice(0)) db.close(); vi.restoreAllMocks() })
function setup(deps = {}) {
  const db = createDb(':memory:'); databases.push(db)
  const parent = registerParent(db, { name: 'Parent', email: 'p@test.dev', password: 'secret123' })
  const child = registerChild(db, { nickname: 'Child', creationCode: '1234', inviteCode: parent.family.inviteCode })
  const auth = { role: 'parent', accountId: parent.session.id, familyId: parent.session.familyId }
  const app = createApp({ db, ...deps })
  const add = (elements = ['tree'], changes = {}) => {
    const features = { rawDescription: '模型原始描述，不可当作孩子原话', elements,
      colors: { dominant: ['green'], darkRatio: .1 }, composition: { size: 'normal', position: 'center', pressure: 'normal' },
      distortions: [], erasureMarks: 0, confidence: { elements: .9, colors: .9, composition: .9, distortions: .9, erasureMarks: .9 },
      provenance: 'child', ...changes }
    const id = insertAnalysis(db, { childId: child.session.id, familyId: parent.session.familyId, features })
    attachReport(db, id, buildObservationReport(features), auth)
    return id
  }
  const get = (locale = 'zh', token = parent.token) => request(app).post(`/api/children/${child.session.id}/communication`)
    .set('Authorization', `Bearer ${token}`).send({ locale })
  return { db, app, parent, child, auth, add, get }
}

const wording = sourceId => ({ sourceId, opener: '你愿意给我介绍一下画里的树吗？',
  followUp: '你刚才讲的部分，愿意再多说一点吗？', alternative: '我们也可以一起看看，想指给我看哪里都可以。' })

test('cards belong to recent distinct artworks, never pair unrelated advice with frequent elements', async () => {
  const s = setup()
  const boat = s.add(['boat']); s.add(['tree']); const tree = s.add(['tree'])
  const result = await s.get()
  expect(result.status).toBe(200)
  expect(result.body.cards.map(c => c.sourceId)).toEqual([tree, boat])
  expect(result.body.cards[0]).toMatchObject({ subject: '树', observation: '画面中可以看到树。', evidenceIds: ['OBS-elements'] })
  expect(result.body.cards[1].opener).toContain('船')
  expect(result.body.cards.every(card => card.followUp && card.alternative)).toBe(true)
  expect(result.body.cards.every(card => !card.opener.includes('自己决定是否讲述'))).toBe(true)
})

test('one meaningful source yields one card; empty/legacy/uncertain analyses do not invent observations', async () => {
  const s = setup()
  expect((await s.get()).body.cards).toEqual([])
  const id = s.add(); s.add()
  expect((await s.get()).body.cards).toHaveLength(1)
  s.db.prepare('UPDATE analyses SET report_json = NULL').run()
  s.add([], { colors: { dominant: [], darkRatio: .1 } })
  expect((await s.get()).body.cards).toEqual([])
  s.db.prepare('UPDATE analyses SET report_json = ? WHERE id = ?').run(JSON.stringify({ kind: 'legacy', parentAdvice: ['错误建议'] }), id)
  expect((await s.get()).body.cards).toEqual([])
})

test('validated wording uses one call; refresh and a new service instance reuse persisted cache', async () => {
  const model = vi.fn()
  const s = setup({ communicationChatText: model }), id = s.add()
  model.mockResolvedValue({ cards: [wording(id)] })
  const first = await s.get(), second = await s.get()
  expect(first.body.mode).toBe('model')
  expect(second.body).toEqual(first.body)
  expect(model).toHaveBeenCalledTimes(1)
  expect(model.mock.calls[0][1]).toMatchObject({ retries: 0, privateContent: true, maxTokens: 1000 })
  expect(model.mock.calls[0][0]).not.toContain('模型原始描述')
  const restarted = createCommunicationService({ db: s.db, chatText: model })
  expect(await restarted(s.child.session.id, s.auth, 'zh')).toEqual(first.body)
  expect(model).toHaveBeenCalledTimes(1)
})

test('schema, invented sources, added objects and psychological claims fall back to grounded templates', async () => {
  const source = { sourceId: 'a', subject: '树' }
  for (const bad of [
    { cards: [wording('other')] },
    { cards: [{ ...wording('a'), opener: '这棵树说明你很孤独，是吗？' }] },
    { cards: [{ ...wording('a'), opener: '树旁边的猫正在做什么呀？' }] },
    { cards: [{ ...wording('a'), opener: '为什么画成红色的树呢？' }] },
    { cards: [{ ...wording('a'), opener: null }] },
  ]) expect(validateGuideWording(bad, [source], 'zh')).toBeNull()
  const model = vi.fn().mockRejectedValue(new Error('offline')), s = setup({ communicationChatText: model })
  s.add()
  expect((await s.get()).body.mode).toBe('template')
  expect((await s.get()).body.cards).toHaveLength(1)
  expect(model).toHaveBeenCalledTimes(1)
})

test('a hanging provider is bounded and aborted', async () => {
  const model = vi.fn(() => new Promise(() => {})), s = setup({ communicationChatText: model, communicationTimeoutMs: 15 })
  s.add()
  expect((await s.get()).body.mode).toBe('template')
  expect(model.mock.calls[0][1].signal.aborted).toBe(true)
})

test('concurrent requests share generation, and changed or deleted sources cannot return stale cards', async () => {
  let finish
  const model = vi.fn(() => new Promise(resolve => { finish = resolve })), s = setup()
  const id = s.add(), service = createCommunicationService({ db: s.db, chatText: model })
  const first = service(s.child.session.id, s.auth, 'zh'), second = service(s.child.session.id, s.auth, 'zh')
  expect(model).toHaveBeenCalledTimes(1)
  finish({ cards: [wording(id)] })
  expect(await first).toEqual(await second)
  s.add(['boat'])
  const pending = service(s.child.session.id, s.auth, 'zh')
  s.db.prepare('DELETE FROM analyses WHERE child_id = ?').run(s.child.session.id)
  finish({ cards: [] })
  await expect(pending).rejects.toMatchObject({ status: 409 })
  expect((await service(s.child.session.id, s.auth, 'zh')).cards).toEqual([])
})

test('new artwork, birth-date changes and language changes invalidate only relevant cache', async () => {
  const s = setup(); s.add()
  const initial = (await s.get()).body
  const birthYear = new Date().getUTCFullYear() - 6
  s.db.prepare('UPDATE accounts SET birth_date = ? WHERE id = ?').run(`${birthYear}-01-01`, s.child.session.id)
  const young = (await s.get()).body
  expect(young.cards[0].opener).not.toBe(initial.cards[0].opener)
  expect(young.cards[0].opener).toContain('正在做什么')
  const english = (await s.get('en')).body
  expect(english.cards[0].observation).toContain('tree')
  expect((await s.get()).body).toEqual(young)
  s.add(['boat'])
  expect((await s.get()).body.cards).toHaveLength(2)
})

test('anonymous, child and unrelated family cannot read or generate suggestions', async () => {
  const model = vi.fn(), s = setup({ communicationChatText: model }); s.add()
  expect((await request(s.app).post(`/api/children/${s.child.session.id}/communication`).send({})).status).toBe(401)
  expect((await s.get('zh', s.child.token)).status).toBe(403)
  const other = registerParent(s.db, { name: 'Other', email: 'other@test.dev', password: 'secret123' })
  expect((await s.get('zh', other.token)).status).toBe(403)
  expect(model).not.toHaveBeenCalled()
})

test('out of age range skips model calls and invalid locale is rejected', async () => {
  const model = vi.fn(), s = setup({ communicationChatText: model }); s.add()
  s.db.prepare('UPDATE accounts SET birth_date = ? WHERE id = ?').run(`${new Date().getUTCFullYear() - 15}-01-01`, s.child.session.id)
  expect((await s.get()).body).toMatchObject({ cards: [], emptyReason: 'age_out_of_scope' })
  expect((await s.get('fr')).status).toBe(400)
  expect(model).not.toHaveBeenCalled()
})

test('a family deleted during generation cannot be recreated through the cache', async () => {
  let finish
  const s = setup(), id = s.add()
  const service = createCommunicationService({ db: s.db, chatText: () => new Promise(resolve => { finish = resolve }) })
  const pending = service(s.child.session.id, s.auth, 'zh')
  const removed = await request(s.app).post('/api/auth/family/delete').set('Authorization', `Bearer ${s.parent.token}`)
    .send({ password: 'secret123', confirmation: '删除整个家庭' })
  finish({ cards: [wording(id)] })
  await expect(pending).rejects.toMatchObject({ status: 403 })
  expect(removed.status).toBe(200)
  expect(s.db.prepare('SELECT COUNT(*) AS n FROM communication_guides').get().n).toBe(0)
})

test('deleting artwork or family removes cached source content', async () => {
  const s = setup(), id = s.add(); await s.get()
  expect(s.db.prepare('SELECT COUNT(*) AS n FROM communication_guides').get().n).toBe(1)
  expect((await request(s.app).post(`/api/analyses/${id}/delete`).set('Authorization', `Bearer ${s.parent.token}`)).status).toBe(200)
  expect(s.db.prepare('SELECT COUNT(*) AS n FROM communication_guides').get().n).toBe(0)
  s.add(); await s.get()
  const removed = await request(s.app).post('/api/auth/family/delete').set('Authorization', `Bearer ${s.parent.token}`)
    .send({ password: 'secret123', confirmation: '删除整个家庭' })
  expect(removed.status).toBe(200)
  expect(s.db.prepare('SELECT COUNT(*) AS n FROM communication_guides').get().n).toBe(0)
})
