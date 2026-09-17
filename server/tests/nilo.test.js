import { afterEach, expect, test } from 'vitest'
import request from 'supertest'

import { createDb } from '../src/db.js'
import { createApp } from '../src/app.js'
import { registerParent, registerChild } from '../src/services/authService.js'
import { buildNiloStrokePrompt, generateNiloStroke, validateNiloStroke } from '../src/services/niloCompanion.js'

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aO2kAAAAASUVORK5CYII='
const VALID = { kind: 'wave', points: [[0.2, 0.7], [0.3, 0.65], [0.4, 0.7]], color: '#6fa8d8', width: 6, say: '我在这里加一条小波浪～' }

const resources = []
afterEach(() => { for (const cleanup of resources.splice(0).reverse()) cleanup() })

function setup(chatWithImage) {
  const db = createDb(':memory:')
  resources.push(() => db.close())
  const parent = registerParent(db, { name: '妈妈', email: 'nilo@example.com', password: 'secret6' })
  const child = registerChild(db, { nickname: '画画', creationCode: '1234', inviteCode: parent.family.inviteCode })
  const app = createApp({ db, entries: [], periodReportsEnabled: false, chatWithImage })
  return { db, app, parent, child }
}
const auth = account => `Bearer ${account.token}`

test('合法的一笔会被规范化后返回（坐标数组 → {x,y}）', async () => {
  const { app } = setup(async () => VALID)
  const res = await request(app)
    .post('/api/nilo/stroke')
    .send({ imageBase64: PNG, mode: 'turn', context: { locale: 'zh', strokes: 3, recentColors: ['#6fa8d8'] } })
  expect(res.status).toBe(200)
  expect(res.body.stroke).toEqual({
    kind: 'wave',
    points: [{ x: 0.2, y: 0.7 }, { x: 0.3, y: 0.65 }, { x: 0.4, y: 0.7 }],
    color: '#6fa8d8',
    width: 6,
    say: '我在这里加一条小波浪～',
  })
})

test('越界坐标 / 非法颜色 / 不适措辞都会被拒绝', () => {
  expect(validateNiloStroke({ ...VALID, points: [[1.4, 0.2], [0.3, 0.4]] })).toBeNull()
  expect(validateNiloStroke({ ...VALID, color: 'red' })).toBeNull()
  expect(validateNiloStroke({ ...VALID, width: 99 })).toBeNull()
  expect(validateNiloStroke({ ...VALID, points: [[0.2, 0.2]] })).toBeNull()
  expect(validateNiloStroke({ ...VALID, say: '我们去画一把刀吧' })).toBeNull()
  expect(validateNiloStroke({ ...VALID, kind: 'explosion' })).toBeNull()
  expect(validateNiloStroke(VALID)?.kind).toBe('wave')
})

test('提示词包含安全与坐标约束，并按语言要求 say', () => {
  const zh = buildNiloStrokePrompt({ mode: 'ask', locale: 'zh' })
  expect(zh).toContain('禁止恐怖、暴力、血腥')
  expect(zh).toContain('0 到 1')
  expect(zh).toContain('只输出 JSON')
  expect(zh).toContain('中文，不超过 18 个字')
  expect(buildNiloStrokePrompt({ locale: 'en' })).toContain('英文，不超过 8 个单词')
})

test('模型超时会快速返回 null，交给前端本地笔触降级', async () => {
  const started = Date.now()
  const result = await generateNiloStroke({
    imageBase64: 'AAAA',
    timeoutMs: 60,
    chatWithImage: () => new Promise(() => {}),
  })
  expect(result.stroke).toBeNull()
  expect(Date.now() - started).toBeLessThan(1500)
})

