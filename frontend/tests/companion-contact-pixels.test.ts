import { expect, test } from 'vitest'
import {
  drawingPlanFits, prepareDrawingPlan, prepareProposal, prepareTurnProposal,
  projectionFits, type DrawingProposal,
} from '@/features/child/companion/proposals'
import { pixelOccupancy } from '../../shared/niloOccupancy.mjs'
import type { InkPixels } from '../../shared/niloContact.mjs'

const surface = { width: 512, height: 512 }
function blank(): InkPixels {
  const data = new Uint8ClampedArray(surface.width * surface.height * 4)
  data.fill(255)
  return { ...surface, data }
}
function putPixel(pixels: InkPixels, x: number, y: number) {
  if (x < 0 || y < 0 || x >= pixels.width || y >= pixels.height) return
  const i = (y * pixels.width + x) * 4
  pixels.data[i] = 32; pixels.data[i + 1] = 53; pixels.data[i + 2] = 47
}
function segment(pixels: InkPixels, a: { x: number; y: number }, b: { x: number; y: number }, radius = 2) {
  const steps = Math.max(1, Math.ceil(Math.hypot((a.x - b.x) * pixels.width, (a.y - b.y) * pixels.height) * 2))
  for (let i = 0; i <= steps; i++) {
    const x = Math.round((a.x + (b.x - a.x) * i / steps) * pixels.width)
    const y = Math.round((a.y + (b.y - a.y) * i / steps) * pixels.height)
    for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy <= radius * radius) putPixel(pixels, x + dx, y + dy)
    }
  }
}
function roundHead() {
  const pixels = blank()
  // Original synthetic outline: no imports from server services, no .tmp assets.
  const points = Array.from({ length: 81 }, (_, i) => ({
    x: .5 + .23 * Math.cos(i * Math.PI / 40), y: .5 + .25 * Math.sin(i * Math.PI / 40),
  }))
  for (let i = 1; i < points.length; i++) segment(pixels, points[i - 1], points[i])
  return pixels
}

// Frozen regression geometry of a two-ended hat that the coarse square cells
// falsely rejected. These are source pixels/coordinates, never model permissions.
const boundaryHat: DrawingProposal = {
  template: 'custom', x: .3916015625, y: .16414292279411763,
  width: .216796875, height: .11222426470588237, rotation: 0,
  color: '#20352f', strokeWidth: 4, brushKind: 'round', target: '圆脸人物',
  subject: '头顶的小帽子', relation: '帽子的两端连接头顶，向外生长', placement: 'near',
  anchor: { x: .26, y: .24, width: .48, height: .52 },
  sketch: { aspect: 1.9318181818181814, paths: [[['M', 0, 1], ['L', .2, 0], ['L', .8, 0], ['L', 1, 1]]] },
  contact: { kind: 'points', points: [{ x: .3916015625, y: .2763671875 }, { x: .6083984375, y: .2763671875 }] },
}

test('real boundary pixels repair a coarse false reject through every client plan entry point without moving it', () => {
  const pixels = roundHead(), occupancy = pixelOccupancy(pixels), saved = structuredClone(boundaryHat)
  expect(projectionFits(boundaryHat, occupancy, 1, surface)).toBe(false)
  expect(prepareProposal(boundaryHat, occupancy, 1, surface)).toBeNull()
  expect(prepareTurnProposal(boundaryHat, occupancy, 1, surface)).toBeNull()
  expect(prepareDrawingPlan([boundaryHat], occupancy, 1, surface)).toBeNull()
  expect(drawingPlanFits([boundaryHat], occupancy, 1, surface)).toBe(false)
  expect(projectionFits(boundaryHat, occupancy, 1, surface, pixels)).toBe(true)
  expect(prepareProposal(boundaryHat, occupancy, 1, surface, pixels)).toEqual(saved)
  expect(prepareTurnProposal(boundaryHat, occupancy, 1, surface, pixels)).toEqual(saved)
  expect(prepareDrawingPlan([boundaryHat], occupancy, 1, surface, pixels)).toEqual([saved])
  expect(drawingPlanFits([boundaryHat], occupancy, 1, surface, pixels)).toBe(true)
  expect(boundaryHat).toEqual(saved)
})

