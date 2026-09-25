import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { PNG } from 'pngjs'

vi.mock('../src/services/niloCurationStore.js', async importOriginal => {
  const original = await importOriginal()
  const curation = await import('../../shared/niloCuration.mjs')
  return { ...original, refreshMaterialCuration: vi.fn(() => curation.getMaterialCuration()) }
})

import { drawingIllustrations, illustrationCatalogue, getDrawingIllustration } from '../../shared/niloIllustrations.mjs'
import { getMaterialCuration, setMaterialCuration } from '../../shared/niloCuration.mjs'
import { planIllustrationDrawing } from '../src/services/niloIllustrationDrawing.js'
import { generateNiloDialogue } from '../src/services/niloDialogue.js'
import { sampleProposalGeometry } from '../../shared/niloGeometry.mjs'

const medium = drawingIllustrations.filter(material => material.id.startsWith('illustration-medium-'))
const originalCuration = getMaterialCuration()
// This suite verifies the original thirty-picture release and its fallback when
// no beginner PNG is eligible; the new library has separate selection coverage.
beforeEach(() => setMaterialCuration({ version: 1, decisions: Object.fromEntries(drawingIllustrations
  .filter(item => item.id.startsWith('illustration-library-')).map(item => [item.id, 'reject'])) }))
afterEach(() => { setMaterialCuration(originalCuration); vi.clearAllMocks() })
const blank = new PNG({ width: 900, height: 600 }); blank.data.fill(255)
const imageBase64 = PNG.sync.write(blank).toString('base64')
const base = { locale: 'zh', requestDrawing: true, tracingGuide: true, canvasAspect: 1.5,
  canvasSize: { width: 900, height: 600 }, drawingStyle: { color: '#203b34', brushKind: 'round', brushSize: 4 },
  history: [], utterance: '画一座学校', ageBand: '5-7' }
const proposalFor = material => ({ template: 'illustration', illustrationId: material.id, subject: material.name,
  x: .26, y: .2, width: .34, height: .5, rotation: 6, color: '#203b34', strokeWidth: 4,
  target: material.name, relation: '孩子选好的参考图', contribution: 'object', placementPolicy: 'free' })

describe('thirty medium picture-book references', () => {
  test('the promised set has fifteen people, fifteen buildings and unique medium IDs', () => {
    expect(medium).toHaveLength(30)
    expect(medium.filter(m => m.category === 'people')).toHaveLength(15)
    expect(medium.filter(m => m.category === 'architecture')).toHaveLength(15)
    expect(new Set(medium.map(m => m.id)).size).toBe(30)
    expect(new Set(medium.map(m => m.subject)).size).toBe(30)
    for (const subject of ['readingchild', 'gardener', 'school', 'bookshop']) {
      expect(medium.some(m => m.subject === subject)).toBe(true)
      expect(drawingIllustrations.some(m => m.subject === subject && m.difficulty === 'detailed')).toBe(true)
    }
  })

  test.each(medium)('$id advertises usable difficulty metadata without requiring a child style label', material => {
    expect(material.id).toMatch(/^illustration-medium-[a-z-]+$/)
    expect(material).toMatchObject({ kind: 'illustration', style: 'storybook', detail: 'moderate', difficulty: 'medium', minPixels: 220 })
    expect(material.ageBands).toEqual(['5-7', '8-9', '10-12'])
    expect(material.name).toBeTruthy()
    expect(material.learning).toBeTruthy()
    expect(material.learning).not.toMatch(/写实风|精美风|storybook|illustrated|realistic/)
    expect(illustrationCatalogue().find(item => item.id === material.id)).toMatchObject({
      id: material.id, subject: material.subject, difficulty: 'medium', detail: 'moderate',
    })
  })

  test.each(medium)('$id ships a complete nonblank monochrome image with matching proportions', material => {
    expect(material.src).toBe(`/nilo-illustrations/${material.id}.png`)
    const png = PNG.sync.read(readFileSync(new URL(`../../frontend/public${material.src}`, import.meta.url)))
    expect(Math.min(png.width, png.height)).toBeGreaterThanOrEqual(768)
    expect(material.aspect).toBeCloseTo(png.width / png.height, 6)
    let dark = 0, colored = 0, light = 0, borderDark = 0
    const count = png.width * png.height
    for (let y = 0; y < png.height; y++) for (let x = 0; x < png.width; x++) {
      const i = (y * png.width + x) * 4, alpha = png.data[i + 3] / 255
      const channels = [png.data[i], png.data[i + 1], png.data[i + 2]].map(v => 255 + (v - 255) * alpha)
      const luminance = channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722
      if (luminance < 160) dark++
      if (luminance > 240) light++
      if (Math.max(...channels) - Math.min(...channels) > 40) colored++
      if (luminance < 130 && (x < png.width * .01 || x >= png.width * .99 || y < png.height * .01 || y >= png.height * .99)) borderDark++
    }
    // These are delivery checks for blank, color-filled or clipped files, not an aesthetic rating.
    expect(dark / count).toBeGreaterThan(.003)
    expect(dark / count).toBeLessThan(.35)
    expect(light / count).toBeGreaterThan(.5)
    expect(colored / count).toBeLessThan(.01)
    expect(borderDark).toBe(0)
  })
})

