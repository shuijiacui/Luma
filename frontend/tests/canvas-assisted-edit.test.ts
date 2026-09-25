import { afterEach, expect, test, vi } from 'vitest'
import { boundsForGroups, editableStrokeGroups, prepareAssistedEdit } from '@/features/child/canvasEditing'
import { canvasUndoCounts, cloneCanvasDocument, getCanvasProvenance, hasAssistedEdits, lastUndoOwner, originalChildOperations, paintCanvasOperation, undoCanvasOwner, undoLastCanvasOperation, visibleOperations, type CanvasDocument, type CanvasStroke } from '@/features/child/canvasDocument'
import { validateDrawingDocument } from '../../shared/niloDocument.mjs'

const stroke = (groupId: string, extra: Partial<CanvasStroke> = {}): CanvasStroke => ({
  owner: 'child', type: 'stroke', groupId, points: [{ x: .2, y: .2 }, { x: .3, y: .3 }],
  color: '#ff0000', size: 10, brushKind: 'round', eraser: false, referenceWidth: 1000, referenceHeight: 600, ...extra,
})
const doc = (...operations: CanvasDocument['operations']): CanvasDocument => ({ version: 1, baseSource: 'child', operations })
const ink = (document: CanvasDocument) => visibleOperations(document).filter((op): op is CanvasStroke => op.type === 'stroke' && !op.eraser)
afterEach(() => vi.restoreAllMocks())

test('compound assistance preserves all samples and original ink, saves once, and undoes as one transaction', () => {
  const points = Array.from({ length: 200 }, (_, i) => ({ x: .2 + i * .0005, y: .25 + Math.sin(i) * .02 }))
  const source = doc(stroke('sun', { points, brushKind: 'crayon' }), stroke('neighbour', { color: '#00ff00' }))
  const before = cloneCanvasDocument(source)
  const changed = prepareAssistedEdit(source, ['sun'], [{ type: 'color', value: '#0000ff' }, { type: 'scale', factor: .8 }, { type: 'move', dx: .2, dy: .1 }], 'assist-1')!
  expect(changed).not.toBeNull()
  expect(source).toEqual(before)
  expect(changed.operations.slice(0, 2)).toEqual(before.operations)
  expect(ink(changed).map(s => s.groupId)).toEqual(['sun', 'neighbour'])
  expect(ink(changed)[0]).toMatchObject({ color: '#0000ff', brushKind: 'crayon', size: 8 })
  expect(ink(changed)[0].points).toHaveLength(200)
  expect(ink(changed)[1]).toEqual(source.operations[1])
  expect(canvasUndoCounts(changed)).toEqual({ child: 2, nilo: 1 })
  expect(validateDrawingDocument(JSON.parse(JSON.stringify(changed)))).toBe(true)
  expect(undoCanvasOwner(changed, 'nilo')).toBe(true)
  expect(visibleOperations(changed)).toEqual(before.operations)
  expect(hasAssistedEdits(changed)).toBe(true)
  expect(getCanvasProvenance(changed)).toBe('co-created')
  expect(changed.operations.at(-1)).toMatchObject({ type: 'assist-revert', targetId: 'assist-1' })
  expect(canvasUndoCounts(changed)).toEqual({ child: 2, nilo: 0 })
  expect(undoCanvasOwner(changed, 'nilo')).toBe(false)
  expect(validateDrawingDocument(changed)).toBe(true)
})

test('repeated transformations compose from displayed geometry and undo restores the previous edit', () => {
  const source = doc(stroke('a'), stroke('b', { points: [{ x: .35, y: .2 }] }))
  const first = prepareAssistedEdit(source, ['a', 'b'], [{ type: 'scale', factor: .5 }], 'first')!
  const second = prepareAssistedEdit(first, ['a', 'b'], [{ type: 'place', x: .7, y: .6 }, { type: 'color', value: '#459fd1' }], 'second')!
  expect(second).not.toBeNull()
  const bounds = boundsForGroups(second, ['a', 'b'])!
  expect(bounds.x + bounds.width / 2).toBeCloseTo(.7)
  expect(bounds.y + bounds.height / 2).toBeCloseTo(.6)
  expect(ink(second).every(s => s.color === '#459fd1')).toBe(true)
  undoCanvasOwner(second, 'nilo')
  expect(visibleOperations(second)).toEqual(visibleOperations(first))
})

