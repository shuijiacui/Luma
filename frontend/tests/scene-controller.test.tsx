import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { useCompanion } from '@/features/child/hooks/useCompanion'
import { authFetch } from '@/lib/api/authFetch'
import { refreshMaterialCuration } from '@/features/child/companion/materialCuration'
import type { DrawingCanvasHandle } from '@/features/child/components/DrawingCanvas'
import type { DrawingProposal } from '@/features/child/companion/proposals'
import { editSceneLocally, isCompositeDrawingRequest, needsSceneIdea, sceneAnswer, validateSceneGuide } from '@/features/child/companion/sceneWorkflow'
import { validateTracingGuide } from '@/features/child/companion/tracingGuide'
import { compileSceneObject, scenePalette, sanitizeScenePlan, type ScenePlan } from '../../shared/niloSceneDrawing.mjs'
import { sanitizeSceneInput } from '../../server/src/services/niloScene.js'

vi.mock('@/lib/api/authFetch', () => ({ authFetch: vi.fn() }))
vi.mock('../../server/src/services/tracing.js', () => ({ traceLLM: vi.fn(), traceNode: vi.fn() }))
vi.mock('@/features/child/companion/materialCuration', () => ({ refreshMaterialCuration: vi.fn(async () => {}) }))
const plan: ScenePlan = { version: 1, title: '星光城堡', summary: '云上的城堡，旁边有月亮。你喜欢这个想法吗？',
  request: '画一个迪士尼那样梦幻的场景', palette: { ...scenePalette }, preserve: ['保留孩子的小船'], objects: [
    { id: 'castle', name: '云上城堡', aliases: ['城堡'], role: 'main', essential: ['塔楼', '城门'], render: { kind: 'compose', primitive: 'castle', parameters: { towers: 3 } }, box: { x: .3, y: .25, width: .3, height: .35 }, color: '#936fbc' },
    { id: 'moon', name: '月亮', aliases: ['月亮'], role: 'atmosphere', essential: ['弯月'], render: { kind: 'compose', primitive: 'moon' }, box: { x: .72, y: .1, width: .12, height: .15 }, color: '#dcbf66' },
  ] }
function rendered(scenePlan = plan) {
  return { status: 'ready', plan: scenePlan, objects: scenePlan.objects.map(object => ({ id: object.id, name: object.name,
    proposal: { ...object.box, template: 'custom', subject: object.name, sketch: compileSceneObject(object)!.sketch,
      rotation: 0, color: object.color, strokeWidth: 3, brushKind: 'round', target: object.name, relation: '场景的一部分', contribution: 'object', placementPolicy: 'free' } as DrawingProposal })) }
}
beforeEach(() => {
  vi.mocked(authFetch).mockReset(); localStorage.clear()
  vi.mocked(refreshMaterialCuration).mockReset().mockResolvedValue(undefined)
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })
function setup() {
  const state = { revision: 1 }
  const onSpeak = vi.fn(), commit = vi.fn()
  const canvas = { current: {
    getRevision: () => state.revision, getOccupancy: () => Array(64 * 64).fill(0), getInkGrid: () => Array(64).fill(0),
    getLastStroke: () => null, getCompanionScene: () => ({ childBounds: null, niloBounds: null, recentContributions: [] }),
    getDocument: () => ({ version: 1, baseSource: 'child', operations: [] }), exportCompanionObservation: () => 'data:image/png;base64,AAAA',
    commitCompanionStrokes: commit, getEditableTargets: () => [], hasInkAt: () => false,
  } as unknown as DrawingCanvasHandle }
  const hook = renderHook(({ artworkId }) => useCompanion({ ownerId: 'child', token: 'test-child-token', artworkId, locale: 'zh', enabled: true, allowDrawing: true,
    canvas, aspect: () => 1.4, surfaceSize: () => ({ width: 840, height: 600 }), onSpeak, onCommitted: vi.fn() }), { initialProps: { artworkId: 'one' } })
  return { ...hook, state, commit, onSpeak }
}
async function propose(hook: ReturnType<typeof setup>) {
  vi.mocked(authFetch).mockResolvedValueOnce({ status: 'proposed', reply: plan.summary, plan })
  await act(async () => { await hook.result.current.receive(plan.request) })
}
async function draw(hook: ReturnType<typeof setup>) {
  await propose(hook)
  vi.mocked(authFetch).mockResolvedValueOnce(rendered())
  await act(async () => { await hook.result.current.confirmSceneIdea() })
}

