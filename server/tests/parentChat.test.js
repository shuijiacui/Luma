import { afterEach, expect, test, vi } from 'vitest'
import request from 'supertest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createDb } from '../src/db.js'
import { createApp } from '../src/app.js'
import { registerParent, registerChild } from '../src/services/authService.js'
import { insertAnalysis } from '../src/services/historyService.js'
import { chatSnapshot, createParentChatService, deleteChat, newChat, readArtworkMemory, resetChat, validateChatReply } from '../src/services/parentChat.js'

const databases = []
afterEach(() => { for (const db of databases.splice(0)) db.close(); vi.restoreAllMocks() })
const reply = { reply: '每次都要忍住脾气，确实很累。也可以先说说刚才发生了什么。', sourceIds: [] }
function setup(deps = {}) {
  const db = createDb(':memory:'); databases.push(db)
  const parent = registerParent(db, { name: 'Parent', email: 'p@test.dev', password: 'secret123' })
  const child = registerChild(db, { nickname: 'Child', creationCode: '1234', inviteCode: parent.family.inviteCode })
  const auth = { role: 'parent', accountId: parent.session.id, familyId: parent.session.familyId }
  const app = createApp({ db, ...deps })
  const path = `/api/children/${child.session.id}/chat`
  const input = (changes = {}) => ({ text: '我也很累，不想再忍了', requestId: 'request-0001', revision: 0, locale: 'zh', ...changes })
  const post = (body = input(), token = parent.token) => request(app).post(path).set('Authorization', `Bearer ${token}`).send(body)
  const get = (token = parent.token) => request(app).get(path).set('Authorization', `Bearer ${token}`)
  const add = (elements = ['tree'], changes = {}) => insertAnalysis(db, { childId: child.session.id, familyId: parent.session.familyId,
    features: { rawDescription: '秘密原始描述，孩子很焦虑', elements, colors: { dominant: ['green'], darkRatio: .1 },
      composition: { size: 'normal', position: 'center', pressure: 'normal' }, distortions: [], erasureMarks: 0,
      confidence: { elements: .9, colors: .9, composition: .9, distortions: .9, erasureMarks: .9 }, provenance: 'child', ...changes } })
  return { db, app, parent, child, auth, path, input, post, get, add }
}

test('daily conversations need no artwork; turns persist and retries do not duplicate or charge twice', async () => {
  const model = vi.fn().mockResolvedValue(reply), s = setup({ parentChatMessages: model })
  expect((await s.get()).body).toMatchObject({ available: true, revision: 0, turns: [], memory: { works: [] } })
  const first = await s.post()
  expect(first.status).toBe(200)
  expect(first.body).toMatchObject({ revision: 1, turn: { reply: reply.reply, userText: s.input().text, sources: [] } })
  expect((await s.post()).body).toEqual(first.body)
  expect(model).toHaveBeenCalledTimes(1)
  const restarted = createApp({ db: s.db, parentChatMessages: model })
  const reloaded = await request(restarted).get(s.path).set('Authorization', `Bearer ${s.parent.token}`)
  expect(reloaded.body.turns).toEqual([first.body.turn])
  await s.post(s.input({ requestId: 'request-0002', revision: 1, text: '不是他不听话，是我已经说不动了' }))
  const messages = model.mock.calls[1][0]
  expect(messages.filter(m => m.role !== 'system').slice(-3)).toEqual([{ role: 'user', content: s.input().text }, { role: 'assistant', content: JSON.stringify(reply) }, { role: 'user', content: '不是他不听话，是我已经说不动了' }])
  expect(model.mock.calls[0][1]).toMatchObject({ privateContent: true, retries: 0, disableThinking: true })
  expect((await s.post(s.input({ text: 'different' }))).status).toBe(409)
})

