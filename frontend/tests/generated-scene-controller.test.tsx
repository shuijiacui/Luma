import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { useCompanion } from '@/features/child/hooks/useCompanion'
import { authFetch } from '@/lib/api/authFetch'
import { refreshMaterialCuration } from '@/features/child/companion/materialCuration'
import type { DrawingCanvasHandle } from '@/features/child/components/DrawingCanvas'
import type { DrawingProposal } from '@/features/child/companion/proposals'
import type { TracingGuide } from '@/features/child/companion/tracingGuide'
import { scenePalette, sanitizeScenePlan, type ScenePlan } from '../../shared/niloSceneDrawing.mjs'

vi.mock('@/lib/api/authFetch', () => ({ authFetch: vi.fn() }))
vi.mock('@/features/child/companion/materialCuration', () => ({ refreshMaterialCuration: vi.fn(async () => {}) }))
const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAEAAAAAgCAYAAACinX6EAAAAT0lEQVR4AeXBAQ0AIAzAsDH/ng8uTrL2zMOCAwz7ZMnwB4mTOImTOImTOImTOImTOImTOImTOImTOImTOImTOImTOImTOImTOImTOImTOImTOImTOImTuAtPZgY7mG4ntAAAAABJRU5ErkJggg=='
const plan: ScenePlan = { version: 1, title: '鲸背小镇', summary: '小房子连在鲸鱼宽宽的背上。', request: '我想画一个住在鲸鱼背上的小镇，旁边有月亮',
  palette: { ...scenePalette }, preserve: [], objects: [
    { id: 'town', name: '鲸鱼背上的小镇', aliases: ['鲸鱼', '小房子'], role: 'main', essential: ['完整鲸鱼的身体', '鲸背与小镇的房屋连接，不悬空'],
      render: { kind: 'generated' }, box: { x: .12, y: .25, width: .55, height: .4 }, color: '#66729b' },
    { id: 'moon', name: '月亮', aliases: ['弯月'], role: 'atmosphere', essential: ['弯月'], render: { kind: 'illustration', illustrationId: 'illustration-library-moon-beginner-01' },
      box: { x: .75, y: .1, width: .15, height: .2 }, color: '#66729b' },
  ] }
function proposals(variant = false): DrawingProposal[] {
  return plan.objects.map(object => ({ ...object.box, subject: object.name, rotation: 0, color: object.color, strokeWidth: 3,
    target: object.name, relation: '仅供描画的场景参考', brushKind: 'round', contribution: 'object', placementPolicy: 'free',
    ...(object.render.kind === 'generated' ? { template: 'generated', raster: { version: 1, pngBase64, width: 64, height: 32,
      projection: variant ? 'dashed' : 'gray', ...(variant ? { paths: [[[.1, .2], [.8, .7]]] } : {}) } }
      : { template: 'illustration', illustrationId: 'illustration-library-moon-beginner-01' }),
  } as DrawingProposal))
}
function ready(variant = false, targetPlan = plan) {
  const items = proposals(variant)
  return { status: 'ready', plan: targetPlan, objects: targetPlan.objects.map((object, i) => ({ id: object.id, name: object.name, proposal: items[i] })) }
}
function guide(): TracingGuide {
  const items = proposals()
  return { id: 'guide_before', aspect: 1.4, proposal: items[0], additions: items.slice(1),
    scene: { plan: sanitizeScenePlan(plan)!, objectIds: ['town', 'moon'], selectedId: 'town', view: 'outline' } }
}
beforeEach(() => {
  vi.useFakeTimers(); vi.mocked(authFetch).mockReset(); localStorage.clear()
  vi.mocked(refreshMaterialCuration).mockReset().mockResolvedValue(undefined)
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
})
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks() })
function setup(initialGuide: TracingGuide | undefined = guide()) {
  const state = { revision: 1 }, commit = vi.fn(), onSpeak = vi.fn()
  const canvas = { current: { getRevision: () => state.revision, getOccupancy: () => Array(64 * 64).fill(0),
    getInkGrid: () => Array(64).fill(0), getLastStroke: () => null, hasInkAt: () => false,
    getCompanionScene: () => ({ childBounds: null, niloBounds: null, recentContributions: [] }),
    getDocument: () => ({ version: 1, baseSource: 'child', operations: [] }),
    exportCompanionObservation: () => 'data:image/png;base64,AAAA', commitCompanionStrokes: commit,
  } as unknown as DrawingCanvasHandle }
  const hook = renderHook(props => useCompanion({ ...props, token: 'test-child-token', initialGuide, locale: 'zh', allowDrawing: true, tracing: false,
    canvas, aspect: () => 1.4, surfaceSize: () => ({ width: 840, height: 600 }), onSpeak, onCommitted: vi.fn() }),
  { initialProps: { ownerId: 'child-a', artworkId: 'work-a', enabled: true } })
  return { ...hook, state, commit, onSpeak }
}

