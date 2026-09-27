import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { authFetch } from '@/lib/api/authFetch'
import { useCompanion } from '@/features/child/hooks/useCompanion'
import type { CompanionVoiceController } from '@/features/child/hooks/useCompanionVoice'
import type { DrawingCanvasHandle } from '@/features/child/components/DrawingCanvas'
import { CompanionDock } from '@/features/child/components/CompanionDock'
import { SceneProjection } from '@/features/child/components/SceneProjection'
import { validateProposal, type DrawingProposal } from '@/features/child/companion/proposals'
import { validateTracingGuide, type TracingGuide } from '@/features/child/companion/tracingGuide'
import { loadIllustrationTrace, type IllustrationTrace } from '@/features/child/companion/illustrationTracing'
import { compileSceneObject, scenePalette, type ScenePlan } from '../../shared/niloSceneDrawing.mjs'

vi.mock('@/lib/api/authFetch', () => ({ authFetch: vi.fn() }))
vi.mock('@/features/child/companion/materialCuration', () => ({ refreshMaterialCuration: vi.fn(async () => {}) }))
vi.mock('@/features/child/companion/illustrationTracing', async importOriginal => ({
  ...await importOriginal<typeof import('@/features/child/companion/illustrationTracing')>(), loadIllustrationTrace: vi.fn(),
}))

const plan: ScenePlan = {
  version: 1, title: '月光城堡', summary: '一座云上的城堡，旁边挂着弯弯的月亮。', request: '画一个梦幻场景',
  palette: { ...scenePalette }, preserve: ['保留孩子的小船'], objects: [
    { id: 'castle', name: '城堡', aliases: ['云上城堡'], role: 'main', essential: ['尖屋顶'],
      render: { kind: 'compose', primitive: 'castle', parameters: { towers: 3, roof: 'pointed' } },
      box: { x: .3, y: .35, width: .32, height: .32 }, color: '#bc8bba' },
    { id: 'moon', name: '月亮', aliases: ['月牙'], role: 'support', essential: ['弯弯的'],
      render: { kind: 'compose', primitive: 'moon', parameters: { phase: 'crescent' } },
      box: { x: .73, y: .14, width: .16, height: .16 }, color: '#d9b762' },
  ],
}

function readyScene(scenePlan = plan) {
  return { status: 'ready', plan: structuredClone(scenePlan), objects: scenePlan.objects.map(object => ({
    id: object.id, name: object.name, proposal: validateProposal({ subject: object.name,
      ...object.box, rotation: 0, color: object.color, strokeWidth: 3, brushKind: 'round',
      contribution: 'object', placementPolicy: 'free', target: object.name, relation: '孩子认可的场景构思',
      ...(object.render.kind === 'illustration' ? { template: 'illustration', illustrationId: object.render.illustrationId }
        : { template: 'custom', sketch: compileSceneObject(object)!.sketch }),
    }) as DrawingProposal,
  })) }
}

beforeEach(() => {
  vi.mocked(authFetch).mockReset()
  vi.mocked(loadIllustrationTrace).mockReset().mockResolvedValue({ version: 1, aspect: 1,
    paths: [[[.1, .3], [.5, .2], [.9, .3]], [[.1, .3], [.5, .8], [.9, .3]]] } as IllustrationTrace)
  localStorage.clear()
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
  vi.spyOn(Math, 'random').mockReturnValue(0)
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 600, height: 600 } as DOMRect)
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    setLineDash: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(),
  } as unknown as CanvasRenderingContext2D)
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

