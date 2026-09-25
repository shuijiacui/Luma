import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { PNG } from 'pngjs'
import request from 'supertest'

// Exercise request-boundary refresh without touching the developer's review file.
vi.mock('../src/services/niloCurationStore.js', async importOriginal => {
  const original = await importOriginal()
  const curation = await import('../../shared/niloCuration.mjs')
  return { ...original, refreshMaterialCuration: vi.fn(() => curation.getMaterialCuration()) }
})

import { generateNiloDialogue, validateProposal } from '../src/services/niloDialogue.js'
import { generateCreativeTurn } from '../src/services/niloCreativeTurn.js'
import { planIllustrationDrawing } from '../src/services/niloIllustrationDrawing.js'
import { drawingIllustrations, getDrawingIllustration } from '../../shared/niloIllustrations.mjs'
import { creativeRecipeCatalogue, getDrawingRecipe } from '../../shared/niloRecipes.mjs'
import { getMaterialCuration, setMaterialCuration } from '../../shared/niloCuration.mjs'
import { createApp } from '../src/app.js'
import { createDb } from '../src/db.js'

const originalCuration = getMaterialCuration()
beforeEach(() => setMaterialCuration({ version: 1, decisions: Object.fromEntries(drawingIllustrations
  .filter(item => item.id.startsWith('illustration-library-')).map(item => [item.id, 'reject'])) }))
afterEach(() => { setMaterialCuration(originalCuration); vi.clearAllMocks() })

const png = new PNG({ width: 900, height: 600 }); png.data.fill(255)
const imageBase64 = PNG.sync.write(png).toString('base64')
const context = { locale: 'zh', requestDrawing: true, takeTurn: true, drawingProtocol: 3, turnScope: 'scene', tracingGuide: true,
  canvasAspect: 1.5, canvasSize: { width: 900, height: 600 }, utterance: '轮到你了', history: [],
  drawingStyle: { color: '#203b34', brushSize: 4, brushKind: 'round' } }
const school = getDrawingIllustration('illustration-medium-school')
const richSchool = getDrawingIllustration('illustration-school')
const choice = { illustrationId: school.id, subject: school.name, relationship: '小镇里的学校', at: [.5, .5], scale: .65,
  reply: '学校的参考图来啦，可以先观察屋顶的轮廓。' }
const localContext = changes => ({ ...context, takeTurn: false, utterance: '画一座学校', ageBand: '10-12', ...changes })
async function creative(plan = choice, changes = {}) {
  const call = vi.fn().mockResolvedValue(plan)
  const result = await generateCreativeTurn({ imageBase64, context: { ...context, ...changes },
    knowledge: { observation: { subjects: [] }, cards: [] }, call, opts: { signal: new AbortController().signal }, validateProposal })
  return { result, call }
}

describe('illustration selection through the drawing planner', () => {
  test('the normal two-call observation/planning route returns a trusted, large tracing reference', async () => {
    const model = vi.fn().mockResolvedValueOnce({ subjects: [] }).mockResolvedValue(choice)
    const result = await generateNiloDialogue({ imageBase64, context, chatWithImage: model })
    expect(result).toMatchObject({ status: 'ready', protocolVersion: 3, proposal: { template: 'illustration', illustrationId: school.id, subject: school.name } })
    expect(result.proposal.width * context.canvasAspect / result.proposal.height).toBeCloseTo(school.aspect)
    expect(result.proposal.height).toBeGreaterThan(.45)
    expect(result.proposal.sketch).toBeUndefined()
    expect(result.proposal.recipeId).toBeUndefined()
    expect(result.proposal.src).toBeUndefined()
    expect(result.proposal.url).toBeUndefined()
    expect(model).toHaveBeenCalledTimes(2)
    expect(model.mock.calls.map(args => args[2].kind)).toEqual(['nilo_knowledge_observe', 'nilo_companion_vision'])
    expect(model.mock.calls[1][1]).toContain('ILLUSTRATION REFERENCES:')
    expect(model.mock.calls[1][1]).toContain(school.id)
    expect(model.mock.calls[1][1]).not.toContain(school.src)
  })

  test('a bitmap cannot enter the old accept-and-commit drawing flow', async () => {
    const { result, call } = await creative(choice, { tracingGuide: false })
    expect(result.proposal).toBeUndefined()
    expect(result.status).toBe('unavailable')
    expect(call).toHaveBeenCalledTimes(2)
    expect(call.mock.calls[0][0]).toContain('ILLUSTRATION REFERENCES: []')
  })

  test.each([
    { ...choice, illustrationId: 'illustration-not-in-catalogue' },
    { ...choice, illustrationId: 'https://example.com/arbitrary.png' },
    { subject: '学校', src: 'https://example.com/arbitrary.png' },
    { ...choice, recipeId: 'school-4' },
    { ...choice, sketch: getDrawingRecipe('school-4').sketch },
  ])('unsupported image authority or mixed media cannot become a guide: %j', async plan => {
    const { result, call } = await creative(plan)
    expect(result.proposal).toBeUndefined()
    expect(call).toHaveBeenCalledTimes(2)
  })

  test('a selected backup reference keeps its own identity, position and relationship', async () => {
    const backup = { ...choice, at: [.65, .7], scale: .55, relationship: '故事里新开的学校' }
    const { result } = await creative({ subject: 'unrenderable object', sketch: null, backup })
    expect(result.proposal).toMatchObject({ illustrationId: school.id, subject: school.name, relation: backup.relationship })
  })

  test('review decisions remove images from prompts and reject even an explicit stale model selection', async () => {
    setMaterialCuration({ version: 1, decisions: { ...getMaterialCuration().decisions, [school.id]: 'reject' } })
    const { result, call } = await creative()
    expect(result.proposal).toBeUndefined()
    expect(call.mock.calls[0][0]).not.toContain(`"id":"${school.id}"`)
    expect(planIllustrationDrawing(localContext())).toBeNull()
    expect(getDrawingIllustration(school.id)).toBe(school)
  })

  test('removing one studio vector expands its compact family without advertising the rejected ID', async () => {
    setMaterialCuration({ version: 1, decisions: { 'lamp-4': 'reject' } })
    const catalogue = creativeRecipeCatalogue([{ subject: '台灯' }])
    expect(catalogue.index).not.toContain('lamp/台灯 @6')
    expect(catalogue.index).not.toContain('lamp-4=')
    for (const suffix of [0, 1, 2, 3, 5]) expect(catalogue.index).toContain(`lamp-${suffix}=`)
    const { result } = await creative({ subject: '台灯', recipeId: 'lamp-4', at: [.5, .5], scale: .3 })
    expect(result.proposal).toBeUndefined()
  })
})

