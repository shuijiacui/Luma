import { beforeEach, expect, test } from 'vitest'
import { drawingPlanFits, localCommand, prepareDrawingPlan, prepareProposal, projectionFits, proposalStrokes, readMemory, saveMemory, summarizeStroke, templates, validateProposal, type DrawingProposal } from '@/features/child/companion/proposals'

const proposal: DrawingProposal = { template: 'flame', x: .3, y: .5, width: .15, height: .15, rotation: 0, color: '#e4a86a', strokeWidth: 4, target: '飞船', relation: '尾部的火焰' }
const empty = () => Array(32 * 32).fill(0)
beforeEach(() => localStorage.clear())

test('only complete affirmative statements accept; questions, praise and negation never commit', () => {
  for (const text of ['留下来', '留下来！', '画上去。', 'Keep it!', 'add it', '确认留下']) expect(localCommand(text)).toBe('accept')
  for (const text of ['留下来？', 'keep it?', '不要留下来', '好看', '嗯', '就这样', '可以留下来吗', '我说留下来是什么意思', 'keep it, no', 'I do not want to keep it', 'leave it alone', '留下来然后放大']) expect(localCommand(text)).not.toBe('accept')
})

test('button directions and bilingual voice edits share bounded local commands', () => {
  for (const word of ['left', 'right', 'up', 'down', 'smaller', 'larger']) expect(localCommand(word)).toBe(word)
  expect(localCommand('往左一点')).toBe('left')
  expect(localCommand('再小一点')).toBe('smaller')
  expect(localCommand('换成蓝色')).toEqual({ color: '#4aa5d8' })
  expect(localCommand('换一个')).toBe('alternative')
  expect(localCommand('不要留下来')).toBe('dismiss')
})

test('rejects unsupported shape instructions, bad coordinates and oversized edits', () => {
  expect(validateProposal({ ...proposal, rotation: undefined, strokeWidth: undefined })).toMatchObject({ rotation: 0, strokeWidth: 4 })
  for (const patch of [{ x: NaN }, { x: '0.4' }, { template: 'random' }, { width: 10 }, { width: .45, height: .45 }, { color: 'url(evil)' }, { target: '' }, { relation: '' }, { strokeWidth: 0 }, { strokeWidth: 33 }, { brushKind: 'random' }, { accept: true }]) expect(validateProposal({ ...proposal, ...patch })).toBeNull()
})

test('proposals carry the child brush and its full size range into preview and committed strokes', () => {
  for (const brushKind of ['round', 'pencil', 'marker', 'crayon', 'star'] as const) {
    for (const strokeWidth of [1, 9.5, 32]) {
      const styled = { ...proposal, brushKind, strokeWidth, color: '#d74952' }
      expect(validateProposal(styled)).toMatchObject({ brushKind, strokeWidth })
      expect(proposalStrokes(styled).every(stroke => stroke.brushKind === brushKind && stroke.width === strokeWidth && stroke.color === styled.color)).toBe(true)
    }
  }
})

test('a wide brush footprint cannot cross neighbouring ink on a small screen', () => {
  const p: DrawingProposal = { ...proposal, template: 'window', x: .4, y: .4, width: .2, height: .2, strokeWidth: 32, brushKind: 'star' }
  const grid = empty()
  grid[16 * 32 + 9] = .5
  expect(projectionFits({ ...p, strokeWidth: 1, brushKind: 'pencil' }, grid, 1, { width: 200, height: 200 })).toBe(true)
  expect(projectionFits(p, grid, 1, { width: 200, height: 200 })).toBe(false)
})

test('all concrete templates have finite visible paths and fit an empty canvas', () => {
  for (const template of templates.filter(value => value !== 'echo')) {
    const p = { ...proposal, template }
    expect(proposalStrokes(p, 1.7).length).toBeGreaterThan(0)
    expect(projectionFits(p, empty(), 1.7)).toBe(true)
  }
  expect(projectionFits(proposal, empty(), 0)).toBe(false)
  expect(projectionFits(proposal, [0, 0], 1)).toBe(false)
})

test('new concrete subjects prepare complete brush paths without clipping', () => {
  for (const template of ['sun', 'moon', 'tree', 'mountain', 'house', 'boat', 'bird', 'butterfly', 'heart'] as const) {
    const prepared = prepareProposal({ ...proposal, template, y: .35, width: .24, height: .3 }, Array(64 * 64).fill(0), 2, { width: 1200, height: 600 })
    expect(prepared).not.toBeNull()
    const strokes = proposalStrokes(prepared!, 2)
    expect(strokes.flatMap(stroke => stroke.points).every(point => Number.isFinite(point.x) && Number.isFinite(point.y))).toBe(true)
    expect(projectionFits(prepared!, Array(64 * 64).fill(0), 2, { width: 1200, height: 600 })).toBe(true)
    expect(strokes.every(stroke => stroke.points.length >= 2)).toBe(true)
    if (!['moon', 'heart'].includes(template)) expect(strokes.length).toBeGreaterThan(2)
  }
})

