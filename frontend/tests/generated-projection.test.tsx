import { createRef } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { CompanionProjection } from '@/features/child/components/CompanionProjection'
import { SceneProjection } from '@/features/child/components/SceneProjection'
import { DrawingCanvas, type DrawingCanvasHandle } from '@/features/child/components/DrawingCanvas'
import { validateProposal, proposalStrokes, type DrawingProposal } from '@/features/child/companion/proposals'
import { validateTracingGuide } from '@/features/child/companion/tracingGuide'
import { sceneRenderResult } from '@/features/child/companion/sceneWorkflow'
import { clearChildDraft, getChildDraft } from '@/features/child/draft'
import { persistChildDraft, readStoredDraft } from '@/features/child/draftRecovery'
import { scenePalette, type ScenePlan } from '../../shared/niloSceneDrawing.mjs'
import { proportionedProposal } from '../../shared/niloGeometry.mjs'
import { projectionTransform } from '@/features/child/companion/projectionTransform'
import type { Projection } from '@/features/child/hooks/useCompanion'

const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAEAAAAAgCAYAAACinX6EAAAAT0lEQVR4AeXBAQ0AIAzAsDH/ng8uTrL2zMOCAwz7ZMnwB4mTOImTOImTOImTOImTOImTOImTOImTOImTOImTOImTOImTOImTOImTOImTOImTuAtPZgY7mG4ntAAAAABJRU5ErkJggg=='
function proposal(projection: 'gray' | 'dashed' = 'gray'): DrawingProposal {
  return { template: 'generated', raster: { version: 1, pngBase64, width: 64, height: 32, projection,
    ...(projection === 'dashed' ? { paths: [[[.1, .1], [.5, .9], [.9, .1]]] as [number, number][][] } : {}) },
    x: .2, y: .2, width: .5, height: .35, rotation: 0, color: '#66729b', strokeWidth: 3, subject: '鲸背小镇', target: '画纸', relation: '鲸鱼背上住着小房子', contribution: 'object', placementPolicy: 'free' }
}
function scene(p = proposal()): ScenePlan {
  return { version: 1, title: '鲸背小镇', summary: '鲸鱼背上住着小房子。', request: '画鲸背小镇', palette: { ...scenePalette }, preserve: [], objects: [
    { id: 'town', name: p.subject!, aliases: [], essential: ['鲸鱼', '房屋在背上'], role: 'main', render: { kind: 'generated' }, box: { x: p.x, y: p.y, width: p.width, height: p.height }, color: p.color },
  ] }
}
let context: CanvasRenderingContext2D
beforeEach(() => {
  sessionStorage.clear(); clearChildDraft()
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  context = { save: vi.fn(), restore: vi.fn(), clearRect: vi.fn(), drawImage: vi.fn(), scale: vi.fn(), translate: vi.fn(), rotate: vi.fn(), fillRect: vi.fn(),
    setLineDash: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(), globalCompositeOperation: 'source-over' } as unknown as CanvasRenderingContext2D
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context)
  vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 840, height: 600 } as DOMRect)
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,child-only-export')
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

test('a generated PNG is always a reference even without tracing=true and its frame can move/resize', () => {
  const p = proposal(), edit = vi.fn()
  render(<CompanionProjection proposal={p} aspect={1.4} onEdit={edit} />)
  const reference = screen.getByLabelText('Nilo 的插画参考底图'), image = reference.querySelector('img')!
  expect(reference.className).toContain('nilo-tracing-projection')
  expect(image.getAttribute('src')).toBe(`data:image/png;base64,${pngBase64}`)
  expect(image.dataset.illustrationProjection).toBe('gray')
  expect(screen.queryByText('Nilo 的想法')).toBeNull()
  fireEvent.keyDown(screen.getByLabelText('拖动 Nilo 的投影'), { key: 'ArrowRight' })
  expect(edit.mock.calls.at(-1)![0].x).toBeGreaterThan(p.x)
  fireEvent.keyDown(screen.getByLabelText('调整 Nilo 投影大小'), { key: '+' })
  const patch = edit.mock.calls.at(-1)![0]
  expect(patch.width / patch.height).toBeCloseTo(p.width / p.height, 10)
  expect(validateProposal({ ...p, ...patch })).not.toBeNull()
  expect(proposalStrokes(p)).toEqual([])
})

