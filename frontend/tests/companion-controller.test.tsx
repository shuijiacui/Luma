import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { authFetch } from '@/lib/api/authFetch'
import { ApiError } from '@/lib/api/client'
import { useCompanion } from '@/features/child/hooks/useCompanion'
import { proposalStrokes, readMemory, saveMemory, type CompanionReply, type DrawingProposal } from '@/features/child/companion/proposals'
import type { DrawingCanvasHandle } from '@/features/child/components/DrawingCanvas'
import type { CanvasDocument } from '@/features/child/canvasDocument'
import type { CompanionScene } from '@/features/child/companionScene'

vi.mock('@/lib/api/authFetch', () => ({ authFetch: vi.fn() }))
const proposal: DrawingProposal = { template: 'flame', x: .3, y: .5, width: .15, height: .15, rotation: 0, color: '#e4a86a', strokeWidth: 4, target: '飞船', relation: '飞船的小尾焰' }
const reply: CompanionReply = { reply: '先给你看一小段尾焰。', theme: '飞船', proposal }
const plan: DrawingProposal[] = [
  { ...proposal, template: 'boat', x: .15, y: .58, width: .2, height: .18 },
  { ...proposal, template: 'waves', x: .15, y: .8, width: .24, height: .08 },
  { ...proposal, template: 'sun', x: .65, y: .12, width: .18, height: .2 },
  { ...proposal, template: 'cloud', x: .55, y: .47, width: .24, height: .13 },
]
beforeEach(() => {
  vi.useFakeTimers(); vi.mocked(authFetch).mockReset(); localStorage.clear()
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })))
})
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

function setup(initial = { ownerId: 'child-a', artworkId: 'work-a' as string | undefined, allowDrawing: true, enabled: true }) {
  const state = {
    revision: 1, occupancy: Array(64 * 64).fill(0),
    document: { version: 1, baseSource: 'child', operations: [] } as CanvasDocument,
    scene: { childBounds: { x: .2, y: .3, width: .3, height: .2 }, niloBounds: null, recentContributions: [] } as CompanionScene,
  }
  const onSpeak = vi.fn(), onCommitted = vi.fn(), onUnavailable = vi.fn()
  const commit = vi.fn(() => { state.revision++; return true })
  const canvas = { current: {
    getRevision: () => state.revision, getOccupancy: vi.fn(() => state.occupancy), getInkGrid: vi.fn((size = 8) => Array(size * size).fill(0)),
    getLastStroke: () => ({ points: Array.from({ length: 120 }, (_, i) => ({ x: i / 200, y: i / 200 })), color: '#123456', width: 4 }),
    getDocument: () => state.document, getCompanionScene: vi.fn(() => state.scene),
    exportObservation: vi.fn(() => 'data:image/png;base64,CHILD'),
    exportCompanionObservation: vi.fn(() => 'data:image/png;base64,COMPOSITE'), commitCompanionStrokes: commit,
  } as unknown as DrawingCanvasHandle }
  const hook = renderHook(props => useCompanion({ ...props, locale: 'zh', canvas, aspect: () => 1.5,
    surfaceSize: () => ({ width: 900, height: 600 }), drawingStyle: () => ({ brushKind: 'pencil', color: '#123456', brushSize: 4 }),
    onSpeak, onCommitted, onUnavailable }), { initialProps: initial })
  return { ...hook, state, canvas, commit, onSpeak, onCommitted, onUnavailable }
}
async function project(hook: ReturnType<typeof setup>) {
  vi.mocked(authFetch).mockResolvedValueOnce(reply)
  await act(async () => { await hook.result.current.ask('给飞船画尾焰', true) })
  act(() => vi.advanceTimersByTime(550))
  expect(hook.result.current.phase).toBe('projected')
}