test('generated “choose another” rerenders the complete same idea, preserves other objects and supports undo', async () => {
  const hook = setup(), before = structuredClone(hook.result.current.projection!)
  vi.mocked(authFetch).mockResolvedValueOnce(ready(true))
  await act(async () => { await hook.result.current.openMaterialPicker() })
  expect(authFetch).toHaveBeenCalledOnce()
  const call = vi.mocked(authFetch).mock.lastCall!
  expect(call[0]).toBe('/nilo/scene')
  expect(call[1]?.body).toMatchObject({ stage: 'render', utterance: plan.request, variantObjectId: 'town', plan: before.scene!.plan,
    context: { previousScene: { plan: before.scene!.plan, objects: [{ id: 'town', proposal: before.proposal }, { id: 'moon', proposal: before.additions[0] }] } } })
  expect(hook.result.current.materialPicker).toBeNull()
  expect(hook.result.current.projection?.proposal.raster?.projection).toBe('dashed')
  expect(hook.result.current.projection?.scene?.selectedId).toBe('town')
  expect(hook.result.current.projection?.additions).toEqual(before.additions)
  expect(hook.result.current.projection?.scene?.plan.request).toBe(before.scene!.plan.request)
  expect(hook.result.current.projection?.scene?.plan.objects[0].essential).toEqual(before.scene!.plan.objects[0].essential)
  act(() => hook.result.current.accept())
  expect(hook.commit).not.toHaveBeenCalled()
  expect(hook.result.current.memory.recentSubjects).toContain('鲸鱼背上的小镇')
  expect(hook.result.current.memory.recentTemplates).not.toContain('generated')
  await act(async () => { await hook.result.current.receive('撤销') })
  expect(hook.result.current.projection?.proposal).toEqual(before.proposal)
  expect(hook.result.current.projection?.additions).toEqual(before.additions)
  expect(authFetch).toHaveBeenCalledOnce()
})

test('voice alternative also retains the original whole-object request without a stock lookup', async () => {
  const hook = setup()
  vi.mocked(authFetch).mockResolvedValueOnce(ready(true))
  await act(async () => { await hook.result.current.alternative({ speak: false }) })
  expect(vi.mocked(authFetch).mock.lastCall?.[1]?.body).toMatchObject({ stage: 'render', variantObjectId: 'town', utterance: plan.request, plan: sanitizeScenePlan(plan) })
  expect(hook.result.current.materialPicker).toBeNull()
  expect(hook.result.current.sceneIdea).toBeNull()
})

test('an exact failed variation retries the same transaction, but the next chosen variation gets a new attempt', async () => {
  const hook = setup()
  vi.mocked(authFetch).mockRejectedValueOnce(new Error('offline')).mockResolvedValue(ready(true))
  await act(async () => { await hook.result.current.openMaterialPicker() })
  const failedBody = vi.mocked(authFetch).mock.lastCall?.[1]?.body as Record<string, unknown>
  await act(async () => { await hook.result.current.receive('再试一次') })
  expect(vi.mocked(authFetch).mock.lastCall?.[1]?.body).toEqual(failedBody)
  await act(async () => { await hook.result.current.openMaterialPicker() })
  const nextBody = vi.mocked(authFetch).mock.lastCall?.[1]?.body as Record<string, unknown>
  expect(nextBody.requestId).not.toBe(failedBody.requestId)
  expect(nextBody.requestScopeKey).toBe(failedBody.requestScopeKey)
  expect(nextBody.variantObjectId).toBe('town')
  expect(hook.commit).not.toHaveBeenCalled()
})

test('a failed variation retains the previous guide and an explicit retry keeps its ID and feature contract after new ink', async () => {
  const hook = setup(), before = structuredClone(hook.result.current.projection!)
  vi.mocked(authFetch).mockResolvedValueOnce({ status: 'unavailable', reason: 'visual_mismatch' })
  await act(async () => { await hook.result.current.openMaterialPicker() })
  expect(hook.result.current.projection?.proposal).toEqual(before.proposal)
  expect(hook.result.current.sceneIdea).toBeNull()
  expect(hook.result.current.message).toContain('上一张底图还在')
  hook.state.revision++
  vi.mocked(authFetch).mockResolvedValueOnce(ready(true))
  await act(async () => { await hook.result.current.receive('再试一次') })
  expect(vi.mocked(authFetch).mock.lastCall?.[1]?.body).toMatchObject({ stage: 'render', variantObjectId: 'town', utterance: plan.request,
    plan: before.scene!.plan, context: { revision: hook.state.revision } })
  expect(hook.result.current.projection?.proposal.raster?.projection).toBe('dashed')
  expect(hook.commit).not.toHaveBeenCalled()
})

