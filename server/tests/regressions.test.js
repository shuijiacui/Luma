import { test, expect, afterEach } from 'vitest'
import request from 'supertest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createDb } from '../src/db.js'
import { createApp } from '../src/app.js'
import { registerParent, registerChild } from '../src/services/authService.js'
import { insertAnalysis, attachReport, trendSummary } from '../src/services/historyService.js'
import { backupDb } from '../scripts/backup.mjs'
import { restoreBackup } from '../scripts/restore.mjs'
import { dispatchEntries } from '../src/services/kbDispatcher.js'
import { matchEntry } from '../src/services/retrieve.js'

const FEATURES = { rawDescription: '画面是一棵树', elements: ['tree'], colors: { dominant: ['green'], darkRatio: 0.1 }, composition: { size: 'normal', position: 'center', pressure: 'normal' }, distortions: [], erasureMarks: 0, confidence: { elements: .9, colors: .9, composition: .9, distortions: .9, erasureMarks: .9 } }
const disposals = []
afterEach(() => { while (disposals.length) disposals.pop()() })
function fixture(deps = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'luma-regression-'))
  const db = createDb(path.join(dir, 'data.sqlite'))
  disposals.push(() => { db.close(); if (path.resolve(dir).startsWith(path.resolve(os.tmpdir()) + path.sep)) fs.rmSync(dir, { recursive: true, force: true }) })
  const parent = registerParent(db, { name: 'P', email: 'p@example.test', password: 'secret123' })
  const child = registerChild(db, { nickname: 'C', creationCode: '1234', inviteCode: parent.family.inviteCode })
  const auth = { accountId: parent.session.id, role: 'parent', familyId: parent.session.familyId }
  const app = createApp({ db, uploadDir: path.join(dir, 'uploads'), entries: [], chatWithImage: async () => structuredClone(FEATURES), ...deps })
  const add = () => insertAnalysis(db, { childId: child.session.id, familyId: child.session.familyId, features: FEATURES })
  const analyze = (key = 'key') => request(app).post('/api/analyze').set('Authorization', `Bearer ${child.token}`).send({ imageBase64: 'aGVsbG8=', submissionKey: key })
  return { app, db, dir, parent, child, auth, add, analyze }
}

test('malformed report requests return 400 and server remains healthy', async () => {
  const { app } = fixture()
  for (const features of [{ elements: {} }, [], { ...FEATURES, elements: [null] }, { ...FEATURES, confidence: { ...FEATURES.confidence, colors: 3 } }]) {
    expect((await request(app).post('/api/report').send({ features })).status).toBe(400)
    expect((await request(app).get('/api/health')).body.ok).toBe(true)
  }
  expect((await request(app).post('/api/auth/parent/register').send({ name: {}, email: 'x', password: '123456' })).status).toBe(400)
})

test('expired analyze cannot silently become a guest; refresh then saves', async () => {
  const { app, db, child, analyze } = fixture()
  db.prepare('UPDATE sessions SET expires_at = ? WHERE token = ?').run('2000-01-01', child.token)
  expect((await analyze()).status).toBe(401)
  expect(db.prepare('SELECT COUNT(*) AS n FROM analyses').get().n).toBe(0)
  const pair = (await request(app).post('/api/auth/refresh').send({ refreshToken: child.refreshToken })).body
  const saved = await request(app).post('/api/analyze').set('Authorization', `Bearer ${pair.token}`).send({ imageBase64: 'aGVsbG8=' })
  expect(saved.body.analysisId).toBeTruthy()
})

test('parent generates from stored ID alone; child and unrelated family cannot access reports', async () => {
  const { app, parent, child, add } = fixture()
  const id = add()
  const generated = await request(app).post('/api/report').set('Authorization', `Bearer ${parent.token}`).send({ analysisId: id })
  expect(generated.status).toBe(200)
  expect((await request(app).post('/api/report').set('Authorization', `Bearer ${child.token}`).send({ analysisId: id })).status).toBe(403)
  expect((await request(app).post('/api/report').send({ analysisId: id, features: FEATURES })).status).toBe(401)
  const history = await request(app).get(`/api/children/${child.session.id}/analyses`).set('Authorization', `Bearer ${child.token}`)
  expect(history.body.analyses[0].report).toBeNull()
  expect((await request(app).get(`/api/children/${child.session.id}/trend`).set('Authorization', `Bearer ${child.token}`)).status).toBe(403)
  const other = (await request(app).post('/api/auth/parent/register').send({name:'other',email:'other@example.test',password:'123456'})).body
  expect((await request(app).post('/api/report').set('Authorization', `Bearer ${other.token}`).send({ analysisId:id })).status).toBe(403)
})

