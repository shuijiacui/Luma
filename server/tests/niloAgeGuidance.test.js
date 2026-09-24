import express from 'express'
import request from 'supertest'
import { expect, test, vi } from 'vitest'
import { createNiloRouter } from '../src/routes/nilo.js'
import { ageBandForBirthDate, niloAgeGuidance } from '../src/services/niloAgeGuidance.js'
import { buildDialoguePrompt, clarificationReply, sanitizeDialogueContext } from '../src/services/niloDialogue.js'
import { buildCoCreationPrompt } from '../src/services/niloCoCreation.js'
import { knowledgePlanningPrompt } from '../src/services/niloDrawingKnowledge.js'
import { creativeIdeationPrompt } from '../src/services/niloIdeaFirst.js'

const today = new Date('2026-09-24T00:00:00Z')

test('verified birthday maps to a conversation band, not a drawing ability score', () => {
  expect(ageBandForBirthDate('2020-09-24', today)).toBe('5-7')
  expect(ageBandForBirthDate('2018-09-24', today)).toBe('8-9')
  expect(ageBandForBirthDate('2014-09-24', today)).toBe('10-12')
  expect(ageBandForBirthDate('2014-09-25', today)).toBe('10-12')
  expect(ageBandForBirthDate('2012-09-24', today)).toBeNull()
  expect(ageBandForBirthDate('2020-02-31', today)).toBeNull()
})

test('companion route ignores client-forged age and uses the child profile', async () => {
  const generateDialogue = vi.fn(async () => ({ status: 'clarify', reply: '好呀' }))
  const db = { prepare: () => ({ get: () => ({ birth_date: '2020-06-01' }) }) }
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => { if (req.headers.authorization) req.auth = { role: 'child', accountId: 'child-1' }; next() })
  app.use('/api/nilo', createNiloRouter({ db, generateDialogue, limits: { nilo: { max: 100, windowMs: 60000 } } }))
  await request(app).post('/api/nilo/companion').set('Authorization', 'Bearer child')
    .send({ context: { locale: 'zh', utterance: '你好', ageBand: '10-12' } }).expect(200)
  expect(generateDialogue.mock.calls[0][0].context).toMatchObject({ ageBand: '5-7' })
  await request(app).post('/api/nilo/companion')
    .send({ context: { locale: 'zh', utterance: '你好', ageBand: '10-12' } }).expect(200)
  expect(generateDialogue.mock.calls[1][0].context.ageBand).toBeNull()
})

test('all co-creation prompt paths adapt questions without constraining drawing ideas', () => {
  const young = sanitizeDialogueContext({ locale: 'zh', ageBand: '5-7', history: [], requestDrawing: true, takeTurn: true })
  const older = sanitizeDialogueContext({ ...young, ageBand: '10-12' })
  expect(niloAgeGuidance(young)).toContain('短句')
  expect(niloAgeGuidance(older)).toContain('创作选择')
  expect(clarificationReply(young)).toContain('接下来变成什么')
  expect(buildDialoguePrompt({ ...young, takeTurn: false }, false)).toContain(niloAgeGuidance(young))
  expect(buildCoCreationPrompt(young, ['leaf'])).toContain(niloAgeGuidance(young))
  expect(knowledgePlanningPrompt(older, { observation: {}, cards: [] })).toContain(niloAgeGuidance(older))
  expect(creativeIdeationPrompt(older)).toContain(niloAgeGuidance(older))
  expect(niloAgeGuidance({ locale: 'en', ageBand: null })).toContain('age is unknown')
})