test.each(['interrupt', 'owner', 'artwork', 'disabled', 'revision'] as const)('pending generated variation cannot override %s', async action => {
  const hook = setup(), before = structuredClone(hook.result.current.projection!)
  let finish!: (value: unknown) => void
  vi.mocked(authFetch).mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  let pending!: Promise<void>
  act(() => { pending = hook.result.current.openMaterialPicker() })
  expect(hook.result.current.phase).toBe('thinking')
  if (action === 'interrupt') act(() => hook.result.current.interrupt())
  if (action === 'owner') hook.rerender({ ownerId: 'child-b', artworkId: 'work-a', enabled: true })
  if (action === 'artwork') hook.rerender({ ownerId: 'child-a', artworkId: 'work-b', enabled: true })
  if (action === 'disabled') hook.rerender({ ownerId: 'child-a', artworkId: 'work-a', enabled: false })
  if (action === 'revision') hook.state.revision++
  await act(async () => { finish(ready(true)); await pending })
  expect(hook.result.current.projection?.proposal.raster?.projection).not.toBe('dashed')
  if (!['owner', 'artwork'].includes(action)) expect(hook.result.current.projection?.proposal).toEqual(before.proposal)
  expect(hook.commit).not.toHaveBeenCalled()
})

test('generated rendering waits beyond the ordinary budget and aborts at 55 seconds while retaining the old guide', async () => {
  const hook = setup()
  vi.mocked(authFetch).mockImplementationOnce(() => new Promise(() => {}))
  let pending!: Promise<void>
  act(() => { pending = hook.result.current.openMaterialPicker() })
  const signal = vi.mocked(authFetch).mock.lastCall?.[1]?.signal
  await act(async () => { await vi.advanceTimersByTimeAsync(32000) })
  expect(signal?.aborted).toBe(false)
  expect(hook.result.current.phase).toBe('thinking')
  await act(async () => { await vi.advanceTimersByTimeAsync(22999) })
  expect(signal?.aborted).toBe(false)
  await act(async () => { await vi.advanceTimersByTimeAsync(1); await pending })
  expect(signal?.aborted).toBe(true)
  expect(hook.result.current.projection?.proposal.raster?.projection).toBe('gray')
  expect(hook.result.current.message).toContain('再试一次')
})

test.each(['request', 'essential'] as const)('a variation response cannot silently change the original %s', async field => {
  const hook = setup(), before = structuredClone(hook.result.current.projection!)
  const changed = structuredClone(plan)
  if (field === 'request') changed.request = '只画鲸鱼'
  else changed.objects[0].essential = ['只有鲸鱼，省略房子']
  vi.mocked(authFetch).mockResolvedValueOnce(ready(true, changed))
  await act(async () => { await hook.result.current.openMaterialPicker() })
  expect(hook.result.current.projection?.proposal).toEqual(before.proposal)
  expect(hook.result.current.projection?.scene?.plan.request).toBe(before.scene!.plan.request)
  expect(hook.commit).not.toHaveBeenCalled()
})

test('stock scene objects still open only their existing same-subject material choices', async () => {
  const hook = setup()
  act(() => hook.result.current.selectSceneObject('moon'))
  await act(async () => { await hook.result.current.openMaterialPicker() })
  expect(authFetch).not.toHaveBeenCalled()
  expect(hook.result.current.materialPicker?.subject).toBe('moon')
  expect(hook.result.current.materialPicker?.subjects.map(group => group.subject)).toEqual(['moon'])
  expect(hook.commit).not.toHaveBeenCalled()
})

test('a generated reply is tracing-only even in the legacy ink confirmation workflow', async () => {
  const hook = setup(undefined)
  act(() => hook.result.current.dismiss({ speak: false }))
  vi.mocked(authFetch).mockResolvedValueOnce({ reply: '参考底图准备好了。', proposal: proposals()[0] })
  await act(async () => { await hook.result.current.ask('画一只特别的鲸鱼', true) })
  expect(hook.result.current.projection?.tracing).toBe(true)
  act(() => hook.result.current.accept())
  expect(hook.commit).not.toHaveBeenCalled()
  expect(hook.result.current.memory.recentTemplates).not.toContain('generated')
  expect(hook.result.current.memory.recentSubjects).toContain('鲸鱼背上的小镇')
})
