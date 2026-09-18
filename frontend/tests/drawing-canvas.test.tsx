import { createRef } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { DrawingCanvas, type DrawingCanvasHandle } from '@/features/child/components/DrawingCanvas'
import type { CanvasDraft } from '@/features/child/draft'
import { cloneCanvasDocument, getCanvasProvenance, paintCanvasOperation } from '@/features/child/canvasDocument'
import { createStrokePainter } from '@/features/child/brushes'

let ctx: CanvasRenderingContext2D
beforeEach(() => {
  ctx = {
    save: vi.fn(), restore: vi.fn(), scale: vi.fn(), clearRect: vi.fn(), drawImage: vi.fn(), translate: vi.fn(),
    rotate: vi.fn(), beginPath: vi.fn(), closePath: vi.fn(), arc: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(),
    fill: vi.fn(), fillRect: vi.fn(), globalAlpha: 1, globalCompositeOperation: 'source-over', fillStyle: '',
  } as unknown as CanvasRenderingContext2D
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx)
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,drawing')
  vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({left:0,top:0,width:320,height:240} as DOMRect)
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  vi.stubGlobal('Image', class { onload?: () => void; set src(_value: string) { this.onload?.() } })
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

function pointer(canvas: HTMLCanvasElement, name: string, overrides: Record<string, unknown> = {}) {
  const event = new Event(name, {bubbles:true})
  Object.assign(event, {pointerId:1, isPrimary:true, button:0, clientX:20, clientY:30, ...overrides})
  fireEvent(canvas, event)
}
function prepare() {
  const ref = createRef<DrawingCanvasHandle>()
  const draft: CanvasDraft = {history:['']}
  const complete = vi.fn()
  const props = {ref, draft, onStrokeComplete:complete, color:'#edcd70', brushSize:8, brushKind:'star' as const, isEraser:false}
  const view = render(<DrawingCanvas {...props} />)
  const canvas = screen.getByLabelText('自由绘画画布') as HTMLCanvasElement
  canvas.setPointerCapture = vi.fn()
  canvas.hasPointerCapture = vi.fn().mockReturnValue(true)
  canvas.releasePointerCapture = vi.fn()
  return {ref,draft,complete,props,view,canvas}
}

test('a tap is saved as one undoable stroke; a second pointer cannot finish it', () => {
  const {canvas, draft, complete, ref, view, props} = prepare()
  const start = vi.fn()
  view.rerender(<DrawingCanvas {...props} onStrokeStart={start} />)
  pointer(canvas,'pointerdown')
  expect(start).toHaveBeenCalledOnce()
  pointer(canvas,'pointerdown',{pointerId:2,isPrimary:false})
  expect(start).toHaveBeenCalledOnce()
  expect(ctx.fill).toHaveBeenCalled()
  pointer(canvas,'pointerup',{pointerId:2,isPrimary:false})
  expect(complete).not.toHaveBeenCalled()
  pointer(canvas,'pointerup')
  expect(draft.history).toEqual(['data:image/png;base64,drawing'])
  expect(complete).toHaveBeenCalledOnce()
  act(() => ref.current?.undo())
  expect(ref.current?.getUndoCounts()).toEqual({ child: 0, nilo: 0 })
  expect(draft.document?.operations).toEqual([])
  expect(ctx.clearRect).toHaveBeenCalled()
})

test('eraser snapshots can be undone and the following brush uses normal paint', async () => {
  const {canvas,props,view,ref} = prepare()
  pointer(canvas,'pointerdown'); pointer(canvas,'pointerup')
  view.rerender(<DrawingCanvas {...props} isEraser />)
  pointer(canvas,'pointerdown')
  expect(ctx.globalCompositeOperation).toBe('destination-out')
  pointer(canvas,'pointerup')
  expect(ref.current?.getUndoCounts()).toEqual({ child: 2, nilo: 0 })
  await act(async () => { ref.current?.undo() })
  expect(ref.current?.getUndoCounts()).toEqual({ child: 1, nilo: 0 })
  expect(ctx.scale).toHaveBeenCalled()
  view.rerender(<DrawingCanvas {...props} />)
  pointer(canvas,'pointerdown'); pointer(canvas,'pointerup')
  expect(ctx.globalCompositeOperation).toBe('source-over')
})

test('两套撤销互相独立，可连续撤销各自的笔迹', async () => {
  const { canvas, ref } = prepare()
  const frames: FrameRequestCallback[] = []
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.push(callback); return frames.length })
  const drawChild = () => { pointer(canvas, 'pointerdown'); pointer(canvas, 'pointerup') }
  const drawNilo = async (kind: string) => {
    await act(async () => {
      const drawing = ref.current!.drawCompanionStroke({ kind, points: [{ x: 0.2, y: 0.2 }, { x: 0.3, y: 0.3 }], color: '#6fa8d8', width: 5 })
      frames.splice(0).forEach(frame => frame(0))
      await drawing
    })
  }

  drawChild()
  await drawNilo('wave')
  expect(ref.current?.getUndoCounts()).toEqual({ child: 1, nilo: 1 })

  // 撤销 Nilo：孩子那一笔不受影响
  expect(ref.current?.undoCompanionStroke()).toBe(true)
  await act(async () => {})
  expect(ref.current?.getUndoCounts()).toEqual({ child: 1, nilo: 0 })
  expect(ref.current?.undoCompanionStroke()).toBe(false)

  // 即使孩子之后又画了，也依然可以单独撤销 Nilo 的笔，并连续撤销更早的
  await drawNilo('dot')
  drawChild()
  await drawNilo('flower')
  expect(ref.current?.getUndoCounts()).toEqual({ child: 2, nilo: 2 })
  expect(ref.current?.undoCompanionStroke()).toBe(true)
  await act(async () => {})
  expect(ref.current?.getUndoCounts()).toEqual({ child: 2, nilo: 1 })
  expect(ref.current?.undoCompanionStroke()).toBe(true)
  await act(async () => {})
  expect(ref.current?.getUndoCounts()).toEqual({ child: 2, nilo: 0 })

  // 孩子的撤销只减少孩子自己的笔
  expect(ref.current?.undo()).toBe(true)
  await act(async () => {})
  expect(ref.current?.getUndoCounts()).toEqual({ child: 1, nilo: 0 })
})

