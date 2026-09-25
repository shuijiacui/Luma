import { afterEach, describe, expect, test, vi } from 'vitest'

vi.mock('../../shared/niloIllustrations.mjs', async importOriginal => {
  const original = await importOriginal()
  const drawingIllustrations = [
    { id: 'school-picture-a', subject: 'school', name: '学校', aspect: 1.5, src: '/illustrations/school-a.png' },
    { id: 'school-picture-b', subject: 'school', name: '学校', aspect: 1.2, src: '/illustrations/school-b.png' },
    { id: 'house-picture', subject: 'house', name: '房子', aspect: .8, src: '/illustrations/house.png' },
  ]
  return { ...original, drawingIllustrations, getDrawingIllustration: id => drawingIllustrations.find(item => item.id === id),
    illustrationCatalogue: () => drawingIllustrations }
})

import { sampleProposalGeometry, proposalBoundsPoints, proportionedProposal } from '../../shared/niloGeometry.mjs'
import { placementFits, projectionFits, proposalFootprint } from '../../shared/niloCollision.mjs'
import { fitVariantToFrame, nextDrawingVariant, sameDrawingSubject, variantSubjectName } from '../../shared/niloVariants.mjs'
import { validateDrawingDocument } from '../../shared/niloDocument.mjs'
import { getDrawingRecipe } from '../../shared/niloRecipes.mjs'
import { getMaterialCuration, setMaterialCuration } from '../../shared/niloCuration.mjs'
import { validateProposal, sanitizeDialogueContext, validateDialogue } from '../src/services/niloDialogue.js'
import { withinDrawingGroupBudget } from '../src/services/niloSketch.js'

const originalCuration = getMaterialCuration()
afterEach(() => setMaterialCuration(originalCuration))

const illustration = (changes = {}) => ({ template: 'illustration', illustrationId: 'school-picture-a', subject: '学校',
  x: .3, y: .3, width: .3, height: .2, rotation: 0, color: '#203b34', strokeWidth: 3,
  contribution: 'object', ...changes })
const occupancy = () => Array(64 * 64).fill(0)
const cell = (x, y) => Math.floor(y * 64) * 64 + Math.floor(x * 64)
const reference = (changes = {}) => illustration({ x: .1, y: .15, width: .8, height: .7,
  target: '学校', relation: '观察屋顶和窗户，再试着描画', ...changes })

describe('server bitmap guide proposal validation', () => {
  test('accepts a large trusted illustration without sending its image URL to the model', () => {
    expect(validateProposal(reference(), { canvasAspect: 1 })).toEqual(reference())
    expect(validateProposal(reference({ width: .9, height: .9, x: .05, y: .05 }), { canvasAspect: 1 })).toBeTruthy()
  })

  test.each(['src', 'url', 'image', 'dataUrl', 'sketch', 'recipeId', 'attachment', 'contact', 'echoPoints'])('rejects image field %s rather than trusting client image data', key => {
    expect(validateProposal(reference({ [key]: key === 'recipeId' ? 'school-2' : 'https://example.com/untrusted.png' }))).toBeNull()
    expect(validateProposal(reference({ [key]: undefined }))).toBeNull()
  })

  test('rejects unregistered IDs, missing or disguised subjects, and cross-media IDs', () => {
    expect(validateProposal(reference({ illustrationId: 'unknown-picture' }))).toBeNull()
    expect(validateProposal(reference({ illustrationId: undefined }))).toBeNull()
    expect(validateProposal(reference({ subject: undefined }))).toBeNull()
    expect(validateProposal(reference({ subject: '月亮' }))).toBeNull()
    expect(validateProposal(illustration({ template: 'house', subject: undefined }))).toBeNull()
    expect(validateProposal(reference({ subject: 'school' }))).toMatchObject({ subject: 'school' })
  })

  test('bounds remain finite, limited and fully within the rotated canvas', () => {
    expect(validateProposal(reference({ width: .91 }))).toBeNull()
    expect(validateProposal(reference({ height: Number.NaN }))).toBeNull()
    expect(validateProposal(reference({ rotation: 45 }))).toBeNull()
    expect(validateProposal(reference({ x: .02, width: .7, height: .2, rotation: 90 }), { canvasAspect: 2 })).toBeNull()
  })

  test('a retired existing reference still restores and keeps variant controls for a large frame', () => {
    setMaterialCuration({ version: 1, decisions: { 'school-picture-a': 'reject' } })
    const context = sanitizeDialogueContext({ currentProposal: reference(), requestDrawing: true, variantOnly: true,
      tracingGuide: true, canvasAspect: 1, rejectedTemplates: ['illustration', 'fish'] })
    expect(context.currentProposal).toMatchObject(reference())
    expect(context.variantOnly).toBe(true)
    expect(context.rejectedTemplates).toEqual(['fish'])
  })

  test('one image is an independent reference and cannot be mixed into a group', () => {
    const p = reference()
    expect(withinDrawingGroupBudget([p])).toBe(true)
    expect(withinDrawingGroupBudget([p, illustration({ template: 'house' })])).toBe(false)
    expect(withinDrawingGroupBudget([p, p])).toBe(false)
    const context = sanitizeDialogueContext({ currentProposal: p, currentAdditions: [p], requestDrawing: true, variantOnly: true, canvasAspect: 1 })
    expect(context.variantOnly).toBe(false)
    expect(context.currentAdditions).toEqual([])
    const reply = { intent: 'draw', confidence: .9, reply: '先观察学校的大轮廓。', proposal: p }
    const request = sanitizeDialogueContext({ requestDrawing: true, utterance: '画一座学校', tracingGuide: true, canvasAspect: 1 })
    expect(validateDialogue(reply, request, true)?.proposal).toMatchObject(p)
    expect(validateDialogue({ ...reply, additions: [p] }, request, true)).toBeNull()
  })
})

