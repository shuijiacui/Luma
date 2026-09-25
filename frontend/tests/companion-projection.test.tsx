import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { CompanionProjection } from '@/features/child/components/CompanionProjection'
import { proposalStrokes, type DrawingProposal } from '@/features/child/companion/proposals'
import { createStrokePainter } from '@/features/child/brushes'

vi.mock('@/features/child/companion/proposals', () => ({ proposalStrokes: vi.fn() }))
vi.mock('@/features/child/brushes', () => ({ createStrokePainter: vi.fn(() => ({ moveTo: () => {} })) }))
const proposal: DrawingProposal = { template: 'waves', x: .2, y: .2, width: .3, height: .2,
  rotation: 0, color: '#4aa5d8', strokeWidth: 3 }

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  vi.stubGlobal('devicePixelRatio', 2)
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ setLineDash: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn() } as unknown as CanvasRenderingContext2D)
  vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 320.25, height: 240.25 } as DOMRect)
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.clearAllMocks() })

test('a maximum-size multi-path projection has finite bounds without spreading all points into function arguments', () => {
  vi.mocked(proposalStrokes).mockReturnValue(Array.from({ length: 64 }, () => ({
    kind: 'custom', color: '#4aa5d8', width: 3,
    points: Array.from({ length: 4096 }, (_, index) => ({ x: .2 + index / 4095 * .3, y: .4 })),
  })))
  render(<CompanionProjection proposal={proposal} aspect={4 / 3} />)
  const overlay = screen.getByLabelText('Nilo 的投影，尚未加入画作')
  expect(overlay.outerHTML).not.toMatch(/NaN|Infinity/)
  expect(createStrokePainter).toHaveBeenCalledTimes(64)
  const canvas = overlay.querySelector('canvas')!
  expect(canvas.width).toBe(641)
  expect(vi.mocked(createStrokePainter).mock.calls[0][1].size).toBeCloseTo(3 * canvas.width / 320.25, 12)
})

test('an empty compiled proposal does not expose an invalid projection or start a brush', () => {
  vi.mocked(proposalStrokes).mockReturnValue([])
  render(<CompanionProjection proposal={proposal} aspect={4 / 3} />)
  expect(screen.queryByLabelText('Nilo 的投影，尚未加入画作')).toBeNull()
  expect(createStrokePainter).not.toHaveBeenCalled()
})

test('a turn paints a growing stroke and cancels animation when the child takes over', () => {
  let now = 0
  let nextFrame!: FrameRequestCallback
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  vi.stubGlobal('requestAnimationFrame', vi.fn(callback => { nextFrame = callback; return 7 }))
  const cancel = vi.fn()
  vi.stubGlobal('cancelAnimationFrame', cancel)
  const move = vi.fn()
  vi.mocked(createStrokePainter).mockReturnValue({ moveTo: move })
  vi.mocked(proposalStrokes).mockReturnValue([{ kind: 'custom', color: '#4aa5d8', width: 3,
    points: [{ x: .2, y: .4 }, { x: .8, y: .4 }] }])
  const view = render(<CompanionProjection proposal={proposal} aspect={4 / 3} turnDuration={1200} />)
  expect(createStrokePainter).not.toHaveBeenCalled()
  expect(screen.queryByText('Nilo 的想法')).toBeNull()
  now = 600
  act(() => nextFrame(now))
  const overlay = screen.getByLabelText('Nilo 正在画，接着你的这一笔')
  const canvas = overlay.querySelector('canvas')!
  expect(move.mock.calls.at(-1)![0].x).toBeCloseTo(.5 * canvas.width)
  expect(overlay.querySelector<HTMLSpanElement>('.nilo-drawing-pen')!.style.opacity).toBe('1')
  now = 1200
  act(() => nextFrame(now))
  expect(move.mock.calls.at(-1)![0].x).toBeCloseTo(.8 * canvas.width)
  view.unmount()
  expect(cancel).toHaveBeenCalledWith(7)
})

