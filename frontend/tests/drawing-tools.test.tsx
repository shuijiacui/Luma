import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { DrawingTools } from '@/features/child/components/DrawingTools'
import { createStrokePainter, type BrushKind } from '@/features/child/brushes'
import { clearChildDraft, getChildDraft } from '@/features/child/draft'

afterEach(() => { cleanup(); clearChildDraft() })

function context() {
  return {
    save: vi.fn(), restore: vi.fn(), translate: vi.fn(), rotate: vi.fn(),
    beginPath: vi.fn(), closePath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(),
    arc: vi.fn(), fill: vi.fn(), fillRect: vi.fn(), globalAlpha: 1,
    globalCompositeOperation: 'source-over', fillStyle: '',
  } as unknown as CanvasRenderingContext2D
}

test.each<BrushKind>(['round', 'pencil', 'marker', 'crayon', 'star'])('%s paints on a tap, without requiring movement', kind => {
  const ctx = context()
  createStrokePainter(ctx, { kind, color: '#e58bb3', size: 8, eraser: false }, { x: 20, y: 30 })
  expect(ctx.translate).toHaveBeenCalledWith(20, 30)
  expect(vi.mocked(ctx.fill).mock.calls.length + vi.mocked(ctx.fillRect).mock.calls.length).toBeGreaterThan(0)
  expect(ctx.fillStyle).toBe('#e58bb3')
  expect(ctx.restore).toHaveBeenCalledOnce()
})

test('star spacing remains identical with sparse or dense pointer events', () => {
  const sparse = context(), dense = context()
  const settings = { kind: 'star' as const, color: '#edcd70', size: 8, eraser: false }
  createStrokePainter(sparse, settings, {x: 0, y: 0}).moveTo({x: 200, y: 0})
  const painter = createStrokePainter(dense, settings, {x: 0, y: 0})
  for (let x = 1; x <= 200; x++) painter.moveTo({x, y: 0})
  expect(vi.mocked(dense.translate).mock.calls).toEqual(vi.mocked(sparse.translate).mock.calls)
  expect(sparse.translate).toHaveBeenCalledTimes(9)
})

test('eraser removes pixels with a round tip even after selecting a star brush', () => {
  const ctx = context()
  createStrokePainter(ctx, { kind: 'star', color: '#fff', size: 8, eraser: true }, {x: 4, y: 8})
  expect(ctx.globalCompositeOperation).toBe('destination-out')
  expect(ctx.arc).toHaveBeenCalledWith(0, 0, 10, 0, Math.PI * 2)
  expect(ctx.lineTo).not.toHaveBeenCalled()
  expect(ctx.restore).toHaveBeenCalledOnce()
})

test('different brushes use different tip geometry and widths', () => {
  const round = context(), pencil = context(), marker = context(), crayon = context()
  for (const [ctx, kind] of [[round, 'round'], [pencil, 'pencil'], [marker, 'marker'], [crayon, 'crayon']] as const) {
    createStrokePainter(ctx, {kind, color:'#168a78', size: 10, eraser: false}, {x:0,y:0})
  }
  expect(vi.mocked(round.arc).mock.calls[0][2]).toBe(5)
  expect(vi.mocked(pencil.arc).mock.calls[0][2]).toBe(2)
  expect(marker.rotate).toHaveBeenCalled()
  expect(marker.fillRect).toHaveBeenCalledOnce()
  expect(crayon.fillRect).toHaveBeenCalledTimes(28)
})

const actions = () => ({ onColor: vi.fn(), onBrush: vi.fn(), onSize: vi.fn(), onEraser: vi.fn(), onNextShape: vi.fn(), onClearShape: vi.fn(), onUndo: vi.fn(), onClear: vi.fn(), onSave: vi.fn(), onFinish: vi.fn() })

test('palette, brush and size controls report selections; Escape restores focus', () => {
  const callbacks = actions()
  render(<DrawingTools color="#20352f" brushKind="round" brushSize={8} isEraser={false} disabled={false} shapeLabel="自由画" {...callbacks} />)
  fireEvent.click(screen.getByRole('button', {name:'更多颜色'}))
  expect(screen.getByRole('dialog', {name:'我的调色盘'})).toBeTruthy()
  fireEvent.click(screen.getByRole('button', {name:'薰衣草紫'}))
  expect(callbacks.onColor).toHaveBeenCalledWith('#d6bce5')
  fireEvent.keyDown(document, {key:'Escape'})
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(document.activeElement).toBe(screen.getByRole('button', {name:'更多颜色'}))
  fireEvent.click(screen.getByRole('button', {name:'星星笔'}))
  expect(callbacks.onBrush).toHaveBeenCalledWith('star')
  fireEvent.change(screen.getByRole('slider', {name:'画笔粗细'}), {target:{value:'17'}})
  expect(callbacks.onSize).toHaveBeenCalledWith(17)
})

test('size slider updates its value and preview between the former fixed sizes', () => {
  function Workspace() {
    const [size, setSize] = useState(8)
    return <DrawingTools color="#20352f" brushKind="round" brushSize={size} isEraser={false} disabled={false} shapeLabel="自由画" {...actions()} onSize={setSize} />
  }
  const {container} = render(<Workspace />)
  const slider = screen.getByRole('slider', {name:'画笔粗细'}) as HTMLInputElement
  for (const value of [1, 13, 32]) {
    fireEvent.change(slider, {target:{value:String(value)}})
    expect(slider.value).toBe(String(value))
    expect(container.querySelector('output')?.textContent).toBe(String(value))
    expect((container.querySelector('.drawing-size-dot') as HTMLElement).style.width).toBe(`${value}px`)
  }
})

test('analysis locks drawing controls and submission actions', () => {
  const callbacks = actions()
  const {container} = render(<DrawingTools color="#20352f" brushKind="round" brushSize={8} isEraser={false} disabled shapeLabel="自由画" {...callbacks} />)
  expect([...container.querySelectorAll('button')].every(button => button.disabled)).toBe(true)
  expect((screen.getByRole('slider', {name:'画笔粗细'}) as HTMLInputElement).disabled).toBe(true)
  fireEvent.click(screen.getByRole('button', {name:'星星笔'}))
  expect(callbacks.onBrush).not.toHaveBeenCalled()
})

test('brush preferences survive returning to the same child, but are cleared for another child', () => {
  const draft = getChildDraft('first')
  draft.brushKind = 'crayon'; draft.brushSize = 13; draft.color = '#aa80c3'
  expect(getChildDraft('first')).toBe(draft)
  expect(getChildDraft('first').brushSize).toBe(13)
  expect(getChildDraft('second')).toMatchObject({brushKind:'round',brushSize:8,color:'#20352f',canvas:{history:['']}})
})
