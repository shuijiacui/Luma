import { expect, test } from 'vitest'
import { PNG } from 'pngjs'
import { validateGeneratedRaster, GENERATED_RASTER_LIMITS } from '../../shared/niloGeneratedRaster.mjs'
import { validateProposal, validateDialogue, sanitizeDialogueContext } from '../src/services/niloDialogue.js'
import { sanitizeScenePlan } from '../../shared/niloSceneDrawing.mjs'
import { proportionedProposal, proposalBoundsPoints, sampleProposalGeometry } from '../../shared/niloGeometry.mjs'
import { placementFits } from '../../shared/niloCollision.mjs'
import { validateDrawingDocument } from '../../shared/niloDocument.mjs'
import { guidePaths, rasterGuide } from '../src/services/niloScenePreview.js'
import { buildRenderedSceneQualityPreview } from '../src/services/niloSceneQuality.js'

function raster(projection = 'gray') {
  const png = new PNG({ width: 64, height: 32 }); png.data.fill(255)
  png.data[120] = 0
  return { version: 1, pngBase64: PNG.sync.write(png).toString('base64'), width: 64, height: 32, projection,
    ...(projection === 'dashed' ? { paths: [[[.1, .2], [.8, .7]]] } : {}) }
}
const proposal = () => ({ template: 'generated', raster: raster(), x: .1, y: .1, width: .7, height: .6, rotation: 0,
  color: '#66729b', strokeWidth: 3, subject: '鲸背上的小镇', target: 'whole picture', relation: '临时参考图', contribution: 'object', placementPolicy: 'free' })

test('accepts a bounded PNG header and clones normalized tracing paths without changing input', () => {
  const raw = raster('dashed'), before = structuredClone(raw), valid = validateGeneratedRaster(raw)
  expect(valid).toEqual(raw)
  valid.paths[0][0][0] = .8
  expect(raw).toEqual(before)
  expect(validateGeneratedRaster(raster())).not.toHaveProperty('paths')
})

test('rejects URLs, forged dimensions, non-PNG, oversized bytes and unknown raster fields', () => {
  const original = raster(), oversized = Buffer.alloc(GENERATED_RASTER_LIMITS.bytes + 1)
  Buffer.from(original.pngBase64, 'base64').copy(oversized)
  for (const patch of [{ pngBase64: 'https://example.invalid/image.png' }, { pngBase64: `data:image/png;base64,${original.pngBase64}` },
    { pngBase64: Buffer.from('<svg width="64"></svg>').toString('base64') }, { width: 32 }, { height: 64 },
    { width: 0 }, { height: 1537 }, { width: 1.2 }, { url: 'https://example.invalid' },
    { pngBase64: oversized.toString('base64') }, { projection: 'color' }, { version: 2 },
  ]) expect(validateGeneratedRaster({ ...original, ...patch })).toBeNull()
  const wrongHeader = Buffer.from(original.pngBase64, 'base64'); wrongHeader.write('IDAT', 12)
  expect(validateGeneratedRaster({ ...original, pngBase64: wrongHeader.toString('base64') })).toBeNull()
})

test('dashed guides require bounded complete numeric paths without accepting other drawing protocols', () => {
  for (const paths of [undefined, [], [[[]]], [[[0, 0], [NaN, 1]]], [[[0, 0], [1.1, .5]]], [[[0, 0], ['1', .5]]],
    Array.from({ length: 1501 }, () => [[0, 0], [1, 1]]), [Array.from({ length: 50001 }, () => [.5, .5])],
  ]) expect(validateGeneratedRaster({ ...raster('dashed'), paths })).toBeNull()
})

test('generated proposals restore as reference geometry, preserve aspect, and never produce authored strokes', () => {
  const raw = proposal(), valid = validateProposal(raw, { canvasAspect: 1.4 })
  expect(valid).not.toBeNull()
  expect(valid.raster).toEqual(raw.raster)
  const fitted = proportionedProposal(valid, 1.4)
  expect(fitted.width * 1.4 / fitted.height).toBeCloseTo(2, 10)
  expect(placementFits(fitted, 1.4)).toBe(true)
  expect(proposalBoundsPoints(fitted, 1.4)).toHaveLength(4)
  expect(sampleProposalGeometry(fitted, 1.4)).toEqual([])
  for (const patch of [{ url: 'https://example.invalid' }, { illustrationId: 'illustration-library-whale-beginner-01' }, { sketch: {} }, { raster: { ...raw.raster, width: 50 } }, { contact: {} }]) {
    expect(validateProposal({ ...raw, ...patch }, { canvasAspect: 1.4 })).toBeNull()
  }
  expect(validateProposal({ ...raw, template: 'cloud' }, { canvasAspect: 1.4 })).toBeNull()
})