test('no commit during sketching; explicit acceptance commits exactly the shown paths once', async () => {
  const hook = setup()
  vi.mocked(authFetch).mockResolvedValueOnce(reply)
  await act(async () => { await hook.result.current.ask('帮飞船画尾焰', true) })
  expect(hook.result.current.phase).toBe('sketching')
  act(() => hook.result.current.receive('留下来'))
  expect(hook.commit).not.toHaveBeenCalled()
  act(() => vi.advanceTimersByTime(550))
  const shown = hook.result.current.projection!
  expect(shown.proposal.width * shown.aspect / shown.proposal.height).toBeCloseTo(.65)
  act(() => { hook.result.current.receive('留下来'); hook.result.current.accept() })
  expect(hook.commit).toHaveBeenCalledTimes(1)
  expect(hook.commit).toHaveBeenCalledWith(proposalStrokes(shown.proposal, shown.aspect), 1)
  expect(hook.onCommitted).toHaveBeenCalledTimes(1)
  expect(readMemory('child-a', 'work-a').recentTemplates).toEqual(['flame'])
})

test('a silent drawing handoff and its confirmation never invoke speech', async () => {
  const hook = setup()
  vi.mocked(authFetch).mockResolvedValueOnce(reply)
  await act(async () => { await hook.result.current.ask('我画好了，该你了', true, { speak: false }) })
  act(() => vi.advanceTimersByTime(550))
  expect(hook.result.current.phase).toBe('projected')
  expect(hook.onSpeak).not.toHaveBeenCalled()
  act(() => hook.result.current.accept({ speak: false }))
  expect(hook.commit).toHaveBeenCalledOnce()
  expect(hook.onSpeak).not.toHaveBeenCalled()
})

test.each([2, 3, 4])('%s related additions preview together and commit exactly the shown group once', async count => {
  const hook = setup()
  vi.mocked(authFetch).mockResolvedValueOnce({ ...reply, proposal: plan[0], additions: plan.slice(1, count) })
  await act(async () => { await hook.result.current.ask('轮到你添一组小风景', true, { speak: false }) })
  expect(hook.result.current.phase).toBe('sketching')
  expect(hook.commit).not.toHaveBeenCalled()
  act(() => vi.advanceTimersByTime(550))
  const shown = hook.result.current.projection!
  const items = [shown.proposal, ...shown.additions]
  expect(items).toHaveLength(count)
  expect(items.map(item => item.template)).toEqual(plan.slice(0, count).map(item => item.template))
  expect(shown.proposal.width * shown.aspect / shown.proposal.height).toBeCloseTo(1.4)
  if (count >= 3) expect(items[2].width * shown.aspect / items[2].height).toBeCloseTo(1)
  const displayedPaths = items.flatMap(item => proposalStrokes(item, shown.aspect))
  act(() => { hook.result.current.accept({ speak: false }); hook.result.current.accept({ speak: false }) })
  expect(hook.commit).toHaveBeenCalledExactlyOnceWith(displayedPaths, 1)
  expect(hook.onCommitted).toHaveBeenCalledOnce()
  expect(hook.onSpeak).not.toHaveBeenCalled()
  expect(readMemory('child-a', 'work-a').recentTemplates).toEqual(items.map(item => item.template))
})

test('group color, brush, movement and scaling stay together without another model request', async () => {
  const hook = setup()
  vi.mocked(authFetch).mockResolvedValueOnce({ ...reply, proposal: plan[0], additions: plan.slice(1) })
  await act(async () => { await hook.result.current.ask('添一些相关的小风景', true, { speak: false }) })
  act(() => vi.advanceTimersByTime(550))
  const getItems = () => {
    const preview = hook.result.current.projection!
    return [preview.proposal, ...preview.additions]
  }
  act(() => hook.result.current.edit({ color: '#7a82d8', brushKind: 'crayon', strokeWidth: 8 }))
  expect(getItems().every(item => item.color === '#7a82d8' && item.brushKind === 'crayon' && item.strokeWidth === 8)).toBe(true)
  const styled = getItems()
  act(() => hook.result.current.receive('left', { speak: false }))
  const moved = getItems()
  moved.forEach((item, index) => {
    expect(item.x).toBeCloseTo(styled[index].x - .035)
    expect(item.y).toBeCloseTo(styled[index].y)
    expect(item.width).toBe(styled[index].width)
  })
  const cx = (Math.min(...moved.map(item => item.x)) + Math.max(...moved.map(item => item.x + item.width))) / 2
  const cy = (Math.min(...moved.map(item => item.y)) + Math.max(...moved.map(item => item.y + item.height))) / 2
  act(() => hook.result.current.receive('smaller', { speak: false }))
  const resized = getItems()
  resized.forEach((item, index) => {
    expect(item.x).toBeCloseTo(cx + (moved[index].x - cx) * .85)
    expect(item.y).toBeCloseTo(cy + (moved[index].y - cy) * .85)
    expect(item.width).toBeCloseTo(moved[index].width * .85)
    expect(item.height).toBeCloseTo(moved[index].height * .85)
  })
  const validPreview = hook.result.current.projection
  act(() => hook.result.current.edit({ x: .9 }))
  expect(hook.result.current.projection).toBe(validPreview)
  expect(authFetch).toHaveBeenCalledOnce()
  expect(hook.onSpeak.mock.calls.every(([text]) => text === '')).toBe(true)
  act(() => hook.result.current.accept({ speak: false }))
  expect(hook.commit).toHaveBeenCalledExactlyOnceWith(resized.flatMap(item => proposalStrokes(item, 1.5)), 1)
})

