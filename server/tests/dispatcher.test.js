import { test, expect } from 'vitest'
import request from 'supertest'
import { dispatchEntries } from '../src/services/kbDispatcher.js'
import { score, DEFAULT_CONFIG } from '../src/services/score.js'
import { createApp } from '../src/app.js'
import { createDb } from '../src/db.js'

const mk = (id, signal, cluster, s, r, tier, match = {}) =>
  ({ id, featureMatch: match, emotionSignal: signal, cluster, strength: s, reliability: r, tier, note: 'n' })

const FEATURES = {
  elements: ['rain', 'snow'], colors: { dominant: ['blue'], darkRatio: 0.2 },
  composition: { size: 'normal', position: 'center', pressure: 'normal' },
  distortions: [], erasureMarks: 3,
  confidence: { elements: 0.7, colors: 0.9, composition: 0.9, distortions: 0.9, erasureMarks: 0.9 },
}

// ---- 调度规则 1：L2+L3 组合不得越阈（预警必须有实证） ----
test('L2+L3-only group: E capped at l23Cap → cannot reach threshold', () => {
  const matches = [
    mk('L2-1', '焦虑倾向', 'c1', 0.2, 0.5, 2),   // w=0.1
    mk('L3-1', '焦虑倾向', 'c2', 0.2, 0.3, 3),   // w=0.06（若无 L1 共现还会被调度器丢弃）
    mk('L2-2', '焦虑倾向', 'c3', 0.2, 0.5, 2),
  ]
  const res = score(matches, FEATURES)
  expect(res.groups['焦虑倾向'].E).toBeLessThanOrEqual(0.6)
  expect(res.groups['焦虑倾向'].posterior).toBeLessThan(0.7)
  expect(res.emotion).not.toBe('焦虑倾向')
})

test('same weights with one L1 hit: no cap applied', () => {
  const matches = [
    mk('L1-1', '焦虑倾向', 'c1', 0.2, 0.5, 1),
    mk('L2-1', '焦虑倾向', 'c2', 0.2, 0.5, 2),
    mk('L2-2', '焦虑倾向', 'c3', 0.2, 0.5, 2),
  ]
  const res = score(matches, FEATURES)
  expect(res.groups['焦虑倾向'].E).toBeCloseTo(1 - 0.9 ** 3, 10)
})

// ---- 调度规则 2：L3 无 L1 共现被丢弃 ----
test('L3 entries dropped without same-group L1 co-occurrence', () => {
  const entries = [
    mk('L3-1', '低落倾向', 'c1', 0.2, 0.3, 3, { elements: ['rain'] }),
    mk('L3-2', '焦虑倾向', 'c2', 0.2, 0.3, 3, { elements: ['snow'] }),
  ]
  const { hits, dropped } = dispatchEntries({ features: FEATURES, entries })
  expect(hits).toHaveLength(0)
  expect(dropped.map(d => d.reason)).toEqual(expect.arrayContaining(['L3_requires_L1_cooccurrence']))
})

test('L3 kept when same-group L1 hit exists', () => {
  const entries = [
    mk('L1-1', '低落倾向', 'c1', 0.5, 0.7, 1, { elements: ['rain'] }),
    mk('L3-1', '低落倾向', 'c2', 0.2, 0.3, 3, { elements: ['snow'] }),
  ]
  const { hits } = dispatchEntries({ features: FEATURES, entries })
  expect(hits.map(h => h.id)).toEqual(expect.arrayContaining(['L1-1', 'L3-1']))
})

// ---- 调度规则 3：年龄调制（4-7 岁 c×0.5 门控） ----
test('age mod: affected entry dropped at age 5 (c 0.7×0.5=0.35 < 0.5), kept at default', () => {
  const constraints = {
    ageMods: {
      bands: [{ min: 4, max: 7, multiplier: 0.5 }, { min: 8, max: 12, multiplier: 0.8 }],
      affectedEntries: ['AGE-1'],
      defaultMultiplier: 1.0,
    },
  }
  const entries = [mk('AGE-1', '低落倾向', 'c1', 0.5, 0.7, 1, { elements: ['rain'] })] // 用 elements 维度 c=0.7

  const at5 = dispatchEntries({ features: FEATURES, entries, constraints, childAge: 5 })
  expect(at5.hits).toHaveLength(0)
  expect(at5.dropped[0].reason).toContain('age_mod')

  const at10 = dispatchEntries({ features: FEATURES, entries, constraints, childAge: 10 }) // c 0.7×0.8=0.56 ≥0.5
  expect(at10.hits).toHaveLength(1)

  const noAge = dispatchEntries({ features: FEATURES, entries, constraints })
  expect(noAge.hits).toHaveLength(1)
})