test('same submission key deduplicates concurrent and sequential completions', async () => {
  const { app, db, child, analyze } = fixture()
  const results = await Promise.all([analyze(), analyze()])
  expect(results[0].body.analysisId).toBe(results[1].body.analysisId)
  expect((await analyze()).body.analysisId).toBe(results[0].body.analysisId)
  expect(db.prepare('SELECT COUNT(*) AS n FROM analyses').get().n).toBe(1)
  const conflict = await request(app).post('/api/analyze').set('Authorization', `Bearer ${child.token}`).send({ imageBase64:'b3RoZXI=',submissionKey:'key' })
  expect(conflict.status).toBe(409)
})

test('a model response after family deletion cannot recreate a saved artwork', async () => {
  let entered, release
  const started = new Promise(resolve => { entered = resolve })
  const response = new Promise(resolve => { release = resolve })
  const { app, db, parent, dir, analyze } = fixture({ chatWithImage: () => { entered(); return response } })
  const pending = analyze().then(result => result)
  await started
  expect((await request(app).post('/api/auth/family/delete').set('Authorization', `Bearer ${parent.token}`).send({ password: 'secret123', confirmation: '删除整个家庭' })).status).toBe(200)
  release(structuredClone(FEATURES))
  expect((await pending).status).toBe(401)
  expect(db.prepare('SELECT COUNT(*) AS n FROM analyses').get().n).toBe(0)
  expect(fs.existsSync(path.join(dir, 'uploads'))).toBe(false)
})

test('a report removed during enrichment does not return false save success', async () => {
  let entered, release
  const started = new Promise(resolve => { entered = resolve })
  const response = new Promise(resolve => { release = resolve })
  const { app, db, parent, add } = fixture({
    entries: [{ id: 'HTP-001', featureMatch: { elements: ['tree'] }, tier: 1, strength: .5, reliability: .7, emotionSignal: '乐观平稳', cluster: 'tree', note: '画面有树' }],
    chatText: () => { entered(); return response },
  })
  const id = add()
  const pending = request(app).post('/api/report').set('Authorization', `Bearer ${parent.token}`).send({ analysisId: id }).then(result => result)
  await started
  expect((await request(app).post(`/api/analyses/${id}/delete`).set('Authorization', `Bearer ${parent.token}`)).status).toBe(200)
  release({})
  expect((await pending).status).toBe(404)
  expect(db.prepare('SELECT COUNT(*) AS n FROM analyses').get().n).toBe(0)
})

test('history pagination includes all 55 records and trend keeps older reports', async () => {
  const { app, db, parent, child, auth, add } = fixture()
  for (let i=0;i<55;i++) {
    const id=add()
    if (i<2) attachReport(db,id,{ emotion:'信息不足', confidence:0, evidence:[], parentAdvice:[] },auth)
  }
  const first = (await request(app).get(`/api/children/${child.session.id}/analyses`).set('Authorization',`Bearer ${parent.token}`)).body
  const last = (await request(app).get(`/api/children/${child.session.id}/analyses?offset=${first.nextOffset}`).set('Authorization',`Bearer ${parent.token}`)).body
  expect(first.total).toBe(55)
  expect(first.analyses.length+last.analyses.length).toBe(55)
  expect(new Set([...first.analyses,...last.analyses].map(x=>x.id)).size).toBe(55)
  expect(trendSummary(db,child.session.id,auth)).toMatchObject({total:55,withReport:2,direction:'insufficient'})
})

