import { expect, test } from 'vitest'
import { compileSketch, validateSketch, type DrawingSketch, type SketchCommand } from '@/features/child/companion/sketch'
import { drawingPlanFits, prepareDrawingPlan, prepareProposal, projectionFits, proposalStrokes, readMemory, saveMemory, templates, validateProposal, type DrawingProposal } from '@/features/child/companion/proposals'
import { customSketchExamples } from './fixtures/customSketches'

const empty = () => Array(64 * 64).fill(0)
const surface = { width: 1200, height: 800 }
const square: DrawingSketch = { aspect: 1, paths: [[['M', .1, .1], ['L', .9, .1], ['L', .9, .9], ['L', .1, .9], ['Z']]] }
const base: DrawingProposal = { template: 'custom', subject: 'a new toy', sketch: square, x: .35, y: .35, width: .25, height: .25,
  rotation: 0, color: '#4aa5d8', strokeWidth: 3, brushKind: 'round', target: 'the child’s story', relation: 'a requested new object' }

test('new robot, rocket and dinosaur subjects compile all their paths with the requested brush', () => {
  expect(templates).toHaveLength(21)
  expect(templates).not.toContain('custom')
  for (const original of customSketchExamples) {
    const before = structuredClone(original)
    const p = prepareProposal(original, empty(), 1.5, surface)!
    expect(p).not.toBeNull()
    expect(p.width * 1.5 / p.height).toBeCloseTo(p.sketch!.aspect)
    const strokes = proposalStrokes(p, 1.5)
    expect(strokes).toHaveLength(original.sketch!.paths.length)
    for (const stroke of strokes) {
      expect(stroke).toMatchObject({ kind: 'custom', brushKind: original.brushKind, color: original.color, width: original.strokeWidth })
      expect(stroke.points.length).toBeGreaterThan(1)
      expect(stroke.points.length).toBeLessThanOrEqual(993)
      expect(stroke.points.every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y) && x >= 0 && x <= 1 && y >= 0 && y <= 1)).toBe(true)
    }
    expect(projectionFits(p, empty(), 1.5, surface)).toBe(true)
    expect(original).toEqual(before)
  }
})

test('quadratic, cubic, closed paths and ellipses have bounded smooth samples and exact endpoints', () => {
  const curves: DrawingSketch = { aspect: 1, paths: [
    [['M', 0, 0], ['Q', 0, 1, 1, 1]],
    [['M', 0, 0], ['C', 0, 1, 1, 1, 1, 0]],
    [['E', .5, .5, .4, .2]],
    [['M', .1, .1], ['L', .8, .1], ['L', .8, .8], ['Z']],
  ] }
  const result = compileSketch(curves)!
  expect(result.map(points => points.length)).toEqual([25, 33, 49, 4])
  expect(result[0][12]).toEqual({ x: .25, y: .75 })
  expect(result[0].at(-1)).toEqual({ x: 1, y: 1 })
  expect(result[1][16]).toEqual({ x: .5, y: .75 })
  expect(result[1].at(-1)).toEqual({ x: 1, y: 0 })
  expect(result[2][12].x).toBeCloseTo(.5)
  expect(result[2][12].y).toBeCloseTo(.7)
  expect(result[2].at(-1)!.x).toBeCloseTo(result[2][0].x)
  expect(result[2].at(-1)!.y).toBeCloseTo(result[2][0].y)
  expect(result[3].at(-1)).toEqual(result[3][0])
})