test.each(['画一个太阳', '我想画一个太阳', '在左上角画一个太阳', '帮我画一个红色的太阳', '画一个太阳在左上角', '画一只猫',
  '画一本迪士尼故事书', '画一本童话故事书', 'draw a Disney storybook'])('simple instruction stays direct: %s', text => {
  expect(needsSceneIdea(text)).toBe(false)
})
test.each(['画一个迪士尼那样梦幻的场景', '我想画迪士尼那样的梦幻场景', '童话故事里的森林', '帮我画一个童话世界', '画一个星光森林的场景'])('scene needs a child decision: %s', text => {
  expect(needsSceneIdea(text)).toBe(true)
})
test.each(['可以', '好，就这样画', '可以，就这样画', 'yes please'])('natural approval: %s', text => expect(sceneAnswer(text)).toBe('yes'))
test('a corrected approval never silently draws', () => expect(sceneAnswer('好，不过不要城堡，换成树屋')).toBe('change'))
test('plan is separate from drawing and approval uses the same complete idea', async () => {
  const hook = setup()
  await propose(hook)
  expect(authFetch).toHaveBeenCalledOnce()
  expect(vi.mocked(authFetch).mock.calls[0][0]).toBe('/nilo/scene')
  expect(hook.result.current.sceneIdea?.plan.title).toBe(plan.title)
  expect(hook.result.current.projection).toBeNull()
  expect(hook.commit).not.toHaveBeenCalled()
  vi.mocked(authFetch).mockResolvedValueOnce(rendered())
  await act(async () => { await hook.result.current.receive('好，就这样画') })
  expect(vi.mocked(authFetch).mock.calls[1][1]?.body).toMatchObject({ stage: 'render', plan })
  expect(hook.result.current.sceneIdea).toBeNull()
  expect(hook.result.current.projection?.scene?.objectIds).toEqual(['castle', 'moon'])
  expect(hook.result.current.phase).toBe('projected')
  expect(hook.commit).not.toHaveBeenCalled()
})
test('asking to revise keeps the idea, speaks an invitation, and makes no model request', async () => {
  const hook = setup(); await propose(hook)
  act(() => hook.result.current.reviseSceneIdea())
  expect(hook.result.current.sceneIdea?.editing).toBe(true)
  expect(hook.onSpeak.mock.lastCall?.[0]).toContain('麦克风')
  expect(authFetch).toHaveBeenCalledOnce()
  expect(hook.result.current.projection).toBeNull()
})

test('a failed scene retains its full request for an explicit retry, without treating retry as a new idea', async () => {
  const hook = setup()
  const request = '我想画一个魔法世界'
  vi.mocked(authFetch).mockResolvedValueOnce({ status: 'unavailable', reason: 'invalid_plan' })
  await act(async () => { await hook.result.current.receive(request) })
  expect(hook.onSpeak.mock.lastCall?.[0]).toContain('再试一次')
  expect(hook.commit).not.toHaveBeenCalled()
  vi.mocked(authFetch).mockResolvedValueOnce({ status: 'proposed', reply: plan.summary, plan })
  await act(async () => { await hook.result.current.receive('再试一次') })
  expect(vi.mocked(authFetch).mock.lastCall?.[1]?.body).toMatchObject({ stage: 'plan', utterance: request })
  expect(hook.result.current.sceneIdea?.plan).toEqual(sanitizeScenePlan(plan))
  expect(hook.result.current.projection).toBeNull()
  expect(hook.commit).not.toHaveBeenCalled()
})