test('chat only receives the opted-in latest questionnaire for this parent and child; old reports expire', async () => {
  const model = vi.fn().mockResolvedValue(reply), s = setup({ parentChatMessages: model })
  const answers = Object.fromEntries(Array.from({ length: 15 }, (_, index) => [`q${index + 1}`, 3]))
  const save = (revision, childId) => request(s.app).post('/api/parent-questionnaire').set('Authorization', `Bearer ${s.parent.token}`).send({ revision, childId, childAge: 7, answers })
  const toggle = enabled => request(s.app).put('/api/parent-questionnaire/preferences').set('Authorization', `Bearer ${s.parent.token}`).send({ childId: s.child.session.id, enabled })
  const context = () => model.mock.calls.at(-1)[0].find(message => message.content.startsWith('家长自愿提供的近期问卷背景'))?.content
  await save(0, null).expect(201)
  await toggle(true).expect(200)
  await s.post().expect(200)
  expect(context()).toBeUndefined() // Unbound legacy answers must not be assigned implicitly.
  const record = (await save(1, s.child.session.id).expect(201)).body
  await toggle(false).expect(200)
  await s.post(s.input({ revision: 1, requestId: 'questionnaire-02' })).expect(200)
  expect(context()).toBeUndefined()
  await toggle(true).expect(200)
  await s.post(s.input({ revision: 2, requestId: 'questionnaire-03' })).expect(200)
  expect(context()).toContain(record.createdAt)
  expect(context()).toContain('照顾孩子的日常起居让我感到有些疲惫')
  expect(context()).toContain('家长当前的说法和纠正优先于问卷')
  expect(context()).not.toMatch(/"scores"|"total"|"dimensions"/)
  const sibling = registerChild(s.db, { nickname: 'Sibling', creationCode: '5678', inviteCode: s.parent.family.inviteCode })
  await request(s.app).post(`/api/children/${sibling.session.id}/chat`).set('Authorization', `Bearer ${s.parent.token}`).send(s.input()).expect(200)
  expect(context()).toBeUndefined()
  s.db.prepare('UPDATE parent_questionnaire_versions SET created_at = ? WHERE id = ?').run('2020-01-01T00:00:00.000Z', record.id)
  await s.post(s.input({ revision: 3, requestId: 'questionnaire-04' })).expect(200)
  expect(context()).toBeUndefined()
})

test('revoking questionnaire access while a reply is pending prevents persisting stale personalization', async () => {
  let finish
  const model = vi.fn(() => new Promise(resolve => { finish = resolve }))
  const s = setup({ parentChatMessages: model })
  const answers = Object.fromEntries(Array.from({ length: 15 }, (_, index) => [`q${index + 1}`, 3]))
  await request(s.app).post('/api/parent-questionnaire').set('Authorization', `Bearer ${s.parent.token}`)
    .send({ revision: 0, childId: s.child.session.id, childAge: 7, answers }).expect(201)
  const toggle = enabled => request(s.app).put('/api/parent-questionnaire/preferences').set('Authorization', `Bearer ${s.parent.token}`).send({ childId: s.child.session.id, enabled })
  await toggle(true).expect(200)
  const pending = s.post().then(response => response)
  await vi.waitFor(() => expect(model).toHaveBeenCalledOnce())
  await toggle(false).expect(200)
  finish(reply)
  expect((await pending).status).toBe(409)
  expect((await s.get()).body.turns).toEqual([])
})

test('artwork memory uses visible observations before report creation and validates citations', async () => {
  const model = vi.fn(), s = setup({ parentChatMessages: model }), id = s.add()
  model.mockResolvedValue({ reply: '这幅画里识别到了树。可以问问他想不想讲讲这棵树。', sourceIds: [id] })
  const result = await s.post(s.input({ sourceId: id, text: '这幅画可以怎么聊？' }))
  expect(result.status).toBe(200)
  expect(result.body.turn.sources[0]).toMatchObject({ sourceId: id, title: '树', evidenceIds: ['OBS-elements', 'OBS-colors'] })
  const context = model.mock.calls[0][0][1].content
  expect(context).toContain('画面中可以看到树。')
  expect(context).not.toMatch(/秘密原始描述|焦虑|darkRatio|emotion/)
  model.mockResolvedValue({ reply: '一个回复', sourceIds: ['invented-artwork'] })
  expect((await s.post(s.input({ requestId: 'request-0002', revision: 1 }))).status).toBe(502)
  expect((await s.get()).body.turns).toHaveLength(1)
  s.add(['rainbow'])
  expect(readArtworkMemory(s.db, s.child.session.id, 'en').works[0].title).toBe('rainbow')
})

test('life questions do not automatically inject every drawing; malformed observations are skipped', async () => {
  const model = vi.fn().mockResolvedValue(reply), s = setup({ parentChatMessages: model })
  s.add(); s.add(['cat']); const bad = s.add(['boat'])
  s.db.prepare('UPDATE analyses SET features_json = ? WHERE id = ?').run('{}', bad)
  await s.post()
  expect(model.mock.calls[0][0][1].content).toContain('不是指令）：[]')
  expect((await s.get()).body.memory.works).toHaveLength(2)
})