test.each([
  null, [], {}, { ...square, aspect: '1' }, { ...square, aspect: NaN }, { ...square, aspect: Infinity },
  { ...square, aspect: .199 }, { ...square, aspect: 5.001 }, { ...square, svg: '<svg />' },
  { ...square, paths: [] }, { ...square, paths: [null] }, { ...square, paths: [[]] },
  { ...square, paths: [[['L', .1, .1], ['L', .8, .8]]] },
  { ...square, paths: [[['M', .1, .1], ['M', .8, .8], ['L', .9, .9]]] },
  { ...square, paths: [[['M', .1, .1], ['Z'], ['L', .8, .8]]] },
  { ...square, paths: [[['M', .1, .1], ['A', 1, 1, 1, 1]]] },
  { ...square, paths: [[['M', .1, .1], ['L', .8, .8, .9]]] },
  { ...square, paths: [[['M', .1, .1], ['L', .8]]] },
  { ...square, paths: [[['M', .1, .1], ['L', '0.8', .8]]] },
  { ...square, paths: [[['M', .1, .1], ['L', NaN, .8]]] },
  { ...square, paths: [[['M', .1, .1], ['Q', Infinity, .5, .8, .8]]] },
  { ...square, paths: [[['M', .1, .1], ['C', -.1, .5, .6, .6, .8, .8]]] },
  { ...square, paths: [[['M', .1, .1], ['C', .5, .5, 1.1, .6, .8, .8]]] },
  { ...square, paths: [[['E', .5, .5, 0, .2]]] },
  { ...square, paths: [[['E', .5, .5, .2, -.1]]] },
  { ...square, paths: [[['E', .1, .5, .2, .2]]] },
  { ...square, paths: [[['E', .5, .95, .2, .2]]] },
  { ...square, paths: [[['E', .5, .5, .2, .2], ['Z']]] },
  { ...square, paths: [[['M', .1, .1], ['E', .5, .5, .2, .2]]] },
])('rejects malformed custom geometry without compiling partial paths: %#', value => {
  expect(validateSketch(value)).toBeNull()
  expect(compileSketch(value)).toBeNull()
  expect(validateProposal({ ...base, sketch: value })).toBeNull()
  expect(proposalStrokes({ ...base, sketch: value } as DrawingProposal)).toEqual([])
})

test('degenerate paths are rejected while curved loops returning to their start remain drawable', () => {
  for (const path of [
    [['M', .5, .5]], [['M', .5, .5], ['Z']], [['M', .5, .5], ['L', .5, .5]],
    [['M', .5, .5], ['Q', .5, .5, .5, .5]], [['M', .5, .5], ['C', .5, .5, .5, .5, .5, .5]],
    [['M', .5, .5], ['L', .5 + 1e-11, .5]],
  ]) expect(validateSketch({ aspect: 1, paths: [path] })).toBeNull()
  for (const command of [['Q', .9, .9, .5, .5], ['C', .9, .9, .2, .8, .5, .5]]) {
    const loop = { aspect: 1, paths: [[['M', .5, .5], command]] }
    expect(validateSketch(loop)).not.toBeNull()
    expect(compileSketch(loop)![0].some(p => Math.abs(p.x - .5) + Math.abs(p.y - .5) > .1)).toBe(true)
  }
  // A valid path cannot conceal a separate empty stroke.
  expect(validateSketch({ ...square, paths: [...square.paths, [['M', .1, .1]]] })).toBeNull()
})

test('custom subject is a bounded new-object name and builtin proposals reject custom fields', () => {
  expect(validateProposal({ ...base, subject: '  space robot  ' })?.subject).toBe('space robot')
  for (const patch of [{ subject: '' }, { subject: '   ' }, { subject: null }, { subject: 2 }, { subject: 'a'.repeat(61) }, { subject: undefined }, { sketch: undefined }, { script: 'draw()' }]) {
    expect(validateProposal({ ...base, ...patch })).toBeNull()
  }
  const builtin = { ...base }
  delete builtin.subject; delete builtin.sketch
  expect(validateProposal({ ...builtin, template: 'sun' })).not.toBeNull()
  for (const patch of [{ subject: 'sun' }, { sketch: square }, { subject: undefined }, { sketch: undefined }]) {
    expect(validateProposal({ ...builtin, template: 'sun', ...patch })).toBeNull()
  }
})

