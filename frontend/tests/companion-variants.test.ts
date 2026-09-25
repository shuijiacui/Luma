import { expect, test } from 'vitest'
import { isMaterialEnabled } from '../../shared/niloCuration.mjs'
import { fitVariantToFrame, nextDrawingVariant, sameDrawingSubject } from '../../shared/niloVariants.mjs'
import { drawingRecipes, getDrawingRecipe } from '../../shared/niloRecipes.mjs'
import { drawingIllustrations } from '../../shared/niloIllustrations.mjs'
import { halfShape } from '../../shared/niloHalfShape.mjs'
import { compileSketch, type DrawingSketch } from '../../shared/niloSketch.mjs'
import { proposalStrokes, validateProposal, type DrawingProposal } from '@/features/child/companion/proposals'

const sun: DrawingProposal = {
  template: 'sun', x: .47, y: .18, width: .28, height: .21, rotation: 17,
  color: '#ce8948', strokeWidth: 7, brushKind: 'crayon', target: '太阳', relation: '照着孩子的小花园',
}
const custom = (subject: string, sketch: DrawingSketch): DrawingProposal => ({ ...sun, template: 'custom', subject, sketch })
const recipeProposal = (id: string): DrawingProposal => {
  const recipe = getDrawingRecipe(id)!
  return { ...sun, template: 'custom', subject: recipe.name, recipeId: id, sketch: recipe.sketch }
}
const bounds = (sketch: DrawingSketch) => {
  const points = compileSketch(sketch)!.flat()
  const xs = points.map(p => p.x), ys = points.map(p => p.y)
  return { width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) }
}

test('a builtin sun with no recipe ID gains a different sun drawing without changing its frame or chosen style', () => {
  const next = nextDrawingVariant(sun, 1.8)!
  expect(next).not.toBeNull()
  expect(getDrawingRecipe(next.recipeId!)?.subject).toBe('sun')
  expect(next).toMatchObject({ ...sun, template: 'custom' })
  expect(validateProposal(next)).not.toBeNull()
  expect(next.sketch?.aspect).toBeCloseTo(sun.width * 1.8 / sun.height)
  expect(nextDrawingVariant(next, 1.8)?.recipeId).not.toBe(next.recipeId)
})

test('same-object matching accepts explicit aliases but rejects a moon, a sunflower and recipe ID spoofing', () => {
  expect(sameDrawingSubject(sun, recipeProposal('sun-0'))).toBe(true)
  expect(sameDrawingSubject(sun, { ...recipeProposal('sun-0'), subject: 'SUN' })).toBe(true)
  expect(sameDrawingSubject(sun, recipeProposal('moon-0'))).toBe(false)
  expect(sameDrawingSubject(sun, custom('sunflower', getDrawingRecipe('sun-0')!.sketch))).toBe(false)
  expect(sameDrawingSubject(sun, { ...recipeProposal('moon-0'), subject: '太阳' })).toBe(false)
  expect(sameDrawingSubject({ ...recipeProposal('moon-0'), subject: '太阳' }, sun)).toBe(false)
  expect(sameDrawingSubject(sun, { ...recipeProposal('sun-0'), recipeId: 'sun-999' })).toBe(false)
  expect(sameDrawingSubject(sun, custom('半个太阳', getDrawingRecipe('sun-0')!.sketch))).toBe(false)
})

const eligibleRecipes = drawingRecipes.filter(recipe => isMaterialEnabled(recipe.id))
const firstPerSubject = eligibleRecipes.filter((recipe, index) => eligibleRecipes.findIndex(other => other.subject === recipe.subject) === index)
test.each(firstPerSubject)('$subject cycles only retained poses and preserves a resized, rotated frame', recipe => {
  const variants = eligibleRecipes.filter(r => r.subject === recipe.subject)
  const original = recipeProposal(recipe.id)
  if (variants.length === 1) {
    expect(nextDrawingVariant(original, 1.8)).toBeNull()
    expect(validateProposal(original)).not.toBeNull()
    return
  }
  let current = original
  const seen = new Set([current.recipeId])
  for (let i = 1; i <= variants.length; i++) {
    const next = nextDrawingVariant(current, 1.8)!
    expect(next).not.toBeNull()
    expect(getDrawingRecipe(next.recipeId!)?.subject).toBe(recipe.subject)
    expect(next).toMatchObject({
      x: original.x, y: original.y, width: original.width, height: original.height,
      rotation: original.rotation, color: original.color, strokeWidth: original.strokeWidth,
      brushKind: original.brushKind, target: original.target, relation: original.relation,
    })
    expect(next.sketch?.aspect).toBeCloseTo(original.width * 1.8 / original.height)
    expect(validateProposal(next)).not.toBeNull()
    if (i < variants.length) expect(seen.has(next.recipeId)).toBe(false)
    else expect(next.recipeId).toBe(original.recipeId)
    seen.add(next.recipeId)
    current = next
  }
  expect(seen).toEqual(new Set(variants.map(r => r.id)))
  expect(nextDrawingVariant(current, 1.8)?.sketch).toEqual(nextDrawingVariant(original, 1.8)?.sketch)
})