test('export flattens the painted canvas onto an opaque background; clear remains undoable', async () => {
  const {canvas,ref} = prepare()
  pointer(canvas,'pointerdown'); pointer(canvas,'pointerup')
  expect(ref.current?.exportImage()).toBe('drawing')
  expect(ctx.fillStyle).toBe('#fffdf8')
  expect(ctx.globalCompositeOperation).toBe('destination-over')
  act(() => ref.current?.clear())
  expect(ref.current?.getUndoCounts()).toEqual({ child: 2, nilo: 0 })
  await act(async () => { ref.current?.undo() })
  expect(ref.current?.getUndoCounts()).toEqual({ child: 1, nilo: 0 })
  const download = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  act(() => ref.current?.download())
  expect(download).toHaveBeenCalledOnce()
})

test('disabled canvas ignores new pointer strokes', () => {
  const {canvas,view,props,draft,complete} = prepare()
  view.rerender(<DrawingCanvas {...props} disabled />)
  pointer(canvas,'pointerdown'); pointer(canvas,'pointermove',{clientX:100}); pointer(canvas,'pointerup')
  expect(draft.document?.operations).toEqual([])
  expect(complete).not.toHaveBeenCalled()
})

const contribution = { kind: 'wave', color: '#4488aa', width: 4, points: [{ x: 0.2, y: 0.6 }, { x: 0.3, y: 0.7 }] }