// ---- 调度规则 4：冲突显式化 ----
test('CONFLICT-01: rain+snow 双命中 → weather 簇两组均作废并登记', () => {
  const constraints = {
    conflictRegistry: [{ id: 'CONFLICT-01', entries: ['W-LOW', 'W-POS'], policy: 'weather 簇作废' }],
  }
  const entries = [
    mk('W-LOW', '低落倾向', 'weather', 0.4, 0.7, 1, { elements: ['rain'] }),
    mk('W-POS', '乐观平稳', 'weather', 0.4, 0.7, 1, { elements: ['snow'] }),
    mk('OTHER', '低落倾向', 'dark_color', 0.5, 0.7, 1, { 'colors.darkRatioMin': 0.1 }),
  ]
  const { hits, conflicts, dropped } = dispatchEntries({ features: FEATURES, entries, constraints })
  expect(conflicts).toEqual(['CONFLICT-01'])
  expect(hits.map(h => h.id)).toEqual(['OTHER']) // weather 簇两条都被作废
  expect(dropped).toHaveLength(2)
})

test('CONFLICT-02: 擦改条目需线条簇支撑，否则不计入', () => {
  const constraints = {
    conflictRegistry: [{ id: 'CONFLICT-02', entries: ['ERA-1'], policy: '需线条簇' }],
  }
  const erasEntry = [mk('ERA-1', '焦虑倾向', 'erasure', 0.5, 0.7, 1, { erasureMarksMin: 3 })]
  const noLine = dispatchEntries({ features: FEATURES, entries: erasEntry, constraints })
  expect(noLine.hits).toHaveLength(0)
  expect(noLine.conflicts).toEqual(['CONFLICT-02'])

  const withLine = dispatchEntries({
    features: FEATURES,
    entries: [...erasEntry, mk('LINE-1', '焦虑倾向', 'line_quality', 0.3, 0.7, 1, { 'composition.pressure': 'normal' })],
    constraints,
  })
  expect(withLine.hits.map(h => h.id)).toEqual(expect.arrayContaining(['ERA-1', 'LINE-1']))
})

// ---- 趋势接口 ----
test('trend: 聚合历史报告，direction 三态正确，权限隔离', async () => {
  const app = createApp({
    chatWithImage: async () => ({
      rawDescription: 'd', elements: ['house'], colors: { dominant: ['red'], darkRatio: 0.1 },
      composition: { size: 'normal', position: 'center', pressure: 'normal' },
      distortions: [], erasureMarks: 0,
      confidence: { elements: 0.9, colors: 0.9, composition: 0.9, distortions: 0.9, erasureMarks: 0.9 },
    }),
    entries: [],
    db: createDb(':memory:'),
  })
  const parent = (await request(app).post('/api/auth/parent/register')
    .send({ name: 'M', email: 'trend@luma.dev', password: 'secret6' })).body
  const child = (await request(app).post('/api/auth/child/register')
    .send({ nickname: '趋势娃', creationCode: '1234', inviteCode: parent.family.inviteCode })).body

  // 不足 2 份报告 → insufficient
  let trend = (await request(app).get(`/api/children/${child.session.id}/trend`)
    .set('Authorization', `Bearer ${parent.token}`)).body
  expect(trend.direction).toBe('insufficient')

  // 产生 2 份报告（entries 为空 → 未见明显风险信号）
  for (let i = 0; i < 2; i += 1) {
    const ana = await request(app).post('/api/analyze')
      .set('Authorization', `Bearer ${child.token}`).send({ imageBase64: 'aGVsbG8=' })
    await request(app).post('/api/report')
      .set('Authorization', `Bearer ${parent.token}`)
      .send({ features: ana.body.features, analysisId: ana.body.analysisId })
  }
  trend = (await request(app).get(`/api/children/${child.session.id}/trend`)
    .set('Authorization', `Bearer ${parent.token}`)).body
  expect(trend.direction).toBe('stable')
  expect(trend.withReport).toBe(2)
  expect(trend.points).toHaveLength(2)
  expect(trend.counts['未见明显风险信号']).toBe(2)

  // 权限：陌生家长 403，未登录 401
  const stranger = (await request(app).post('/api/auth/parent/register')
    .send({ name: 'S', email: 'stranger2@luma.dev', password: 'secret6' })).body
  expect((await request(app).get(`/api/children/${child.session.id}/trend`)
    .set('Authorization', `Bearer ${stranger.token}`)).status).toBe(403)
  expect((await request(app).get(`/api/children/${child.session.id}/trend`)).status).toBe(401)
})
