import { expect, test, vi } from 'vitest'
import { listMaterialSubjects, createMaterialProposal, getMaterialChoices } from '../../shared/niloMaterialLibrary.mjs'
import { drawingProposalLimits, hasRegisteredRecipeGeometry } from '../../shared/niloProposalLimits.mjs'
import { validateDrawingDocument } from '../../shared/niloDocument.mjs'
import { projectionTransform } from '@/features/child/companion/projectionTransform'
import { drawingPlanFits, proposalStrokes, validateProposal, type DrawingProposal } from '@/features/child/companion/proposals'
import { applyVoiceActions } from '@/features/child/companion/voiceActions'
import { sanitizeDialogueContext, validateProposal as validateServerProposal } from '../../server/src/services/niloDialogue.js'

vi.mock('../../server/src/services/tracing.js', () => ({ traceNode: vi.fn(), traceLLM: vi.fn() }))

const recipes = listMaterialSubjects().flatMap(group => group.materials).filter(material => material.kind === 'recipe')
const source = { x: .25, y: .25, width: .45, height: .35, rotation: 0 }

test.each([.6, 1, 1.6])('every selectable SVG can enlarge and shrink with valid geometry at canvas aspect %s', aspect => {
  expect(recipes.length).toBeGreaterThan(100)
  for (const material of recipes) {
    const proposal = validateProposal(createMaterialProposal(material.id, null, aspect))!
    expect(proposal, material.id).toBeTruthy()
    const before = JSON.stringify(proposal)
    const patch = projectionTransform([proposal], { scale: 1.6 }, aspect, { width: 600 * aspect, height: 600 })!
    const enlarged = { ...proposal, ...patch }
    expect(enlarged.width, material.id).toBeGreaterThan(proposal.width)
    expect(enlarged.width / enlarged.height, material.id).toBeCloseTo(proposal.width / proposal.height)
    expect(validateProposal(enlarged), material.id).toBeTruthy()
    expect(validateServerProposal(enlarged, { canvasAspect: aspect }), material.id).toBeTruthy()
    const smaller = { ...enlarged, ...projectionTransform([enlarged], { scale: .8 }, aspect) }
    expect(smaller.width, material.id).toBeLessThan(enlarged.width)
    expect(validateProposal(smaller), material.id).toBeTruthy()
    expect(proposalStrokes(enlarged, aspect).length, material.id).toBeGreaterThan(0)
    const originalPoint = proposalStrokes(proposal, aspect)[0].points[0]
    const enlargedPoint = proposalStrokes(enlarged, aspect)[0].points[0]
    const factor = enlarged.width / proposal.width
    expect(enlargedPoint.x - enlarged.x, material.id).toBeCloseTo((originalPoint.x - proposal.x) * factor)
    expect(enlargedPoint.y - enlarged.y, material.id).toBeCloseTo((originalPoint.y - proposal.y) * factor)
    expect(JSON.stringify(proposal), material.id).toBe(before)
  }
})

test('SVG at the former 45% limit can enlarge by touch or voice without adding drawing commands', () => {
  const material = getMaterialChoices('cat').find(item => item.kind === 'recipe')!
  const proposal = validateProposal(createMaterialProposal(material.id, source, 1))!
  expect(proposal.width).toBe(.45)
  const patch = projectionTransform([proposal], { scale: 1.15 }, 1)!
  expect(patch.width).toBeCloseTo(.5175)
  expect(validateProposal({ ...proposal, ...patch })).toBeTruthy()
  const voice = applyVoiceActions([proposal], [{ type: 'scale', factor: 1.15 }])
  expect(voice.ok).toBe(true)
  if (!voice.ok) return
  expect(voice.items[0].width).toBeCloseTo(.5175)
  expect(voice.items[0].sketch).toEqual(proposal.sketch)
})