test('confirmation is atomic, rejects stale/invalid results, and undoes a complete multi-path contribution', () => {
  const { canvas, ref } = prepare()
  const originalRevision = ref.current!.getRevision()
  pointer(canvas, 'pointerdown'); pointer(canvas, 'pointerup')
  expect(ref.current!.commitCompanionStrokes([contribution], originalRevision)).toBe(false)
  const revision = ref.current!.getRevision()
  const baseline = ref.current!.getDocument()
  expect(ref.current!.commitCompanionStrokes([contribution, { ...contribution, points: [{ x: NaN, y: 1 }] }], revision)).toBe(false)
  expect(ref.current!.getDocument()).toEqual(baseline)
  expect(ref.current!.getRevision()).toBe(revision)
  vi.mocked(ctx.drawImage).mockClear()
  vi.mocked(HTMLCanvasElement.prototype.toDataURL).mockImplementationOnce(() => { throw new Error('cannot encode') })
  expect(ref.current!.commitCompanionStrokes([contribution], revision)).toBe(false)
  expect(ctx.drawImage).not.toHaveBeenCalled()
  expect(ref.current!.getDocument()).toEqual(baseline)
  expect(ref.current!.commitCompanionStrokes([contribution, contribution], revision)).toBe(true)
  expect(ref.current!.getUndoCounts()).toEqual({ child: 1, nilo: 1 })
  expect(ref.current!.getDocument().operations).toHaveLength(3)
  expect(ref.current!.commitCompanionStrokes([contribution], revision)).toBe(false)
  ref.current!.undoCompanionStroke()
  expect(ref.current!.getDocument()).toEqual({ ...baseline, coCreated: true })
  expect(getCanvasProvenance(ref.current!.getDocument())).toBe('co-created')
  ref.current!.clear()
  expect(getCanvasProvenance(ref.current!.getDocument())).toBe('co-created')
})

test.each(['round', 'pencil', 'marker', 'crayon', 'star'] as const)('%s preserves every sample and replays the original brush after reopening', kind => {
  const { canvas, ref, props, view } = prepare()
  view.rerender(<DrawingCanvas {...props} brushKind={kind} />)
  vi.clearAllMocks()
  pointer(canvas, 'pointerdown')
  for (let index = 1; index <= 80; index++) pointer(canvas, 'pointermove', { clientX: 20 + index, clientY: 30 + index })
  pointer(canvas, 'pointerup', { clientX: 110, clientY: 120 })
  const operations = ref.current!.getDocument().operations
  const operation = operations[0]
  expect(operation.type).toBe('stroke')
  if (operation.type !== 'stroke') return
  expect(operation.brushKind).toBe(kind)
  expect(operation.points).toHaveLength(82)
  const recordedCalls = vi.mocked(ctx.translate).mock.calls.map(call => [...call])
  vi.clearAllMocks()
  paintCanvasOperation(ctx, 320, 240, operation)
  const replayCalls = vi.mocked(ctx.translate).mock.calls
  expect(replayCalls).toHaveLength(recordedCalls.length)
  replayCalls.forEach((call, index) => call.forEach((value, axis) => expect(value).toBeCloseTo(recordedCalls[index][axis], 8)))
  expect(ctx.scale).toHaveBeenCalledWith(1, 1)
  ref.current!.commitCompanionStrokes([contribution, contribution], ref.current!.getRevision())
  const saved: CanvasDraft = { history: [...props.draft.history], document: cloneCanvasDocument(ref.current!.getDocument()) }
  view.unmount()
  render(<DrawingCanvas {...props} draft={saved} />)
  expect(ref.current!.getUndoCounts()).toEqual({ child: 1, nilo: 1 })
  ref.current!.undoCompanionStroke()
  expect(ref.current!.getDocument().operations).toEqual(operations)
})

test('child-only export excludes Nilo strokes and legacy mixed PNGs are never represented as child-only', () => {
  const { canvas, ref, view, props } = prepare()
  pointer(canvas, 'pointerdown'); pointer(canvas, 'pointerup')
  ref.current!.commitCompanionStrokes([contribution], ref.current!.getRevision())
  vi.clearAllMocks()
  expect(ref.current!.exportChildImage()).toBe('drawing')
  expect(ctx.lineTo).toHaveBeenCalled() // original star brush
  expect(ctx.arc).not.toHaveBeenCalled() // companion round brush excluded
  expect(getCanvasProvenance(ref.current!.getDocument())).toBe('co-created')
  view.unmount()
  render(<DrawingCanvas {...props} draft={{ history: ['data:image/png;base64,legacy'] }} />)
  expect(getCanvasProvenance(ref.current!.getDocument())).toBe('unknown')
  expect(ref.current!.exportChildImage()).toBeNull()
})