test.each([
  [null],
  [{ ...plan[1], template: 'arbitrary-path' }],
  [{ ...plan[1], x: Number.NaN }],
  [plan[1], plan[2], plan[3], plan[1]],
])('an invalid addition rejects the complete plan instead of silently dropping the member: %j', async (...additions) => {
  const hook = setup()
  vi.mocked(authFetch).mockResolvedValueOnce({ ...reply, proposal: plan[0], additions, alternatives: [plan[2]] })
  await act(async () => { await hook.result.current.ask('帮我加一组内容', true, { speak: false }) })
  act(() => vi.advanceTimersByTime(550))
  expect(hook.result.current.phase).toBe('idle')
  expect(hook.result.current.projection).toBeNull()
  expect(hook.result.current.message).toContain('这组小主意')
  expect(hook.commit).not.toHaveBeenCalled()
  expect(hook.onSpeak).not.toHaveBeenCalled()
})

test('a newly occupied addition invalidates acceptance of the entire group', async () => {
  const hook = setup()
  vi.mocked(authFetch).mockResolvedValueOnce({ ...reply, proposal: plan[0], additions: plan.slice(1, 3) })
  await act(async () => { await hook.result.current.ask('请画船和小风景', true) })
  act(() => vi.advanceTimersByTime(550))
  expect(hook.result.current.projection?.additions).toHaveLength(2)
  // Only the right-side sun is blocked; the boat and waves remain unobstructed.
  for (let row = 0; row < 64; row++) for (let col = 32; col < 64; col++) hook.state.occupancy[row * 64 + col] = 1
  act(() => hook.result.current.accept({ speak: false }))
  expect(hook.commit).not.toHaveBeenCalled()
  expect(hook.result.current.projection).toBeNull()
})

test('co-creation requests use the confirmed composite image and scene with separate ownership hints', async () => {
  const hook = setup()
  hook.state.document.coCreated = true
  hook.state.scene.niloBounds = { x: .65, y: .1, width: .15, height: .2 }
  hook.state.scene.recentContributions = [
    { owner: 'child', bounds: hook.state.scene.childBounds!, brushKind: 'pencil', color: '#123456', strokeCount: 3 },
    { owner: 'nilo', bounds: hook.state.scene.niloBounds, brushKind: 'round', color: '#edcd70', strokeCount: 9 },
  ]
  await project(hook)
  const body = vi.mocked(authFetch).mock.calls[0][1]?.body as {
    imageBase64: string
    context: { imageProvenance: string; scene: CompanionScene; canvasSize: { width: number; height: number }; drawingStyle: unknown; inkGrid: number[] }
  }
  expect(body.imageBase64).toBe('COMPOSITE')
  expect(body.context.imageProvenance).toBe('composite')
  expect(body.context.scene).toEqual(hook.state.scene)
  expect(body.context.canvasSize).toEqual({ width: 900, height: 600 })
  expect(body.context.drawingStyle).toEqual({ brushKind: 'pencil', color: '#123456', brushSize: 4 })
  expect(body.context.inkGrid).toHaveLength(64)
  expect(hook.canvas.current.exportObservation).not.toHaveBeenCalled()
  expect(hook.canvas.current.exportCompanionObservation).toHaveBeenCalledOnce()
  expect(hook.canvas.current.getOccupancy).toHaveBeenCalledWith(64)
})