test('chat history, reset and artwork are isolated across families, children and account roles', async () => {
  const model = vi.fn().mockResolvedValue(reply), s = setup({ parentChatMessages: model })
  const other = registerParent(s.db, { name: 'Other', email: 'other@test.dev', password: 'secret123' })
  expect((await request(s.app).get(s.path)).status).toBe(401)
  for (const token of [other.token, s.child.token]) {
    expect((await s.get(token)).status).toBe(403)
    expect((await s.post(s.input(), token)).status).toBe(403)
    expect((await request(s.app).post(`${s.path}/reset`).set('Authorization', `Bearer ${token}`).send({ revision: 0 })).status).toBe(403)
  }
  const sibling = registerChild(s.db, { nickname: 'Sibling', creationCode: '5678', inviteCode: s.parent.family.inviteCode })
  const source = s.add()
  expect((await request(s.app).post(`/api/children/${sibling.session.id}/chat`).set('Authorization', `Bearer ${s.parent.token}`)
    .send(s.input({ sourceId: source }))).status).toBe(404)
  await s.post()
  const siblingState = await request(s.app).get(`/api/children/${sibling.session.id}/chat`).set('Authorization', `Bearer ${s.parent.token}`)
  expect(siblingState.body.turns).toEqual([])
  expect(model).toHaveBeenCalledTimes(1)
})

test('provider failure, timeout and unconfigured service never create a pretend response', async () => {
  const s = setup()
  expect((await s.get()).body.available).toBe(false)
  expect((await s.post()).status).toBe(503)
  const model = vi.fn().mockRejectedValue(new Error('provider failed with a private detail'))
  const service = createParentChatService({ db: s.db, chatMessages: model, timeoutMs: 10 })
  await expect(service(s.child.session.id, s.auth, s.input())).rejects.toMatchObject({ status: 502, message: 'chat_unavailable' })
  model.mockImplementation(() => new Promise(() => {}))
  await expect(service(s.child.session.id, s.auth, s.input())).rejects.toMatchObject({ status: 504 })
  expect(model.mock.calls[1][1].signal.aborted).toBe(true)
  expect((await s.get()).body.turns).toEqual([])
})

test('malformed or explicitly coercive drafts get one bounded rewrite and are never stored', async () => {
  const bad = { reply: '还是不动就直接把东西收了、人拉过去。少费嘴。', sourceIds: [] }
  expect(validateChatReply(bad, [])).toBeNull()
  const model = vi.fn().mockResolvedValueOnce(bad).mockResolvedValueOnce(reply), s = setup({ parentChatMessages: model })
  expect((await s.post()).body.turn.reply).toBe(reply.reply)
  expect(model).toHaveBeenCalledTimes(2)
  expect((await s.get()).body.turns[0].reply).not.toContain('拉过去')
  expect(model.mock.calls[0][1].responseFormat).toBeUndefined()
})

test('duplicate concurrent sends share work; clearing during a reply rejects the late result', async () => {
  const s = setup(); s.add()
  let finish
  const model = vi.fn(() => new Promise(resolve => { finish = resolve }))
  const service = createParentChatService({ db: s.db, chatMessages: model })
  const first = service(s.child.session.id, s.auth, s.input()), duplicate = service(s.child.session.id, s.auth, s.input())
  await expect(service(s.child.session.id, s.auth, s.input({ requestId: 'request-0002' }))).rejects.toMatchObject({ status: 409 })
  expect(model).toHaveBeenCalledTimes(1)
  finish(reply)
  expect(await first).toEqual(await duplicate)
  const pending = service(s.child.session.id, s.auth, s.input({ requestId: 'request-0002', revision: 1 }))
  expect(resetChat(s.db, s.child.session.id, s.auth, 1)).toEqual({ revision: 2 })
  finish(reply)
  await expect(pending).rejects.toMatchObject({ status: 409 })
  expect(chatSnapshot(s.db, s.child.session.id, s.auth, 'zh')).toMatchObject({ revision: 2, turns: [], memory: { works: [expect.any(Object)] } })
  expect(() => resetChat(s.db, s.child.session.id, s.auth, 1)).toThrow('chat_changed')
})