test.each(['round', 'pencil', 'marker', 'crayon', 'star'] as const)('Nilo %s preview footprints match committed and reopened paths at device pixel ratio 2', kind => {
  vi.stubGlobal('devicePixelRatio', 2)
  const { ref, props, view } = prepare()
  const specs = [
    { ...contribution, brushKind: kind, width: 4.25 },
    { ...contribution, brushKind: kind, width: 32, points: [{ x: .6, y: .2 }, { x: .7, y: .3 }] },
  ]
  const calls = () => Object.fromEntries((['translate', 'rotate', 'arc', 'fillRect', 'moveTo', 'lineTo', 'fill'] as const)
    .map(method => [method, vi.mocked(ctx[method]).mock.calls.map(call => [...call])]))
  vi.clearAllMocks()
  // Preview uses the shared brush painter at the same display scale.
  for (const spec of specs) {
    const points = spec.points.map(point => ({ x: point.x * 640, y: point.y * 480 }))
    const painter = createStrokePainter(ctx, { kind, color: spec.color, size: spec.width * 2, eraser: false }, points[0])
    points.slice(1).forEach(point => painter.moveTo(point))
  }
  const expectedFootprints = calls()
  vi.clearAllMocks()
  expect(ref.current!.commitCompanionStrokes(specs, ref.current!.getRevision())).toBe(true)
  expect(calls()).toEqual(expectedFootprints)
  expect(ref.current!.getUndoCounts()).toEqual({ child: 0, nilo: 1 })
  const saved = cloneCanvasDocument(ref.current!.getDocument())
  expect(saved.operations).toEqual(specs.map(spec => expect.objectContaining({ owner: 'nilo', brushKind: kind,
    color: spec.color, size: spec.width * 2, referenceWidth: 640, referenceHeight: 480, points: spec.points })))
  view.unmount()
  vi.clearAllMocks()
  render(<DrawingCanvas {...props} draft={{ history: [], document: saved }} />)
  // Mount may repaint twice, but each pass must reproduce the same footprints.
  const reopened = calls()
  for (const [method, expected] of Object.entries(expectedFootprints)) {
    const actual = reopened[method]
    if (!expected.length) expect(actual).toEqual([])
    else {
      expect(actual.length).toBeGreaterThanOrEqual(expected.length)
      expect(actual.length % expected.length).toBe(0)
      for (let offset = 0; offset < actual.length; offset += expected.length) expect(actual.slice(offset, offset + expected.length)).toEqual(expected)
    }
  }
  expect(ref.current!.getDocument()).toEqual(saved)
  expect(ref.current!.undoCompanionStroke()).toBe(true)
  expect(ref.current!.getDocument().operations).toEqual([])
  expect(ref.current!.getUndoCounts()).toEqual({ child: 0, nilo: 0 })
})

test('unknown Nilo brushes or out-of-range widths reject the entire contribution; old strokes default to round', () => {
  const { ref } = prepare()
  const revision = ref.current!.getRevision()
  const original = ref.current!.getDocument()
  vi.clearAllMocks()
  for (const invalid of [{ ...contribution, width: 0.5 }, { ...contribution, width: 32.1 }, { ...contribution, brushKind: 'spray' as never }]) {
    expect(ref.current!.commitCompanionStrokes([contribution, invalid], revision)).toBe(false)
    expect(ref.current!.getDocument()).toEqual(original)
    expect(ref.current!.getRevision()).toBe(revision)
  }
  expect(ctx.drawImage).not.toHaveBeenCalled()
  expect(ref.current!.commitCompanionStrokes([{ ...contribution, width: 1 }], revision)).toBe(true)
  expect(ref.current!.getDocument().operations[0]).toMatchObject({ brushKind: 'round', size: 1 })
})

