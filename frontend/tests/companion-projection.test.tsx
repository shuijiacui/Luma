import { act, cleanup, render, screen } from '@testing-library/react'
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
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({} as CanvasRenderingContext2D)
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