test('a failed scene is not retried in another artwork', async () => {
  const hook = setup()
  vi.mocked(authFetch).mockResolvedValueOnce({ status: 'unavailable', reason: 'invalid_plan' })
  await act(async () => { await hook.result.current.receive('我想画一个魔法世界') })
  hook.rerender({ artworkId: 'another' })
  vi.mocked(authFetch).mockResolvedValueOnce({ reply: '想画些什么？', proposals: [] })
  await act(async () => { await hook.result.current.receive('再试一次') })
  expect(vi.mocked(authFetch).mock.lastCall?.[0]).not.toBe('/nilo/scene')
})
test('a child correction goes back to planning, never executes an unaccepted change', async () => {
  const hook = setup(); await propose(hook)
  const revised = { ...plan, title: '森林', summary: '我们画一片森林，好吗？' }
  vi.mocked(authFetch).mockResolvedValueOnce({ status: 'proposed', plan: revised })
  await act(async () => { await hook.result.current.receive('不要城堡，换成森林') })
  expect(vi.mocked(authFetch).mock.lastCall?.[1]?.body).toMatchObject({ stage: 'plan', plan, utterance: '不要城堡，换成森林' })
  expect(hook.result.current.projection).toBeNull()
  expect(hook.result.current.sceneIdea?.plan.title).toBe('森林')
})
test('a cancelled render can never appear later', async () => {
  const hook = setup(); await propose(hook)
  let finish!: (value: unknown) => void
  vi.mocked(authFetch).mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  let work!: Promise<void> | undefined
  act(() => { work = hook.result.current.confirmSceneIdea() })
  act(() => hook.result.current.interrupt())
  await act(async () => { finish(rendered()); await work })
  expect(hook.result.current.projection).toBeNull()
  expect(hook.result.current.sceneIdea).toBeNull()
})
test('a partial or renamed result cannot replace the accepted scene', async () => {
  const hook = setup(); await propose(hook)
  const incomplete = rendered(); incomplete.objects.pop()
  vi.mocked(authFetch).mockResolvedValueOnce(incomplete)
  await act(async () => { await hook.result.current.confirmSceneIdea() })
  expect(hook.result.current.projection).toBeNull()
  expect(hook.result.current.sceneIdea?.plan.title).toBe(plan.title)
  expect(hook.result.current.message).toContain('还没画好')
})
test('a named local edit keeps unrelated objects unchanged and undo restores it', async () => {
  const hook = setup(); await draw(hook)
  const before = structuredClone(hook.result.current.projection)
  await act(async () => { await hook.result.current.receive('把城堡变成粉色') })
  expect(authFetch).toHaveBeenCalledTimes(2)
  expect(hook.result.current.projection?.proposal.color).not.toBe(before?.proposal.color)
  expect(hook.result.current.projection?.additions).toEqual(before?.additions)
  await act(async () => { await hook.result.current.receive('撤销') })
  expect(hook.result.current.projection).toEqual(before)
})
test('a named move stays direct and a missing named object does not modify the selection', async () => {
  const hook = setup(); await draw(hook)
  const before = hook.result.current.projection!.proposal.x
  await act(async () => { await hook.result.current.receive('把城堡往左挪一点') })
  expect(hook.result.current.projection!.proposal.x).toBeLessThan(before)
  expect(authFetch).toHaveBeenCalledTimes(2)
  act(() => hook.result.current.selectSceneObject('castle'))
  const saved = structuredClone(hook.result.current.projection)
  await act(async () => { await hook.result.current.receive('把小船变成蓝色') })
  expect(hook.result.current.projection).toEqual(saved)
  expect(authFetch).toHaveBeenCalledTimes(2)
})
test('scene objects, palette and semantic identity persist as a tracing-only guide', async () => {
  const hook = setup(); await draw(hook)
  const p = hook.result.current.projection!
  const saved = validateTracingGuide(JSON.parse(JSON.stringify({ id: p.id, aspect: p.aspect, proposal: p.proposal, additions: p.additions, scene: p.scene })))
  expect(saved?.scene?.plan).toEqual(sanitizeScenePlan(plan))
  expect(saved?.scene?.objectIds).toEqual(['castle', 'moon'])
  expect(saved?.scene?.view).toBe('outline')
  const legacy = validateTracingGuide(JSON.parse(JSON.stringify({ ...saved, scene: { ...saved!.scene, view: 'color' } })))
  expect(legacy).toEqual(saved)
  expect(hook.commit).not.toHaveBeenCalled()
})
test('deleting the only main object leaves a valid, persistable scene', () => {
  const ready = rendered(), proposals = ready.objects.map(o => o.proposal)
  const scene = { plan, objectIds: ['castle', 'moon'], view: 'color' as const }
  const result = editSceneLocally('删掉城堡', scene, proposals)
  expect(result.status).toBe('edited')
  if (result.status === 'edited') expect(validateSceneGuide(result.scene, result.proposals)).not.toBeNull()
})
test('simple drawing never shows a scene confirmation card', async () => {
  const hook = setup()
  const p: DrawingProposal = { template: 'sun', x: .1, y: .1, width: .15, height: .15, rotation: 0, color: '#edcd70', strokeWidth: 3, target: '太阳', relation: '画在左上角' }
  vi.mocked(authFetch).mockResolvedValueOnce({ status: 'ready', reply: '太阳来啦。', proposal: p })
  await act(async () => { await hook.result.current.receive('在左上角画一个太阳') })
  expect(vi.mocked(authFetch).mock.calls[0][0]).toBe('/nilo/companion')
  expect(hook.result.current.sceneIdea).toBeNull()
  expect(hook.result.current.projection?.proposal.template).toBe('sun')
})

test.each(['我想画迪士尼那样的梦幻场景', '童话故事里的森林'])('the full setting request reaches scene planning unchanged: %s', async request => {
  const hook = setup()
  vi.mocked(authFetch).mockResolvedValueOnce({ status: 'proposed', plan: { ...plan, request } })
  await act(async () => { await hook.result.current.receive(request) })
  expect(authFetch).toHaveBeenCalledOnce()
  expect(vi.mocked(authFetch).mock.calls[0]).toMatchObject(['/nilo/scene', { body: { stage: 'plan', utterance: request, context: { requestScope: 'scene' } } }])
  expect(hook.result.current.sceneIdea?.plan.request).toBe(request)
  expect(hook.result.current.projection).toBeNull()
  expect(hook.commit).not.toHaveBeenCalled()
})