function setup(initialGuide?: TracingGuide) {
  const onSpeak = vi.fn(), commit = vi.fn(), onCommitted = vi.fn()
  const voice: CompanionVoiceController = { status: 'idle', error: null, transcript: '', soundOn: true,
    continuous: false, supported: true, voiceReady: true, backend: 'server', start: vi.fn(), stop: vi.fn(),
    cancel: vi.fn(), speak: vi.fn(), toggleSound: vi.fn(), setContinuous: vi.fn() }
  const canvas = { current: {
    getRevision: () => 1, getDocument: () => ({ version: 1, baseSource: 'child', operations: [] }),
    getCompanionScene: () => ({ childBounds: null, niloBounds: null, recentContributions: [] }),
    getOccupancy: (n = 64) => Array(n * n).fill(0), getInkGrid: (n = 8) => Array(n * n).fill(0), getLastStroke: () => null,
    exportObservation: () => 'data:image/png;base64,CHILD', exportCompanionObservation: () => 'data:image/png;base64,CHILD',
    commitCompanionStrokes: commit, previewWithoutObject: vi.fn(), hasInkAt: () => true,
  } as unknown as DrawingCanvasHandle }
  let current!: ReturnType<typeof useCompanion>
  function Harness() {
    current = useCompanion({ ownerId: 'child', artworkId: 'scene-work', locale: 'zh', enabled: true, allowDrawing: true,
      canvas, initialGuide, aspect: () => 1, surfaceSize: () => ({ width: 600, height: 600 }), onSpeak, onCommitted })
    return <>
      <CompanionDock companion={current} voice={voice} mode="together" visible enabled isDrawing={false}
        onVisible={vi.fn()} onInvite={vi.fn()} />
      {current.projection?.scene && <SceneProjection projection={current.projection}
        onEdit={current.editSceneObject} onInteractionStart={voice.cancel} />}
    </>
  }
  render(<Harness />)
  return { current: () => current, voice, onSpeak, commit, onCommitted }
}

async function propose(hook: ReturnType<typeof setup>) {
  vi.mocked(authFetch).mockResolvedValueOnce({ status: 'proposed', plan: structuredClone(plan), reply: plan.summary })
  await act(async () => { await hook.current().receive(plan.request) })
}

async function confirm() {
  vi.mocked(authFetch).mockResolvedValueOnce(readyScene())
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '好，就这样画' })) })
}

function expectOutlineOnly() {
  const overlay = screen.getByLabelText('Nilo 的场景描画轮廓')
  const picture = overlay.querySelector('.nilo-scene-picture')!
  const strokes = [...picture.querySelectorAll('polyline')]
  expect(strokes.length).toBeGreaterThan(2)
  for (const stroke of strokes) {
    expect(stroke.getAttribute('stroke')).toBe('#9ca3af')
    expect(stroke.getAttribute('stroke-dasharray')).toBe('6 5')
    expect(stroke.getAttribute('fill')).toBe('none')
    expect(stroke.getAttribute('points')).not.toMatch(/NaN|Infinity/)
  }
  expect(picture.querySelector('defs, rect, image, linearGradient, radialGradient')).toBeNull()
  expect(screen.queryByRole('button', { name: '看彩色效果' })).toBeNull()
  expect(screen.queryByRole('button', { name: '描画轮廓' })).toBeNull()
  return strokes.map(node => node.getAttribute('points'))
}

test('the idea offers two decisions; revise invites the microphone without recording or rendering', async () => {
  const hook = setup()
  await propose(hook)
  const idea = screen.getByRole('group', { name: '一起决定怎么画' })
  expect(within(idea).getByRole('button', { name: '好，就这样画' })).toBeTruthy()
  const revise = within(idea).getByRole('button', { name: '我想改一改' })
  expect(screen.queryByLabelText('Nilo 的场景描画轮廓')).toBeNull()
  fireEvent.click(revise)
  expect(within(idea).getByText(/麦克风/)).toBeTruthy()
  const firstInvitation = hook.onSpeak.mock.calls.at(-1)![0]
  fireEvent.click(revise)
  const secondInvitation = hook.onSpeak.mock.calls.at(-1)![0]
  expect(secondInvitation).not.toBe(firstInvitation)
  expect(firstInvitation).toContain('麦克风')
  expect(secondInvitation).toContain('麦克风')
  expect(hook.voice.cancel).toHaveBeenCalledTimes(2)
  expect(hook.voice.start).not.toHaveBeenCalled()
  expect(hook.voice.setContinuous).not.toHaveBeenCalled()
  expect(authFetch).toHaveBeenCalledTimes(1)
  expect(hook.commit).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '和 Nilo 说话' }))
  expect(hook.voice.start).toHaveBeenCalledOnce()
  expect(authFetch).toHaveBeenCalledTimes(1)
})