test('last child style uses visible CSS size, ignores Nilo and erasing, and stops at a clear', () => {
  vi.stubGlobal('devicePixelRatio', 2)
  const { canvas, ref, view, props } = prepare()
  pointer(canvas, 'pointerdown'); pointer(canvas, 'pointerup')
  expect(ref.current!.getDocument().operations[0]).toMatchObject({ size: 16, referenceWidth: 640 })
  expect(ref.current!.getLastDrawingStyle()).toEqual({ brushKind: 'star', color: '#edcd70', size: 8 })
  expect(ref.current!.getLastStroke()).toMatchObject({ brushKind: 'star', width: 8 })
  ref.current!.commitCompanionStrokes([{ ...contribution, brushKind: 'marker' }], ref.current!.getRevision())
  view.rerender(<DrawingCanvas {...props} isEraser />)
  pointer(canvas, 'pointerdown'); pointer(canvas, 'pointerup')
  expect(ref.current!.getLastDrawingStyle()).toEqual({ brushKind: 'star', color: '#edcd70', size: 8 })
  vi.mocked(HTMLCanvasElement.prototype.getBoundingClientRect).mockReturnValue({ left: 0, top: 0, width: 160, height: 120 } as DOMRect)
  expect(ref.current!.getLastDrawingStyle()).toEqual({ brushKind: 'star', color: '#edcd70', size: 4 })
  expect(ref.current!.getLastStroke()).toMatchObject({ brushKind: 'star', width: 4 })
  ref.current!.clear()
  expect(ref.current!.getLastDrawingStyle()).toBeNull()
  expect(ref.current!.getLastStroke()).toBeNull()
})

test('companion observation includes confirmed Nilo ink while child analysis exports remain child-only', () => {
  const { canvas, ref } = prepare()
  pointer(canvas, 'pointerdown'); pointer(canvas, 'pointerup')
  ref.current!.commitCompanionStrokes([contribution], ref.current!.getRevision())
  vi.clearAllMocks()
  expect(ref.current!.exportCompanionObservation()).toBe('data:image/png;base64,drawing')
  expect(ctx.lineTo).toHaveBeenCalled() // child's star
  expect(ctx.arc).toHaveBeenCalled() // confirmed Nilo round brush
  expect(ref.current!.getCompanionScene().recentContributions.map(group => group.owner)).toEqual(['child', 'nilo'])
  vi.clearAllMocks()
  ref.current!.exportObservation()
  expect(ctx.lineTo).toHaveBeenCalled()
  expect(ctx.arc).not.toHaveBeenCalled()
  ref.current!.undoCompanionStroke()
  expect(ref.current!.getCompanionScene().niloBounds).toBeNull()
  expect(ref.current!.getCompanionScene().recentContributions.map(group => group.owner)).toEqual(['child'])
  ref.current!.clear()
  expect(ref.current!.getCompanionScene()).toEqual({ childBounds: null, niloBounds: null, recentContributions: [] })
})

test('a composite contribution permits 64 paths atomically and undoes them as one group', () => {
  const { canvas, ref } = prepare()
  pointer(canvas, 'pointerdown'); pointer(canvas, 'pointerup')
  const original = ref.current!.getDocument()
  const revision = ref.current!.getRevision()
  expect(ref.current!.commitCompanionStrokes(Array.from({ length: 65 }, () => contribution), revision)).toBe(false)
  expect(ref.current!.getDocument()).toEqual(original)
  expect(ref.current!.getRevision()).toBe(revision)
  expect(ref.current!.commitCompanionStrokes(Array.from({ length: 64 }, () => contribution), revision)).toBe(true)
  expect(ref.current!.getDocument().operations).toHaveLength(65)
  expect(ref.current!.getUndoCounts()).toEqual({ child: 1, nilo: 1 })
  expect(ref.current!.getCompanionScene().recentContributions.at(-1)?.strokeCount).toBe(64)
  ref.current!.undoCompanionStroke()
  expect(ref.current!.getDocument().operations).toEqual(original.operations)
})

test('occupancy supports a 64 by 64 grid using the full confirmed canvas', () => {
  const { ref, canvas } = prepare()
  const pixels = new Uint8ClampedArray(canvas.width * canvas.height * 4)
  const x = canvas.width - 1, y = canvas.height - 1
  pixels[(y * canvas.width + x) * 4 + 3] = 255
  ctx.getImageData = vi.fn().mockReturnValue({ data: pixels, width: canvas.width, height: canvas.height })
  const grid = ref.current!.getOccupancy(64)
  expect(grid).toHaveLength(4096)
  expect(grid.at(-1)).toBeGreaterThan(0)
  expect(grid.slice(0, -1).every(value => value === 0)).toBe(true)
  expect(ref.current!.getOccupancy(NaN)).toHaveLength(1024)
})