test('an explicitly requested Disney storybook remains a single book request without scene confirmation', async () => {
  const hook = setup(), request = '画一本迪士尼故事书'
  const bookPlan: ScenePlan = { ...structuredClone(plan), objects: [{ ...structuredClone(plan.objects[1]), id: 'book', name: '迪士尼故事书',
    role: 'main', aliases: ['书'], essential: ['封面', '书页'], render: { kind: 'recipe', recipeId: 'book-0' } }] }
  const proposal = rendered(bookPlan).objects[0].proposal
  vi.mocked(authFetch).mockResolvedValueOnce({ reply: '书的底图准备好了。', proposal })
  await act(async () => { await hook.result.current.receive(request) })
  expect(vi.mocked(authFetch).mock.calls[0]).toMatchObject(['/nilo/companion', { body: { context: { utterance: request, requestDrawing: true } } }])
  expect(hook.result.current.sceneIdea).toBeNull()
  expect(hook.result.current.projection?.proposal.subject).toBe('迪士尼故事书')
  expect(hook.commit).not.toHaveBeenCalled()
})

test.each(['画城堡旁的一本书', '在城堡旁画一本书'])('a concrete relational drawing retains the full relation through direct scene planning and rendering: %s', async request => {
  const hook = setup()
  const related: ScenePlan = { ...structuredClone(plan), request, objects: [structuredClone(plan.objects[0]), {
    ...structuredClone(plan.objects[1]), id: 'book', name: '书', role: 'support', aliases: [], essential: ['封面', '书页'],
    render: { kind: 'recipe', recipeId: 'book-0' },
  }] }
  vi.mocked(authFetch).mockResolvedValueOnce({ status: 'proposed', plan: related }).mockResolvedValueOnce(rendered(related))
  await act(async () => { await hook.result.current.receive(request) })
  expect(authFetch).toHaveBeenCalledTimes(2)
  expect(vi.mocked(authFetch).mock.calls[0]).toMatchObject(['/nilo/scene', { body: { stage: 'plan', utterance: request, context: { requestScope: 'object' } } }])
  expect(vi.mocked(authFetch).mock.calls[1]).toMatchObject(['/nilo/scene', { body: { stage: 'render', utterance: request } }])
  expect(hook.result.current.sceneIdea).toBeNull()
  expect(hook.result.current.projection?.scene?.objectIds).toEqual(['castle', 'book'])
  expect(hook.commit).not.toHaveBeenCalled()
})

test.each(['童话故事里的森林是什么样的？', '怎么画迪士尼那样的梦幻场景', '怎么画城堡旁的一本书', '我画的城堡旁边有一本书'])('a setting discussion or drawing tutorial does not begin scene rendering: %s', async request => {
  const hook = setup()
  vi.mocked(authFetch).mockResolvedValueOnce({ reply: '我们可以先聊聊你的想法。' })
  await act(async () => { await hook.result.current.receive(request) })
  expect(authFetch).toHaveBeenCalledOnce()
  expect(vi.mocked(authFetch).mock.calls[0]).toMatchObject(['/nilo/companion', { body: { context: { requestDrawing: false } } }])
  expect(hook.result.current.sceneIdea).toBeNull()
  expect(hook.result.current.projection).toBeNull()
  expect(hook.commit).not.toHaveBeenCalled()
})

test('planning speaks a short acknowledgement before the request resolves and consecutive acknowledgements differ', async () => {
  vi.spyOn(Math, 'random').mockReturnValue(0)
  const hook = setup()
  const acknowledgements: string[] = []
  for (let i = 0; i < 3; i++) {
    let finish!: (value: unknown) => void
    vi.mocked(authFetch).mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    let work!: Promise<void>
    const previousSpeechCount = hook.onSpeak.mock.calls.length
    act(() => { work = hook.result.current.receive(plan.request) })
    expect(hook.result.current.phase).toBe('thinking')
    expect(hook.result.current.sceneIdea).toBeNull()
    expect(hook.onSpeak).toHaveBeenCalledTimes(previousSpeechCount + 1)
    const acknowledgement = hook.onSpeak.mock.lastCall![0] as string
    expect(hook.onSpeak.mock.lastCall![1]).toEqual({ resumeListening: false })
    expect(acknowledgement.length).toBeLessThanOrEqual(24)
    expect(acknowledgement).toMatch(/想/)
    expect(hook.onSpeak.mock.invocationCallOrder.at(-1)!).toBeLessThan(vi.mocked(authFetch).mock.invocationCallOrder.at(-1)!)
    if (acknowledgements.length) expect(acknowledgement).not.toBe(acknowledgements.at(-1))
    acknowledgements.push(acknowledgement)
    await act(async () => { finish({ status: 'proposed', reply: plan.summary, plan }); await work })
    expect(hook.onSpeak.mock.lastCall![1]?.resumeListening).not.toBe(false)
    act(() => hook.result.current.dismissSceneIdea())
  }
  expect(hook.commit).not.toHaveBeenCalled()
})

test('silent scene requests still show the thinking message without invoking speech', async () => {
  const hook = setup()
  let finish!: (value: unknown) => void
  vi.mocked(authFetch).mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  let work!: Promise<void>
  act(() => { work = hook.result.current.receive(plan.request, { speak: false }) })
  expect(hook.result.current.message).toMatch(/想/)
  expect(hook.onSpeak).not.toHaveBeenCalled()
  await act(async () => { finish({ status: 'proposed', plan }); await work })
  expect(hook.onSpeak).not.toHaveBeenCalled()
})