test.each([.75, 1, 2.5])('preparation keeps suns circular and windows square at canvas aspect %s', aspect => {
  for (const template of ['sun', 'window'] as const) {
    const original = { ...proposal, template, x: .3, y: .3, width: .24, height: .22 }
    const prepared = prepareProposal(original, Array(64 * 64).fill(0), aspect, { width: 800 * aspect, height: 800 })!
    expect(prepared).not.toBeNull()
    expect(prepared.width * aspect / prepared.height).toBeCloseTo(1)
    expect(prepared.x + prepared.width / 2).toBeCloseTo(original.x + original.width / 2)
    expect(prepared.y + prepared.height / 2).toBeCloseTo(original.y + original.height / 2)
    const points = proposalStrokes(prepared, aspect).flatMap(stroke => stroke.points)
    const physicalWidth = (Math.max(...points.map(p => p.x)) - Math.min(...points.map(p => p.x))) * aspect
    const physicalHeight = Math.max(...points.map(p => p.y)) - Math.min(...points.map(p => p.y))
    expect(physicalWidth / physicalHeight).toBeCloseTo(1)
    expect(original.width).toBe(.24)
  }
})

test('waves and grass remain horizontal while anchored additions stay proportional to their subject', () => {
  for (const template of ['waves', 'grass'] as const) {
    const prepared = prepareProposal({ ...proposal, template, width: .3, height: .25 }, empty(), 2)!
    expect(prepared.width * 2 / prepared.height).toBeGreaterThan(2)
  }
  const anchor = { x: .25, y: .6, width: .15, height: .15 }
  const prepared = prepareProposal({ ...proposal, template: 'sun', x: .3, y: .15, width: .25, height: .3, anchor, placement: 'above' }, Array(64 * 64).fill(0), 2)!
  expect(prepared).not.toBeNull()
  expect(Math.max(prepared.width * 2, prepared.height)).toBeLessThanOrEqual(.15 * 2 * .85 + 1e-9)
  expect(drawingPlanFits([prepared], Array(64 * 64).fill(0), 2)).toBe(true)
  const inside = prepareProposal({ ...proposal, template: 'window', x: .35, y: .35, width: .3, height: .3,
    anchor: { x: .3, y: .3, width: .4, height: .4 }, placement: 'inside' }, empty(), 2)!
  expect(inside).not.toBeNull()
  expect(inside.height).toBeLessThanOrEqual(.4 * .6)
  expect(drawingPlanFits([inside], empty(), 2)).toBe(true)
})

test('anchor metadata is bounded and cannot smuggle arbitrary geometry', () => {
  const anchor = { x: .25, y: .6, width: .15, height: .15 }
  expect(validateProposal({ ...proposal, anchor, placement: 'above' })?.anchor).toEqual(anchor)
  for (const patch of [
    { anchor: null }, { anchor: { ...anchor, x: NaN } }, { anchor: { ...anchor, width: '0.2' } },
    { anchor: { ...anchor, height: 2 } }, { anchor: { ...anchor, paths: [[0, 0]] } }, { placement: 'anywhere' },
    { paths: [[0, 0], [1, 1]] },
  ]) expect(validateProposal({ ...proposal, ...patch })).toBeNull()
})

test.each([32, 64])('a local collision can be repaired without crossing to a new location on a %s grid', size => {
  const p: DrawingProposal = { ...proposal, template: 'window', x: .4, y: .5, width: .2, height: .14,
    anchor: { x: .35, y: .2, width: .3, height: .2 }, placement: 'below', strokeWidth: 2 }
  const grid = Array(size * size).fill(0)
  const unblocked = prepareProposal(p, grid, 1, { width: 800, height: 800 })!
  const point = proposalStrokes(unblocked)[0].points[0]
  grid[Math.floor(point.y * size) * size + Math.floor(point.x * size)] = .7
  expect(projectionFits(unblocked, grid, 1, { width: 800, height: 800 })).toBe(false)
  const repaired = prepareProposal(p, grid, 1, { width: 800, height: 800 })!
  expect(repaired).not.toBeNull()
  expect(projectionFits(repaired, grid, 1, { width: 800, height: 800 })).toBe(true)
  expect(drawingPlanFits([repaired], grid, 1, { width: 800, height: 800 })).toBe(true)
  expect(Math.hypot(repaired.x + repaired.width / 2 - (p.x + p.width / 2), repaired.y + repaired.height / 2 - (p.y + p.height / 2))).toBeLessThanOrEqual(.026)
  expect(repaired.width / repaired.height).toBeCloseTo(1)
})

test('a blocked neighbourhood is rejected even if a distant corner is empty', () => {
  const grid = Array(64 * 64).fill(0)
  for (let row = 17; row < 50; row++) for (let col = 15; col < 49; col++) grid[row * 64 + col] = .8
  expect(prepareProposal({ ...proposal, template: 'house', x: .4, y: .4, width: .2, height: .2 }, grid, 1)).toBeNull()
  const wrongSide: DrawingProposal = { ...proposal, template: 'sun', x: .4, y: .7, width: .15, height: .15,
    anchor: { x: .3, y: .3, width: .3, height: .2 }, placement: 'above' }
  expect(prepareProposal(wrongSide, empty(), 1)).toBeNull()
})