test('cancelled, revised and hidden-canvas requests never expose a stale projection', async () => {
  const hook = setup()
  let resolve!: (value: CompanionReply) => void
  vi.mocked(authFetch).mockImplementationOnce(() => new Promise(done => { resolve = done }))
  let work!: Promise<void>
  act(() => { work = hook.result.current.ask('请帮我画', true) })
  act(() => hook.result.current.cancel())
  await act(async () => { resolve(reply); await work })
  expect(hook.result.current.projection).toBeNull()
  vi.advanceTimersByTime(1600)
  vi.mocked(authFetch).mockImplementationOnce(() => new Promise(done => { resolve = done }))
  act(() => { work = hook.result.current.ask('请帮我画', true) })
  hook.state.revision++
  await act(async () => { resolve(reply); await work })
  expect(hook.result.current.projection).toBeNull()
  expect(hook.commit).not.toHaveBeenCalled()
})

test('timeout exits thinking even when fetch ignores its AbortSignal and late results stay unused', async () => {
  const hook = setup()
  let resolve!: (value: CompanionReply) => void
  vi.mocked(authFetch).mockImplementationOnce(() => new Promise(done => { resolve = done }))
  let work!: Promise<void>
  act(() => { work = hook.result.current.ask('请帮我画', true) })
  act(() => vi.advanceTimersByTime(27999))
  expect(hook.result.current.phase).toBe('thinking')
  await act(async () => { vi.advanceTimersByTime(1); await work })
  expect(hook.result.current.phase).toBe('idle')
  expect(hook.result.current.message).toContain('连接有点慢')
  expect(hook.onUnavailable).toHaveBeenCalledOnce()
  await act(async () => { resolve(reply); await Promise.resolve() })
  expect(hook.result.current.projection).toBeNull()
})

test.each([
  [new ApiError(404, 'Not found'), '正在更新'],
  [new ApiError(401, 'Unauthorized'), '重新登录'],
  [new ApiError(429, 'Rate limited'), '有点忙'],
  [new TypeError('Failed to fetch'), '网络暂时没连上'],
])('connection failure %s is not presented as a creative dead end', async (error, message) => {
  const hook = setup()
  vi.mocked(authFetch).mockRejectedValueOnce(error)
  await act(async () => { await hook.result.current.ask('请帮我的船画一点浪花', true) })
  expect(hook.result.current.message).toContain(message)
  expect(hook.onUnavailable).toHaveBeenCalledOnce()
  expect(hook.commit).not.toHaveBeenCalled()
  expect(hook.result.current.phase).toBe('idle')
})

test('a model outage ends continuous voice and does not pollute the next story turn', async () => {
  const hook = setup()
  vi.mocked(authFetch).mockResolvedValueOnce({ status: 'unavailable', reason: 'provider_error', reply: '画画伙伴暂时没连上，稍后再点我试试。', theme: '错误主题', proposal })
  await act(async () => { await hook.result.current.ask('请帮我画', true) })
  expect(hook.result.current.projection).toBeNull()
  expect(hook.result.current.memory.theme).toBe('')
  expect(hook.onUnavailable).toHaveBeenCalledOnce()
  vi.advanceTimersByTime(1500)
  vi.mocked(authFetch).mockResolvedValueOnce(reply)
  await act(async () => { await hook.result.current.ask('这是我的飞船', true) })
  const request = vi.mocked(authFetch).mock.calls[1][1]?.body as { context: { history: unknown[] } }
  expect(request.context.history).toEqual([])
  expect(hook.result.current.phase).toBe('sketching')
})

test('child edits, revision changes and collisions are checked again before acceptance', async () => {
  const hook = setup()
  await project(hook)
  act(() => hook.result.current.edit({ color: '#123456' }))
  expect(hook.result.current.projection?.proposal.color).toBe('#123456')
  expect(hook.onSpeak).toHaveBeenLastCalledWith('')
  const shown = hook.result.current.projection
  act(() => hook.result.current.edit({ width: 5 }))
  expect(hook.result.current.projection).toBe(shown)
  hook.state.occupancy.fill(1)
  act(() => hook.result.current.accept())
  expect(hook.commit).not.toHaveBeenCalled()
  expect(hook.result.current.projection).toBeNull()
})

