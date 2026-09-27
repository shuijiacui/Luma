import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { SceneProjection } from '@/features/child/components/SceneProjection'
import type { Projection } from '@/features/child/hooks/useCompanion'
import { illustrationTracePaths, loadIllustrationTrace, type IllustrationTrace } from '@/features/child/companion/illustrationTracing'
import { validateProposal } from '@/features/child/companion/proposals'
import { getDrawingIllustration } from '../../shared/niloIllustrations.mjs'
import { scenePalette } from '../../shared/niloSceneDrawing.mjs'

vi.mock('@/features/child/companion/illustrationTracing', async importOriginal => ({
  ...await importOriginal<typeof import('@/features/child/companion/illustrationTracing')>(), loadIllustrationTrace: vi.fn(),
}))

const trace: IllustrationTrace = { version: 1, aspect: 1, paths: [
  [[.1, .3], [.5, .2], [.9, .3]], [[.1, .3], [.5, .8], [.9, .3]], [[.5, .2], [.5, .8]],
] }
const boat = 'illustration-library-boat-beginner-01', kite = 'illustration-library-kite-beginner-01'
function projection(id = boat): Projection {
  const asset = getDrawingIllustration(id)!
  const proposal = validateProposal({ template: 'illustration', illustrationId: id, subject: asset.name,
    x: .2, y: .2, width: .3, height: .3, rotation: 20, color: '#ee4499', strokeWidth: 3,
    target: asset.name, relation: '保留孩子画作的参考轮廓' })!
  return { id: 'saved-scene', revision: 1, proposal, additions: [], alternatives: [], tracing: true, aspect: 1.5,
    scene: { view: 'color', selectedId: 'object', objectIds: ['object'], plan: { version: 1, title: '一起画', request: '画一个场景',
      summary: '一起画这些物体，好吗？', preserve: [], palette: { ...scenePalette }, objects: [{ id: 'object', name: asset.name,
        aliases: [], role: 'main', essential: [asset.name], render: { kind: 'illustration', illustrationId: id },
        box: { x: proposal.x, y: proposal.y, width: proposal.width, height: proposal.height }, color: proposal.color }] } } }
}

beforeEach(() => {
  vi.mocked(loadIllustrationTrace).mockReset()
  vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 600, height: 400 } as DOMRect)
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })

function expectOnlyDashedPaths(expected: number) {
  const view = screen.getByLabelText('Nilo 的场景描画轮廓')
  const strokes = [...view.querySelectorAll('polyline')]
  expect(strokes).toHaveLength(expected)
  for (const stroke of strokes) {
    expect(stroke.getAttribute('stroke')).toBe('#9ca3af')
    expect(stroke.getAttribute('stroke-dasharray')).toBe('6 5')
    expect(stroke.getAttribute('fill')).toBe('none')
  }
  expect(view.querySelector('img, image, rect, defs')).toBeNull()
  expect(screen.queryByRole('button', { name: '看原图' })).toBeNull()
  return strokes
}

test('legacy PNG references render only registry centerline paths, with one set of controls and no raster', async () => {
  vi.mocked(loadIllustrationTrace).mockResolvedValue(trace)
  const p = projection(), onEdit = vi.fn()
  render(<SceneProjection projection={p} onEdit={onEdit} />)
  await act(async () => { await Promise.resolve() })
  const paths = expectOnlyDashedPaths(3)
  const expected = illustrationTracePaths(trace, p.proposal, p.aspect)
    .map(path => path.map(point => `${(point.x * 1000).toFixed(2)},${(point.y * 1000).toFixed(2)}`).join(' '))
  expect(paths.map(node => node.getAttribute('points'))).toEqual(expected)
  expect(loadIllustrationTrace).toHaveBeenCalledWith(boat)
  expect(screen.getAllByRole('button', { name: '拖动 Nilo 的投影' })).toHaveLength(1)
  expect(screen.getAllByRole('button', { name: '调整 Nilo 投影大小' })).toHaveLength(1)
  expect(HTMLCanvasElement.prototype.getContext).not.toHaveBeenCalled()
})

test('moving and resizing a PNG changes its centerlines without reloading or replacing the asset', async () => {
  vi.mocked(loadIllustrationTrace).mockResolvedValue(trace)
  const p = projection(), view = render(<SceneProjection projection={p} onEdit={vi.fn()} />)
  await act(async () => { await Promise.resolve() })
  const original = expectOnlyDashedPaths(3).map(node => node.getAttribute('points'))
  view.rerender(<SceneProjection projection={{ ...p, proposal: { ...p.proposal, x: .25, width: .35, height: .35 } }} onEdit={vi.fn()} />)
  expect(expectOnlyDashedPaths(3).map(node => node.getAttribute('points'))).not.toEqual(original)
  expect(loadIllustrationTrace).toHaveBeenCalledOnce()
  expect(loadIllustrationTrace).toHaveBeenCalledWith(boat)
})

