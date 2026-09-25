import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { CanvasSelection } from '@/features/child/components/CanvasSelection'
import { lassoGroups, pointGroup, type SelectionCandidate } from '@/features/child/companion/selectionGeometry'
import { validateTracingGuide } from '@/features/child/companion/tracingGuide'

afterEach(() => { cleanup(); vi.restoreAllMocks() })
const square = [{ x: .4, y: .4 }, { x: .6, y: .4 }, { x: .6, y: .6 }, { x: .4, y: .6 }]
const candidate = (groupId: string, points: { x: number; y: number }[]): SelectionCandidate => ({ groupId, points, bounds: { x: 0, y: 0, width: 1, height: 1 } })

test('lasso selects actual line intersections and dots, not overlapping bounding boxes', () => {
  expect(lassoGroups([
    candidate('outside-corner', [{ x: .1, y: .1 }, { x: .9, y: .1 }, { x: .9, y: .9 }]),
    candidate('crosses', [{ x: .1, y: .5 }, { x: .9, y: .5 }]),
    candidate('dot', [{ x: .5, y: .5 }]),
    candidate('far-dot', [{ x: .1, y: .1 }]),
    candidate('touches-edge', [{ x: .4, y: .4 }, { x: .4, y: .2 }]),
  ], square)).toEqual(['crosses', 'dot', 'touches-edge'])
})

test('lasso preserves grouping, supports a concave outline, and rejects incomplete gestures', () => {
  const items = [candidate('group', [{ x: .1, y: .5 }, { x: .9, y: .5 }]), candidate('group', [{ x: .5, y: .4 }]), candidate('empty', [])]
  expect(lassoGroups(items, square)).toEqual(['group'])
  expect(lassoGroups(items, square.slice(0, 2))).toEqual([])
  expect(lassoGroups(items, [{ x: NaN, y: 0 }, ...square])).toEqual([])
  expect(lassoGroups([candidate('in-gap', [{ x: .5, y: .6 }]), candidate('in-arm', [{ x: .3, y: .6 }])], [
    { x: .2, y: .2 }, { x: .8, y: .2 }, { x: .8, y: .8 }, { x: .6, y: .8 },
    { x: .6, y: .4 }, { x: .4, y: .4 }, { x: .4, y: .8 }, { x: .2, y: .8 },
  ])).toEqual(['in-arm'])
})

test('tap measures actual segments in screen pixels and chooses visible topmost ink on ties', () => {
  const items = [candidate('first', [{ x: .1, y: .5 }, { x: .9, y: .5 }]), candidate('top', [{ x: .1, y: .5 }, { x: .9, y: .5 }])]
  expect(pointGroup(items, { x: .5, y: .53 }, { width: 1000, height: 200 }, 10)).toBe('top')
  expect(pointGroup(items, { x: .5, y: .53 }, { width: 200, height: 1000 }, 10)).toBeNull()
  expect(pointGroup([candidate('dot', [{ x: .5, y: .5 }])], { x: .51, y: .5 }, { width: 500, height: 200 }, 10)).toBe('dot')
  expect(pointGroup(items, { x: .5, y: .5 }, { width: 0, height: 200 })).toBeNull()
})

test('erased alpha holes cannot be tapped or lassoed, while surviving brush edges remain selectable', () => {
  const alpha = new Uint8Array(100 * 20)
  for (let row = 0; row < 20; row++) for (let column = 0; column < 20; column++) alpha[row * 100 + column] = 255
  const erased: SelectionCandidate = { ...candidate('masked', [{ x: .1, y: .5 }, { x: .9, y: .5 }]),
    coverage: { x: .1, y: .4, width: .8, height: .2, columns: 100, rows: 20, alpha } }
  expect(pointGroup([erased], { x: .6, y: .5 }, { width: 1000, height: 600 }, 14)).toBeNull()
  expect(lassoGroups([erased], square)).toEqual([])
  expect(pointGroup([erased], { x: .15, y: .42 }, { width: 1000, height: 600 }, 1)).toBe('masked')
  expect(lassoGroups([erased], [{x:.12,y:.41},{x:.16,y:.41},{x:.16,y:.44},{x:.12,y:.44}])).toEqual(['masked'])
  const wide = { ...candidate('wide', [{x:.2,y:.5},{x:.8,y:.5}]), brushRadius:{x:.02,y:.08} }
  expect(pointGroup([wide],{x:.4,y:.565},{width:1000,height:400},1)).toBe('wide')
  expect(lassoGroups([wide],[{x:.4,y:.56},{x:.42,y:.56},{x:.42,y:.57},{x:.4,y:.57}])).toEqual(['wide'])
})