test('the close button dismisses the proposal without drawing or opening the microphone', async () => {
  const hook = setup()
  await propose(hook)
  fireEvent.click(screen.getByRole('button', { name: '收起构思' }))
  expect(screen.queryByRole('group', { name: '一起决定怎么画' })).toBeNull()
  expect(hook.current().projection).toBeNull()
  expect(authFetch).toHaveBeenCalledTimes(1)
  expect(hook.voice.start).not.toHaveBeenCalled()
  expect(hook.commit).not.toHaveBeenCalled()
})

test('confirmation displays every scene object only as an unfilled gray dashed projection', async () => {
  const hook = setup()
  await propose(hook)
  await confirm()
  expect(screen.getByLabelText('Nilo 的场景描画轮廓').querySelectorAll('[data-scene-object]')).toHaveLength(2)
  expectOutlineOnly()
  expect(hook.current().projection?.scene?.view).toBe('outline')
  expect(screen.queryByRole('group', { name: '一起决定怎么画' })).toBeNull()
  await act(async () => { await hook.current().receive('留下来') })
  expect(authFetch).toHaveBeenCalledTimes(2)
  expect(hook.commit).not.toHaveBeenCalled()
  expect(hook.onCommitted).not.toHaveBeenCalled()
})

test('choosing a scene object exposes its own handles and a local color edit preserves the other object', async () => {
  const hook = setup()
  await propose(hook)
  await confirm()
  const snapshot = structuredClone(hook.current().projection!)
  const points = expectOutlineOnly()
  const objects = screen.getByRole('group', { name: '选择场景里的物体' })
  fireEvent.click(within(objects).getByRole('button', { name: '月亮' }))
  expect(within(objects).getByRole('button', { name: '月亮' }).getAttribute('aria-pressed')).toBe('true')
  expect(screen.getByRole('button', { name: '调整 Nilo 投影大小' })).toBeTruthy()
  await act(async () => { await hook.current().receive('把月亮改成蓝色', { speak: false }) })
  const updated = hook.current().projection!
  expect(updated.proposal).toEqual(snapshot.proposal)
  expect(updated.additions[0]).toEqual({ ...snapshot.additions[0], color: '#459fd1' })
  expect(updated.scene!.plan.objects[1].color).toBe('#459fd1')
  expect(expectOutlineOnly()).toEqual(points)
  expect(validateTracingGuide(JSON.parse(JSON.stringify(updated)))?.scene?.objectIds).toEqual(['castle', 'moon'])
  expect(authFetch).toHaveBeenCalledTimes(2)
  expect(hook.voice.start).not.toHaveBeenCalled()
  expect(hook.commit).not.toHaveBeenCalled()
})

test('a legacy color scene restores as the same outline projection without adding authored ink', async () => {
  const ready = readyScene()
  const guide: TracingGuide = { id: 'saved-scene', aspect: 1, proposal: ready.objects[0].proposal,
    additions: ready.objects.slice(1).map(object => object.proposal),
    scene: { plan: ready.plan, objectIds: ready.objects.map(object => object.id), view: 'color' } }
  const hook = setup(guide)
  expectOutlineOnly()
  expect(hook.current().projection?.scene?.view).toBe('outline')
  expect(hook.current().projection?.proposal).toEqual(guide.proposal)
  expect(hook.current().projection?.additions).toEqual(guide.additions)
  expect(validateTracingGuide(JSON.parse(JSON.stringify(guide)))?.scene?.view).toBe('outline')
  await act(async () => { await hook.current().receive('留下来') })
  expect(authFetch).not.toHaveBeenCalled()
  expect(hook.commit).not.toHaveBeenCalled()
  expect(hook.onCommitted).not.toHaveBeenCalled()
})

