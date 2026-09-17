import { createRef } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { DrawingCanvas, type DrawingCanvasHandle } from '@/features/child/components/DrawingCanvas'

let ctx: CanvasRenderingContext2D
beforeEach(() => {
  ctx = {
    save: vi.fn(), restore: vi.fn(), clearRect: vi.fn(), drawImage: vi.fn(), translate: vi.fn(),
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
  const draft = {history:['']}
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
  const {canvas, draft, complete, ref} = prepare()
  pointer(canvas,'pointerdown')
  expect(ctx.fill).toHaveBeenCalled()
  pointer(canvas,'pointerup',{pointerId:2,isPrimary:false})
  expect(complete).not.toHaveBeenCalled()
  pointer(canvas,'pointerup')
  expect(draft.history).toEqual(['','data:image/png;base64,drawing'])
  expect(complete).toHaveBeenCalledOnce()
  act(() => ref.current?.undo())
  expect(ref.current?.getUndoCounts()).toEqual({ child: 0, nilo: 0 })
  expect(draft.history[0]).toBe('')
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
  expect(ctx.drawImage).toHaveBeenCalled()
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
  expect(ctx.drawImage).toHaveBeenLastCalledWith(canvas,0,0)
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
  expect(draft.history).toEqual([''])
  expect(complete).not.toHaveBeenCalled()
})
