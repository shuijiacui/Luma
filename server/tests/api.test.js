import { test, expect } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { createDb } from '../src/db.js'

const FEATURES = {
  rawDescription: '画面有一座房子和一棵树。',
  elements: ['house', 'tree'],
  colors: { dominant: ['green'], darkRatio: 0.1 },
  composition: { size: 'normal', position: 'center', pressure: 'normal' },
  distortions: [],
  erasureMarks: 0,
  confidence: { elements: 0.9, colors: 0.85, composition: 0.8, distortions: 0.6, erasureMarks: 0.55 },
}

const ENTRIES = [
  { id: 'HTP-001', featureMatch: { elements: ['house', 'tree'] }, emotionSignal: '乐观平稳', cluster: 'classic_htp', strength: 0.3, reliability: 0.7, tier: 1, source: 'test', note: '房树共现为画面完整性的积极信号' },
]

const RED_LINE = /抑郁|焦虑障碍|多动症|自闭|孤独症|双相|精神分裂|心理疾病|诊断|难过|悲伤|害怕|紧张/

function makeApp(chatWithImage) {
  return createApp({
    chatWithImage: chatWithImage ?? (async () => structuredClone(FEATURES)),
    entries: ENTRIES,
    db: createDb(':memory:'),
  })
}

test('POST /api/analyze returns features + descriptive feedback (no emotion/leading words)', async () => {
  const res = await request(makeApp()).post('/api/analyze').send({ imageBase64: 'aGVsbG8=' })
  expect(res.status).toBe(200)
  expect(res.body.features.elements).toEqual(['house', 'tree'])
  expect(res.body.feedbackText).toContain('房子')
  expect(res.body.feedbackText).toContain('树')
  expect(res.body.feedbackText).not.toMatch(RED_LINE) // 红线 4：禁诱导/情绪词
  expect(res.body.followUp).toBe('还想再画点什么吗？')
})

test('POST /api/analyze merges priorFeatures (补充绘画)', async () => {
  const prior = { ...FEATURES, elements: ['house'], erasureMarks: 1 }
  const res = await request(makeApp()).post('/api/analyze').send({ imageBase64: 'aGVsbG8=', priorFeatures: prior })
  expect(res.status).toBe(200)
  expect(res.body.features.elements).toEqual(expect.arrayContaining(['house', 'tree']))
  expect(res.body.features.erasureMarks).toBe(1)
})

test('POST /api/analyze 400 without imageBase64', async () => {
  const res = await request(makeApp()).post('/api/analyze').send({})
  expect(res.status).toBe(400)
  expect(res.body).toEqual({ error: 'imageBase64 required' })
})

test('POST /api/analyze 502 when LLM extraction fails', async () => {
  const app = makeApp(async () => { throw new Error('LLMParseError: bad') })
  const res = await request(app).post('/api/analyze').send({ imageBase64: 'aGVsbG8=' })
  expect(res.status).toBe(502)
  expect(res.body).toEqual({ error: 'feature_extraction_failed' })
})

test('POST /api/report returns emotion/confidence/evidence/parentAdvice', async () => {
  const res = await request(makeApp()).post('/api/report').send({ features: FEATURES })
  expect(res.status).toBe(200)
  expect(res.body.emotion).toBe('乐观平稳')
  expect(res.body.confidence).toBeGreaterThan(0)
  expect(res.body.evidence.length).toBeGreaterThan(0)
  for (const e of res.body.evidence) {
    expect(ENTRIES.map(x => x.id)).toContain(e.entryId) // 条目 ID 必须真实存在
  }
  expect(Array.isArray(res.body.parentAdvice)).toBe(true)
  expect(res.body.parentAdvice.join('')).not.toMatch(/抑郁|多动症|自闭|精神分裂|心理疾病|诊断/)
})

test('POST /api/report 400 without features', async () => {
  const res = await request(makeApp()).post('/api/report').send({})
  expect(res.status).toBe(400)
  expect(res.body).toEqual({ error: 'features required' })
})