test('an erased-stroke selection highlights surviving coverage without reconstructing the erased polyline', () => {
  const item = { ...candidate('masked',[{x:.1,y:.5},{x:.9,y:.5}]), highlight:{x:.1,y:.4,width:.8,height:.2,url:'data:image/png;base64,aW5r'} }
  const view=render(<CanvasSelection active candidates={[item]} selected={['masked']} bounds={item.bounds} onChange={vi.fn()} onDone={vi.fn()}/> )
  expect(view.container.querySelector('image')?.getAttribute('href')).toBe(item.highlight.url)
  expect(view.container.querySelector('polyline')).toBeNull()
})

function pointer(node: Element, type: string, x: number, y: number, id = 1) {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.assign(event, { pointerId: id, isPrimary: true, button: 0, clientX: x, clientY: y, pointerType: 'touch' })
  fireEvent(node, event)
}
function setup(selected: string[] = [], active = true) {
  const onChange = vi.fn(), onDone = vi.fn(), onCancel = vi.fn()
  const props = { active, candidates: [candidate('a', [{ x: .1, y: .5 }, { x: .3, y: .5 }]), candidate('b', [{ x: .7, y: .5 }, { x: .9, y: .5 }])], selected, bounds: null, onChange, onDone, onCancel }
  const view = render(<CanvasSelection {...props} />)
  const svg = screen.getByRole('group') as unknown as SVGSVGElement
  vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 400, height: 200 } as DOMRect)
  svg.setPointerCapture = vi.fn(); svg.hasPointerCapture = vi.fn(() => true); svg.releasePointerCapture = vi.fn()
  return { svg, onChange, onDone, onCancel, view, props }
}

test('tap toggles whole groups; the inactive overlay leaves drawing input untouched', () => {
  const { svg, onChange, view, props } = setup(['a'])
  pointer(svg, 'pointerdown', 80, 100); pointer(svg, 'pointerup', 80, 100)
  expect(onChange).toHaveBeenLastCalledWith([])
  view.rerender(<CanvasSelection {...props} active={false} />)
  pointer(svg, 'pointerdown', 320, 100); pointer(svg, 'pointerup', 320, 100)
  expect(onChange).toHaveBeenCalledOnce()
  expect(svg.dataset.active).toBe('false')
})

test('lasso adds groups without replacing the earlier selection; cancellation never selects', () => {
  const { svg, onChange, onDone, onCancel } = setup(['a'])
  pointer(svg, 'pointerdown', 250, 60)
  pointer(svg, 'pointermove', 380, 60)
  pointer(svg, 'pointermove', 380, 140)
  pointer(svg, 'pointermove', 250, 140)
  pointer(svg, 'pointerup', 250, 60)
  expect(onChange).toHaveBeenLastCalledWith(['a', 'b'])
  pointer(svg, 'pointerdown', 80, 100); pointer(svg, 'pointercancel', 80, 100)
  expect(onChange).toHaveBeenCalledOnce()
  fireEvent.keyDown(svg, { key: 'Escape' })
  expect(onCancel).toHaveBeenCalledOnce()
  expect(onDone).not.toHaveBeenCalled()
  fireEvent.keyDown(svg, { key: 'Enter' })
  expect(onDone).toHaveBeenCalledOnce()
})

test('a second finger cannot finish or alter the active lasso', () => {
  const { svg, onChange } = setup()
  pointer(svg, 'pointerdown', 80, 100, 1)
  pointer(svg, 'pointermove', 320, 100, 2); pointer(svg, 'pointerup', 320, 100, 2)
  expect(onChange).not.toHaveBeenCalled()
  pointer(svg, 'pointerup', 80, 100, 1)
  expect(onChange).toHaveBeenCalledWith(['a'])
})

test('guide validation preserves a stable safe id while remaining compatible with old drafts', () => {
  const guide = { id: 'guide-123', aspect: 4 / 3, additions: [], proposal: { template: 'sun', x: .3, y: .3, width: .2, height: .2, rotation: 0, color: '#efba43', strokeWidth: 3, target: '画纸', relation: '描摹太阳' } }
  expect(validateTracingGuide(guide)?.id).toBe('guide-123')
  const legacy = { ...guide, id: undefined }
  delete legacy.id
  expect(validateTracingGuide(legacy)).toEqual(legacy)
  expect(validateTracingGuide({ ...guide, id: '<bad>' })?.id).toBeUndefined()
})