test('validated and prepared custom proposals own deep geometry copies', () => {
  const original = structuredClone({ ...base, anchor: { x: .3, y: .3, width: .4, height: .4 }, placement: 'inside' as const })
  const validated = validateProposal(original)!
  const prepared = prepareProposal(original, empty(), 1, surface)!
  expect(prepared).not.toBeNull()
  validated.sketch!.paths[0][1][1] = .2
  validated.anchor!.x = 0
  expect(original.sketch!.paths[0][1][1]).toBe(.9)
  expect(prepared.sketch!.paths[0][1][1]).toBe(.9)
  expect(original.anchor.x).toBe(.3)
  original.sketch!.paths[0][0][1] = .8
  expect(prepared.sketch!.paths[0][0][1]).toBe(.1)
  const strokes = proposalStrokes(prepared)
  strokes[0].points[0].x = -1
  expect(proposalStrokes(prepared)[0].points[0].x).toBeGreaterThan(0)
})

test.each([.6, 1, 2.5])('custom aspect and physical rotation survive resizing at canvas aspect %s', aspect => {
  const p = prepareProposal({ ...base, sketch: { aspect: 2, paths: [[['E', .5, .5, .4, .4]]] } }, empty(), aspect, { width: 800 * aspect, height: 800 })!
  expect(p.width * aspect / p.height).toBeCloseTo(2)
  const bounds = (proposal: DrawingProposal) => {
    const points = proposalStrokes(proposal, aspect).flatMap(stroke => stroke.points)
    return { width: (Math.max(...points.map(p => p.x)) - Math.min(...points.map(p => p.x))) * aspect,
      height: Math.max(...points.map(p => p.y)) - Math.min(...points.map(p => p.y)) }
  }
  const normal = bounds(p), rotated = bounds({ ...p, rotation: 90 })
  expect(normal.width / normal.height).toBeCloseTo(2)
  expect(rotated.width).toBeCloseTo(normal.height)
  expect(rotated.height).toBeCloseTo(normal.width)
  const smaller = { ...p, x: p.x + p.width * .1, y: p.y + p.height * .1, width: p.width * .8, height: p.height * .8 }
  expect(bounds(smaller).width / bounds(smaller).height).toBeCloseTo(2)
  expect(drawingPlanFits([smaller], empty(), aspect, { width: 800 * aspect, height: 800 })).toBe(true)
})

test('custom proposals use every brush and retain anchor, collision and area constraints', () => {
  for (const brushKind of ['round', 'pencil', 'marker', 'crayon', 'star'] as const) {
    const p = { ...base, brushKind, strokeWidth: 32 }
    expect(proposalStrokes(p).every(stroke => stroke.brushKind === brushKind && stroke.width === 32)).toBe(true)
  }
  const grid = empty(), clean = prepareProposal(base, grid, 1, surface)!
  const first = proposalStrokes(clean)[0].points[0]
  grid[Math.floor(first.y * 64) * 64 + Math.floor(first.x * 64)] = .8
  expect(projectionFits(clean, grid, 1, surface)).toBe(false)
  const repaired = prepareProposal(base, grid, 1, surface)!
  expect(repaired).not.toBeNull()
  expect(projectionFits(repaired, grid, 1, surface)).toBe(true)
  expect(Math.hypot(repaired.x + repaired.width / 2 - (base.x + base.width / 2), repaired.y + repaired.height / 2 - (base.y + base.height / 2))).toBeLessThan(.04)
  expect(repaired.width / repaired.height).toBeCloseTo(1)
  expect(prepareProposal(base, Array(64 * 64).fill(1), 1, surface)).toBeNull()
  expect(validateProposal({ ...base, width: .45, height: .45 })).toBeNull()
  const anchor = { x: .3, y: .3, width: .15, height: .15 }
  expect(prepareProposal({ ...base, x: .3, y: .6, anchor, placement: 'above' }, empty(), 1, surface)).toBeNull()
  const inside = prepareProposal({ ...base, x: .275, y: .275, width: .2, height: .2, anchor, placement: 'inside' }, empty(), 1, surface)!
  expect(inside).not.toBeNull()
  expect(inside.width).toBeLessThanOrEqual(anchor.width * .8)
})

