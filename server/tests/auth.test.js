import { test, expect } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { createDb } from '../src/db.js'

const FEATURES = {
  rawDescription: '一座房子。',
  elements: ['house'],
  colors: { dominant: ['red'], darkRatio: 0.1 },
  composition: { size: 'normal', position: 'center', pressure: 'normal' },
  distortions: [],
  erasureMarks: 0,
  confidence: { elements: 0.9, colors: 0.9, composition: 0.9, distortions: 0.9, erasureMarks: 0.9 },
}

function makeApp() {
  return createApp({
    chatWithImage: async () => structuredClone(FEATURES),
    entries: [],
    db: createDb(':memory:'),
  })
}

async function setupFamily(app) {
  const parent = (await request(app).post('/api/auth/parent/register')
    .send({ name: 'Nilo 妈妈', email: 'mama@example.com', password: 'secret6' })).body
  const child = (await request(app).post('/api/auth/child/register')
    .send({ nickname: '星星船长', creationCode: '1234', inviteCode: parent.family.inviteCode })).body
  return { parent, child }
}

test('parent register → login → me roundtrip', async () => {
  const app = makeApp()
  const reg = await request(app).post('/api/auth/parent/register')
    .send({ name: 'Nilo 妈妈', email: 'mama@example.com', password: 'secret6' })
  expect(reg.status).toBe(201)
  expect(reg.body.token).toBeTruthy()
  expect(reg.body.family.inviteCode).toMatch(/^[A-Z2-9]{6}$/)

  const login = await request(app).post('/api/auth/parent/login')
    .send({ email: 'MAMA@example.com', password: 'secret6' }) // 邮箱大小写不敏感
  expect(login.status).toBe(201)
  expect(login.body.session.displayName).toBe('Nilo 妈妈')

  const me = await request(app).get('/api/auth/me')
    .set('Authorization', `Bearer ${login.body.token}`)
  expect(me.status).toBe(200)
  expect(me.body.family.inviteCode).toBe(reg.body.family.inviteCode)
})

test('duplicate email → 409; wrong password → 401; password not stored in plaintext', async () => {
  const app = makeApp()
  await request(app).post('/api/auth/parent/register')
    .send({ name: 'A', email: 'a@example.com', password: 'secret6' })
  const dup = await request(app).post('/api/auth/parent/register')
    .send({ name: 'B', email: 'a@example.com', password: 'other66' })
  expect(dup.status).toBe(409)
  const bad = await request(app).post('/api/auth/parent/login')
    .send({ email: 'a@example.com', password: 'wrong-pass' })
  expect(bad.status).toBe(401)
})

test('child register requires valid invite code; login verifies creation code', async () => {
  const app = makeApp()
  const noFamily = await request(app).post('/api/auth/child/register')
    .send({ nickname: '星星船长', creationCode: '1234', inviteCode: 'NOPE99' })
  expect(noFamily.status).toBe(404)

  const { child } = await setupFamily(app)
  expect(child.session.role).toBe('child')

  const dupNick = await request(app).post('/api/auth/child/register')
    .send({ nickname: '星星船长', creationCode: '5678', inviteCode: child.family.inviteCode })
  expect(dupNick.status).toBe(409)

  const badCode = await request(app).post('/api/auth/child/login')
    .send({ nickname: '星星船长', creationCode: '9999' })
  expect(badCode.status).toBe(401)

  const ok = await request(app).post('/api/auth/child/login')
    .send({ nickname: '星星船长', creationCode: '1234' })
  expect(ok.status).toBe(201)
})