test.each(['画一座长翅膀的城堡', '画一只戴宇航员头盔的兔子', '画一座会游泳的城堡', 'draw a winged castle'])('a specified novel object qualifies for direct composition: %s', text => {
  expect(isCompositeDrawingRequest(text)).toBe(true)
})

test('a specified new shape automatically plans then renders, without exposing a confirmation card between stages', async () => {
  const hook = setup(), request = '画一座长翅膀的城堡'
  const unusual: ScenePlan = { ...structuredClone(plan), title: '翅膀城堡', request, summary: '一座长着翅膀的城堡。', objects: [{
    ...structuredClone(plan.objects[0]), name: '翅膀城堡', essential: ['翅膀', '城门'],
    render: { kind: 'compose', primitive: 'castle', parameters: { towers: 3, wings: true } },
  }] }
  let finishPlan!: (value: unknown) => void, finishRender!: (value: unknown) => void
  vi.mocked(authFetch)
    .mockImplementationOnce(() => new Promise(resolve => { finishPlan = resolve }))
    .mockImplementationOnce(() => new Promise(resolve => { finishRender = resolve }))
  let work!: Promise<void>
  act(() => { work = hook.result.current.receive(request) })
  expect(vi.mocked(authFetch).mock.calls[0]).toMatchObject(['/nilo/scene', { body: { stage: 'plan', context: { requestScope: 'object' } } }])
  expect(hook.result.current.sceneIdea).toBeNull()
  await act(async () => { finishPlan({ status: 'proposed', plan: unusual }); await Promise.resolve() })
  expect(authFetch).toHaveBeenCalledTimes(2)
  expect(vi.mocked(authFetch).mock.calls[1]).toMatchObject(['/nilo/scene', { body: { stage: 'render', utterance: request, plan: unusual } }])
  expect(hook.result.current.sceneIdea).toBeNull()
  expect(hook.result.current.projection).toBeNull()
  expect(hook.result.current.phase).toBe('thinking')
  await act(async () => { finishRender(rendered(unusual)); await work })
  expect(hook.result.current.sceneIdea).toBeNull()
  expect(hook.result.current.projection?.scene?.plan.objects[0].essential).toContain('翅膀')
  expect(hook.result.current.phase).toBe('projected')
  expect(hook.commit).not.toHaveBeenCalled()
})

test.each(['plan', 'render'] as const)('stopping an in-flight %s preserves the previously accepted scene and ignores the late response', async stage => {
  for (const command of ['停止', '取消', '先不要了']) {
    const hook = setup(); await draw(hook)
    const previous = structuredClone(hook.result.current.projection!)
    const revised = { ...structuredClone(plan), title: '新的星光城堡', summary: '给城堡加更多星光。' }
    if (stage === 'render') {
      vi.mocked(authFetch).mockResolvedValueOnce({ status: 'proposed', plan: revised })
      await act(async () => { await hook.result.current.receive('画一个新的梦幻场景') })
    }
    let finish!: (value: unknown) => void
    vi.mocked(authFetch).mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    let work!: Promise<void> | undefined
    act(() => { work = stage === 'plan' ? hook.result.current.receive('画一个新的梦幻场景') : hook.result.current.confirmSceneIdea() })
    const signal = vi.mocked(authFetch).mock.lastCall![1]!.signal!
    expect(signal.aborted).toBe(false)
    await act(async () => { await hook.result.current.receive(command) })
    expect(signal.aborted, command).toBe(true)
    expect(hook.result.current.phase, command).toBe('projected')
    expect(hook.result.current.sceneIdea, command).toBeNull()
    const preserved = hook.result.current.projection!
    expect(preserved.proposal, command).toEqual(previous.proposal)
    expect(preserved.additions, command).toEqual(previous.additions)
    expect(preserved.scene, command).toEqual(previous.scene)
    await act(async () => { finish(stage === 'plan' ? { status: 'proposed', plan: revised } : rendered(revised)); await work })
    expect(hook.result.current.projection, command).toEqual(preserved)
    expect(hook.result.current.sceneIdea, command).toBeNull()
    expect(hook.commit).not.toHaveBeenCalled()
    hook.unmount()
  }
})

