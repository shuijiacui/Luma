import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { useCompanion } from '@/features/child/hooks/useCompanion'
import { DetailCreationCard } from '@/features/child/components/DetailCreationCard'
import { createDetailReplyPicker, detailChoice, detailProjection, detailRequest, detailSketch, detailSteps } from '@/features/child/companion/detailCreation'
import { authFetch } from '@/lib/api/authFetch'
import type { DrawingCanvasHandle } from '@/features/child/components/DrawingCanvas'
import type { DrawingProposal } from '@/features/child/companion/proposals'
import type { TracingGuide } from '@/features/child/companion/tracingGuide'
import { compileSceneObject, scenePalette, type ScenePlan } from '../../shared/niloSceneDrawing.mjs'

vi.mock('@/lib/api/authFetch', () => ({ authFetch: vi.fn() }))
vi.mock('@/features/child/companion/materialCuration', () => ({ refreshMaterialCuration: vi.fn(async () => {}) }))
const plan: ScenePlan = { version: 1, title: '小城堡', request: '画一个梦幻场景', summary: '城堡旁边有月亮。', palette: { ...scenePalette }, preserve: [], objects: [
  { id: 'castle', name: '城堡', aliases: ['房子', 'castle'], role: 'main', essential: ['塔楼', '城门'], render: { kind: 'compose', primitive: 'castle' }, box: { x: .3, y: .3, width: .3, height: .3 }, color: '#936fbc' },
  { id: 'moon', name: '月亮', aliases: ['moon'], role: 'atmosphere', essential: ['弯月'], render: { kind: 'compose', primitive: 'moon' }, box: { x: .7, y: .1, width: .1, height: .12 }, color: '#dcbf66' },
] }
const items = plan.objects.map(object => ({ ...object.box, template: 'custom', subject: object.name, sketch: compileSceneObject(object)!.sketch,
  rotation: 0, color: object.color, strokeWidth: 3, brushKind: 'round', target: object.name, relation: '场景参考', contribution: 'object', placementPolicy: 'free' } as DrawingProposal))