test('deleting a referenced artwork removes its turns and prevents late replies; family deletion removes all chat', async () => {
  const model = vi.fn(), s = setup({ parentChatMessages: model }), source = s.add()
  model.mockResolvedValue({ ...reply, sourceIds: [source] })
  await s.post(s.input({ sourceId: source }))
  let finish
  const service = createParentChatService({ db: s.db, chatMessages: () => new Promise(resolve => { finish = resolve }) })
  const pending = service(s.child.session.id, s.auth, s.input({ requestId: 'request-0002', revision: 1, sourceId: source }))
  const removed = await request(s.app).post(`/api/analyses/${source}/delete`).set('Authorization', `Bearer ${s.parent.token}`)
  expect(removed.status).toBe(200)
  finish({ ...reply, sourceIds: [source] })
  await expect(pending).rejects.toMatchObject({ status: 409 })
  const state = (await s.get()).body
  expect(state.turns).toEqual([]); expect(state.memory.works).toEqual([])
  model.mockResolvedValue(reply)
  expect((await s.post(s.input({ revision: state.revision }))).status).toBe(200)
  const family = await request(s.app).post('/api/auth/family/delete').set('Authorization', `Bearer ${s.parent.token}`)
    .send({ password: 'secret123', confirmation: '删除整个家庭' })
  expect(family.status).toBe(200)
  expect(s.db.prepare('SELECT count(*) AS n FROM parent_conversation_turns').get().n).toBe(0)
  expect(s.db.prepare('SELECT count(*) AS n FROM parent_conversations').get().n).toBe(0)
  expect(s.db.prepare('SELECT count(*) AS n FROM parent_chat_threads').get().n).toBe(0)
})

test('new conversations preserve history and give the model only the selected conversation', async () => {
  const model = vi.fn().mockResolvedValue(reply), s = setup({ parentChatMessages: model })
  const first = await s.post()
  const created = await request(s.app).post(`${s.path}/conversations`).set('Authorization', `Bearer ${s.parent.token}`).send({ revision: 1 })
  expect(created.status).toBe(200)
  const next = created.body
  expect(next).toMatchObject({ revision: 2, turns: [], conversations: [{ id: first.body.conversationId, title: s.input().text }] })
  expect(next.conversationId).not.toBe(first.body.conversationId)
  const repeated = newChat(s.db, s.child.session.id, s.auth, 2, 'zh')
  expect(repeated.conversationId).toBe(next.conversationId)
  expect((await s.post(s.input({ revision: 2, conversationId: next.conversationId, requestId: 'new-chat-0001', text: '聊聊学校' }))).status).toBe(200)
  expect(model.mock.calls[1][0].filter(m => m.role !== 'system')).toEqual([{ role: 'user', content: '聊聊学校' }])
  const old = await request(s.app).get(`${s.path}?conversationId=${first.body.conversationId}`).set('Authorization', `Bearer ${s.parent.token}`)
  expect(old.body.turns).toEqual([first.body.turn])
  expect(old.body.conversations).toHaveLength(2)
  await s.post(s.input({ revision: 3, conversationId: first.body.conversationId, requestId: 'old-chat-0002', text: '接着刚才的话' }))
  expect(model.mock.calls[2][0].filter(m => m.role === 'user').map(m => m.content)).toEqual([s.input().text, '接着刚才的话'])
  resetChat(s.db, s.child.session.id, s.auth, 4, next.conversationId)
  expect(chatSnapshot(s.db, s.child.session.id, s.auth, 'zh', first.body.conversationId).turns).toHaveLength(2)
  expect(chatSnapshot(s.db, s.child.session.id, s.auth, 'zh', next.conversationId).turns).toEqual([])
})

test('conversation access and deletion stay scoped to the parent and child, including siblings', async () => {
  const s = setup({ parentChatMessages: vi.fn().mockResolvedValue(reply) })
  const sibling = registerChild(s.db, { nickname: 'Sibling', creationCode: '5678', inviteCode: s.parent.family.inviteCode })
  await s.post()
  const next = newChat(s.db, s.child.session.id, s.auth, 1, 'zh')
  await s.post(s.input({ revision: 2, conversationId: next.conversationId, requestId: 'next-chat-0001' }))
  const siblingPath = `/api/children/${sibling.session.id}/chat`
  const siblingPost = await request(s.app).post(siblingPath).set('Authorization', `Bearer ${s.parent.token}`).send(s.input({ text: '弟弟的事情' }))
  expect(siblingPost.status).toBe(200)
  const other = registerParent(s.db, { name: 'Other', email: 'other@test.dev', password: 'secret123' })
  for (const token of [other.token, s.child.token]) {
    expect((await request(s.app).post(`${s.path}/conversations`).set('Authorization', `Bearer ${token}`).send({ revision: 3 })).status).toBe(403)
    expect((await request(s.app).delete(`${s.path}/conversations/${next.conversationId}`).set('Authorization', `Bearer ${token}`).send({ revision: 3 })).status).toBe(403)
  }
  expect((await request(s.app).get(`${siblingPath}?conversationId=${next.conversationId}`).set('Authorization', `Bearer ${s.parent.token}`)).status).toBe(404)
  expect((await request(s.app).delete(`${siblingPath}/conversations/${next.conversationId}`).set('Authorization', `Bearer ${s.parent.token}`).send({ revision: 1 })).status).toBe(404)
  const removed = await request(s.app).delete(`${s.path}/conversations/${next.conversationId}`).set('Authorization', `Bearer ${s.parent.token}`).send({ revision: 3 })
  expect(removed.status).toBe(200)
  expect((await s.get()).body.conversations).toHaveLength(1)
  const siblingState = await request(s.app).get(siblingPath).set('Authorization', `Bearer ${s.parent.token}`)
  expect(siblingState.body.turns).toEqual([siblingPost.body.turn])
  expect(siblingState.body.conversations).toHaveLength(1)
})