test('an earlier PNG response cannot cover the current object after its ID changes', async () => {
  let finishOld!: (value: IllustrationTrace) => void
  vi.mocked(loadIllustrationTrace).mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve }))
    .mockResolvedValueOnce({ ...trace, paths: [trace.paths[0]] })
  const view = render(<SceneProjection projection={projection()} />)
  expect(screen.getByRole('status').textContent).toContain('轮廓正在准备')
  view.rerender(<SceneProjection projection={projection(kite)} />)
  await act(async () => { await Promise.resolve() })
  const current = expectOnlyDashedPaths(1).map(node => node.getAttribute('points'))
  await act(async () => { finishOld({ ...trace, projection: 'gray' }) })
  expect(expectOnlyDashedPaths(1).map(node => node.getAttribute('points'))).toEqual(current)
  expect(screen.queryByRole('status')).toBeNull()
})

test('unmounting while a PNG is loading ignores its response', async () => {
  let finish!: (value: IllustrationTrace) => void
  vi.mocked(loadIllustrationTrace).mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  const view = render(<SceneProjection projection={projection()} />)
  view.unmount()
  await act(async () => { finish(trace) })
  expect(screen.queryByLabelText('Nilo 的场景描画轮廓')).toBeNull()
})

test('a failed PNG centerline gives a clear notice and never falls back to a solid or original image', async () => {
  vi.mocked(loadIllustrationTrace).mockResolvedValue(null)
  render(<SceneProjection projection={projection()} onEdit={vi.fn()} />)
  await act(async () => { await Promise.resolve() })
  expectOnlyDashedPaths(0)
  expect(screen.getByRole('status').textContent).toContain('没加载好')
  expect(screen.getByRole('status').textContent).toContain('可以接着画')
  expect(screen.getByRole('button', { name: '调整 Nilo 投影大小' })).toBeTruthy()
})

test('a dense gray reference and an older dashed reference coexist without doubled lines or a color toggle', async () => {
  vi.mocked(loadIllustrationTrace).mockImplementation(async id => id === boat ? { ...trace, projection: 'gray' } : trace)
  const p = projection(), other = projection(kite)
  p.additions = [{ ...other.proposal, x: .6, rotation: -10 }]
  p.scene!.objectIds.push('kite')
  p.scene!.plan.objects.push({ ...other.scene!.plan.objects[0], id: 'kite', role: 'support' })
  const view = render(<SceneProjection projection={p} onEdit={vi.fn()} />)
  await act(async () => { await Promise.resolve() })
  const overlay = screen.getByLabelText('Nilo 的场景描画轮廓')
  const image = overlay.querySelector<HTMLImageElement>('img')!
  expect(overlay.querySelectorAll('img')).toHaveLength(1)
  expect(image.getAttribute('src')).toBe(getDrawingIllustration(boat)!.src)
  expect(image.dataset.illustrationProjection).toBe('gray')
  expect(image.classList.contains('nilo-illustration-gray-projection')).toBe(true)
  expect(image.classList.contains('nilo-illustration-original')).toBe(false)
  expect(image.style.transform).toBe('rotate(20deg)')
  expect(overlay.querySelectorAll('[data-scene-object="object"] polyline')).toHaveLength(0)
  const dashed = [...overlay.querySelectorAll('[data-scene-object="kite"] polyline')]
  expect(dashed).toHaveLength(3)
  expect(dashed.every(path => path.getAttribute('stroke-dasharray') === '6 5' && path.getAttribute('fill') === 'none')).toBe(true)
  expect(screen.queryByRole('button', { name: '看原图' })).toBeNull()
  expect(screen.queryByRole('button', { name: '看彩色效果' })).toBeNull()
  expect(screen.getAllByRole('button', { name: '调整 Nilo 投影大小' })).toHaveLength(1)
  view.rerender(<SceneProjection projection={{ ...p, proposal: { ...p.proposal, x: .25, width: .35, height: .35, rotation: -15 } }} onEdit={vi.fn()} />)
  expect(image.style.left).toBe('25%')
  expect(image.style.width).toBe('35%')
  expect(image.style.height).toBe('35%')
  expect(image.style.transform).toBe('rotate(-15deg)')
  expect(overlay.querySelectorAll('[data-scene-object="object"] polyline')).toHaveLength(0)
  expect(loadIllustrationTrace).toHaveBeenCalledTimes(2)
  expect(HTMLCanvasElement.prototype.getContext).not.toHaveBeenCalled()
})

test('a failed dense reference keeps the editing controls and reports its image failure without a dashed fallback', async () => {
  vi.mocked(loadIllustrationTrace).mockResolvedValue({ ...trace, projection: 'gray' })
  render(<SceneProjection projection={projection()} onEdit={vi.fn()} />)
  await act(async () => { await Promise.resolve() })
  const overlay = screen.getByLabelText('Nilo 的场景描画轮廓'), image = overlay.querySelector('img')!
  fireEvent.error(image)
  expect(screen.getByRole('status').textContent).toContain('可以接着画')
  expect(overlay.querySelectorAll('polyline')).toHaveLength(0)
  expect(screen.getByRole('button', { name: '调整 Nilo 投影大小' })).toBeTruthy()
  fireEvent.load(image)
  expect(screen.queryByRole('status')).toBeNull()
})