function dragEvent(button: HTMLElement, type: string, x: number, y: number, id = 7) {
  const event = new Event(type, { bubbles:true, cancelable:true })
  Object.assign(event, { pointerId:id, isPrimary:true, button:0, clientX:x, clientY:y, pointerType:'touch' })
  fireEvent(button,event)
}
function controls() {
  vi.mocked(proposalStrokes).mockReturnValue([{kind:'custom',color:'#4aa5d8',width:3,points:[{x:.2,y:.2},{x:.5,y:.4}]}])
  const onEdit=vi.fn(), onInteractionStart=vi.fn()
  render(<CompanionProjection proposal={proposal} aspect={4/3} onEdit={onEdit} onInteractionStart={onInteractionStart} />)
  const move=screen.getByRole('button',{name:'拖动 Nilo 的投影'}), resize=screen.getByRole('button',{name:'调整 Nilo 投影大小'})
  for (const button of [move,resize]) { button.setPointerCapture=vi.fn();button.hasPointerCapture=vi.fn(()=>true);button.releasePointerCapture=vi.fn() }
  return {move,resize,onEdit,onInteractionStart}
}
test('touch drag uses canvas coordinates, captures the pointer and never commits',()=>{
  const {move,onEdit,onInteractionStart}=controls()
  dragEvent(move,'pointerdown',100,100)
  dragEvent(move,'pointermove',132.025,124.025)
  expect(onEdit.mock.calls.at(-1)?.[0]).toMatchObject({x:expect.closeTo(.3),y:expect.closeTo(.3),width:.3,height:.2})
  dragEvent(move,'pointerup',132.025,124.025)
  expect(move.setPointerCapture).toHaveBeenCalledWith(7)
  expect(move.releasePointerCapture).toHaveBeenCalledWith(7)
  expect(onInteractionStart).toHaveBeenCalledOnce()
})
test('corner resizing is proportional, ignores another finger, and pointer cancellation restores the original box',()=>{
  const {resize,onEdit}=controls()
  dragEvent(resize,'pointerdown',100,100)
  dragEvent(resize,'pointermove',130,130,9)
  expect(onEdit).not.toHaveBeenCalled()
  dragEvent(resize,'pointermove',130,130)
  const patch=onEdit.mock.calls.at(-1)![0]
  expect(patch.width/patch.height).toBeCloseTo(1.5)
  expect(patch.width).toBeGreaterThan(.3)
  dragEvent(resize,'pointercancel',130,130)
  expect(onEdit.mock.calls.at(-1)![0]).toEqual({x:.2,y:.2,width:.3,height:.2})
})
test('keyboard controls move and resize; drawing animation exposes no drag handles',()=>{
  const {move,resize,onEdit}=controls()
  fireEvent.keyDown(move,{key:'ArrowRight'})
  expect(onEdit.mock.calls.at(-1)![0].x).toBeCloseTo(.21)
  fireEvent.keyDown(resize,{key:'+'})
  expect(onEdit.mock.calls.at(-1)![0].width).toBeCloseTo(.315)
  cleanup()
  render(<CompanionProjection proposal={proposal} aspect={4/3} turnDuration={1200} onEdit={onEdit} />)
  expect(screen.queryByRole('button',{name:'拖动 Nilo 的投影'})).toBeNull()
})


test('tracing draws neutral dashed paths with constant CSS width regardless of model brush or color', () => {
  vi.mocked(proposalStrokes).mockReturnValue([{ kind: 'custom', color: '#ff0000', width: 20, brushKind: 'marker',
    points: [{ x: .2, y: .2 }, { x: .5, y: .4 }] }])
  render(<CompanionProjection proposal={proposal} aspect={4 / 3} tracing onEdit={vi.fn()} />)
  const overlay = screen.getByLabelText('Nilo 的灰色虚线描摹底图')
  const canvas = overlay.querySelector('canvas')!, ctx = canvas.getContext('2d')!
  const scale = canvas.width / 320.25
  expect(ctx.strokeStyle).toBe('#9ca3af')
  expect(ctx.lineWidth).toBeCloseTo(1.6 * scale)
  expect(ctx.setLineDash).toHaveBeenCalledWith([6 * scale, 5 * scale])
  expect(ctx.stroke).toHaveBeenCalledOnce()
  expect(createStrokePainter).not.toHaveBeenCalled()
  expect(overlay.classList.contains('pointer-events-none')).toBe(true)
  expect(screen.getAllByRole('button')).toHaveLength(2)
})

test('a trusted illustration stays a separate reference, preserves image proportions, and can be inspected or moved', () => {
  vi.mocked(proposalStrokes).mockReturnValue([])
  const imageProposal: DrawingProposal = { ...proposal, template: 'illustration', illustrationId: 'illustration-reading-child', subject: '读书的孩子', rotation: 20 }
  const onEdit = vi.fn()
  render(<CompanionProjection proposal={imageProposal} aspect={4 / 3} tracing onEdit={onEdit} />)
  const overlay = screen.getByLabelText('Nilo 的插画参考底图')
  const reference = overlay.querySelector('img')!
  expect(reference.getAttribute('src')).toMatch(/^\/nilo-illustrations\//)
  expect(reference.draggable).toBe(false)
  expect(reference.style.transform).toBe('rotate(20deg)')
  expect(reference.classList.contains('nilo-illustration-original')).toBe(false)
  fireEvent.click(screen.getByRole('button', { name: '看原图' }))
  expect(reference.classList.contains('nilo-illustration-original')).toBe(true)
  expect(screen.getByRole('button', { name: '继续描画' }).getAttribute('aria-pressed')).toBe('true')
  fireEvent.click(screen.getByRole('button', { name: '继续描画' }))
  expect(reference.classList.contains('nilo-illustration-original')).toBe(false)
  fireEvent.keyDown(screen.getByRole('button', { name: '拖动 Nilo 的投影' }), { key: 'ArrowRight' })
  expect(onEdit).toHaveBeenCalledOnce()
  expect(onEdit.mock.calls[0][0].width).toBe(proposal.width)
  expect(createStrokePainter).not.toHaveBeenCalled()
  expect(overlay.classList.contains('pointer-events-none')).toBe(true)
})

test('an illustration load failure leaves the canvas accessible and reports a recoverable missing reference', () => {
  vi.mocked(proposalStrokes).mockReturnValue([])
  render(<CompanionProjection proposal={{ ...proposal, template: 'illustration', illustrationId: 'illustration-reading-child' }} aspect={4 / 3} tracing onEdit={vi.fn()} />)
  fireEvent.error(document.querySelector('img')!)
  expect(screen.getByRole('status').textContent).toContain('参考图暂时没加载好')
  expect(screen.getByRole('button', { name: '拖动 Nilo 的投影' })).toBeTruthy()
  fireEvent.load(document.querySelector('img')!)
  expect(screen.queryByRole('status')).toBeNull()
})