test('deletion removes stored turns and pending replies cannot recreate the deleted conversation', async () => {
  const s = setup({ parentChatMessages: vi.fn().mockResolvedValue(reply) }), source = s.add()
  const first = (await s.post()).body
  let finish
  const service = createParentChatService({ db: s.db, chatMessages: () => new Promise(resolve => { finish = resolve }) })
  const pending = service(s.child.session.id, s.auth, s.input({ conversationId: first.conversationId, revision: 1, requestId: 'pending-0002' }))
  deleteChat(s.db, s.child.session.id, s.auth, first.conversationId, 1)
  finish(reply)
  await expect(pending).rejects.toMatchObject({ status: 409 })
  expect(s.db.prepare('SELECT count(*) AS n FROM parent_conversation_turns').get().n).toBe(0)
  const state = (await s.get()).body
  expect(state).toMatchObject({ turns: [], conversations: [], revision: 2 })
  expect(state.conversationId).not.toBe(first.conversationId)
  expect(state.memory.works[0].sourceId).toBe(source)
  expect((await s.post(s.input({ revision: 2, conversationId: first.conversationId }))).status).toBe(404)
  expect((await s.get()).body.turns).toEqual([])
})

test('old single-chat databases migrate without loss and deleted legacy chats stay deleted after restart', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'luma-chat-migration-'))
  const path = join(directory, 'test.sqlite')
  let db = createDb(path)
  try {
    const parent = registerParent(db, { name: 'Parent', email: 'migration@test.dev', password: 'secret123' })
    const child = registerChild(db, { nickname: 'Child', creationCode: '1234', inviteCode: parent.family.inviteCode })
    const auth = { role: 'parent', accountId: parent.session.id, familyId: parent.session.familyId }
    const send = createParentChatService({ db, chatMessages: async () => reply })
    await send(child.session.id, auth, { text: '以前聊过的事', requestId: 'migration-0001', revision: 0 })
    db.exec(`DROP INDEX idx_parent_chat_thread_turns;
      DROP TABLE parent_chat_threads;
      ALTER TABLE parent_conversation_turns DROP COLUMN conversation_id;
      ALTER TABLE parent_conversations DROP COLUMN active_conversation_id;`)
    db.close(); db = createDb(path)
    const migrated = chatSnapshot(db, child.session.id, auth, 'zh')
    expect(migrated).toMatchObject({ conversationId: 'legacy', revision: 1, turns: [{ userText: '以前聊过的事' }], conversations: [{ title: '以前聊过的事' }] })
    deleteChat(db, child.session.id, auth, 'legacy', 1)
    db.close(); db = createDb(path)
    expect(chatSnapshot(db, child.session.id, auth, 'zh')).toMatchObject({ turns: [], conversations: [], revision: 2 })
    expect(() => chatSnapshot(db, child.session.id, auth, 'zh', 'legacy')).toThrow('conversation_not_found')
  } finally { db.close(); rmSync(directory, { recursive: true, force: true }) }
})

test('invalid requests are rejected before model work; saved and supplied history are bounded', async () => {
  const model = vi.fn().mockResolvedValue(reply), s = setup({ parentChatMessages: model })
  for (const changes of [{ text: '' }, { text: 'x'.repeat(2001) }, { requestId: 'a' }, { locale: 'fr' }, { revision: -1 }]) {
    expect((await s.post(s.input(changes))).status).toBe(400)
  }
  expect(model).not.toHaveBeenCalled()
  const service = createParentChatService({ db: s.db, chatMessages: model })
  for (let i = 0; i < 63; i++) await service(s.child.session.id, s.auth, s.input({ requestId: `request-${i.toString().padStart(4, '0')}`, revision: i }))
  expect((await s.get()).body.turns).toHaveLength(60)
  expect(model.mock.calls.at(-1)[0].filter(m => m.role === 'assistant')).toHaveLength(12)
})