test('generated dashed outlines render locally in a scene without fetching a static registry image', () => {
  const p = proposal('dashed'), fetch = vi.fn(); vi.stubGlobal('fetch', fetch)
  const projected: Projection = { id: 'guide', revision: 0, aspect: 1.4, proposal: p, additions: [], alternatives: [], tracing: true,
    scene: { plan: scene(p), objectIds: ['town'], view: 'outline', selectedId: 'town' } }
  const view = render(<SceneProjection projection={projected} onEdit={vi.fn()} />)
  expect(view.container.querySelectorAll('polyline')).toHaveLength(1)
  expect(view.container.querySelector('polyline')!.getAttribute('stroke-dasharray')).toBe('6 5')
  expect(view.container.querySelector('img')).toBeNull()
  expect(screen.getByLabelText('调整 Nilo 投影大小')).toBeTruthy()
  expect(fetch).not.toHaveBeenCalled()
  const gray = proposal()
  view.rerender(<SceneProjection projection={{ ...projected, proposal: gray }} />)
  expect(view.container.querySelector('img')!.getAttribute('src')).toBe(`data:image/png;base64,${pngBase64}`)
  expect(view.container.querySelector('polyline')).toBeNull()
})

test('PNG draft restoration is scoped by owner and artwork while corrupt raster only removes the reference', () => {
  const p = proposal(), draft = getChildDraft('child-a')
  draft.canvas.document = { version: 1, baseSource: 'child', operations: [] }
  draft.tracingGuide = { proposal: p, additions: [], aspect: 1.4, scene: { plan: scene(p), objectIds: ['town'], view: 'outline' } }
  expect(validateTracingGuide(draft.tracingGuide)).not.toBeNull()
  expect(persistChildDraft('child-a', 'art-a', draft)).toBe(true)
  expect(readStoredDraft('child-a', 'art-a')?.tracingGuide).toEqual(draft.tracingGuide)
  expect(readStoredDraft('child-b', 'art-a')).toBeNull()
  expect(readStoredDraft('child-a', 'art-b')).toBeNull()
  const key = sessionStorage.key(0)!, raw = JSON.parse(sessionStorage.getItem(key)!)
  raw.tracingGuide.proposal.raster.width = 999
  sessionStorage.setItem(key, JSON.stringify(raw))
  const restored = readStoredDraft('child-a', 'art-a')
  expect(restored?.tracingGuide).toBeUndefined()
  expect(restored?.canvas.document).toEqual(draft.canvas.document)
})

test('scene boundary preserves PNG metadata and scaling allows a large guide without changing its proportions', () => {
  const p = proposal(), result = sceneRenderResult({ status: 'ready', plan: scene(p), objects: [{ id: 'town', name: p.subject, proposal: p }] })
  expect(result?.proposals[0].raster).toEqual(p.raster)
  const fit = proportionedProposal({ ...p, width: .8, height: .8 }, 1.4)
  expect(fit.width * 1.4 / fit.height).toBeCloseTo(2, 10)
  const patch = projectionTransform([p], { scale: 1.4 }, 1.4)
  expect(patch!.width).toBeGreaterThan(.45)
  expect(validateProposal({ ...p, ...patch })).not.toBeNull()
  expect(validateProposal({ ...p, raster: { ...p.raster!, url: 'https://example.invalid' } })).toBeNull()
  expect(validateProposal({ ...p, template: 'cloud' })).toBeNull()
})

test('canvas refuses a PNG commit even when supplied valid strokes; export remains the child canvas', () => {
  const ref = createRef<DrawingCanvasHandle>(), p = proposal()
  render(<DrawingCanvas ref={ref} draft={{ history: [''] }} color="#123456" brushSize={4} isEraser={false} onStrokeComplete={vi.fn()} />)
  const original = ref.current!.getDocument(), revision = ref.current!.getRevision()
  const accepted = ref.current!.commitCompanionStrokes([{ kind: 'custom', color: '#123456', width: 3, points: [{ x: .3, y: .3 }, { x: .4, y: .4 }] }], revision, { proposals: [p], aspect: 1.4 })
  expect(accepted).toBe(false)
  expect(ref.current!.getDocument()).toEqual(original)
  expect(ref.current!.getRevision()).toBe(revision)
  expect(ref.current!.exportSnapshot()).toBe('data:image/png;base64,child-only-export')
})