describe('bitmap guide geometry', () => {
  test('a bitmap never samples into child or Nilo vector ink', () => {
    expect(sampleProposalGeometry(illustration(), 1.5)).toEqual([])
    expect(sampleProposalGeometry(illustration({ illustrationId: 'untrusted' }), 1.5)).toEqual([])
  })

  test('proportional fitting uses the trusted asset aspect and keeps the requested center', () => {
    const p = illustration({ width: .4, height: .3 })
    const fitted = proportionedProposal(p, 2)
    expect(fitted.width * 2 / fitted.height).toBeCloseTo(1.5)
    expect(fitted.x + fitted.width / 2).toBeCloseTo(p.x + p.width / 2)
    expect(fitted.y + fitted.height / 2).toBeCloseTo(p.y + p.height / 2)
    expect(fitted.width).toBeLessThanOrEqual(p.width)
    expect(fitted.height).toBeLessThanOrEqual(p.height)
  })

  test('bounds rotate in physical canvas space instead of stretching with the canvas', () => {
    const points = proposalBoundsPoints(illustration({ rotation: 90 }), 2)
    expect(Math.min(...points.map(p => p.x))).toBeCloseTo(.4)
    expect(Math.max(...points.map(p => p.x))).toBeCloseTo(.5)
    expect(Math.min(...points.map(p => p.y))).toBeCloseTo(.1)
    expect(Math.max(...points.map(p => p.y))).toBeCloseTo(.7)
    expect(proposalBoundsPoints(illustration({ illustrationId: 'untrusted' }), 2)).toEqual([])
  })

  test('placement reserves the image interior and rejects occupied space', () => {
    const p = illustration()
    const grid = occupancy()
    const footprint = proposalFootprint(p, 64, 1, { width: 600, height: 600 })
    expect(footprint.has(cell(.45, .4))).toBe(true)
    expect(projectionFits(p, grid, 1)).toBe(true)
    grid[cell(.45, .4)] = 1
    expect(projectionFits(p, grid, 1)).toBe(false)
    expect(projectionFits({ ...p, placementPolicy: 'free' }, grid, 1)).toBe(true)
    expect(projectionFits({ ...p, illustrationId: 'untrusted', placementPolicy: 'free' }, grid, 1)).toBe(false)
  })

  test('rotated footprints omit the empty corners but enforce canvas bounds', () => {
    const p = illustration({ height: .1, rotation: 45 })
    const footprint = proposalFootprint(p, 64, 1, { width: 600, height: 600 })
    expect(footprint.has(cell(.45, .35))).toBe(true)
    expect(footprint.has(cell(.31, .48))).toBe(false)
    expect(projectionFits(illustration({ x: .015, rotation: 45 }), occupancy(), 1)).toBe(false)
  })

  test('relative placement evaluates the bitmap frame', () => {
    const p = illustration({ contribution: 'detail', anchor: { x: .3, y: .55, width: .3, height: .25 }, placement: 'above' })
    expect(placementFits(p, 1)).toBe(true)
    expect(placementFits({ ...p, placement: 'below' }, 1)).toBe(false)
  })

  test('a large illustration remains valid inside the canvas', () => {
    const p = illustration({ x: .06, y: .08, width: .88, height: .82 })
    expect(projectionFits(p, occupancy(), 1)).toBe(true)
    expect(proposalFootprint(p, 64, 1).size).toBeGreaterThan(2000)
  })
})