const guide: TracingGuide = { id: 'existing-guide', aspect: 1.4, proposal: items[0], additions: items.slice(1), scene: { plan, objectIds: ['castle', 'moon'], selectedId: 'castle', view: 'outline' } }
const ready = { status: 'ready', plan, objects: plan.objects.map((object, i) => ({ id: object.id, name: object.name, proposal: items[i] })) }
type Props = { ownerId: string; artworkId?: string; token?: string; preferenceChildId?: string; enabled: boolean; allowDrawing: boolean }
function setup(initialGuide: TracingGuide | null = guide, props: Partial<Props> = {}) {
  const state = { revision: 1, pixels: 'AAAA', childBounds: null as null | { x: number; y: number; width: number; height: number } }
  const commit = vi.fn(), onSpeak = vi.fn(), onCommitted = vi.fn()
  const canvas = { current: { getRevision: () => state.revision, getOccupancy: () => Array(64 * 64).fill(0), getInkGrid: () => Array(64).fill(0),
    getLastStroke: () => null, getCompanionScene: () => ({ childBounds: state.childBounds, niloBounds: null, recentContributions: [] }),
    getDocument: () => ({ version: 1, baseSource: 'child', operations: [] }), exportCompanionObservation: () => `data:image/png;base64,${state.pixels}`,
    commitCompanionStrokes: commit, getEditableTargets: () => [], hasInkAt: () => false,
  } as unknown as DrawingCanvasHandle }
  const initialProps: Props = { ownerId: 'child-a', token: 'token-a', preferenceChildId: 'child-a', artworkId: 'work-a', enabled: true, allowDrawing: true, ...props }
  const hook = renderHook(p => useCompanion({ ...p, initialGuide: initialGuide ?? undefined, locale: 'zh', tracing: false, canvas,
    aspect: () => 1.4, surfaceSize: () => ({ width: 840, height: 600 }), onSpeak, onCommitted }), { initialProps })
  return { ...hook, state, commit, onSpeak, onCommitted, initialProps }
}
const posts = () => vi.mocked(authFetch).mock.calls.filter(call => call[0] === '/nilo/scene')
const bodies = () => posts().map(call => call[1]!.body as Record<string, any>)
const sessions = () => vi.mocked(authFetch).mock.calls.filter(call => call[0] === '/nilo/scene/session')
beforeEach(() => { vi.mocked(authFetch).mockReset(); localStorage.clear(); vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible') })
afterEach(() => { cleanup(); vi.restoreAllMocks() })

test.each(['把城堡往左挪一点', '把月亮放大一点', '把城堡换成树屋', '月亮换一个画法', '不要加花纹', '画一个魔法世界', '画一个笑脸星球', '给城堡加条纹然后把月亮缩小', 'move the smiling moon left', 'what pattern should I draw?',
  '画一个带条纹的老虎', 'draw a smiling robot', '画一个笑脸太阳', '画带花纹的小猫', 'draw smiling robots', '画一个带条纹的城堡', '给城堡加圆点和条纹', 'add dots and stripes to the castle', '给恐龙加条纹', 'add stripes to the tiger',
  '给城堡加圆点和小门', '给城堡和月亮加圆点', '给月亮加笑脸和花纹'])('invitation does not intercept other intent: %s', text => {
  expect(detailRequest(text, guide.scene!)).toBeNull()
})
test.each([['给城堡加圆点', 'dots', 'castle'], ['给月亮画个笑脸', 'smile', 'moon'], ['add stripes to the castle', 'stripes', 'castle']])('recognizes a finishable detail and named target: %s', (text, kind, targetId) => {
  expect(detailRequest(text, guide.scene!)).toMatchObject({ kind, targetId })
})
test.each([['我来试试', 'self'], ['我还是不会画', 'hint'], ['帮我画个轮廓', 'outline'], ['你帮我画吧', 'outline'], ['show me an outline', 'outline']])('voice choices: %s', (text, choice) => expect(detailChoice(text)).toBe(choice))
test('specific, bounded examples respect blank space and keep adjacent repeated wording varied', () => {
  for (const kind of ['dots', 'stripes', 'waves', 'smile', 'sad', 'pattern', 'decoration'] as const) {
    expect(detailSteps(kind, 'zh')).toHaveLength(3)
    expect(detailProjection({ kind }, 1.4, [], '#936fbc', 'zh')?.sketch).toEqual(detailSketch(kind))
    expect(detailProjection({ kind }, 1.4, [{ x: 0, y: 0, width: 1, height: 1 }], '#936fbc', 'zh')).toBeNull()
  }
  const pick = createDetailReplyPicker()
  expect(pick('dots', 'zh')).not.toBe(pick('dots', 'zh'))
})

test('invitation, hint, repeated difficulty and outline stay local and never change the scene or child ink', async () => {
  const hook = setup(), before = structuredClone(hook.result.current.projection!)
  await act(async () => { await hook.result.current.receive('给城堡加圆点') })
  expect(hook.result.current.detailInvitation?.mode).toBe('offer')
  act(() => hook.result.current.chooseDetailHelp('hint'))
  expect(hook.result.current.detailInvitation?.steps[1]).toContain('三个')
  await act(async () => { await hook.result.current.receive('我还是不会画') })
  expect(hook.result.current.detailInvitation?.mode).toBe('outline')
  expect(hook.result.current.projection?.detailGuide?.sketch).toEqual(detailSketch('dots'))
  expect(hook.result.current.projection?.proposal).toEqual(before.proposal)
  expect(hook.result.current.projection?.additions).toEqual(before.additions)
  expect(hook.result.current.projection?.scene).toEqual(before.scene)
  act(() => hook.result.current.accept())
  expect(hook.commit).not.toHaveBeenCalled(); expect(hook.onCommitted).not.toHaveBeenCalled(); expect(authFetch).not.toHaveBeenCalled()
  await act(async () => { await hook.result.current.receive('撤销') })
  expect(hook.result.current.projection?.detailGuide).toBeUndefined()
  expect(hook.result.current.projection?.proposal).toEqual(before.proposal)
})
test('explicit help skips invitation; a repeated detail continues with help rather than asking again', async () => {
  const hook = setup()
  await act(async () => { await hook.result.current.receive('帮我画城堡上的条纹') })
  expect(hook.result.current.detailInvitation?.mode).toBe('outline')
  act(() => hook.result.current.dismissDetailHelp())
  await act(async () => { await hook.result.current.receive('给城堡加条纹') })
  expect(hook.result.current.detailInvitation?.mode).toBe('hint')
  await act(async () => { await hook.result.current.receive('给月亮画个笑脸') })
  expect(hook.result.current.detailInvitation?.mode).toBe('offer')
  expect(authFetch).not.toHaveBeenCalled()
})
test('self choice closes the card but later difficulty still gets actionable help', async () => {
  const hook = setup()
  await act(async () => { await hook.result.current.receive('给城堡加圆点') })
  act(() => hook.result.current.chooseDetailHelp('self'))
  expect(hook.result.current.detailInvitation).toBeNull()
  await act(async () => { await hook.result.current.receive('我不会画') })
  expect(hook.result.current.detailInvitation?.mode).toBe('hint')
  expect(hook.result.current.detailInvitation?.steps[1]).toContain('圆圈')
})
test('full child canvas keeps example on card, never overlaps protected ink', async () => {
  const hook = setup(); hook.state.childBounds = { x: 0, y: 0, width: 1, height: 1 }
  await act(async () => { await hook.result.current.receive('帮我画城堡上的条纹') })
  expect(hook.result.current.detailInvitation?.example).toBeDefined()
  expect(hook.result.current.projection?.detailGuide).toBeUndefined()
  expect(hook.result.current.detailInvitation?.message).toContain('小卡片')
})
test('movement after an invitation keeps its existing direct local route', async () => {
  const hook = setup(), x = hook.result.current.projection!.proposal.x
  await act(async () => { await hook.result.current.receive('给城堡加圆点'); await hook.result.current.receive('把城堡往左挪一点') })
  expect(hook.result.current.detailInvitation).toBeNull()
  expect(hook.result.current.projection!.proposal.x).toBeLessThan(x)
  expect(authFetch).not.toHaveBeenCalled()
})
test('a new detail kind replaces the actual example after an offer, and undo returns the previous example', async () => {
  const hook = setup()
  await act(async () => { await hook.result.current.receive('帮我画城堡上的圆点') })
  expect(hook.result.current.projection?.detailGuide?.sketch).toEqual(detailSketch('dots'))
  await act(async () => { await hook.result.current.receive('给城堡加条纹') })
  expect(hook.result.current.detailInvitation?.mode).toBe('offer')
  act(() => hook.result.current.chooseDetailHelp('outline'))
  expect(hook.result.current.projection?.detailGuide?.sketch).toEqual(detailSketch('stripes'))
  await act(async () => { await hook.result.current.receive('撤销') })
  expect(hook.result.current.projection?.detailGuide?.sketch).toEqual(detailSketch('dots'))
})
test.each(['revision', 'owner', 'artwork', 'child', 'disabled', 'cancel'] as const)('stale outline choice cannot affect %s', async change => {
  const hook = setup()
  await act(async () => { await hook.result.current.receive('给城堡加圆点') })
  if (change === 'revision') hook.state.revision++
  if (change === 'owner') hook.rerender({ ...hook.initialProps, ownerId: 'child-b' })
  if (change === 'artwork') hook.rerender({ ...hook.initialProps, artworkId: 'work-b' })
  if (change === 'child') hook.rerender({ ...hook.initialProps, preferenceChildId: 'child-b' })
  if (change === 'disabled') hook.rerender({ ...hook.initialProps, enabled: false })
  if (change === 'cancel') act(() => hook.result.current.interrupt())
  act(() => hook.result.current.chooseDetailHelp('outline'))
  expect(hook.result.current.projection?.detailGuide).toBeUndefined()
  if (change === 'child') expect(hook.result.current.projection).toBeNull()
  expect(hook.commit).not.toHaveBeenCalled(); expect(authFetch).not.toHaveBeenCalled()
})
test('card presents three child-facing choices and a concrete visible outline without service terminology', () => {
  const choose = vi.fn(), close = vi.fn(), invitation = { request: { kind: 'dots' as const }, mode: 'offer' as const, message: '试试圆点吧。', steps: detailSteps('dots', 'zh') }
  const view = render(<DetailCreationCard invitation={invitation} locale="zh" disabled={false} onChoose={choose} onClose={close} />)
  for (const [label, value] of [['我来试试', 'self'], ['给我一点提示', 'hint'], ['帮我画个轮廓', 'outline']]) {
    fireEvent.click(screen.getByRole('button', { name: label })); expect(choose).toHaveBeenLastCalledWith(value)
  }
  view.rerender(<DetailCreationCard invitation={{ ...invitation, mode: 'outline', example: detailSketch('dots') }} locale="zh" disabled={false} onChoose={choose} onClose={close} />)
  expect(screen.getAllByRole('listitem')).toHaveLength(3)
  expect(screen.getByRole('img', { name: '细节轮廓小示范' }).querySelectorAll('polyline')).toHaveLength(3)
  expect(view.container.textContent).not.toMatch(/API|额度|省钱|费用/i)
})

test('exact failed scene retry reuses complete body and request ID, with stable unsaved canvas scope', async () => {
  const hook = setup(null, { artworkId: undefined })
  vi.mocked(authFetch).mockRejectedValue(new Error('offline'))
  await act(async () => { await hook.result.current.receive(plan.request); await hook.result.current.receive('再试一次') })
  expect(bodies()).toHaveLength(2)
  expect(bodies()[1]).toEqual(bodies()[0])
  expect(bodies()[0].artworkId).toMatch(/^[\w-]+$/)
  expect(bodies()[0].requestScopeKey).not.toBe('child-a')
  await act(async () => { await hook.result.current.receive('画一个海底场景') })
  expect(bodies()[2].requestScopeKey).toBe(bodies()[0].requestScopeKey)
  expect(bodies()[2].artworkId).toBe(bodies()[0].artworkId)
  expect(bodies()[2].requestId).not.toBe(bodies()[0].requestId)
})
test.each(['pixels', 'revision'] as const)('changed %s uses a new attempt instead of accepting stale cached output', async change => {
  const hook = setup(null); vi.mocked(authFetch).mockRejectedValue(new Error('offline'))
  await act(async () => { await hook.result.current.receive(plan.request) })
  if (change === 'pixels') hook.state.pixels = 'BBBB'; else hook.state.revision++
  await act(async () => { await hook.result.current.receive('再试一次') })
  expect(bodies()[1].requestId).not.toBe(bodies()[0].requestId)
  expect(bodies()[1].requestScopeKey).toBe(bodies()[0].requestScopeKey)
})
test.each(['owner', 'child', 'token', 'artwork', 'reset'] as const)('request scope is renewed for %s', async change => {
  const hook = setup(null, { artworkId: undefined }); vi.mocked(authFetch).mockRejectedValue(new Error('offline'))
  await act(async () => { await hook.result.current.receive(plan.request) })
  if (change === 'reset') act(() => hook.result.current.resetSceneSession())
  else hook.rerender({ ...hook.initialProps, ...(change === 'owner' ? { ownerId: 'child-b' } : change === 'child' ? { preferenceChildId: 'child-b' } : change === 'token' ? { token: 'token-b' } : { artworkId: 'saved-b' }) })
  await act(async () => { await hook.result.current.receive(plan.request) })
  expect(bodies()[1].requestScopeKey).not.toBe(bodies()[0].requestScopeKey)
  expect(bodies()[1].artworkId).not.toBe(bodies()[0].artworkId)
})
test('plan and render share transaction identity; failed render confirmation only reuses an identical observation', async () => {
  const hook = setup(null)
  vi.mocked(authFetch).mockResolvedValueOnce({ status: 'proposed', plan }).mockRejectedValue(new Error('offline'))
  await act(async () => { await hook.result.current.receive(plan.request); await hook.result.current.confirmSceneIdea() })
  expect(bodies()[1].requestId).toBe(bodies()[0].requestId)
  await act(async () => { await hook.result.current.confirmSceneIdea() })
  expect(bodies()[2]).toEqual(bodies()[1])
  hook.state.pixels = 'BBBB'
  await act(async () => { await hook.result.current.receive('好，就这样画') })
  expect(bodies()[3].requestId).not.toBe(bodies()[2].requestId)
})
test('guest establishes a free cookie session before the first scene POST and reuses it while fresh', async () => {
  const hook = setup(null, { ownerId: 'guest', token: undefined, preferenceChildId: undefined })
  vi.mocked(authFetch).mockImplementation(async url => url === '/nilo/scene/session' ? { ready: true } : { status: 'proposed', plan })
  await act(async () => { await hook.result.current.receive(plan.request) })
  expect(vi.mocked(authFetch).mock.calls.map(call => call[0])).toEqual(['/nilo/scene/session', '/nilo/scene'])
  vi.mocked(authFetch).mockResolvedValueOnce(ready)
  await act(async () => { await hook.result.current.confirmSceneIdea() })
  expect(sessions()).toHaveLength(1); expect(posts()).toHaveLength(2)
})
test('a long-open guest tab renews its free cookie session before dispatching the next scene stage', async () => {
  let now = Date.now()
  vi.spyOn(Date, 'now').mockImplementation(() => now)
  const hook = setup(null, { ownerId: 'guest', token: undefined })
  vi.mocked(authFetch).mockImplementation(async url => url === '/nilo/scene/session' ? { ready: true } : { status: 'proposed', plan })
  await act(async () => { await hook.result.current.receive(plan.request) })
  now += 25 * 60 * 1000 + 1
  vi.mocked(authFetch).mockImplementation(async url => url === '/nilo/scene/session' ? { ready: true } : ready)
  await act(async () => { await hook.result.current.confirmSceneIdea() })
  expect(sessions()).toHaveLength(2)
  expect(vi.mocked(authFetch).mock.calls.map(call => call[0])).toEqual(['/nilo/scene/session', '/nilo/scene', '/nilo/scene/session', '/nilo/scene'])
  expect(bodies()[1].requestId).toBe(bodies()[0].requestId)
})
test('cancelling guest initialization never posts or caches readiness; retry initializes first', async () => {
  const hook = setup(null, { ownerId: 'guest', token: undefined })
  let finish!: (value: unknown) => void
  vi.mocked(authFetch).mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  let pending!: Promise<void>
  act(() => { pending = hook.result.current.receive(plan.request) })
  act(() => hook.result.current.interrupt())
  await act(async () => { finish({ ready: true }); await pending })
  expect(posts()).toHaveLength(0)
  vi.mocked(authFetch).mockImplementation(async url => url === '/nilo/scene/session' ? { ready: true } : { status: 'proposed', plan })
  await act(async () => { await hook.result.current.receive(plan.request) })
  expect(sessions()).toHaveLength(2); expect(posts()).toHaveLength(1)
})
test('failed guest initialization sends no scene POST, and authenticated children skip it', async () => {
  const guest = setup(null, { ownerId: 'guest', token: undefined })
  vi.mocked(authFetch).mockResolvedValue({ ready: false })
  await act(async () => { await guest.result.current.receive(plan.request) })
  expect(posts()).toHaveLength(0)
  guest.unmount(); vi.mocked(authFetch).mockClear()
  const child = setup(null)
  vi.mocked(authFetch).mockResolvedValue({ status: 'proposed', plan })
  await act(async () => { await child.result.current.receive(plan.request) })
  expect(sessions()).toHaveLength(0); expect(posts()).toHaveLength(1)
})