test('a free custom drawing or cropped half sun never silently becomes the stock whole object', () => {
  const freeSun = custom('太阳', getDrawingRecipe('sun-0')!.sketch)
  const halfSun = halfShape({ ...sun, rotation: 0 }, 'top', 1.8) as DrawingProposal
  const freeVehicle = custom('火星小车', getDrawingRecipe('car-0')!.sketch)
  for (const source of [freeSun, halfSun, freeVehicle]) expect(nextDrawingVariant(source, 1.8)).toBeNull()
  expect(fitVariantToFrame(halfSun, recipeProposal('sun-1'), 1.8)).toBeNull()
  expect(fitVariantToFrame(halfSun, sun, 1.8)).toBeNull()
  expect(fitVariantToFrame(freeSun, recipeProposal('sun-1'), 1.8)).toBeNull()
})

test('a new free custom drawing of the same named object retains child choices and its natural proportions', () => {
  const first: DrawingSketch = { aspect: 1, paths: [[['E', .5, .5, .4, .4]]] }
  const newPose: DrawingSketch = { aspect: 2, paths: [[['E', .5, .5, .3, .25]], [['M', .1, .8], ['Q', .5, .95, .9, .8]]] }
  const source = custom('火星小车', first)
  const candidate = { ...custom('火星小车', newPose), x: .1, y: .1, width: .1, height: .1, color: '#000000' }
  const next = fitVariantToFrame(source, candidate, 1.8)!
  expect(next).toMatchObject({ ...source, sketch: expect.anything() })
  expect(next.sketch).not.toEqual(first)
  expect(next.recipeId).toBeUndefined()
  const natural = bounds(newPose), fitted = bounds(next.sketch!)
  expect(fitted.width * source.width * 1.8 / (fitted.height * source.height)).toBeCloseTo(natural.width * newPose.aspect / natural.height)
  expect(fitVariantToFrame(source, custom('火星飞船', newPose), 1.8)).toBeNull()
  expect(fitVariantToFrame(source, candidate, 0)).toBeNull()
})

test('fitting a round sun into a wide dragged frame preserves circular geometry over repeated cycles', () => {
  const source = { ...sun, width: .36, height: .18, rotation: 0 }
  let current = nextDrawingVariant(source, 2)!
  const firstFrame = { x: current.x, y: current.y, width: current.width, height: current.height }
  for (let i = 0; i < 9; i++) {
    const disc = current.sketch!.paths[0][0]
    expect(disc[0]).toBe('E')
    if (disc[0] !== 'E') throw new Error('Sun recipe lost its circular disc')
    expect(disc[3] * current.width * 2).toBeCloseTo(disc[4] * current.height)
    expect(current).toMatchObject(firstFrame)
    current = nextDrawingVariant(current, 2)!
  }
})


test('retired geometry can restore an existing draft without becoming a new drawing variant', () => {
  const archived = recipeProposal('school-2')
  expect(validateProposal(archived)).not.toBeNull()
  expect(isMaterialEnabled('school-2')).toBe(false)
  expect(nextDrawingVariant(archived, 1.8)).toBeNull()
  expect(fitVariantToFrame(archived, archived, 1.8)).toBeNull()
})


test('picture-book alternatives keep the large image frame and never convert a reference into vector ink', () => {
  const original: DrawingProposal = { ...sun, template: 'illustration', illustrationId: 'illustration-reading-child', subject: '读书的孩子', x: .1, y: .1, width: .58, height: .72 }
  const next = nextDrawingVariant(original, 1.8)!
  expect(next.illustrationId).not.toBe(original.illustrationId)
  expect(next).toMatchObject({ ...original, illustrationId: next.illustrationId })
  expect(next.sketch).toBeUndefined()
  expect(next.recipeId).toBeUndefined()
  expect(validateProposal(next)).not.toBeNull()
  expect(proposalStrokes(next, 1.8)).toEqual([])
  const available = drawingIllustrations.filter(item => item.subject === 'readingchild' && isMaterialEnabled(item.id))
  const seen = new Set([original.illustrationId])
  let current = original
  for (let index = 0; index < available.length; index++) {
    current = nextDrawingVariant(current, 1.8)!
    expect(current).toMatchObject({ ...original, illustrationId: current.illustrationId })
    expect(proposalStrokes(current, 1.8)).toEqual([])
    seen.add(current.illustrationId)
  }
  expect(seen).toEqual(new Set(available.map(item => item.id)))
  expect(current.illustrationId).toBe(original.illustrationId)
})