test.each([
  ['画太阳', '太阳', 'sun-0'], ['画小猫', '小猫', 'cat-0'], ['给我画恐龙', '恐龙', 'dinosaur-2'],
])('short drawing request %s adds to the existing scene instead of replacing its objects', async (utterance, name, recipeId) => {
  const hook = setup(); await draw(hook)
  const previous = structuredClone(hook.result.current.projection!)
  const extended: ScenePlan = { ...structuredClone(previous.scene!.plan), request: utterance, objects: [
    ...structuredClone(previous.scene!.plan.objects),
    { id: 'new-object', name, aliases: [], role: 'support', essential: [name], render: { kind: 'recipe', recipeId },
      box: { x: .08, y: .7, width: .15, height: .15 }, color: '#dcbf66' },
  ] }
  vi.mocked(authFetch).mockResolvedValueOnce({ status: 'proposed', plan: extended }).mockResolvedValueOnce(rendered(extended))
  await act(async () => { await hook.result.current.receive(utterance) })
  expect(vi.mocked(authFetch).mock.calls[2]).toMatchObject(['/nilo/scene', { body: { stage: 'plan', context: { requestScope: 'object', previousScene: { plan: previous.scene!.plan } } } }])
  expect(vi.mocked(authFetch).mock.calls[3]).toMatchObject(['/nilo/scene', { body: { stage: 'render' } }])
  expect(hook.result.current.sceneIdea).toBeNull()
  const result = hook.result.current.projection!
  expect(result.scene?.objectIds).toEqual(['castle', 'moon', 'new-object'])
  expect(result.proposal).toEqual(previous.proposal)
  expect(result.additions[0]).toEqual(previous.additions[0])
  expect(hook.commit).not.toHaveBeenCalled()
})

test.each(['你觉得画太阳会不会更好看？', '请教我怎么画太阳', 'How do I draw a sun?'])('drawing advice %s keeps the scene and does not force an addition', async utterance => {
  const hook = setup(); await draw(hook)
  const previous = structuredClone(hook.result.current.projection!)
  vi.mocked(authFetch).mockResolvedValueOnce({ reply: '可以先试着画一个圆。' })
  await act(async () => { await hook.result.current.receive(utterance) })
  expect(vi.mocked(authFetch).mock.lastCall).toMatchObject(['/nilo/companion', { body: { context: { requestDrawing: false } } }])
  expect(hook.result.current.sceneIdea).toBeNull()
  expect(hook.result.current.projection?.proposal).toEqual(previous.proposal)
  expect(hook.result.current.projection?.additions).toEqual(previous.additions)
  expect(hook.result.current.projection?.scene).toEqual(previous.scene)
})

test('a short, explicit simple drawing replaces an unaccepted scene idea without another confirmation', async () => {
  const hook = setup(); await propose(hook)
  const proposal: DrawingProposal = { template: 'sun', x: .1, y: .1, width: .15, height: .15, rotation: 0,
    color: '#edcd70', strokeWidth: 3, target: '太阳', relation: '画在左上角' }
  vi.mocked(authFetch).mockResolvedValueOnce({ reply: '太阳来啦。', proposal })
  await act(async () => { await hook.result.current.receive('画太阳') })
  expect(vi.mocked(authFetch).mock.lastCall).toMatchObject(['/nilo/companion', { body: { context: { requestDrawing: true } } }])
  expect(hook.result.current.sceneIdea).toBeNull()
  expect(hook.result.current.projection?.proposal.template).toBe('sun')
  expect(hook.commit).not.toHaveBeenCalled()
})

test('scene material choices ask for a target and only show that object, including PNG and SVG drawings', async () => {
  const hook = setup(); await draw(hook)
  const original = hook.result.current.projection
  await act(async () => { await hook.result.current.openMaterialPicker() })
  expect(hook.result.current.materialPicker).toBeNull()
  expect(hook.result.current.message).toContain('先点下面想换的物品')
  expect(hook.result.current.projection).toBe(original)
  act(() => hook.result.current.selectSceneObject('moon'))
  await act(async () => { await hook.result.current.openMaterialPicker() })
  const picker = hook.result.current.materialPicker!
  expect(picker).toMatchObject({ objectId: 'moon', targetName: '月亮', subject: 'moon' })
  expect(picker.subjects.map(group => group.subject)).toEqual(['moon'])
  expect(picker.subjects[0].materials.map(material => material.kind)).toEqual(expect.arrayContaining(['recipe', 'illustration']))
  const selected = hook.result.current.projection
  await act(async () => { await hook.result.current.chooseMaterial('cat-0') })
  expect(hook.result.current.projection).toBe(selected)
  expect(authFetch).toHaveBeenCalledTimes(2)
  expect(hook.commit).not.toHaveBeenCalled()
})