test('invalid or out-of-bounds actions reject the complete transaction, not its colour prefix', () => {
  const source = doc(stroke('a')), before = cloneCanvasDocument(source)
  for (const actions of [
    [{ type: 'color', value: '#0000ff' }, { type: 'move', dx: -.5, dy: 0 }],
    [{ type: 'place', x: 0, y: 0 }], [{ type: 'delete' }], [{ type: 'variant' }], [{ type: 'scale', factor: NaN }],
  ]) expect(prepareAssistedEdit(source, ['a'], actions, 'edit')).toBeNull()
  expect(prepareAssistedEdit(source, ['missing'], [{ type: 'color', value: '#0000ff' }], 'edit')).toBeNull()
  expect(prepareAssistedEdit(source, ['a', 'a'], [{ type: 'color', value: '#0000ff' }], 'edit')).toBeNull()
  expect(prepareAssistedEdit(source, ['a'], [{ type: 'color', value: '#0000ff' }], 'a')).toBeNull()
  expect(source).toEqual(before)
})

test('clear is an epoch boundary and child undo never leaves dangling assistance targets', () => {
  const changed = prepareAssistedEdit(doc(stroke('a')), ['a'], [{ type: 'move', dx: .2, dy: 0 }], 'edit')!
  changed.operations.push({ type: 'clear', owner: 'child', groupId: 'clear' })
  expect(editableStrokeGroups(changed)).toEqual([])
  expect(prepareAssistedEdit(changed, ['a'], [{ type: 'color', value: '#0000ff' }], 'edit2')).toBeNull()
  undoCanvasOwner(changed, 'child')
  expect(ink(changed)[0].points[0].x).toBeCloseTo(.4)
  undoCanvasOwner(changed, 'child')
  expect(changed.operations).toEqual([])
  expect(validateDrawingDocument(changed)).toBe(true)
  expect(changed.coCreated).toBe(true)
})

test('erased holes follow only their original ink; later erasing attaches at the current position', () => {
  const eraser = stroke('erase', { eraser: true, size: 12, points: [{ x: .25, y: .25 }] })
  const other = stroke('other', { points: [{ x: .7, y: .25 }] })
  const source = doc(stroke('a'), eraser, other)
  const first = prepareAssistedEdit(source, ['a'], [{ type: 'move', dx: .3, dy: 0 }], 'first')!
  expect(ink(first)[0].erasures![0].points[0].x).toBeCloseTo(.55)
  expect(ink(first)[1].erasures).toBeUndefined()
  expect(visibleOperations(first)[0]).toEqual(eraser) // base erasing occurs before isolated ink
  first.operations.push(stroke('erase2', { eraser: true, points: [{ x: .56, y: .26 }] }))
  const second = prepareAssistedEdit(first, ['a'], [{ type: 'scale', factor: .5 }], 'second')!
  const edited = ink(second)[0]
  expect(edited.erasures).toHaveLength(2)
  expect(edited.erasures![0].size).toBe(6)
  expect(edited.erasures![1].points[0].x).toBeCloseTo(.555)
  expect(ink(second)[1]).toEqual(other)
  expect(source.operations[0]).toEqual(stroke('a'))
  expect(validateDrawingDocument(second)).toBe(true) // derived masks never leak into persistence
})

test('moving ink into the old eraser area does not erase it retroactively', () => {
  const source = doc(stroke('a'), stroke('erase', { eraser: true, points: [{ x: .6, y: .25 }] }))
  const changed = prepareAssistedEdit(source, ['a'], [{ type: 'move', dx: .35, dy: 0 }], 'edit')!
  expect(ink(changed)[0].erasures).toBeUndefined()
})

