import express from 'express'
import request from 'supertest'
import { afterEach, expect, test, vi } from 'vitest'
import { createApp } from '../src/app.js'
import { createDb } from '../src/db.js'
import { createNiloRouter } from '../src/routes/nilo.js'
import { generateNiloScene } from '../src/services/niloScene.js'
import { sceneChatText, sceneChatWithImage } from '../src/services/niloSceneModels.js'

// The HTTP boundary is under test. No provider or visual-quality verdict is used.
vi.mock('../src/services/niloScene.js', async importOriginal => ({
  ...await importOriginal(), generateNiloScene: vi.fn(async () => ({ status: 'proposed' })),
}))
const databases = []
afterEach(() => {
  databases.splice(0).forEach(db => db.close())
  vi.clearAllMocks(); vi.unstubAllEnvs()
})
const body = { stage: 'plan', utterance: '画一个太阳', locale: 'zh', context: { requestScope: 'object' } }
const appWith = deps => {
  const db = createDb(':memory:'); databases.push(db)
  return createApp({ db, periodReportsEnabled: false, staticDir: false, ...deps })
}

test('production HTTP scenes use dedicated text and vision clients independently of companion clients', async () => {
  vi.stubEnv('NODE_ENV', 'production')
  const text = vi.fn(), vision = vi.fn()
  const response = await request(appWith({ chatText: text, chatWithImage: vision })).post('/api/nilo/scene').send(body)
  expect(response.status).toBe(200)
  const options = generateNiloScene.mock.calls[0][1]
  expect(options.chatText).toBe(sceneChatText)
  expect(options.chatWithImage).toBe(sceneChatWithImage)
  expect(text).not.toHaveBeenCalled(); expect(vision).not.toHaveBeenCalled()
})

test('app forwards explicit scene-only clients and deadline for isolated integration tests', async () => {
  const text = vi.fn(), vision = vi.fn()
  const response = await request(appWith({ sceneChatText: text, sceneChatWithImage: vision, niloTimeoutMs: 47000 }))
    .post('/api/nilo/scene').send(body)
  expect(response.status).toBe(200)
  expect(generateNiloScene.mock.calls[0][1]).toMatchObject({ chatText: text, chatWithImage: vision, timeoutMs: 47000 })
  expect(generateNiloScene.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal)
})

test('same-subject variant reaches the service with the previous rendered scene intact', async () => {
  const previousScene = { plan: { version: 1 }, objects: [{ id: 'focal', name: '鲸背小镇', proposal: { template: 'generated', raster: { marker: 'previous guide' } } }] }
  const payload = { ...body, stage: 'render', variantObjectId: 'focal', plan: previousScene.plan, context: { ...body.context, previousScene } }
  const response = await request(appWith({})).post('/api/nilo/scene').send(payload)
  expect(response.status).toBe(200)
  expect(generateNiloScene.mock.calls[0][0]).toMatchObject({ variantObjectId: 'focal', plan: previousScene.plan, context: { previousScene } })
})

test('scene isolation does not change existing companion dependency injection', async () => {
  const text = vi.fn(), vision = vi.fn(), sceneText = vi.fn(), sceneVision = vi.fn()
  const generateDialogue = vi.fn(async () => ({ reply: '你好' }))
  const app = express().use(express.json()).use('/nilo', createNiloRouter({
    chatText: text, chatWithImage: vision, sceneChatText: sceneText, sceneChatWithImage: sceneVision, generateDialogue,
  }))
  expect((await request(app).post('/nilo/companion').send({ context: { locale: 'zh' } })).status).toBe(200)
  expect(generateDialogue.mock.calls[0][0]).toMatchObject({ chatText: text, chatWithImage: vision })
  expect(sceneText).not.toHaveBeenCalled(); expect(sceneVision).not.toHaveBeenCalled()
})

test('same guest operation reuses the server-signed private session while different guests remain separate', async () => {
  const first = request.agent(appWith({})), payload = { ...body, requestScopeKey: 'scope_12345', artworkId: 'canvas_12345', requestId: 'request_12345' }
  const a = await first.post('/api/nilo/scene').send(payload)
  expect(a.status).toBe(200)
  expect(a.headers['set-cookie'][0]).toContain('HttpOnly')
  expect((await first.post('/api/nilo/scene').send(payload)).status).toBe(200)
  expect(generateNiloScene).toHaveBeenCalledOnce()
  // A second agent on the SAME server receives another unpredictable identity.
  const app = appWith({}), left = request.agent(app), right = request.agent(app)
  await left.post('/api/nilo/scene').send(payload)
  await right.post('/api/nilo/scene').send(payload)
  expect(generateNiloScene).toHaveBeenCalledTimes(3)
})

test('changing the canvas within an operation is rejected instead of replaying a stale plan', async () => {
  const agent = request.agent(appWith({})), payload = { ...body, requestScopeKey: 'scope_12345', artworkId: 'canvas_12345', requestId: 'request_12345' }
  expect((await agent.post('/api/nilo/scene').send(payload)).status).toBe(200)
  expect((await agent.post('/api/nilo/scene').send({ ...payload, context: { ...payload.context, revision: 2 } })).status).toBe(409)
  expect(generateNiloScene).toHaveBeenCalledOnce()
})

test('free guest session initialization completes before a cancellable drawing request and calls no provider', async () => {
  const agent = request.agent(appWith({}))
  const session = await agent.get('/api/nilo/scene/session')
  expect(session.status).toBe(200)
  expect(session.body).toEqual({ ready: true })
  expect(session.headers['set-cookie'][0]).toContain('nilo_scene_session=')
  expect(generateNiloScene).not.toHaveBeenCalled()
  const renewed = await agent.get('/api/nilo/scene/session')
  expect(renewed.headers['set-cookie'][0]).toBe(session.headers['set-cookie'][0])
  expect(generateNiloScene).not.toHaveBeenCalled()
  const response = await agent.post('/api/nilo/scene').send({ ...body, requestScopeKey: 'scope_12345', artworkId: 'canvas_12345', requestId: 'request_12345' })
  expect(response.status).toBe(200)
  expect(response.headers['set-cookie']).toBeUndefined()
})
