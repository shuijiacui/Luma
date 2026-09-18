import { createRef } from 'react'
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { DrawingSurface } from '@/features/child/components/DrawingSurface'
import type { CanvasDocument } from '@/features/child/canvasDocument'

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

test('blank paper fills changed space and locks its ratio only when the first stroke is created', () => {
  let frame = { width: 800, height: 400 }
  let resize = () => {}
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => frame as DOMRect)
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: () => void) { resize = callback }
    observe() {}
    disconnect() {}
  })
  const surfaceRef = createRef<HTMLDivElement>()
  const doc: CanvasDocument = { version: 1, baseSource: 'child', operations: [] }
  const view = render(<DrawingSurface surfaceRef={surfaceRef} document={doc}><canvas /></DrawingSurface>)
  expect(surfaceRef.current?.style.width).toBe('800px')
  expect(surfaceRef.current?.style.height).toBe('400px')
  frame = { width: 600, height: 400 }
  act(() => resize())
  expect(surfaceRef.current?.style.width).toBe('600px')
  expect(surfaceRef.current?.style.height).toBe('400px')
  const withInk: CanvasDocument = { ...doc, operations: [{ type: 'stroke', owner: 'child', groupId: 'first', brushKind: 'round', color: '#123456', size: 8, eraser: false, referenceWidth: 600, referenceHeight: 400, points: [{ x: .2, y: .3 }] }] }
  view.rerender(<DrawingSurface surfaceRef={surfaceRef} document={withInk}><canvas /></DrawingSurface>)
  frame = { width: 800, height: 400 }
  act(() => resize())
  expect(surfaceRef.current?.style.width).toBe('600px')
  expect(surfaceRef.current?.style.height).toBe('400px')
  frame = { width: 300, height: 400 }
  act(() => resize())
  expect(surfaceRef.current?.style.width).toBe('300px')
  expect(surfaceRef.current?.style.height).toBe('200px')
})