test('模型报错或输出非法时返回 fallback，孩子不需要等待', async () => {
  const failing = setup(async () => { throw new Error('model down') })
  const failed = await request(failing.app).post('/api/nilo/stroke').send({ imageBase64: PNG, mode: 'turn' })
  expect(failed.status).toBe(200)
  expect(failed.body).toEqual({ stroke: null, fallback: true })

  const invalid = setup(async () => ({ kind: 'wave', points: 'nope', color: 'blue', width: 6 }))
  const bad = await request(invalid.app).post('/api/nilo/stroke').send({ imageBase64: PNG, mode: 'ask' })
  expect(bad.status).toBe(200)
  expect(bad.body.fallback).toBe(true)
})

test('游客可以用，登录家长账号会被拒绝，缺少图片会 400', async () => {
  const { app, parent, child } = setup(async () => VALID)
  const guest = await request(app).post('/api/nilo/stroke').send({ imageBase64: PNG, mode: 'turn' })
  expect(guest.status).toBe(200)

  const asChild = await request(app).post('/api/nilo/stroke').set('Authorization', auth(child)).send({ imageBase64: PNG, mode: 'turn' })
  expect(asChild.status).toBe(200)

  const asParent = await request(app).post('/api/nilo/stroke').set('Authorization', auth(parent)).send({ imageBase64: PNG, mode: 'turn' })
  expect(asParent.status).toBe(403)

  const noImage = await request(app).post('/api/nilo/stroke').send({ mode: 'turn' })
  expect(noImage.status).toBe(400)
})

test('孩子最后一笔与画面分布会进入提示词，越界坐标被过滤', async () => {
  const prompts = []
  const { app } = setup(async (_image, prompt) => { prompts.push(prompt); return VALID })
  const res = await request(app).post('/api/nilo/stroke').send({
    imageBase64: PNG,
    mode: 'turn',
    context: {
      intent: 'echo',
      inkGrid: [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      lastStroke: { points: [{ x: 0.2, y: 0.3 }, { x: 1.5, y: 0.3 }, { x: 0.4, y: 0.5 }], color: '#6fa8d8', width: 6 },
    },
  })
  expect(res.status).toBe(200)
  expect(prompts[0]).toContain('画面内容分布')
  expect(prompts[0]).toContain('顺着孩子最后一笔')
  expect(prompts[0]).toContain('0.2')
  expect(prompts[0]).not.toContain('1.5')
})

test('提示词告诉 Nilo 先看懂孩子画的是什么，再添相关的一笔', () => {
  const prompt = buildNiloStrokePrompt({ mode: 'turn', locale: 'zh' })
  expect(prompt).toContain('先花一秒判断孩子在画什么')
  expect(prompt).toContain('船、道路、旅行')
  expect(prompt).toContain('房子、家')
})

test('praise 接口返回具体夸奖 + 下一步建议，安全校验不过则降级', async () => {
  const ok = setup(async () => ({ praise: '这条线弯弯的，好像一条小路～', suggestion: '可以试着画一条小鱼。' }))
  const res = await request(ok.app).post('/api/nilo/praise').send({ imageBase64: PNG, context: { strokes: 1 } })
  expect(res.status).toBe(200)
  expect(res.body).toEqual({ praise: '这条线弯弯的，好像一条小路～', suggestion: '可以试着画一条小鱼。' })

  const bad = setup(async () => ({ praise: '我们去画一把刀', suggestion: 'x' }))
  const fallback = await request(bad.app).post('/api/nilo/praise').send({ imageBase64: PNG })
  expect(fallback.body).toEqual({ praise: null, fallback: true })

  const prompts = []
  const withContext = setup(async (_image, prompt) => { prompts.push(prompt); return { praise: '好', suggestion: '继续' } })
  await request(withContext.app).post('/api/nilo/praise').send({
    imageBase64: PNG,
    context: { strokes: 2, lastStroke: { points: [{ x: 0.2, y: 0.3 }, { x: 0.4, y: 0.5 }], color: '#6fa8d8', width: 5 }, inkGrid: [0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  })
  expect(prompts[0]).toContain('具体')
  expect(prompts[0]).toContain('最后一笔')
  expect(prompts[0]).toContain('画面内容分布')
})