test('moving and resizing a selected object keeps all scene lines dashed and the other object unchanged', async () => {
  const hook = setup(); await propose(hook); await confirm()
  const before = structuredClone(hook.current().projection!)
  fireEvent.click(screen.getByRole('button', { name: '月亮' }))
  fireEvent.keyDown(screen.getByRole('button', { name: '拖动 Nilo 的投影' }), { key: 'ArrowLeft' })
  const moved = structuredClone(hook.current().projection!)
  expect(moved.additions[0].x).toBeLessThan(before.additions[0].x)
  fireEvent.keyDown(screen.getByRole('button', { name: '调整 Nilo 投影大小' }), { key: '+' })
  const resized = hook.current().projection!
  expect(resized.additions[0].width).toBeGreaterThan(moved.additions[0].width)
  expect(resized.proposal).toEqual(before.proposal)
  expect(resized.scene!.plan.objects[1].box.width).toBe(resized.additions[0].width)
  expectOutlineOnly()
  expect(hook.voice.cancel).toHaveBeenCalled()
  expect(hook.commit).not.toHaveBeenCalled()
  expect(hook.onCommitted).not.toHaveBeenCalled()
})

test('a mixed PNG and SVG scene stays a dashed guide through confirmation, local edits and save/restore', async () => {
  const illustrationId = 'illustration-library-boat-beginner-01'
  const mixed: ScenePlan = { ...structuredClone(plan), objects: [structuredClone(plan.objects[0]), {
    ...structuredClone(plan.objects[1]), id: 'boat', name: '小船', aliases: ['船'], essential: ['船身'],
    render: { kind: 'illustration', illustrationId },
  }] }
  const hook = setup()
  vi.mocked(authFetch).mockResolvedValueOnce({ status: 'proposed', plan: mixed, reply: mixed.summary })
  await act(async () => { await hook.current().receive(mixed.request) })
  expect(screen.getByRole('button', { name: '好，就这样画' })).toBeTruthy()
  expect(hook.current().projection).toBeNull()
  vi.mocked(authFetch).mockResolvedValueOnce(readyScene(mixed))
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '好，就这样画' })) })
  const before = structuredClone(hook.current().projection!)
  expect(before.additions[0].illustrationId).toBe(illustrationId)
  expect(screen.getByLabelText('Nilo 的场景描画轮廓').querySelectorAll('[data-scene-object="boat"] polyline')).toHaveLength(2)
  expectOutlineOnly()
  fireEvent.click(screen.getByRole('button', { name: '小船' }))
  fireEvent.keyDown(screen.getByRole('button', { name: '拖动 Nilo 的投影' }), { key: 'ArrowLeft' })
  fireEvent.keyDown(screen.getByRole('button', { name: '调整 Nilo 投影大小' }), { key: '+' })
  const edited = hook.current().projection!
  expect(edited.additions[0].x).toBeLessThan(before.additions[0].x)
  expect(edited.additions[0].width).toBeGreaterThan(before.additions[0].width)
  expect(edited.additions[0].illustrationId).toBe(illustrationId)
  expect(edited.proposal).toEqual(before.proposal)
  expect(loadIllustrationTrace).toHaveBeenCalledOnce()
  expect(screen.getByLabelText('Nilo 的场景描画轮廓').querySelector('img')).toBeNull()
  expect(screen.queryByRole('button', { name: '看原图' })).toBeNull()
  expect(hook.commit).not.toHaveBeenCalled()
  expect(hook.onCommitted).not.toHaveBeenCalled()
  const saved = validateTracingGuide(JSON.parse(JSON.stringify(edited)))!
  expect(saved.scene!.plan.objects[1].render).toEqual({ kind: 'illustration', illustrationId })
  cleanup()
  const restored = setup(saved)
  await act(async () => { await Promise.resolve() })
  expectOutlineOnly()
  expect(restored.current().projection?.additions[0]).toEqual(edited.additions[0])
  await act(async () => { await restored.current().receive('留下来') })
  expect(restored.commit).not.toHaveBeenCalled()
  expect(restored.onCommitted).not.toHaveBeenCalled()
  expect(authFetch).toHaveBeenCalledTimes(2)
})

