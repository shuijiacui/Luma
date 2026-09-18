import { afterEach, expect, test } from 'vitest'
import request from 'supertest'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createDb } from '../src/db.js'
import { createApp } from '../src/app.js'
import { registerParent, registerChild, loginChild } from '../src/services/authService.js'
import { deleteFamily } from '../src/services/familyDeletion.js'

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aO2kAAAAASUVORK5CYII='
const resources = []
afterEach(() => { for (const cleanup of resources.splice(0).reverse()) cleanup() })
function setup(dbPath = ':memory:') {
  const db = createDb(dbPath)
  resources.push(() => db.close())
  const parent = registerParent(db, { name: '妈妈', email: 'art@example.com', password: 'secret6' })
  const child = registerChild(db, { nickname: '画画', creationCode: '1234', inviteCode: parent.family.inviteCode })
  const sibling = registerChild(db, { nickname: '星星', creationCode: '5678', inviteCode: parent.family.inviteCode })
  const app = createApp({ db, entries: [], periodReportsEnabled: false })
  return { db, app, parent, child, sibling }
}
const auth = account => `Bearer ${account.token}`

test('saved artwork survives a new database connection and login; retries do not duplicate it', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'luma-artworks-'))
  resources.push(() => fs.rmSync(dir, { recursive: true, force: true }))
  const dbPath = path.join(dir, 'test.sqlite')
  const { app, child } = setup(dbPath)
  const id = crypto.randomUUID()
  const save = () => request(app).put(`/api/artworks/${id}`).set('Authorization', auth(child)).send({ image: PNG, revision: 0 })
  expect((await save()).body.revision).toBe(1)
  expect((await save()).body.revision).toBe(1)
  const reopened = createDb(dbPath)
  resources.push(() => reopened.close())
  const newApp = createApp({ db: reopened, entries: [], periodReportsEnabled: false })
  const relogin = loginChild(reopened, { nickname: '画画', creationCode: '1234' })
  const result = await request(newApp).get(`/api/artworks/${id}`).set('Authorization', auth(relogin))
  expect(result.status).toBe(200)
  expect(result.body.image).toBe(PNG)
  expect((await request(newApp).get('/api/artworks').set('Authorization', auth(relogin))).body.artworks).toHaveLength(1)
  expect(reopened.prepare('SELECT COUNT(*) AS n FROM analyses').get().n).toBe(0)
})

test('artworks and images are isolated per child; invalid input and stale saves cannot overwrite', async () => {
  const { app, child, sibling, parent, db } = setup()
  const id = crypto.randomUUID()
  await request(app).put(`/api/artworks/${id}`).set('Authorization', auth(child)).send({ image: PNG, revision: 0 }).expect(200)
  for (const suffix of ['', '/image']) {
    await request(app).get(`/api/artworks/${id}${suffix}`).expect(401)
    await request(app).get(`/api/artworks/${id}${suffix}`).set('Authorization', auth(sibling)).expect(404)
    await request(app).get(`/api/artworks/${id}${suffix}`).set('Authorization', auth(parent)).expect(403)
  }
  expect((await request(app).get('/api/artworks').set('Authorization', auth(sibling))).body.artworks).toEqual([])
  await request(app).put(`/api/artworks/${id}`).set('Authorization', auth(sibling)).send({ image: PNG, revision: 1 }).expect(404)
  await request(app).put(`/api/artworks/${id}`).set('Authorization', auth(child)).send({ image: 'data:image/png;base64,bm90LXBuZw==', revision: 1 }).expect(400)
  // Simulate a newer saved version without needing a second fixture image.
  db.prepare('UPDATE artworks SET revision = 2, image_base64 = ? WHERE id = ?').run('newer', id)
  await request(app).put(`/api/artworks/${id}`).set('Authorization', auth(child)).send({ image: PNG, revision: 1 }).expect(409)
  expect(db.prepare('SELECT image_base64 FROM artworks WHERE id = ?').get(id).image_base64).toBe('newer')
})

test('continuing updates the same artwork; deleting family removes saved canvases', async () => {
  const { app, child, db } = setup()
  const id = crypto.randomUUID()
  await request(app).put(`/api/artworks/${id}`).set('Authorization', auth(child)).send({ image: PNG, revision: 0 }).expect(200)
  db.prepare('UPDATE artworks SET image_base64 = ? WHERE id = ?').run('previous', id)
  const update = await request(app).put(`/api/artworks/${id}`).set('Authorization', auth(child)).send({ image: PNG, revision: 1 })
  expect(update.body.revision).toBe(2)
  expect((await request(app).get('/api/artworks').set('Authorization', auth(child))).body.artworks).toHaveLength(1)
  deleteFamily(db, child.session.familyId, '.')
  expect(db.prepare('SELECT COUNT(*) AS n FROM artworks').get().n).toBe(0)
})

test('operation logs preserve authorship across reloads and reject stale same-PNG document changes', async () => {
  const { app, child, db } = setup()
  const id = crypto.randomUUID()
  const document = { version: 1, baseSource: 'child', operations: [{ owner: 'nilo', type: 'stroke', groupId: 'contribution', brushKind: 'round', color: '#123456', size: 4, eraser: false, referenceWidth: 320, referenceHeight: 240, points: [{ x: .2, y: .3 }] }] }
  const save = (body) => request(app).put(`/api/artworks/${id}`).set('Authorization', auth(child)).send({ image: PNG, ...body })
  const created = await save({ revision: 0, document })
  expect(created.status).toBe(200)
  expect(created.body.provenance).toBe('co-created')
  expect((await save({ revision: 0, document })).body.revision).toBe(1)
  expect((await request(app).get(`/api/artworks/${id}`).set('Authorization', auth(child))).body.document).toEqual(document)
  expect((await request(app).get('/api/artworks').set('Authorization', auth(child))).body.artworks[0].provenance).toBe('co-created')
  const changed = { ...document, operations: [] }
  expect((await save({ revision: 0, document: changed })).status).toBe(409)
  expect(JSON.parse(db.prepare('SELECT document_json FROM artworks WHERE id = ?').get(id).document_json)).toEqual(document)
  expect((await save({ revision: 1, document: changed })).body).toMatchObject({ revision: 2, provenance: 'child' })
  expect((await save({ revision: 2, document: { ...document, operations: [{ ...document.operations[0], points: [{ x: 2, y: 0 }] }] } })).status).toBe(400)
  expect((await save({ revision: 2, document: { ...document, version: 2 } })).status).toBe(400)
})

test('legacy PNG saves remain usable but have unknown authorship', async () => {
  const { app, child } = setup()
  const id = crypto.randomUUID()
  const saved = await request(app).put(`/api/artworks/${id}`).set('Authorization', auth(child)).send({ image: PNG, revision: 0 })
  expect(saved.body.provenance).toBe('unknown')
})

test('accepted collaboration remains attributed after all companion strokes are removed', async () => {
  const { app, child } = setup()
  const id = crypto.randomUUID()
  const document = { version: 1, baseSource: 'child', coCreated: true, operations: [] }
  const saved = await request(app).put(`/api/artworks/${id}`).set('Authorization', auth(child)).send({ image: PNG, revision: 0, document })
  expect(saved.body.provenance).toBe('co-created')
  expect((await request(app).get(`/api/artworks/${id}`).set('Authorization', auth(child))).body.document.coCreated).toBe(true)
})