describe('bitmap guide variants and persistence', () => {
  test('subject identity comes from the trusted catalogue, including cross-media variants', () => {
    const recipe = getDrawingRecipe('school-2')
    const vector = { ...illustration(), template: 'custom', recipeId: recipe.id, sketch: recipe.sketch }
    delete vector.illustrationId
    expect(sameDrawingSubject(illustration(), vector)).toBe(true)
    expect(sameDrawingSubject(illustration({ subject: '月亮' }), vector)).toBe(false)
    expect(sameDrawingSubject(illustration(), illustration({ illustrationId: 'house-picture', subject: '房子' }))).toBe(false)
    expect(variantSubjectName(illustration())).toBe('学校')
  })

  test('cycling bitmap guides preserves the user frame and never creates a sketch', () => {
    const source = illustration({ rotation: 12 })
    const next = nextDrawingVariant(source, 1.5)
    expect(next).toMatchObject({ ...source, illustrationId: 'school-picture-b' })
    expect(next.sketch).toBeUndefined()
    expect(next.recipeId).toBeUndefined()
    expect(sampleProposalGeometry(next, 1.5)).toEqual([])
    expect(nextDrawingVariant(illustration({ illustrationId: 'house-picture', subject: '房子' }), 1.5)).toBeNull()
  })

  test('rejected images still render saved guides but cannot be selected as the next variant', () => {
    setMaterialCuration({ version: 1, decisions: { 'school-picture-b': 'reject' } })
    expect(proposalBoundsPoints(illustration({ illustrationId: 'school-picture-b' }), 1.5)).toHaveLength(4)
    expect(nextDrawingVariant(illustration(), 1.5)).toBeNull()
    expect(nextDrawingVariant(illustration({ illustrationId: 'school-picture-b' }), 1.5)?.illustrationId).toBe('school-picture-a')
    expect(fitVariantToFrame(illustration(), illustration({ illustrationId: 'school-picture-b' }), 1.5)).toBeNull()
  })

  test('explicit cross-media changes preserve the frame and remove incompatible metadata', () => {
    const recipe = getDrawingRecipe('school-2')
    const vector = { ...illustration(), template: 'custom', recipeId: recipe.id, sketch: recipe.sketch }
    delete vector.illustrationId
    const image = fitVariantToFrame(vector, illustration(), 1.5)
    expect(image).toMatchObject({ template: 'illustration', illustrationId: 'school-picture-a', x: vector.x, y: vector.y, width: vector.width, height: vector.height })
    expect(image.sketch).toBeUndefined()
    expect(image.recipeId).toBeUndefined()
    const back = fitVariantToFrame(image, vector, 1.5)
    // The kept school vector is archived: old drafts restore, new choices stay raster.
    expect(back).toBeNull()
  })

  test('bitmap references cannot be persisted as authored object ink', () => {
    const stroke = { type: 'stroke', owner: 'nilo', groupId: 'g1', color: '#203b34', brushKind: 'round', size: 3,
      eraser: false, referenceWidth: 600, referenceHeight: 600, points: [{ x: .3, y: .3 }, { x: .4, y: .4 }] }
    const document = { version: 1, baseSource: 'child', operations: [stroke] }
    expect(validateDrawingDocument(document)).toBe(true)
    expect(validateDrawingDocument({ ...document, operations: [{ ...stroke, object: { name: '学校', aspect: 1,
      proposals: [illustration()] } }] })).toBe(false)
    expect(validateDrawingDocument({ ...document, operations: [{ ...stroke, object: { name: '学校', aspect: 1,
      proposals: [illustration({ template: 'house' })] } }] })).toBe(false)
    expect(validateDrawingDocument({ ...document, operations: [{ ...stroke, owner: 'child', guidance: { guideId: 'g2', name: '学校', subjects: ['school'] } }] })).toBe(true)
  })
})