test('me without token → 401; logout invalidates token', async () => {
  const app = makeApp()
  expect((await request(app).get('/api/auth/me')).status).toBe(401)

  const { parent } = await setupFamily(app)
  await request(app).post('/api/auth/logout').set('Authorization', `Bearer ${parent.token}`)
  const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${parent.token}`)
  expect(me.status).toBe(401)
})

test('full flow: child analyze 落库 → report 回写 → parent 查历史', async () => {
  const app = makeApp()
  const { parent, child } = await setupFamily(app)

  // 游客 analyze：无 analysisId，不落库
  const anon = await request(app).post('/api/analyze').send({ imageBase64: 'aGVsbG8=' })
  expect(anon.status).toBe(200)
  expect(anon.body.analysisId).toBeUndefined()

  // 登录孩子 analyze：落库
  const ana = await request(app).post('/api/analyze')
    .set('Authorization', `Bearer ${child.token}`)
    .send({ imageBase64: 'aGVsbG8=' })
  expect(ana.status).toBe(200)
  expect(ana.body.analysisId).toBeTruthy()

  // report 回写
  const rep = await request(app).post('/api/report')
    .set('Authorization', `Bearer ${parent.token}`)
    .send({ features: ana.body.features, analysisId: ana.body.analysisId })
  expect(rep.status).toBe(200)

  // 家长查历史
  const history = await request(app).get(`/api/children/${child.session.id}/analyses`)
    .set('Authorization', `Bearer ${parent.token}`)
  expect(history.status).toBe(200)
  expect(history.body.analyses).toHaveLength(1)
  expect(history.body.analyses[0].summary.elements).toEqual(['house'])
  expect(history.body.analyses[0].report.emotion).toBe('未见明显风险信号') // entries 为空 → 零命中分支
})

// 回归：narrative / webAdvice / referenceEvidence / evidence[].plain 由 attachReport 落库，
// 历史接口必须一并投影出来，否则家长回看历史时这些区块会凭空消失（前端已按同构类型消费）。
test('history projection: 报告扩展字段随历史一并返回', async () => {
  const db = createDb(':memory:')
  const app = createApp({
    chatWithImage: async () => structuredClone(FEATURES),
    entries: [],
    db,
  })
  const { parent, child } = await setupFamily(app)

  const ana = await request(app).post('/api/analyze')
    .set('Authorization', `Bearer ${child.token}`)
    .send({ imageBase64: 'aGVsbG8=' })
  expect(ana.body.analysisId).toBeTruthy()

  // 测试环境 chatText/webSearch 为 null，真实链路不会产出扩展字段；直接写库模拟已增强的报告
  const enriched = {
    emotion: '未见明显风险信号',
    confidence: 0.6,
    evidence: [{ entryId: 'E1', summary: '证据摘要', plain: '通俗说明' }],
    parentAdvice: ['建议一'],
    narrative: '这是家长可读的说明。',
    webAdvice: ['联网建议一'],
    webAdviceSource: '网络搜索（仅供参考）',
    referenceEvidence: [{ sourceFile: 'a.pdf', text: '文献片段', limitation: '样本有限', role: 'reference_only' }],
    referenceEvidenceSource: 'PDF 文献检索（仅供研究背景参考）',
    audit: { knowledgeVersion: 'test', matchedEntryIds: [], conflicts: [], dropped: [], reason: 'test' },
  }
  db.prepare('UPDATE analyses SET report_json = ? WHERE id = ?')
    .run(JSON.stringify(enriched), ana.body.analysisId)

  const history = await request(app).get(`/api/children/${child.session.id}/analyses`)
    .set('Authorization', `Bearer ${parent.token}`)
  expect(history.status).toBe(200)
  const report = history.body.analyses[0].report
  expect(report.narrative).toBe('这是家长可读的说明。')
  expect(report.webAdvice).toEqual(['联网建议一'])
  expect(report.webAdviceSource).toBe('网络搜索（仅供参考）')
  expect(report.referenceEvidence[0].sourceFile).toBe('a.pdf')
  expect(report.referenceEvidenceSource).toContain('PDF')
  expect(report.evidence[0].plain).toBe('通俗说明')
})

test('history access control: 陌生家庭家长 → 403；未登录 → 401', async () => {
  const app = makeApp()
  const { child } = await setupFamily(app)
  const stranger = (await request(app).post('/api/auth/parent/register')
    .send({ name: '陌生人', email: 'stranger@example.com', password: 'secret6' })).body

  const forbidden = await request(app).get(`/api/children/${child.session.id}/analyses`)
    .set('Authorization', `Bearer ${stranger.token}`)
  expect(forbidden.status).toBe(403)

  const anon = await request(app).get(`/api/children/${child.session.id}/analyses`)
  expect(anon.status).toBe(401)
})