test('generated scene objects contain no asset before rendering and use the same bounded reference frame', () => {
  const object = { id: 'town', name: '鲸背小镇', aliases: [], role: 'main', essential: ['鲸鱼背上的房屋'], render: { kind: 'generated' }, box: { x: .05, y: .05, width: .9, height: .9 }, color: '#66729b' }
  const plan = { version: 1, title: '鲸背小镇', summary: '小镇在鲸鱼背上。', request: '画鲸背小镇', objects: [object] }
  expect(sanitizeScenePlan(plan)?.objects[0].render).toEqual({ kind: 'generated' })
  expect(sanitizeScenePlan({ ...plan, objects: [{ ...object, render: { ...object.render, raster: raster() } }] })).toBeNull()
  expect(sanitizeScenePlan({ ...plan, objects: [{ ...object, box: { ...object.box, width: .91 } }] })).toBeNull()
})

test('final quality preview contains generated dashed guides in the actual aspect-fitted frame without creating authored ink', () => {
  const generated = { ...proposal(), raster: raster('dashed') }, before = structuredClone(generated)
  expect(sampleProposalGeometry(generated, 1.4)).toEqual([])
  const paths = guidePaths(generated, 1.4)
  expect(paths).toHaveLength(1)
  expect(paths[0][0].x).toBeCloseTo(.17, 10)
  expect(paths[0][0].y).toBeCloseTo(.253, 10)
  expect(paths[0][1].x).toBeCloseTo(.66, 10)
  expect(paths[0][1].y).toBeCloseTo(.498, 10)
  const rotated = guidePaths({ ...generated, rotation: 180 }, 1.4)
  expect(rotated[0][0].x).toBeCloseTo(.73, 10)
  expect(rotated[0][0].y).toBeCloseTo(.547, 10)
  const plan = { version: 1, title: generated.subject, summary: '鲸鱼背上的小镇。', request: '画鲸背小镇', objects: [{
    id: 'town', name: generated.subject, aliases: [], role: 'main', essential: ['鲸鱼背上的房屋'], render: { kind: 'generated' },
    box: { x: generated.x, y: generated.y, width: generated.width, height: generated.height }, color: generated.color,
  }] }
  const objects = [{ id: 'town', name: generated.subject, proposal: generated }]
  const preview = buildRenderedSceneQualityPreview({ plan, objects, context: { canvasAspect: 1.4 } })
  expect(preview).not.toBeNull()
  const image = Buffer.from(preview.imageBase64, 'base64')
  expect(image).toEqual(rasterGuide([generated], { width: 840, height: 600, inspection: true }))
  const pixels = PNG.sync.read(image)
  let visible = 0
  for (let offset = 0; offset < pixels.data.length; offset += 4) if (pixels.data[offset] < 240) visible++
  expect(visible).toBeGreaterThan(100)
  expect(generated).toEqual(before)
  expect(sampleProposalGeometry(generated, 1.4)).toEqual([])
})

test('persistence forbids PNG proposals and disguised raster payloads inside authored canvas operations', () => {
  const stroke = { owner: 'nilo', type: 'stroke', groupId: 'g1', brushKind: 'round', color: '#66729b', eraser: false,
    size: 3, referenceWidth: 840, referenceHeight: 600, points: [{ x: .2, y: .3 }], object: { name: '参考图', aspect: 1.4, proposals: [proposal()] } }
  const doc = { version: 1, baseSource: 'child', operations: [stroke] }
  expect(validateDrawingDocument(doc)).toBe(false)
  stroke.object.proposals[0].template = 'cloud'
  expect(validateDrawingDocument(doc)).toBe(false)
})

test('text-model replies cannot inject generated PNGs through main, addition, edit or alternative slots', () => {
  const generated = proposal(), context = sanitizeDialogueContext({ utterance: '画一朵云', requestDrawing: true, canvasAspect: 1.4 })
  const cloud = { template: 'cloud', x: .2, y: .2, width: .2, height: .15, rotation: 0, color: '#66729b', strokeWidth: 3, target: '画纸', relation: '画一朵云' }
  const reply = { reply: '这是一个小主意。', intent: 'draw', confidence: .9, proposal: cloud }
  expect(validateProposal(generated, context)).not.toBeNull() // Saved scene references remain restorable.
  expect(validateDialogue(reply, context, true)?.proposal).toMatchObject({ template: 'cloud' })
  expect(validateDialogue({ ...reply, proposal: generated }, context, true)).toBeNull()
  expect(validateDialogue({ ...reply, additions: [generated] }, context, true)).toBeNull()
  expect(validateDialogue({ ...reply, proposal: { ...cloud, raster: generated.raster } }, context, true)).toBeNull()
  expect(validateDialogue({ ...reply, intent: 'edit', proposal: generated }, { ...context, currentProposal: generated }, true)).toBeNull()
  const alternate = validateDialogue({ ...reply, alternatives: [generated] }, context, true)
  expect(alternate?.proposal).toMatchObject({ template: 'cloud' })
  expect(alternate).not.toHaveProperty('alternatives')
})