test('current pixels cannot excuse a real unrelated stroke crossed by the hat', () => {
  const pixels = roundHead()
  segment(pixels, { x: .5, y: .14 }, { x: .5, y: .20 })
  const occupancy = pixelOccupancy(pixels)
  expect(projectionFits(boundaryHat, occupancy, 1, surface, pixels)).toBe(false)
  expect(prepareProposal(boundaryHat, occupancy, 1, surface, pixels)).toBeNull()
  expect(prepareTurnProposal(boundaryHat, occupancy, 1, surface, pixels)).toBeNull()
  expect(prepareDrawingPlan([boundaryHat], occupancy, 1, surface, pixels)).toBeNull()
  expect(drawingPlanFits([boundaryHat], occupancy, 1, surface, pixels)).toBe(false)
})

test('blank or stale raster cannot remove collisions recorded in the real occupancy bitmap', () => {
  const occupancy = pixelOccupancy(roundHead()), unrelated = blank()
  expect(projectionFits(boundaryHat, occupancy, 1, surface, unrelated)).toBe(false)
  expect(prepareTurnProposal(boundaryHat, occupancy, 1, surface, unrelated)).toBeNull()
  expect(drawingPlanFits([boundaryHat], occupancy, 1, surface, unrelated)).toBe(false)
})

test('a near-contact white gap cannot pass merely because both endpoints share coarse ink cells', () => {
  const pixels = blank()
  for (let x = 128; x < 333; x++) putPixel(pixels, x, 230)
  const gapHat: DrawingProposal = {
    ...boundaryHat, x: .3, y: .246, width: .3, height: .2, strokeWidth: 1,
    anchor: { x: .25, y: .4, width: .4, height: .3 },
    sketch: { aspect: 1.5, paths: [[['M', 0, 1], ['L', .5, 0], ['L', 1, 1]]] },
    contact: { kind: 'points', points: [{ x: .3, y: .45 }, { x: .6, y: .45 }] },
  }
  // Old ink starts at y=230; the round brush reaches only y=228.852.
  expect(230 - ((gapHat.y + gapHat.height) * 512 + gapHat.strokeWidth / 2)).toBeGreaterThan(1)
  const occupancy = pixelOccupancy(pixels)
  expect(projectionFits(gapHat, occupancy, 1, surface, pixels)).toBe(false)
  expect(prepareProposal(gapHat, occupancy, 1, surface, pixels)).toBeNull()
  expect(prepareTurnProposal(gapHat, occupancy, 1, surface, pixels)).toBeNull()
  expect(prepareDrawingPlan([gapHat], occupancy, 1, surface, pixels)).toBeNull()
  expect(drawingPlanFits([gapHat], occupancy, 1, surface, pixels)).toBe(false)
})

test('multi-item plans cannot use old canvas pixels to exempt new strokes or boundary collisions', () => {
  const pixels = roundHead(), occupancy = pixelOccupancy(pixels)
  const detail: DrawingProposal = {
    template: 'custom', x: .45, y: .43, width: .08, height: .08, rotation: 0,
    color: '#20352f', strokeWidth: 4, brushKind: 'round', target: '圆脸人物', subject: '脸内小圆点',
    relation: '在脸内清楚空白处添一颗小圆点', placement: 'inside',
    anchor: { x: .3, y: .35, width: .4, height: .3 },
    sketch: { aspect: 1, paths: [[['E', .5, .5, .2, .2]]] },
  }
  expect(drawingPlanFits([detail], occupancy, 1, surface, pixels)).toBe(true)
  expect(drawingPlanFits([boundaryHat], occupancy, 1, surface, pixels)).toBe(true)
  for (const plan of [[boundaryHat, detail], [detail, boundaryHat], [boundaryHat, boundaryHat]]) {
    expect(drawingPlanFits(plan, occupancy, 1, surface, pixels)).toBe(false)
    expect(prepareDrawingPlan(plan, occupancy, 1, surface, pixels)).toBeNull()
  }
})
