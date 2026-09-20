import {expect, test} from 'vitest'
import {ablationCases} from '../scripts/fixtures/niloAblation.mjs'
import {renderSynthetic, syntheticContext, goldKnowledge} from '../scripts/check-nilo-ablation.mjs'
import {drawingScene, compileDrawingPlan, fitDrawingPlan} from '../src/services/niloDrawingProtocol.js'
import {validateProposal} from '../src/services/niloDialogue.js'
import {projectionFits} from '../../shared/niloCollision.mjs'
import {pixelOccupancy} from '../../shared/niloOccupancy.mjs'

async function hat(id, control = 'contact_hat_points') {
  const f = ablationCases.find(item => item.id === id)
  const raster = renderSynthetic(f.points, f.aspect), context = syntheticContext(f, raster)
  const knowledge = await goldKnowledge(f, raster)
  const scene = drawingScene(knowledge.observation, knowledge.inkAnchors, knowledge.inkContacts)
  const compiled = compileDrawingPlan(f.controls.find(item => item.id === control).plan, scene, context, validateProposal)
  expect(compiled.ok).toBe(true)
  return {p: compiled.proposal, raster, context, fixture: f}
}

test.each(['round_face', 'tilted_face'])('real pixels resolve the frozen %s hat false rejection without moving it', async id => {
  const {p, raster, context: c} = await hat(id)
  expect(projectionFits(p, raster.occupancy, 1, c.canvasSize)).toBe(false)
  expect(projectionFits(p, raster.occupancy, 1, c.canvasSize, raster.png)).toBe(true)
  expect(fitDrawingPlan(p, raster.occupancy, 1, c.canvasSize, raster.png)).toEqual(p)
})

test('real unrelated ink across the hat remains protected, including thin strokes', async () => {
  const {p, raster, context: c} = await hat('round_face')
  const blocked = {...raster.png, data: new Uint8Array(raster.png.data)}
  const y = Math.round((p.y + p.height * .3) * blocked.height)
  for (let x = Math.floor(p.x * blocked.width); x <= Math.ceil((p.x + p.width) * blocked.width); x++) {
    const offset = (y * blocked.width + x) * 4
    blocked.data.set([32, 53, 47, 255], offset)
  }
  const occupancy = pixelOccupancy(blocked)
  expect(projectionFits(p, occupancy, 1, c.canvasSize, blocked)).toBe(false)
  // Supplying the old image cannot make the newly occupied cells disappear.
  expect(projectionFits(p, occupancy, 1, c.canvasSize, raster.png)).toBe(false)
})

test('missing, blank, corrupt, undersized or wrong-aspect pixel evidence cannot override the coarse rejection', async () => {
  const {p, raster, context: c} = await hat('tilted_face')
  const white = new Uint8Array(raster.png.data.length).fill(255)
  for (const pixels of [undefined, {...raster.png, data:white}, {...raster.png, data:new Uint8Array(3)},
    {...raster.png, width:128}, {...raster.png, height:raster.png.height / 2},
    {...raster.png, data:Array.from(raster.png.data)}]) {
    expect(projectionFits(p, raster.occupancy, 1, c.canvasSize, pixels)).toBe(false)
  }
})

test('pixels do not bypass required contacts, broad permissions, or the brush corridor limit', async () => {
  const {p, raster, context: c} = await hat('round_face')
  const fits = candidate => projectionFits(candidate, raster.occupancy, 1, c.canvasSize, raster.png)
  expect(fits({...p, y:p.y - .03})).toBe(false)
  expect(fits({...p, contact:{...p.contact, radius:.3}})).toBe(false)
  expect(fits({...p, attachment:p.contact.points[0]})).toBe(false)
  expect(fits({...p, strokeWidth:32, brushKind:'marker'})).toBe(false)
  const erased = {...raster.png, data:new Uint8Array(raster.png.data)}
  const join = p.contact.points[0]
  for (let y = Math.floor((join.y - .03) * erased.height); y <= Math.ceil((join.y + .03) * erased.height); y++)
    for (let x = Math.floor((join.x - .03) * erased.width); x <= Math.ceil((join.x + .03) * erased.width); x++)
      erased.data.set([255,255,255,255], (y * erased.width + x) * 4)
  expect(projectionFits(p, pixelOccupancy(erased), 1, c.canvasSize, erased)).toBe(false)
})

test('a proposal that mostly retraces the head still fails with exact pixels', async () => {
  const {p, raster, context:c} = await hat('round_face', 'contact_hat_contour')
  const retrace = {...p, sketch:{...p.sketch, paths:[p.contact.points.map((q,i) =>
    [i ? 'L' : 'M', (q.x - p.x) / p.width, (q.y - p.y) / p.height])]}}
  expect(projectionFits(retrace, raster.occupancy, 1, c.canvasSize, raster.png)).toBe(false)
})

test('pixel refinement never grants a non-contact proposal collision permission', async () => {
  const {p, raster, context:c} = await hat('round_face')
  const {contact, ...plain} = p
  expect(projectionFits(plain, raster.occupancy, 1, c.canvasSize, raster.png)).toBe(false)
})

test('textured brushes retain their coarse decision until exact stamp envelopes are supported', async () => {
  const {p, raster, context:c} = await hat('tilted_face')
  for (const brushKind of ['marker', 'crayon', 'star']) {
    const proposal = {...p, brushKind}
    expect(projectionFits(proposal, raster.occupancy, 1, c.canvasSize, raster.png))
      .toBe(projectionFits(proposal, raster.occupancy, 1, c.canvasSize))
  }
})

test('being near both endpoints is not enough when a visible white gap separates the new stroke from original ink', () => {
  const pixels = {width:512, height:512, data:new Uint8Array(512 * 512 * 4).fill(255)}
  for (let x = 120; x <= 345; x++) pixels.data.set([32,53,47,255], (230 * 512 + x) * 4)
  const occupancy = pixelOccupancy(pixels)
  const p = {template:'custom', x:.3, y:.246, width:.3, height:.2, rotation:0, strokeWidth:1, brushKind:'round',
    anchor:{x:.2,y:.4,width:.5,height:.3},
    sketch:{aspect:1.5,paths:[[['M',0,1],['L',.5,0],['L',1,1]]]},
    contact:{kind:'points',points:[{x:.3,y:.45},{x:.6,y:.45}]}}
  expect(projectionFits(p, occupancy, 1, pixels)).toBe(true)
  expect(projectionFits(p, occupancy, 1, pixels, pixels)).toBe(false)
  expect(projectionFits({...p,y:.25}, occupancy, 1, pixels, pixels)).toBe(true)
})