test('switching a scene object between PNG and SVG preserves layout, other objects, save data and future scene requests', async () => {
  const hook = setup(); await draw(hook)
  act(() => { hook.result.current.selectSceneObject('moon'); hook.result.current.editSceneObject('moon', { rotation: 17 }) })
  const original = structuredClone(hook.result.current.projection!)
  for (const id of ['illustration-library-moon-beginner-01', 'moon-0']) {
    await act(async () => { await hook.result.current.openMaterialPicker() })
    await act(async () => { await hook.result.current.chooseMaterial(id) })
    const updated = hook.result.current.projection!
    expect(updated.proposal).toEqual(original.proposal)
    expect(updated.scene!.plan.objects[0]).toEqual(original.scene!.plan.objects[0])
    const { x, y, width, height, rotation, color } = original.additions[0]
    expect(updated.additions[0]).toMatchObject({ x, y, width, height, rotation, color, subject: '月亮' })
    expect(updated.scene!.selectedId).toBe('moon')
    expect(updated.scene!.plan.objects[1].render).toEqual(id === 'moon-0' ? { kind: 'recipe', recipeId: id } : { kind: 'illustration', illustrationId: id })
    expect(updated.tracing).toBe(true)
    const restored = validateTracingGuide(JSON.parse(JSON.stringify(updated)))!
    expect(restored.scene?.plan).toEqual(updated.scene!.plan)
    expect(restored.additions).toEqual(updated.additions)
    expect(() => sanitizeSceneInput({ stage: 'plan', utterance: '再加一颗星星', plan: restored.scene!.plan, context: {
      previousScene: { plan: restored.scene!.plan, objects: [restored.proposal, ...restored.additions].map((proposal, index) => ({
        id: restored.scene!.objectIds[index], name: restored.scene!.plan.objects[index].name, proposal,
      })) },
    } })).not.toThrow()
    await act(async () => { await hook.result.current.openMaterialPicker() })
    expect(hook.result.current.materialPicker?.currentMaterialId).toBe(id)
    act(() => hook.result.current.closeMaterialPicker())
  }
  await act(async () => { await hook.result.current.receive('撤销') })
  expect(hook.result.current.projection!.additions[0].illustrationId).toBe('illustration-library-moon-beginner-01')
  await act(async () => { await hook.result.current.receive('撤销') })
  expect(hook.result.current.projection).toEqual(original)
  expect(authFetch).toHaveBeenCalledTimes(2)
  expect(hook.commit).not.toHaveBeenCalled()
})

test('changing a connected destination preserves the road geometry and detaches stale connection metadata through save and undo', async () => {
  const hook = setup(), connected = structuredClone(plan)
  connected.objects[0] = { ...connected.objects[0], id: 'tree', name: '小树', aliases: ['树'], essential: ['树干和树冠'], render: { kind: 'compose', primitive: 'tree' }, rotation: 180 }
  connected.objects.push({ id: 'path', name: '小路', aliases: ['路'], role: 'support', essential: ['弯弯的小路'],
    render: { kind: 'compose', primitive: 'path', parameters: { curve: 'left' } }, connectTo: 'tree',
    box: { x: .3, y: .61, width: .24, height: .24 }, color: '#66729b' })
  vi.mocked(authFetch).mockResolvedValueOnce({ status: 'proposed', plan: connected, reply: connected.summary })
  await act(async () => { await hook.result.current.receive(connected.request) })
  const response = rendered(connected); response.objects[0].proposal.rotation = 180
  vi.mocked(authFetch).mockResolvedValueOnce(response)
  await act(async () => { await hook.result.current.confirmSceneIdea() })
  act(() => hook.result.current.selectSceneObject('tree'))
  const before = structuredClone(hook.result.current.projection!)
  expect(before.scene!.plan.objects[2].connectTo).toBe('tree')
  await act(async () => { await hook.result.current.openMaterialPicker() })
  await act(async () => { await hook.result.current.chooseMaterial('illustration-library-tree-beginner-01') })
  const after = hook.result.current.projection!
  expect(after.proposal.illustrationId).toBe('illustration-library-tree-beginner-01')
  expect(after.proposal.rotation).toBe(180)
  expect(after.scene!.plan.objects[0].rotation).toBe(180)
  expect(after.additions).toEqual(before.additions)
  expect(after.scene!.plan.objects[1]).toEqual(before.scene!.plan.objects[1])
  expect(after.scene!.plan.objects[2]).toEqual(expect.objectContaining({ id: 'path', box: before.scene!.plan.objects[2].box }))
  expect(after.scene!.plan.objects[2]).not.toHaveProperty('connectTo')
  const restored = validateTracingGuide(JSON.parse(JSON.stringify(after)))!
  expect(restored.scene!.plan.objects[2]).not.toHaveProperty('connectTo')
  expect(restored.proposal.rotation).toBe(180)
  const next = sanitizeSceneInput({ stage: 'plan', utterance: '再加一颗星星', plan: restored.scene!.plan, context: {
    previousScene: { plan: restored.scene!.plan, objects: [restored.proposal, ...restored.additions].map((proposal, index) => ({ id: restored.scene!.objectIds[index], proposal })) },
  } })
  expect(next.plan!.objects[2]).not.toHaveProperty('connectTo')
  await act(async () => { await hook.result.current.receive('撤销') })
  expect(hook.result.current.projection).toEqual(before)
  expect(hook.commit).not.toHaveBeenCalled()
  expect(authFetch).toHaveBeenCalledTimes(2)
})