test('button edits avoid model and speech calls; voice edits acknowledge once', async () => {
  const hook = setup()
  await project(hook)
  const previousX = hook.result.current.projection!.proposal.x
  hook.onSpeak.mockClear(); vi.mocked(authFetch).mockClear()
  act(() => hook.result.current.receive('left', { speak: false }))
  expect(hook.result.current.projection?.proposal.x).toBeCloseTo(previousX - .035)
  expect(hook.onSpeak.mock.calls.every(([text]) => text === '')).toBe(true)
  act(() => hook.result.current.receive('再小一点'))
  expect(hook.onSpeak).toHaveBeenLastCalledWith('调整好啦，喜欢的话就留下来。')
  expect(authFetch).not.toHaveBeenCalled()
})

test('switching children and artworks cancels pending operations and loads only their own memory', async () => {
  const hook = setup()
  await project(hook)
  saveMemory('child-b', 'work-b', { theme: '花园', recentTemplates: ['leaf'], rejectedTemplates: [] })
  hook.rerender({ ownerId: 'child-b', artworkId: 'work-b', allowDrawing: true, enabled: true })
  expect(hook.result.current.projection).toBeNull()
  expect(hook.result.current.memory.theme).toBe('花园')
  act(() => hook.result.current.accept())
  expect(hook.commit).not.toHaveBeenCalled()
  expect(readMemory('child-a', 'work-a').theme).toBe('飞船')
  expect(readMemory('child-b', 'work-b').theme).toBe('花园')
})

test('first save carries the unsaved story to the new id; request context is bounded and child-only', async () => {
  const hook = setup({ ownerId: 'child-a', artworkId: undefined, allowDrawing: true, enabled: true })
  await project(hook)
  const body = vi.mocked(authFetch).mock.calls[0][1]?.body as { context: { lastStroke: { points: unknown[] }; imageProvenance: string } }
  expect(body.context.lastStroke.points).toHaveLength(24)
  expect(body.context.imageProvenance).toBe('child')
  hook.rerender({ ownerId: 'child-a', artworkId: 'newly-saved', allowDrawing: true, enabled: true })
  expect(hook.result.current.memory.theme).toBe('飞船')
  expect(readMemory('child-a', 'newly-saved').theme).toBe('飞船')
})

test('solo conversation does not request drawing or accept a model-supplied proposal', async () => {
  const hook = setup({ ownerId: 'child-a', artworkId: 'work-a', allowDrawing: false, enabled: true })
  vi.mocked(authFetch).mockResolvedValueOnce(reply)
  await act(async () => { await hook.result.current.ask('帮我画尾焰', true) })
  const body = vi.mocked(authFetch).mock.calls[0][1]?.body as { context: { requestDrawing: boolean } }
  expect(body.context.requestDrawing).toBe(false)
  expect(hook.result.current.projection).toBeNull()
  act(() => hook.result.current.accept())
  expect(hook.commit).not.toHaveBeenCalled()
})

test('praise about a preview stays conversation and neither accepts nor replaces that preview', async () => {
  const hook = setup()
  await project(hook)
  const shown = hook.result.current.projection
  vi.advanceTimersByTime(1500)
  vi.mocked(authFetch).mockResolvedValueOnce({ reply: '你可以再看看，喜欢的话按留下来。' })
  await act(async () => { hook.result.current.receive('好看'); await Promise.resolve(); await Promise.resolve() })
  const calls = vi.mocked(authFetch).mock.calls
  const body = calls[calls.length - 1][1]?.body as { context: { requestDrawing: boolean } }
  expect(body.context.requestDrawing).toBe(false)
  expect(hook.result.current.projection).toEqual(shown)
  expect(hook.commit).not.toHaveBeenCalled()
})

test('forgetting a story is local, clears memory and preview, and never changes the drawing', async () => {
  const hook = setup()
  await project(hook)
  expect(hook.result.current.memory.theme).toBe('飞船')
  vi.mocked(authFetch).mockClear()
  const revision = hook.state.revision
  act(() => hook.result.current.receive('忘掉这个故事'))
  expect(hook.result.current.memory).toEqual({ theme: '', recentTemplates: [], rejectedTemplates: [] })
  expect(readMemory('child-a', 'work-a').theme).toBe('')
  expect(hook.result.current.projection).toBeNull()
  expect(hook.state.revision).toBe(revision)
  expect(hook.commit).not.toHaveBeenCalled()
  expect(authFetch).not.toHaveBeenCalled()
})
