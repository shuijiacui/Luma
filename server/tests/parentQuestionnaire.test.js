import { afterEach, expect, test } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { createDb } from '../src/db.js'
import { registerChild, registerParent } from '../src/services/authService.js'
import { deleteFamily } from '../src/services/familyDeletion.js'
import { readQuestionnaireContext } from '../src/services/parentQuestionnaireContext.js'

const resources = []
afterEach(() => { for (const cleanup of resources.splice(0).reverse()) cleanup() })

function setup() {
  const db = createDb(':memory:')
  resources.push(() => db.close())
  const parent = registerParent(db, { name: '妈妈', email: 'questionnaire@example.com', password: 'secret6' })
  const otherParent = registerParent(db, { name: '爸爸', email: 'other-questionnaire@example.com', password: 'secret6' })
  const child = registerChild(db, { nickname: '小树', creationCode: '1234', inviteCode: parent.family.inviteCode })
  return { db, app: createApp({ db, periodReportsEnabled: false }), parent, otherParent, child }
}

const auth = account => `Bearer ${account.token}`
const answers = Object.fromEntries(Array.from({ length: 15 }, (_, index) => [`q${index + 1}`, 3]))

test('parent questionnaire appends immutable revisions and isolates records by parent', async () => {
  const { db, app, parent, otherParent, child } = setup()
  const first = await request(app)
    .post('/api/parent-questionnaire')
    .set('Authorization', auth(parent))
    .send({ revision: 0, childAge: 7, answers })
  expect(first.status).toBe(201)
  expect(first.body).toMatchObject({ revision: 1, childAge: 7 })
  expect(first.body.scores.total).toBe(63.3)

  const stale = await request(app)
    .post('/api/parent-questionnaire')
    .set('Authorization', auth(parent))
    .send({ revision: 0, childAge: 7, answers })
  expect(stale.status).toBe(409)

  const updatedAnswers = { ...answers, q1: 4, q3: 2 }
  const second = await request(app)
    .post('/api/parent-questionnaire')
    .set('Authorization', auth(parent))
    .send({ revision: 1, childAge: 7, answers: updatedAnswers })
  expect(second.status).toBe(201)
  expect(second.body).toMatchObject({ revision: 2, childAge: 7 })
  expect(second.body.scores.total).toBeGreaterThan(first.body.scores.total)

  const history = await request(app)
    .get('/api/parent-questionnaire/history')
    .set('Authorization', auth(parent))
  expect(history.status).toBe(200)
  expect(history.body.responses.map(item => item.revision)).toEqual([2, 1])
  expect(history.body.responses[1].answers.q1).toBe(3)

  expect((await request(app).get('/api/parent-questionnaire/history').set('Authorization', auth(otherParent))).body.responses).toEqual([])
  await request(app).post('/api/parent-questionnaire').set('Authorization', auth(child)).send({ revision: 0, childAge: 7, answers }).expect(403)
  await request(app).post('/api/parent-questionnaire').send({ revision: 0, childAge: 7, answers }).expect(401)
  await request(app).post('/api/parent-questionnaire').set('Authorization', auth(parent)).send({ revision: 2, childAge: 20, answers }).expect(400)
  await request(app).post('/api/parent-questionnaire').set('Authorization', auth(parent)).send({ revision: 2, childAge: 7, answers: { q1: 4 } }).expect(400)

  deleteFamily(db, parent.session.familyId, '.')
  expect(db.prepare('SELECT COUNT(*) AS n FROM parent_questionnaire_versions WHERE parent_id = ?').get(parent.session.id).n).toBe(0)
})

test('child-scoped history retains legacy records, paginates, and keeps consent private', async () => {
  const { db, app, parent, otherParent, child } = setup()
  const sibling = registerChild(db, { nickname: '小花', creationCode: '5678', inviteCode: parent.family.inviteCode })
  const save = body => request(app).post('/api/parent-questionnaire').set('Authorization', auth(parent)).send({ childAge: 7, answers, ...body })
  const history = id => request(app).get(`/api/parent-questionnaire/history?childId=${id}`).set('Authorization', auth(parent))
  await save({ revision: 0 }).expect(201)
  for (let revision = 1; revision <= 25; revision++) await save({ revision, childId: child.session.id }).expect(201)
  await save({ revision: 26, childId: sibling.session.id }).expect(201)
  const page = (await history(child.session.id)).body
  expect(page).toMatchObject({ total: 25, latestRevision: 27, nextOffset: 24, enabled: false })
  expect(page.responses).toHaveLength(24)
  expect(page.responses.every(row => row.childId === child.session.id)).toBe(true)
  const older = (await request(app).get(`/api/parent-questionnaire/history?childId=${child.session.id}&offset=24`).set('Authorization', auth(parent))).body
  expect(older.responses.map(row => row.revision)).toEqual([2])
  expect(older.nextOffset).toBeNull()
  expect((await history('')).body.responses.map(row => row.revision)).toEqual([1])
  expect((await history(sibling.session.id)).body.responses.map(row => row.revision)).toEqual([27])
  const preference = token => request(app).put('/api/parent-questionnaire/preferences').set('Authorization', auth(token))
  await preference(otherParent).send({ childId: child.session.id, enabled: true }).expect(403)
  await preference(child).send({ childId: child.session.id, enabled: true }).expect(403)
  await preference(parent).send({ childId: child.session.id, enabled: 'true' }).expect(400)
  await preference(parent).send({ childId: child.session.id, enabled: true }).expect(200)
  expect((await history(child.session.id)).body.enabled).toBe(true)
  expect(readQuestionnaireContext(db, parent.session.id, sibling.session.id)).toBeNull()
  expect(readQuestionnaireContext(db, otherParent.session.id, child.session.id)).toBeNull()
  await request(app).get(`/api/parent-questionnaire/history?childId=${child.session.id}`).set('Authorization', auth(otherParent)).expect(403)
  await request(app).post('/api/parent-questionnaire').set('Authorization', auth(otherParent)).send({ revision: 0, childAge: 7, answers, childId: child.session.id }).expect(403)
  deleteFamily(db, parent.session.familyId, '.')
  expect(db.prepare('SELECT COUNT(*) AS n FROM parent_questionnaire_preferences').get().n).toBe(0)
})