test.each([.6, 1.6])('rotated SVGs and their original frames stay on paper at aspect %s', aspect => {
  const material = getMaterialChoices('flower').find(item => item.kind === 'recipe')!
  const proposal = validateProposal(createMaterialProposal(material.id, null, aspect))!
  for (const rotation of [-90, -45, 0, 45, 90]) {
    const rotated = { ...proposal, rotation }
    const patch = projectionTransform([rotated], { scale: 100, dx: -100, dy: 100 }, aspect, { width: 600 * aspect, height: 600 })!
    const resized = { ...rotated, ...patch }
    expect(resized.x).toBeGreaterThanOrEqual(0)
    expect(resized.y).toBeGreaterThanOrEqual(0)
    expect(resized.x + resized.width).toBeLessThanOrEqual(1)
    expect(resized.y + resized.height).toBeLessThanOrEqual(1)
    expect(validateServerProposal(resized, { canvasAspect: aspect }), String(rotation)).toBeTruthy()
  }
})

test('an enlarged registered SVG survives document save and reload', () => {
  const material = getMaterialChoices('cat').find(item => item.kind === 'recipe')!
  const proposal = validateProposal(createMaterialProposal(material.id, { ...source, x: .15, y: .15, width: .7, height: .7 }, 1))!
  expect(proposal.width).toBe(.7)
  expect(drawingPlanFits([proposal], Array(64 * 64).fill(0), 1, { width: 600, height: 600 })).toBe(true)
  expect(sanitizeDialogueContext({ utterance: '把刚才那只猫变蓝色', currentProposal: proposal, canvasAspect: 1 }).currentProposal).toBeTruthy()
  const doc = { version: 1, baseSource: 'child', operations: [{
    type: 'stroke', groupId: 'large-cat', owner: 'nilo', brushKind: 'round', color: proposal.color,
    eraser: false, size: 4, referenceWidth: 600, referenceHeight: 600,
    points: proposalStrokes(proposal, 1)[0].points,
    object: { name: '猫', aspect: 1, proposals: [proposal] },
  }] }
  expect(validateDrawingDocument(JSON.parse(JSON.stringify(doc)))).toBe(true)
  expect(validateProposal(JSON.parse(JSON.stringify(proposal)))).toBeTruthy()
})

test('spoofed recipe IDs and altered SVG commands do not grant a generated sketch the reference size budget', () => {
  const material = getMaterialChoices('cat').find(item => item.kind === 'recipe')!
  const large = validateProposal(createMaterialProposal(material.id, { ...source, x: .15, y: .15, width: .7, height: .7 }, 1))!
  expect(hasRegisteredRecipeGeometry(large)).toBe(true)
  const altered = structuredClone(large)
  const first = altered.sketch!.paths[0][0]
  if (first[0] === 'M') first[1] += .02
  for (const untrusted of [altered, { ...large, recipeId: 'unknown-999' }, { ...large, recipeId: undefined }]) {
    expect(hasRegisteredRecipeGeometry(untrusted)).toBe(false)
    expect(drawingProposalLimits(untrusted).maxSpan).toBe(.45)
    expect(validateProposal(untrusted)).toBeNull()
    expect(validateServerProposal(untrusted)).toBeNull()
  }
  expect(drawingProposalLimits({ ...large, sketch: { aspect: NaN, paths: null } }).maxSpan).toBe(.45)
})

test('moving a rotated narrow frame never produces the negative coordinates rejected by the editor', () => {
  const proposal: DrawingProposal = { template: 'cloud', x: .3, y: .3, width: .44, height: .04, rotation: 90,
    color: '#568570', strokeWidth: 4, target: 'paper', relation: 'beside the picture' }
  const moved = { ...proposal, ...projectionTransform([proposal], { dx: -100 }, .6) }
  expect(moved.x).toBeGreaterThanOrEqual(0)
  expect(moved.width).toBe(proposal.width)
  expect(validateServerProposal(moved, { canvasAspect: .6 })).toBeTruthy()
  expect(projectionTransform([proposal], { scale: 2 }, Infinity)).toBeNull()
})