test('a multi-part contribution is prepared and checked as one immutable plan', () => {
  const proposals: DrawingProposal[] = [
    { ...proposal, template: 'sun', x: .1, y: .15, width: .2, height: .2 },
    { ...proposal, template: 'bird', x: .6, y: .2, width: .2, height: .2 },
    { ...proposal, template: 'boat', x: .15, y: .65, width: .25, height: .2 },
    { ...proposal, template: 'grass', x: .65, y: .7, width: .2, height: .15 },
  ]
  const original = structuredClone(proposals)
  const grid = Array(64 * 64).fill(0)
  const prepared = prepareDrawingPlan(proposals, grid, 2, { width: 1200, height: 600 })!
  expect(prepared).toHaveLength(4)
  expect(drawingPlanFits(prepared, grid, 2, { width: 1200, height: 600 })).toBe(true)
  expect(drawingPlanFits([prepared[0], prepared[0]], grid, 2)).toBe(false)
  expect(proposals).toEqual(original)
  expect(grid.every(cell => cell === 0)).toBe(true)

  // One unsafe addition rejects the whole result, rather than silently dropping it.
  for (let row = 0; row < 64; row++) for (let col = 32; col < 64; col++) grid[row * 64 + col] = 1
  expect(prepareDrawingPlan(proposals, grid, 2)).toBeNull()
})

test('plan budgets reject over-large or over-count contributions and edits do not auto-relocate', () => {
  const large = [.04, .59].flatMap(x => [.04, .59].map(y => ({ ...proposal, template: 'window' as const, x, y, width: .35, height: .35 })))
  expect(prepareDrawingPlan(large, Array(64 * 64).fill(0), 1)).toBeNull()
  expect(drawingPlanFits(large, empty(), 1)).toBe(false)
  expect(prepareDrawingPlan(Array(5).fill(proposal), empty(), 1)).toBeNull()
  expect(prepareDrawingPlan([], empty(), 1)).toBeNull()
  const copy = structuredClone(proposal)
  const grid = Array(64 * 64).fill(1)
  expect(drawingPlanFits([copy], grid, 1)).toBe(false)
  expect(copy).toEqual(proposal)
})

test('sparse straight segments cannot cross occupied cells or rotated canvas bounds', () => {
  const p = { ...proposal, template: 'window' as const, width: .3, height: .2 }
  const occupancy = empty()
  occupancy[Math.floor((p.y + p.height * .12) * 32) * 32 + Math.floor((p.x + p.width * .3) * 32)] = .5
  expect(projectionFits(p, occupancy)).toBe(false)
  expect(projectionFits({ ...proposal, x: .7, y: .01, rotation: 90, width: .2, height: .025 }, empty(), 2)).toBe(false)
  const invalid = empty(); invalid[0] = NaN
  expect(projectionFits(proposal, invalid)).toBe(false)
})

test('echo derives the actual child gesture and preserves its physical direction and proportions', () => {
  expect(validateProposal({ ...proposal, template: 'echo' })).toBeNull()
  expect(proposalStrokes({ ...proposal, template: 'echo' })).toEqual([])
  const p: DrawingProposal = { ...proposal, template: 'echo', echoPoints: [{ x: .1, y: .2 }, { x: .15, y: .21 }, { x: .2, y: .4 }] }
  const points = proposalStrokes(p, 2)[0].points
  expect(points).toHaveLength(3)
  expect((points[2].x - points[0].x) * 2 / (points[2].y - points[0].y)).toBeCloseTo(1)
  expect(points[1].y - points[0].y).toBeLessThan((points[2].y - points[1].y) / 10)
  expect(projectionFits(p, empty(), 2)).toBe(true)
})

test('stroke summary keeps endpoints and full gesture within the 24-point budget', () => {
  const points = Array.from({ length: 240 }, (_, i) => ({ x: i / 239, y: i / 478 }))
  const result = summarizeStroke({ points, color: '#ffffff', width: 4 })
  expect(result?.points).toHaveLength(24)
  expect(result?.points[0]).toEqual(points[0])
  expect(result?.points.at(-1)).toEqual(points.at(-1))
})

test('story storage is isolated by child and artwork and never persists dialogue fields', () => {
  const memory = { theme: '去月球的飞船', recentTemplates: ['flame'], rejectedTemplates: ['waves'], history: [{ role: 'user', text: 'private conversation' }] }
  saveMemory('child-a', 'drawing-a', memory)
  expect(readMemory('child-a', 'drawing-a').theme).toBe('去月球的飞船')
  expect(readMemory('child-b', 'drawing-a').theme).toBe('')
  expect(readMemory('child-a', 'drawing-b').theme).toBe('')
  expect(localStorage.getItem('luma_story:child-a:drawing-a')).not.toContain('history')
  expect(localStorage.getItem('luma_story:child-a:drawing-a')).not.toContain('private conversation')
})