test('a decorated scene object uses its known shape identity, never a substring or an unrelated catalogue', async () => {
  const hook = setup(), decorated = structuredClone(plan)
  decorated.objects[1].name = '星光里的弯月'
  decorated.objects[1].aliases = ['发光的小伙伴']
  vi.mocked(authFetch).mockResolvedValueOnce({ status: 'proposed', plan: decorated, reply: decorated.summary })
  await act(async () => { await hook.result.current.receive(decorated.request) })
  vi.mocked(authFetch).mockResolvedValueOnce(rendered(decorated))
  await act(async () => { await hook.result.current.confirmSceneIdea() })
  act(() => hook.result.current.selectSceneObject('moon'))
  await act(async () => { await hook.result.current.openMaterialPicker() })
  expect(hook.result.current.materialPicker?.subjects.map(group => group.subject)).toEqual(['moon'])
  await act(async () => { await hook.result.current.chooseMaterial('moon-0') })
  expect(hook.result.current.projection!.additions[0].subject).toBe('星光里的弯月')
  expect(hook.result.current.projection!.scene!.plan.objects[1].name).toBe('星光里的弯月')
  await act(async () => { await hook.result.current.openMaterialPicker() })
  await act(async () => { await hook.result.current.chooseMaterial('illustration-library-moon-beginner-01') })
  const replaced = hook.result.current.projection!
  expect(replaced.additions[0].illustrationId).toBe('illustration-library-moon-beginner-01')
  expect(replaced.scene!.plan.objects[1].name).toBe(replaced.additions[0].subject)
  expect(replaced.scene!.plan.objects[1].aliases).toContain('星光里的弯月')
})

test('a pending scene material choice cannot replace a different selected object', async () => {
  const hook = setup(); await draw(hook)
  act(() => hook.result.current.selectSceneObject('moon'))
  await act(async () => { await hook.result.current.openMaterialPicker() })
  const original = structuredClone(hook.result.current.projection!)
  let finish!: () => void
  vi.mocked(refreshMaterialCuration).mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  let pending!: Promise<void>
  act(() => { pending = hook.result.current.chooseMaterial('moon-0') })
  act(() => hook.result.current.selectSceneObject('castle'))
  await act(async () => { finish(); await pending })
  expect(hook.result.current.materialPicker).toBeNull()
  expect(hook.result.current.projection?.scene?.selectedId).toBe('castle')
  expect(hook.result.current.projection?.proposal).toEqual(original.proposal)
  expect(hook.result.current.projection?.additions).toEqual(original.additions)
  expect(hook.result.current.materialChoices).toEqual([])
})

test('the only scene object offers its own drawings without requiring selection', async () => {
  const hook = setup(); await draw(hook)
  await act(async () => { await hook.result.current.receive('删除城堡') })
  await act(async () => { await hook.result.current.openMaterialPicker() })
  expect(hook.result.current.materialPicker).toMatchObject({ objectId: 'moon', subject: 'moon' })
  expect(hook.result.current.materialPicker?.subjects.map(group => group.subject)).toEqual(['moon'])
})

test('another drawing style asks for a scene target, then uses the selected object without replacing the scene', async () => {
  const hook = setup(); await draw(hook)
  const previous = structuredClone(hook.result.current.projection!)
  await act(async () => { await hook.result.current.receive('换个画法') })
  expect(authFetch).toHaveBeenCalledTimes(2)
  expect(hook.result.current.message).toContain('想改哪一个')
  expect(hook.result.current.projection).toEqual(previous)

  act(() => hook.result.current.selectSceneObject('moon'))
  vi.mocked(authFetch).mockResolvedValueOnce({ status: 'proposed', plan: { ...plan, summary: '给月亮换一种画法，好吗？' } })
  await act(async () => { await hook.result.current.receive('换个画法') })
  expect(vi.mocked(authFetch).mock.lastCall).toMatchObject(['/nilo/scene', { body: { stage: 'plan', plan: previous.scene!.plan,
    utterance: expect.stringContaining('“月亮”') } }])
  expect(hook.result.current.projection?.proposal).toEqual(previous.proposal)
  expect(hook.result.current.projection?.additions).toEqual(previous.additions)
  expect(hook.result.current.sceneIdea?.plan.summary).toContain('月亮')
  expect(hook.commit).not.toHaveBeenCalled()
})

test('another drawing style can target the sole remaining scene object without a selection', async () => {
  const hook = setup(); await draw(hook)
  await act(async () => { await hook.result.current.receive('删除城堡') })
  const previous = structuredClone(hook.result.current.projection!)
  expect(previous.scene?.objectIds).toEqual(['moon'])
  vi.mocked(authFetch).mockResolvedValueOnce({ status: 'proposed', plan: previous.scene!.plan })
  await act(async () => { await hook.result.current.alternative() })
  expect(vi.mocked(authFetch).mock.lastCall).toMatchObject(['/nilo/scene', { body: { stage: 'plan', plan: previous.scene!.plan,
    utterance: expect.stringContaining('“月亮”') } }])
  expect(hook.result.current.projection?.proposal).toEqual(previous.proposal)
  expect(hook.result.current.projection?.additions).toEqual(previous.additions)
  expect(hook.result.current.projection?.scene).toEqual(previous.scene)
})
