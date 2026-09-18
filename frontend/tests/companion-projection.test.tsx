import { cleanup, render, screen } from '@testing-library/react'
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
