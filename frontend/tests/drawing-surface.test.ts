import { expect, test } from 'vitest'
import { documentAspect, fitDrawingSurface } from '@/features/child/drawingSurfaceGeometry'
import type { CanvasDocument } from '@/features/child/canvasDocument'

test('toolbar and orientation changes preserve a shared aspect without exceeding the available frame', () => {
  const aspect = 631 / 239
  for (const [width, height] of [[631, 239], [514, 239], [1382, 691], [340, 600]]) {
    const fitted = fitDrawingSurface(width, height, aspect)
    expect(fitted.width).toBeLessThanOrEqual(width)
    expect(fitted.height).toBeLessThanOrEqual(height)
    expect(fitted.width / fitted.height).toBeCloseTo(aspect, 10)
  }
  expect(fitDrawingSurface(0, 100, aspect)).toEqual({ width: 0, height: 0 })
})

test('reopening restores the drawing coordinate ratio rather than the new screen ratio', () => {
  const document: CanvasDocument = { version: 1, baseSource: 'child', operations: [{ type: 'stroke', owner: 'child', groupId: 'one', brushKind: 'star', color: '#123456', size: 8, eraser: false, referenceWidth: 1262, referenceHeight: 478, points: [{ x: .2, y: .3 }] }] }
  expect(documentAspect(document)).toBe(1262 / 478)
  expect(documentAspect({ version: 1, baseSource: 'unknown', baseImage: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aO2kAAAAASUVORK5CYII=', operations: [] })).toBe(1)
  expect(documentAspect({ version: 1, baseSource: 'unknown', baseImage: 'broken', operations: [] })).toBeNull()
})