describe('medium difficulty selection without style terminology', () => {
  test.each(medium)('a child can request $name and receive its standalone image without a model round', async material => {
    const model = vi.fn()
    const result = await generateNiloDialogue({ imageBase64,
      context: { ...base, utterance: `画${material.name}` }, chatWithImage: model })
    expect(result.proposal).toMatchObject({ template: 'illustration', illustrationId: material.id })
    expect(result.proposal.recipeId).toBeUndefined()
    expect(result.proposal.sketch).toBeUndefined()
    expect(sampleProposalGeometry(result.proposal, 1.5)).toEqual([])
    expect(model).not.toHaveBeenCalled()
  })

  test.each(['5-7', '8-9', '10-12', undefined])('a plain empty-canvas request defaults to medium at age %s', ageBand => {
    const result = planIllustrationDrawing({ ...base, ageBand })
    expect(getDrawingIllustration(result?.proposal?.illustrationId)?.difficulty).toBe('medium')
  })

  test.each([
    ['illustration-school', 'illustration-medium-school'],
    ['illustration-bookshop', 'illustration-medium-bookshop'],
    ['illustration-gardener', 'illustration-medium-gardener'],
    ['illustration-reading-child', 'illustration-medium-reading-child'],
  ])('simple words can simplify %s without losing its frame', (sourceId, targetId) => {
    const current = proposalFor(getDrawingIllustration(sourceId))
    const result = planIllustrationDrawing({ ...base, utterance: '简单一点', currentProposal: current })
    expect(result?.proposal).toMatchObject({ illustrationId: targetId, rotation: current.rotation })
    expect(result.proposal.x + result.proposal.width / 2).toBeCloseTo(current.x + current.width / 2)
    expect(result.proposal.y + result.proposal.height / 2).toBeCloseTo(current.y + current.height / 2)
  })

  test('more detail can choose the retained rich picture while a rejected medium is never selected', () => {
    const simple = getDrawingIllustration('illustration-medium-bookshop')
    const result = planIllustrationDrawing({ ...base, utterance: '细节多一点', currentProposal: proposalFor(simple) })
    expect(getDrawingIllustration(result?.proposal?.illustrationId)?.difficulty).toBe('detailed')
    setMaterialCuration({ version: 1, decisions: { 'illustration-medium-school': 'reject' } })
    expect(planIllustrationDrawing(base)?.proposal?.illustrationId).not.toBe('illustration-medium-school')
    expect(getDrawingIllustration('illustration-medium-school')).toBeTruthy()
  })
})

describe('locked-idea rendering can use an eligible same-subject PNG', () => {
  const idea = { subject: '学校', relationship: '故事里孩子们学习的地方', searchTerms: ['school'],
    requiresCustom: false, details: ['学校的屋顶', '门和窗户'] }
  const context = { ...base, utterance: '轮到你了', takeTurn: true, drawingProtocol: 3, turnScope: 'scene' }
  test('an ordinary idea renders as the medium PNG in exactly two model calls', async () => {
    const model = vi.fn().mockResolvedValueOnce({ subjects: [], idea })
      .mockResolvedValue({ illustrationId: 'illustration-medium-school', at: [.5, .5], scale: .65, reply: '我们先画学校的大轮廓。' })
    const result = await generateNiloDialogue({ imageBase64, context, chatWithImage: model, creativeMode: 'idea-first' })
    expect(result.proposal).toMatchObject({ template: 'illustration', illustrationId: 'illustration-medium-school', subject: idea.subject, relation: idea.relationship })
    expect(result.drawingMetrics).toMatchObject({ creativeMode: 'idea-first', route: 'illustration' })
    expect(model).toHaveBeenCalledTimes(2)
    expect(model.mock.calls.map(args => args[2].kind)).toEqual(['nilo_creative_ideate', 'nilo_creative_render'])
    expect(model.mock.calls[1][1]).toContain('SAME-SUBJECT PNG REFERENCES:')
    expect(model.mock.calls[1][1]).toContain('illustration-medium-school')
    expect(model.mock.calls[1][1]).not.toContain('illustration-medium-gardener')
    expect(model.mock.calls[0][1]).not.toContain('illustration-medium-school')
  })
  test.each([
    { locked: idea, id: 'illustration-medium-gardener', tracingGuide: true },
    { locked: { ...idea, subject: '长着翅膀的学校', requiresCustom: true }, id: 'illustration-medium-school', tracingGuide: true },
    { locked: idea, id: 'illustration-medium-school', tracingGuide: false },
  ])('cannot disguise an unrelated, custom or committed idea as a PNG: %j', async entry => {
    const model = vi.fn().mockResolvedValueOnce({ subjects: [], idea: entry.locked })
      .mockResolvedValue({ illustrationId: entry.id, at: [.5, .5], scale: .65 })
    const result = await generateNiloDialogue({ imageBase64, context: { ...context, tracingGuide: entry.tracingGuide },
      chatWithImage: model, creativeMode: 'idea-first' })
    expect(result.proposal).toBeUndefined()
    expect(result.status).toBe('unavailable')
    expect(model).toHaveBeenCalledTimes(3)
  })
})