test('parent birthday is stored and used instead of client supplied age', async () => {
  const { app, db, parent, child, add } = fixture({entries:[{id:'HTP-001',featureMatch:{elements:['tree']},tier:1,strength:.5,reliability:.7,emotionSignal:'乐观平稳',cluster:'tree',note:'画面有树'}]})
  const route=`/api/children/${child.session.id}/profile`
  expect((await request(app).post(route).set('Authorization',`Bearer ${child.token}`).send({birthDate:'2020-01-01'})).status).toBe(403)
  expect((await request(app).post(route).set('Authorization',`Bearer ${parent.token}`).send({birthDate:'2020-02-31'})).status).toBe(400)
  expect((await request(app).post(route).set('Authorization',`Bearer ${parent.token}`).send({birthDate:'2020-01-01'})).status).toBe(200)
  expect(db.prepare('SELECT birth_date FROM accounts WHERE id = ?').get(child.session.id).birth_date).toBe('2020-01-01')
  const id = add()
  const year = new Date().getUTCFullYear() - 5
  db.prepare('UPDATE accounts SET birth_date = ? WHERE id = ?').run(`${year}-01-01`, child.session.id)
  const report = await request(app).post('/api/report').set('Authorization',`Bearer ${parent.token}`).send({analysisId:id,childAge:18})
  expect(report.status).toBe(200)
  const stored = JSON.parse(db.prepare('SELECT report_json FROM analyses WHERE id = ?').get(id).report_json)
  expect(stored.audit.dropped.some(x => x.reason.startsWith('age_mod'))).toBe(true)
})

test('digital canvas excludes unmeasured behavior; legacy weak spelling matches light', () => {
  const entry={ id:'pressure', featureMatch:{'composition.pressure':'weak'}, tier:1, strength:.5, reliability:.5, emotionSignal:'焦虑倾向' }
  const features={...FEATURES,composition:{...FEATURES.composition,pressure:'light'}}
  expect(matchEntry(entry,features)).toBe(true)
  const result=dispatchEntries({features:{...features,source:'digital_canvas'},entries:[entry]})
  expect(result.hits).toHaveLength(0)
  expect(result.dropped[0].reason).toContain('digital_canvas')
})

test('backup contains original bytes; restore is portable and refuses overwrite', async () => {
  const {dir,analyze} = fixture()
  await analyze()
  const {target}=backupDb({dbPath:path.join(dir,'data.sqlite'),backupDir:path.join(dir,'backups'),uploadDir:path.join(dir,'uploads')})
  const restored=restoreBackup({backupPath:target,destination:path.join(dir,'restored')})
  const db=createDb(restored.dbPath)
  try {
    const row=db.prepare('SELECT image_path FROM analyses').get()
    expect(fs.readFileSync(path.join(restored.uploadDir,row.image_path),'utf8')).toBe('hello')
  } finally {db.close()}
  expect(()=>restoreBackup({backupPath:target,destination:path.join(dir,'restored')})).toThrow('must not exist')
})

test('delete requires family parent and removes both history and image', async () => {
  const {app,db,dir,child,parent,analyze}=fixture()
  const id=(await analyze()).body.analysisId
  const filename=db.prepare('SELECT image_path FROM analyses WHERE id=?').get(id).image_path
  expect((await request(app).post(`/api/analyses/${id}/delete`).set('Authorization',`Bearer ${child.token}`)).status).toBe(403)
  expect((await request(app).post(`/api/analyses/${id}/delete`).set('Authorization',`Bearer ${parent.token}`)).status).toBe(200)
  expect(db.prepare('SELECT id FROM analyses WHERE id=?').get(id)).toBeUndefined()
  expect(fs.existsSync(path.join(dir,'uploads',filename))).toBe(false)
})

test('slow text enrichment returns baseline within the total budget', async () => {
  const original=process.env.REPORT_BUDGET_MS
  process.env.REPORT_BUDGET_MS='100'
  try {
    const {app,parent,add}=fixture({entries:[{id:'one',featureMatch:{elements:['tree']},tier:1,strength:.5,reliability:.7,emotionSignal:'乐观平稳',cluster:'tree',note:'画面有树'}],chatText:()=>new Promise(()=>{})})
    const started=Date.now()
    const response=await request(app).post('/api/report').set('Authorization',`Bearer ${parent.token}`).send({analysisId:add()})
    expect(response.status).toBe(200)
    expect(response.body.emotion).toBe('乐观平稳')
    expect(Date.now()-started).toBeLessThan(2000)
  } finally { if(original===undefined) delete process.env.REPORT_BUDGET_MS; else process.env.REPORT_BUDGET_MS=original }
})
