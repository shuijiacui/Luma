import { expect, test } from 'vitest'
import { planLocalTurn } from '@/features/child/companion/localTurn'
import { drawingPlanFits, proposalStrokes } from '@/features/child/companion/proposals'

const style = { brushKind: 'crayon' as const, color: '#568570', brushSize: 4 }
const empty = () => Array(128 * 128).fill(0)
const base = { style, aspect: 1.6, surfaceSize: { width: 960, height: 600 } }

test('an unrecognized closed shape receives a checked inset of its actual contour', () => {
  const points = Array.from({ length: 25 }, (_, i) => ({ x: .5 + .13 * Math.cos(i * Math.PI / 12), y: .5 + .2 * Math.sin(i * Math.PI / 12) }))
  const occupancy = empty()
  for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
    const r = Math.hypot(((x + .5) / 128 - .5) / .13, ((y + .5) / 128 - .5) / .2)
    if (Math.abs(r - 1) < .08) occupancy[y * 128 + x] = 1
  }
  const p = planLocalTurn({ ...base, stroke: { points, width: 4, color: style.color }, occupancy })!
  expect(p.template).toBe('echo')
  expect(p.x).toBeGreaterThan(.37)
  expect(p.x + p.width).toBeLessThan(.63)
  expect(p.y).toBeGreaterThan(.3)
  expect(p.y + p.height).toBeLessThan(.7)
  expect(drawingPlanFits([p], occupancy, base.aspect, base.surfaceSize)).toBe(true)
  expect(proposalStrokes(p, base.aspect).every(s => s.brushKind === style.brushKind && s.color === style.color && s.width === 4)).toBe(true)
})

test.each([{ width: 960, height: 600 }, { width: 547, height: 250 }])('a line at the edge gets a nearby visible response on %j', surfaceSize => {
  const occupancy = empty()
  for (let y = 41; y < 91; y++) for (let x = 2; x < 6; x++) occupancy[y * 128 + x] = 1
  const points = [{ x: .03, y: .34 }, { x: .03, y: .5 }, { x: .03, y: .69 }]
  const aspect = surfaceSize.width / surfaceSize.height
  const p = planLocalTurn({ style, aspect, surfaceSize, stroke: { points, color: style.color, width: 4 }, occupancy })!
  expect(p).not.toBeNull()
  expect(p.template).toBe('echo')
  expect(drawingPlanFits([p], occupancy, aspect, surfaceSize)).toBe(true)
  const rendered = proposalStrokes(p, aspect)[0].points
  expect((Math.max(...rendered.map(p => p.y)) - Math.min(...rendered.map(p => p.y))) * surfaceSize.height).toBeGreaterThan(16)
})

test('a tap receives an outline and a blank canvas receives an open starter stroke', () => {
  const occupancy = empty(); occupancy[64 * 128 + 64] = 1
  const dot = planLocalTurn({ ...base, stroke: { points: [{ x: .5, y: .5 }], color: style.color, width: 4 }, occupancy })!
  expect(dot.sketch?.paths[0][0][0]).toBe('E')
  expect(drawingPlanFits([dot], occupancy, base.aspect, base.surfaceSize)).toBe(true)
  const starter = planLocalTurn({ ...base, stroke: null, occupancy: empty() })!
  expect(starter.subject).toBe('起笔线')
  expect(proposalStrokes(starter, base.aspect)[0].points.length).toBeGreaterThan(2)
})

test('fully occupied or invalid canvases never bypass brush collisions or write unsafe coordinates', () => {
  for (const occupancy of [Array(128 * 128).fill(1), [0, 0], Array(64).fill(NaN)]) {
    expect(planLocalTurn({ ...base, stroke: null, occupancy })).toBeNull()
  }
  expect(planLocalTurn({ ...base, aspect: 0, stroke: null, occupancy: empty() })).toBeNull()
})