test('a scene exposes Choose another and asks for an object first when none is selected', async () => {
  const hook = setup()
  await propose(hook); await confirm()
  const before = structuredClone(hook.current().projection!)
  const replace = screen.getByRole('button', { name: '换一个' }) as HTMLButtonElement
  expect(replace.disabled).toBe(false)
  await act(async () => { fireEvent.click(replace) })
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(screen.getByText(/先点下面想换的物品/)).toBeTruthy()
  expect(hook.current().projection).toEqual(before)
  expect(hook.voice.cancel).toHaveBeenCalled()
  expect(hook.voice.start).not.toHaveBeenCalled()
  expect(authFetch).toHaveBeenCalledTimes(2)
  expect(hook.commit).not.toHaveBeenCalled()
})

test('the scene picker marks the selected supporting object’s current drawing and replaces only that object', async () => {
  const currentId = 'illustration-library-moon-beginner-01'
  const alternativeId = 'illustration-library-moon-medium-01'
  const scenePlan: ScenePlan = { ...structuredClone(plan), objects: [structuredClone(plan.objects[0]), {
    ...structuredClone(plan.objects[1]), render: { kind: 'illustration', illustrationId: currentId },
  }] }
  const ready = readyScene(scenePlan)
  const hook = setup({ aspect: 1, proposal: ready.objects[0].proposal, additions: [ready.objects[1].proposal],
    scene: { plan: ready.plan, objectIds: ['castle', 'moon'], view: 'outline' } })
  await act(async () => { await Promise.resolve() })
  const objects = screen.getByRole('group', { name: '选择场景里的物体' })
  fireEvent.click(within(objects).getByRole('button', { name: '月亮' }))
  const before = structuredClone(hook.current().projection!)
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '换一个' })) })
  const picker = screen.getByRole('dialog', { name: '给月亮换个画法' })
  expect(within(picker).queryByRole('textbox')).toBeNull()
  expect(within(picker).queryByRole('navigation')).toBeNull()
  const choices = within(within(picker).getByRole('region', { name: '可选画法' })).getAllByRole('button')
  expect(choices.every(button => button.getAttribute('aria-label')?.startsWith('选择月亮画法'))).toBe(true)
  const selected = choices.find(button => button.getAttribute('aria-pressed') === 'true')!
  expect(selected.querySelector('img')?.getAttribute('src')).toBe(`/nilo-illustrations/${currentId}.png`)
  expect(selected.textContent).toContain('正在画')
  const replacement = choices.find(button => button.querySelector('img')?.getAttribute('src') === `/nilo-illustrations/${alternativeId}.png`)!
  expect(replacement).toBeTruthy()
  await act(async () => { fireEvent.click(replacement) })
  expect(screen.queryByRole('dialog')).toBeNull()
  const after = hook.current().projection!
  expect(after.proposal).toEqual(before.proposal)
  expect(after.additions[0]).toMatchObject({ illustrationId: alternativeId, x: before.additions[0].x, y: before.additions[0].y,
    width: before.additions[0].width, height: before.additions[0].height })
  expect(after.scene?.objectIds).toEqual(['castle', 'moon'])
  expect(after.scene?.selectedId).toBe('moon')
  expect(hook.commit).not.toHaveBeenCalled()
  expect(hook.onCommitted).not.toHaveBeenCalled()
  expect(hook.voice.start).not.toHaveBeenCalled()
  expect(authFetch).not.toHaveBeenCalled()
})