describe('child-friendly automatic medium choice', () => {
  test('a plain request on an empty canvas uses a medium reference for an older child without a style question', async () => {
    const model = vi.fn()
    const result = await generateNiloDialogue({ imageBase64, context: localContext(), chatWithImage: model })
    expect(result.proposal).toMatchObject({ template: 'illustration', illustrationId: school.id })
    expect(result.reply).not.toMatch(/写实风|精美风|选择.*风格/)
    expect(model).not.toHaveBeenCalled()
  })

  test('a younger child gets the medium standalone picture-book guide by default', async () => {
    const model = vi.fn()
    const result = await generateNiloDialogue({ imageBase64, context: localContext({ ageBand: '5-7' }), chatWithImage: model })
    expect(result.proposal?.template).toBe('illustration')
    expect(result.proposal?.illustrationId).toBe(school.id)
    expect(result.proposal?.recipeId).toBeUndefined()
    expect(model).not.toHaveBeenCalled()
  })

  test('existing ink leaves medium choice to the visual planner unless more detail is explicitly requested', () => {
    const scene = { childBounds: { x: .2, y: .2, width: .3, height: .4 } }
    expect(planIllustrationDrawing(localContext({ scene }))).toBeNull()
    expect(planIllustrationDrawing(localContext({ scene, ageBand: '5-7', utterance: '画一座像真的一样的学校' }))?.proposal?.illustrationId).toBe(richSchool.id)
  })

  test('plain-language detail requests preserve the existing guide location and rotation', async () => {
    const material = getDrawingIllustration('illustration-medium-bookshop')
    const currentProposal = { template: 'illustration', subject: material.name, illustrationId: material.id,
      x: .31, y: .27, width: .24, height: .31, rotation: 12, color: '#203b34', strokeWidth: 4,
      target: material.name, relation: '孩子选择的书店', contribution: 'object', placementPolicy: 'free' }
    const model = vi.fn()
    const result = await generateNiloDialogue({ imageBase64, context: localContext({ ageBand: '5-7', utterance: '细节多一点', currentProposal }), chatWithImage: model })
    expect(result.proposal).toMatchObject({ template: 'illustration', illustrationId: 'illustration-bookshop', rotation: 12 })
    expect(result.proposal.x + result.proposal.width / 2).toBeCloseTo(currentProposal.x + currentProposal.width / 2)
    expect(result.proposal.y + result.proposal.height / 2).toBeCloseTo(currentProposal.y + currentProposal.height / 2)
    expect(model).not.toHaveBeenCalled()
  })
})

describe('shipped references and public review decisions', () => {
  test.each(drawingIllustrations)('$id points to a real high-resolution project PNG with matching proportions', material => {
    expect(material.src).toMatch(/^\/nilo-illustrations\/[a-z][a-z0-9-]+\.png$/)
    const file = new URL(`../../frontend/public${material.src}`, import.meta.url)
    const image = PNG.sync.read(readFileSync(file))
    expect(Math.min(image.width, image.height)).toBeGreaterThanOrEqual(768)
    expect(material.aspect).toBeCloseTo(image.width / image.height, 6)
    expect(material.minPixels).toBeLessThanOrEqual(Math.min(image.width, image.height))
  })

  test('the public read-only endpoint serves only current decisions, without auth or cached child data', async () => {
    const db = createDb(':memory:')
    try {
      const app = createApp({ db, entries: [], periodReportsEnabled: false })
      const manifest = { version: 1, decisions: { 'school-4': 'reject', [school.id]: 'keep' } }
      setMaterialCuration(manifest)
      const response = await request(app).get('/api/nilo/materials/curation').expect(200)
      expect(response.body).toEqual(manifest)
      expect(response.headers['cache-control']).toBe('no-store')
      setMaterialCuration({ version: 1, decisions: { [school.id]: 'reject' } })
      const updated = await request(app).get('/api/nilo/materials/curation').expect(200)
      expect(updated.body).toEqual(getMaterialCuration())
      await request(app).post('/api/nilo/materials/curation').send({ version: 1, decisions: {} }).expect(404)
      expect(getMaterialCuration().decisions[school.id]).toBe('reject')
    } finally { db.close() }
  })
})
