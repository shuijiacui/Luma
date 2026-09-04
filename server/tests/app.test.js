import { test, expect } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { createDb } from '../src/db.js'

test('GET /api/health returns ok', async () => {
  const res = await request(createApp({ db: createDb(':memory:') })).get('/api/health')
  expect(res.status).toBe(200)
  expect(res.body).toEqual({ ok: true })
})