test('undoing a move keeps holes erased at the moved location and retains the historical transaction', () => {
  const source = doc(stroke('a'))
  const moved = prepareAssistedEdit(source, ['a'], [{ type: 'move', dx: .3, dy: 0 }], 'move')!
  moved.operations.push(stroke('eraser', { eraser: true, points: [{ x: .55, y: .25 }] }))
  expect(ink(moved)[0].erasures![0].points[0].x).toBeCloseTo(.55)
  undoCanvasOwner(moved, 'nilo')
  expect(ink(moved)[0].points).toEqual(stroke('a').points)
  expect(ink(moved)[0].erasures![0].points[0].x).toBeCloseTo(.25)
  expect(moved.operations.filter(op => op.type === 'assist')).toHaveLength(1)
  expect(validateDrawingDocument(moved)).toBe(true)
  const next = prepareAssistedEdit(moved, ['a'], [{ type: 'move', dx: 0, dy: .2 }], 'move-again')!
  expect(ink(next)[0].erasures![0].points[0]).toEqual(expect.objectContaining({ x: expect.closeTo(.25), y: expect.closeTo(.45) }))
  expect(lastUndoOwner(next)).toBe('nilo')
  expect(undoLastCanvasOperation(next)).toBe(true)
  expect(lastUndoOwner(next)).toBe('child')
  expect(validateDrawingDocument(next)).toBe(true)
})

test('child undo drops dependent group transactions instead of replaying them against a different scene', () => {
  const source = doc(stroke('a'), stroke('b'))
  const first = prepareAssistedEdit(source, ['a', 'b'], [{ type: 'move', dx: .4, dy: 0 }], 'move')!
  const second = prepareAssistedEdit(first, ['a'], [{ type: 'move', dx: -.3, dy: 0 }], 'move2')!
  undoCanvasOwner(second, 'child')
  expect(second.operations).toEqual([source.operations[0]])
  expect(validateDrawingDocument(second)).toBe(true)
})

test('eraser compositing happens on an isolated layer, preserving neighbouring ink', () => {
  const makeContext = () => ({ save: vi.fn(), restore: vi.fn(), scale: vi.fn(), clearRect: vi.fn(), drawImage: vi.fn(), translate: vi.fn(), rotate: vi.fn(), beginPath: vi.fn(), closePath: vi.fn(), arc: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), fill: vi.fn(), fillRect: vi.fn(), globalAlpha: 1, globalCompositeOperation: 'source-over', fillStyle: '' })
  const main = makeContext(), layer = makeContext()
  const composites: string[] = []
  layer.fill.mockImplementation(() => composites.push(layer.globalCompositeOperation))
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(layer as unknown as CanvasRenderingContext2D)
  paintCanvasOperation(main as unknown as CanvasRenderingContext2D, 1000, 600, { ...stroke('a'), erasures: [stroke('erase', { eraser: true })] })
  expect(composites).toContain('source-over')
  expect(composites).toContain('destination-out')
  expect(main.fill).not.toHaveBeenCalled()
  expect(main.drawImage).toHaveBeenCalledOnce()
  expect(main.globalCompositeOperation).toBe('source-over')
})

test('original replay is unaffected by assistance; explicit tracing is retained as guidance metadata', () => {
  const child = stroke('a', { guidance: { guideId: 'sun-guide', name: '太阳', subjects: ['太阳'] } })
  const source = doc(child)
  source.guided = true
  const changed = prepareAssistedEdit(source, ['a'], [{ type: 'color', value: '#0000ff' }], 'edit')!
  expect(originalChildOperations(changed)).toEqual([child])
  expect(editableStrokeGroups(changed)[0]).toMatchObject({ id: 'a', owner: 'child', name: '太阳', guidance: child.guidance })
  expect(getCanvasProvenance(source)).toBe('co-created')
  expect(validateDrawingDocument(changed)).toBe(true)
})

test('legacy documents replay unchanged, including erasers, and colour can change a clipped edge stroke', () => {
  const source = doc(stroke('a', { points: [{ x: 0, y: .3 }] }), stroke('eraser', { eraser: true }))
  expect(visibleOperations(source)).toEqual(source.operations)
  expect(validateDrawingDocument(source)).toBe(true)
  expect(prepareAssistedEdit(source, ['a'], [{ type: 'color', value: '#0000ff' }], 'edit')).not.toBeNull()
})