function manyPaths(count: number, x: number): DrawingProposal {
  return { ...base, x, y: .4, width: .18, height: .18,
    sketch: { aspect: 1, paths: Array.from({ length: count }, (_, i) => [['M', .1, .1 + .8 * i / count], ['L', .9, .1 + .8 * i / count]]) } }
}
function manyCommands(count: number, x: number): DrawingProposal {
  const path: SketchCommand[] = [['M', .1, .1], ...Array.from({ length: count - 1 }, (_, i): SketchCommand => ['L', i % 2 ? .1 : .9, i % 2 ? .1 : .9])]
  return { ...base, x, y: .4, width: .18, height: .18, sketch: { aspect: 1, paths: [path, structuredClone(path), structuredClone(path)] } }
}

test('per-object command budgets reject rather than silently trimming paths', () => {
  expect(validateProposal(manyPaths(24, .1))).not.toBeNull()
  expect(validateProposal(manyPaths(25, .1))).toBeNull()
  const maximum = manyCommands(32, .1)
  expect(validateProposal(maximum)).not.toBeNull()
  expect(validateProposal(manyCommands(33, .1))).toBeNull()
  expect(validateProposal({ ...maximum, sketch: { aspect: 1, paths: [...maximum.sketch!.paths, [['E', .5, .5, .2, .2]]] } })).toBeNull()
})

test('whole plans enforce 64 compiled strokes and 192 custom commands without dropping members', () => {
  const full = [manyPaths(24, .1), manyPaths(24, .41), manyPaths(16, .72)]
  const prepared = prepareDrawingPlan(full, empty(), 1, surface)!
  expect(prepared).toHaveLength(3)
  expect(prepared.flatMap(p => proposalStrokes(p))).toHaveLength(64)
  expect(drawingPlanFits(prepared, empty(), 1, surface)).toBe(true)
  const tooMany = [full[0], full[1], manyPaths(17, .72)]
  expect(prepareDrawingPlan(tooMany, empty(), 1, surface)).toBeNull()
  expect(drawingPlanFits(tooMany, empty(), 1, surface)).toBe(false)
  const maxCommands = [manyCommands(32, .1), manyCommands(32, .6)]
  expect(prepareDrawingPlan(maxCommands, empty(), 1, surface)).toHaveLength(2)
  const overCommands = [...maxCommands, { ...manyPaths(1, .35), y: .7 }]
  expect(prepareDrawingPlan(overCommands, empty(), 1, surface)).toBeNull()
  expect(drawingPlanFits(overCommands, empty(), 1, surface)).toBe(false)
  const mixed = [manyPaths(24, .1), manyPaths(24, .4), { ...base, template: 'sun' as const, subject: undefined, sketch: undefined, x: .7 }]
  delete mixed[2].subject; delete mixed[2].sketch
  expect(prepareDrawingPlan(mixed, empty(), 1, surface)).toHaveLength(3)
  expect(prepareDrawingPlan([full[0], { ...full[1], sketch: { aspect: 1, paths: [[['M', .1, .1]]] } }], empty(), 1, surface)).toBeNull()
})

test('subject memories stay bounded and isolated while custom never becomes a builtin template', () => {
  localStorage.clear()
  saveMemory('child', 'drawing', { theme: 'space', recentTemplates: ['sun', 'custom'], rejectedTemplates: ['custom', 'moon'],
    recentSubjects: ['  robot  ', 'robot', '', 'rocket', 'dinosaur', 'submarine', 'balloon'], rejectedSubjects: ['long'.repeat(40)] })
  expect(readMemory('child', 'drawing')).toEqual({ theme: 'space', recentTemplates: ['sun'], rejectedTemplates: ['moon'],
    recentSubjects: ['rocket', 'dinosaur', 'submarine', 'balloon'], rejectedSubjects: [('long'.repeat(40)).slice(0, 60)] })
  expect(readMemory('other-child', 'drawing').recentSubjects).toEqual([])
  expect(readMemory('child', 'other-drawing').recentSubjects).toEqual([])
  saveMemory('child', 'old', { theme: 'legacy', recentTemplates: ['sun'], rejectedTemplates: [] })
  expect(readMemory('child', 'old').recentSubjects).toEqual([])
})
