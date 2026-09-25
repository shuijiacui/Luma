import { getDrawingRecipe } from '../../shared/niloRecipes.mjs'
import { drawingIllustrations } from '../../shared/niloIllustrations.mjs'
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { authFetch } from '@/lib/api/authFetch'
import { ApiError } from '@/lib/api/client'
import { useCompanion } from '@/features/child/hooks/useCompanion'
import { proposalStrokes, readMemory, saveMemory, type CompanionReply, type DrawingProposal } from '@/features/child/companion/proposals'
import type { DrawingCanvasHandle } from '@/features/child/components/DrawingCanvas'
import type { CanvasDocument } from '@/features/child/canvasDocument'
import type { CompanionScene } from '@/features/child/companionScene'
import { decodeOccupancy } from '../../shared/niloOccupancy.mjs'
import { refreshMaterialCuration } from '@/features/child/companion/materialCuration'
import { getMaterialCuration, setMaterialCuration } from '../../shared/niloCuration.mjs'
import { readMaterialChoices } from '@/features/child/companion/materialPreferences'

vi.mock('@/lib/api/authFetch', () => ({ authFetch: vi.fn() }))
vi.mock('@/features/child/companion/materialCuration', () => ({ refreshMaterialCuration: vi.fn(async () => {}) }))
const proposal: DrawingProposal = { template: 'flame', x: .3, y: .5, width: .15, height: .15, rotation: 0, color: '#e4a86a', strokeWidth: 4, target: '飞船', relation: '飞船的小尾焰' }
const reply: CompanionReply = { reply: '先给你看一小段尾焰。', theme: '飞船', proposal }
const plan: DrawingProposal[] = [
  { ...proposal, template: 'boat', x: .15, y: .58, width: .2, height: .18 },
  { ...proposal, template: 'waves', x: .15, y: .8, width: .24, height: .08 },
  { ...proposal, template: 'sun', x: .65, y: .12, width: .18, height: .2 },
  { ...proposal, template: 'cloud', x: .55, y: .47, width: .24, height: .13 },
]
const robot: DrawingProposal = {
  ...proposal, template: 'custom', subject: '机器人', x: .3, y: .2, width: .24, height: .4,
  target: '孩子想要的机器人', relation: '先预览一个有天线和圆眼睛的机器人', brushKind: 'crayon',
  sketch: { aspect: .8, paths: [
    [['M', .3, .18], ['L', .7, .18], ['L', .7, .45], ['L', .3, .45], ['Z']],
    [['M', .5, .18], ['L', .5, .08]],
    [['E', .4, .3, .025, .025]], [['E', .6, .3, .025, .025]],
    [['M', .25, .5], ['L', .75, .5], ['L', .75, .78], ['L', .25, .78], ['Z']],
    [['M', .35, .78], ['L', .35, .92]], [['M', .65, .78], ['L', .65, .92]],
  ] },
}
beforeEach(() => {
  vi.useFakeTimers(); vi.mocked(authFetch).mockReset(); localStorage.clear()
  vi.mocked(refreshMaterialCuration).mockReset().mockResolvedValue(undefined)
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })))
})
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

function setup(initial: { ownerId: string; artworkId: string | undefined; allowDrawing: boolean; enabled: boolean; tracing?: boolean; preferenceChildId?: string } = { ownerId: 'child-a', artworkId: 'work-a', allowDrawing: true, enabled: true }) {
  const state = {
    revision: 1, occupancy: Array(64 * 64).fill(0),
    document: { version: 1, baseSource: 'child', operations: [] } as CanvasDocument,
    scene: { childBounds: { x: .2, y: .3, width: .3, height: .2 }, niloBounds: null, recentContributions: [{owner:'child',bounds:{x:.2,y:.3,width:.3,height:.2},brushKind:'round',color:'#123456',strokeCount:1}] } as CompanionScene,
  }
  const onSpeak = vi.fn(), onCommitted = vi.fn(), onUnavailable = vi.fn()
  const commit = vi.fn((...args: unknown[]) => { void args; state.revision++; return true })
  const canvas = { current: {
    hasInkAt: vi.fn(() => true),
    getRevision: () => state.revision, getOccupancy: vi.fn(() => state.occupancy), getInkGrid: vi.fn((size = 8) => Array(size * size).fill(0)),
    getLastStroke: () => ({ points: Array.from({ length: 120 }, (_, i) => ({ x: i / 200, y: i / 200 })), color: '#123456', width: 4 }),
    getDocument: () => state.document, getCompanionScene: vi.fn(() => state.scene),
    exportObservation: vi.fn(() => 'data:image/png;base64,CHILD'),
    exportCompanionObservation: vi.fn(() => 'data:image/png;base64,COMPOSITE'), commitCompanionStrokes: commit,
  } as unknown as DrawingCanvasHandle }
  const hook = renderHook(props => useCompanion({ tracing: false, ...props, locale: 'zh', canvas, aspect: () => 1.5,
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

test('a raster illustration is always a persistent guide even in the legacy confirmation workflow', async () => {
  const hook = setup()
  const raster: DrawingProposal = { ...proposal, template: 'illustration', illustrationId: 'illustration-reading-child', subject: '读书的孩子', contribution: 'object', width: .24, height: .3 }
  vi.mocked(authFetch).mockResolvedValueOnce({ reply: '可以看看书页和手的位置。', proposal: raster })
  await act(async () => { await hook.result.current.ask('画一个读书的孩子', true) })
  expect(hook.result.current.phase).toBe('projected')
  expect(hook.result.current.projection?.tracing).toBe(true)
  expect(hook.result.current.projection?.proposal.illustrationId).toBe(raster.illustrationId)
  expect(hook.result.current.message).not.toContain('虚线')
  act(() => hook.result.current.accept())
  expect(hook.commit).not.toHaveBeenCalled()
  const before = hook.result.current.projection!.proposal
  act(() => hook.result.current.edit({ x: before.x + .03, y: before.y - .02 }))
  expect(hook.result.current.projection?.proposal.x).toBeCloseTo(before.x + .03)
  expect(hook.result.current.projection?.proposal.illustrationId).toBe(raster.illustrationId)
  act(() => hook.result.current.dismiss())
  expect(hook.result.current.projection).toBeNull()
  expect(hook.commit).not.toHaveBeenCalled()
})

test('opening and closing material choices never changes the guide or records a model recommendation', async () => {
  const hook = setup({ ownerId: 'child-a', preferenceChildId: 'child-a', artworkId: 'work-a', allowDrawing: true, enabled: true, tracing: true })
  await project(hook)
  const before = structuredClone(hook.result.current.projection)
  await act(async () => { await hook.result.current.openMaterialPicker() })
  expect(hook.result.current.materialPicker?.subject).toBeNull()
  expect(hook.result.current.materialPicker?.subjects.find(item => item.subject === 'cat')).toBeTruthy()
  expect(hook.result.current.materialChoices).toEqual([])
  act(() => hook.result.current.closeMaterialPicker())
  expect(hook.result.current.projection).toEqual(before)
  expect(readMaterialChoices('child-a')).toEqual([])
  expect(authFetch).toHaveBeenCalledOnce()
})

test('only a clicked material changes the guide, keeps child ink and records the child account preference', async () => {
  const hook = setup({ ownerId: 'child-a', preferenceChildId: 'child-a', artworkId: 'work-a', allowDrawing: true, enabled: true, tracing: true })
  const cat: DrawingProposal = { ...proposal, x: .2, y: .2, width: .25, height: .3, template: 'custom', subject: '小猫', recipeId: 'cat-0', sketch: getDrawingRecipe('cat-0')!.sketch }
  vi.mocked(authFetch).mockResolvedValueOnce({ reply: '小猫的底图来啦。', proposal: cat })
  await act(async () => { await hook.result.current.ask('画小猫', true) })
  const before = hook.result.current.projection!.proposal
  hook.state.document.operations.push({ type: 'stroke', owner: 'child', groupId: 'own-lines', color: '#123456', size: 4,
    brushKind: 'pencil', eraser: false, referenceWidth: 900, referenceHeight: 600, points: [{ x: .1, y: .1 }, { x: .2, y: .2 }] })
  const document = structuredClone(hook.state.document)
  await act(async () => { await hook.result.current.openMaterialPicker() })
  expect(hook.result.current.materialPicker?.subject).toBe('cat')
  await act(async () => { await hook.result.current.chooseMaterial('cat-2') })
  expect(hook.result.current.projection!.proposal).toMatchObject({ recipeId: 'cat-2', x: before.x, y: before.y, width: before.width, height: before.height, rotation: before.rotation })
  expect(hook.result.current.materialPicker).toBeNull()
  expect(hook.result.current.projection!.tracing).toBe(true)
  expect(hook.state.document).toEqual(document)
  expect(hook.commit).not.toHaveBeenCalled()
  expect(readMaterialChoices('child-a')).toEqual([{ subject: 'cat', materialId: 'cat-2', style: 'storybook', difficulty: 'beginner', chosenAt: expect.any(Number) }])
  expect(readMaterialChoices('child-b')).toEqual([])
  await act(async () => { await hook.result.current.openMaterialPicker() })
  expect(hook.result.current.materialPicker?.subjects.find(item => item.subject === 'cat')?.materials[0].id).toBe('cat-2')
  await act(async () => { await hook.result.current.chooseMaterial('illustration-medium-school') })
  expect(hook.result.current.projection!.proposal).toMatchObject({ template: 'illustration', illustrationId: 'illustration-medium-school', subject: '学校' })
  expect(hook.state.document).toEqual(document)
  expect(hook.commit).not.toHaveBeenCalled()
  expect(hook.result.current.materialChoices.at(-1)).toMatchObject({ subject: 'school', difficulty: 'medium' })
  expect(authFetch).toHaveBeenCalledOnce()
})

test.each(['close', 'clear', 'change-child'] as const)('a pending material selection cannot override %s or record a stale preference', async action => {
  const hook = setup({ ownerId: 'child-a', preferenceChildId: 'child-a', artworkId: 'work-a', allowDrawing: true, enabled: true, tracing: true })
  await project(hook)
  const before = hook.result.current.projection
  await act(async () => { await hook.result.current.openMaterialPicker() })
  let finish!: () => void
  vi.mocked(refreshMaterialCuration).mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  let pending!: Promise<void>
  act(() => { pending = hook.result.current.chooseMaterial('cat-0') })
  if (action === 'close') act(() => hook.result.current.closeMaterialPicker())
  if (action === 'clear') act(() => hook.result.current.dismiss({ speak: false }))
  if (action === 'change-child') hook.rerender({ ownerId: 'child-b', preferenceChildId: 'child-b', artworkId: 'work-b', allowDrawing: true, enabled: true, tracing: true })
  await act(async () => { finish(); await pending })
  expect(hook.result.current.projection).toEqual(action === 'close' ? before : null)
  expect(readMaterialChoices('child-a')).toEqual([])
  expect(readMaterialChoices('child-b')).toEqual([])
  expect(hook.commit).not.toHaveBeenCalled()
})

test('a freshly rejected card cannot be selected or recorded and is removed from the open picker', async () => {
  const previous = getMaterialCuration()
  try {
    setMaterialCuration({ version: 1, decisions: {} })
    const hook = setup({ ownerId: 'child-a', preferenceChildId: 'child-a', artworkId: 'work-a', allowDrawing: true, enabled: true, tracing: true })
    await project(hook)
    const before = hook.result.current.projection
    await act(async () => { await hook.result.current.openMaterialPicker() })
    vi.mocked(refreshMaterialCuration).mockImplementationOnce(async () => { setMaterialCuration({ version: 1, decisions: { 'cat-0': 'reject' } }) })
    await act(async () => { await hook.result.current.chooseMaterial('cat-0') })
    expect(hook.result.current.projection).toEqual(before)
    expect(hook.result.current.materialPicker?.subjects.flatMap(item => item.materials).some(item => item.id === 'cat-0')).toBe(false)
    expect(hook.result.current.materialChoices).toEqual([])
  } finally { setMaterialCuration(previous) }
})

test('guest choices stay in this hook session and do not become a shared guest-child profile', async () => {
  const hook = setup({ ownerId: 'guest-child', artworkId: undefined, allowDrawing: true, enabled: true, tracing: true })
  await project(hook)
  await act(async () => { await hook.result.current.openMaterialPicker() })
  await act(async () => { await hook.result.current.chooseMaterial('cat-0') })
  expect(hook.result.current.materialChoices).toHaveLength(1)
  expect([...Array(localStorage.length)].map((_, index) => localStorage.key(index)).some(key => key?.startsWith('luma_material_choices:'))).toBe(false)
  hook.unmount()
  const otherGuest = setup({ ownerId: 'guest-child', artworkId: undefined, allowDrawing: true, enabled: true, tracing: true })
  expect(otherGuest.result.current.materialChoices).toEqual([])
})

test('selecting vector art from a large raster guide fits the existing size budget around its centre', async () => {
  const hook = setup({ ownerId: 'child-a', artworkId: 'work-a', allowDrawing: true, enabled: true, tracing: true })
  vi.mocked(authFetch).mockResolvedValueOnce({ reply: '学校的参考图。', proposal: { ...proposal,
    template: 'illustration', illustrationId: 'illustration-medium-school', subject: '学校', x: .15, y: .14, width: .58, height: .68, rotation: 12 } })
  await act(async () => { await hook.result.current.ask('画学校', true) })
  const before = hook.result.current.projection!.proposal
  await act(async () => { await hook.result.current.openMaterialPicker() })
  await act(async () => { await hook.result.current.chooseMaterial('cat-0') })
  const next = hook.result.current.projection!.proposal
  expect(next.recipeId).toBe('cat-0')
  expect(next.width).toBeLessThanOrEqual(.45)
  expect(next.height).toBeLessThanOrEqual(.45)
  expect(next.width * next.height).toBeLessThanOrEqual(.16)
  expect(next.width / next.height).toBeCloseTo(before.width / before.height)
  expect(next.x + next.width / 2).toBeCloseTo(before.x + before.width / 2)
  expect(next.y + next.height / 2).toBeCloseTo(before.y + before.height / 2)
  expect(next.rotation).toBe(before.rotation)
  expect(hook.commit).not.toHaveBeenCalled()
})

test('tracing preserves the model idea, speaks exactly the displayed text and remembers wording separately', async () => {
  const hook = setup({ ownerId: 'child-a', artworkId: 'work-a', allowDrawing: true, enabled: true, tracing: true })
  const text = '给飞船一个弯弯的尾焰，让你的故事继续出发。'
  vi.mocked(authFetch).mockResolvedValueOnce({ ...reply, reply: text })
  await act(async () => { await hook.result.current.ask('给飞船画尾焰', true) })
  expect(hook.result.current.message).toContain(text)
  expect(hook.onSpeak).toHaveBeenLastCalledWith(hook.result.current.message)
  expect(hook.commit).not.toHaveBeenCalled()
  const spoken = hook.result.current.message
  act(() => vi.advanceTimersByTime(1600))
  vi.mocked(authFetch).mockResolvedValueOnce({ reply: '嗯，画法由你决定。' })
  await act(async () => { await hook.result.current.ask('我想换个画法') })
  const context = (vi.mocked(authFetch).mock.calls[1][1]!.body as { context: { recentReplies: string[]; history: { text: string }[] } }).context
  expect(context.recentReplies).toContain(spoken)
  expect(context.history.some(item => item.text === spoken)).toBe(false)
})

test('click-turn guide also keeps its context-aware reply after the reveal animation', async () => {
  const hook = setup({ ownerId: 'child-a', artworkId: 'work-a', allowDrawing: true, enabled: true, tracing: true })
  const text = '虚线里的小主意准备好啦，你可以画出自己的版本。'
  vi.mocked(authFetch).mockResolvedValueOnce({ ...reply, reply: text })
  await act(async () => { await hook.result.current.takeTurn() })
  expect(hook.result.current.phase).toBe('sketching')
  act(() => vi.advanceTimersByTime(1200))
  expect(hook.result.current.message).toBe(text)
  expect(hook.onSpeak).toHaveBeenLastCalledWith(text)
  expect(hook.commit).not.toHaveBeenCalled()
})

test('compound voice edits are atomic previews, with follow-up corrections and explicit confirmation', async () => {
  const hook=setup()
  await project(hook)
  const original=hook.result.current.projection!.proposal
  vi.mocked(authFetch).mockResolvedValueOnce({status:'edit',targetId:'@preview',actions:[{type:'color',value:'#459fd1'},{type:'scale',factor:.85},{type:'move',dx:-.035,dy:0}]})
  await act(async()=>{await hook.result.current.receive('变蓝再小一点，往左挪',{speak:false})})
  expect(hook.result.current.projection?.proposal).toMatchObject({color:'#459fd1',width:original.width*.85,height:original.height*.85})
  expect(hook.commit).not.toHaveBeenCalled()
  vi.mocked(authFetch).mockResolvedValueOnce({status:'edit',targetId:'@preview',actions:[{type:'color',value:'#168777'}]})
  await act(async()=>{await hook.result.current.receive('不是蓝色，是绿色',{speak:false})})
  expect(hook.result.current.projection?.proposal.color).toBe('#168777')
  expect(hook.result.current.projection?.proposal.width).toBeCloseTo(original.width*.85)
  act(()=>hook.result.current.accept({speak:false}))
  expect(hook.commit).toHaveBeenCalledOnce()
})

test('a failed compound edit keeps the complete original projection',async()=>{
 const hook=setup();await project(hook)
 const before=structuredClone(hook.result.current.projection)
 vi.mocked(authFetch).mockResolvedValueOnce({status:'edit',targetId:'@preview',actions:[{type:'color',value:'#459fd1'},{type:'place',x:0,y:0}]})
 await act(async()=>{await hook.result.current.receive('变蓝并移到最左上角',{speak:false})})
 expect(hook.result.current.projection).toEqual(before)
 expect(hook.result.current.phase).toBe('projected')
 expect(hook.result.current.message).toContain('超出画布')
 expect(hook.commit).not.toHaveBeenCalled()
})

test.each(['cancel','draw','new-request'])('late voice interpretation cannot overwrite %s',async(action)=>{
 const hook=setup();await project(hook)
 let resolve!:(x:unknown)=>void
 vi.mocked(authFetch).mockImplementationOnce(()=>new Promise(r=>{resolve=r}))
 let pending!:Promise<void>
 act(()=>{pending=hook.result.current.receive('改蓝色再小一点',{speak:false})})
 if(action==='cancel')act(()=>hook.result.current.cancel())
 if(action==='draw')hook.state.revision++
 if(action==='new-request')await act(async()=>{await hook.result.current.receive('改成绿色',{speak:false})})
 await act(async()=>{resolve({status:'edit',targetId:'@preview',actions:[{type:'color',value:'#459fd1'}]});await pending})
 if(action==='new-request')expect(hook.result.current.projection?.proposal.color).toBe('#168777')
 else expect(hook.result.current.projection).toBeNull()
 expect(hook.commit).not.toHaveBeenCalled()
})

test('interpretation timeout preserves preview and releases thinking even when fetch ignores abort',async()=>{
 const hook=setup();await project(hook)
 const before=structuredClone(hook.result.current.projection)
 vi.mocked(authFetch).mockImplementationOnce(()=>new Promise(()=>{}))
 let pending!:Promise<void>
 act(()=>{pending=hook.result.current.receive('不是蓝色，换绿色再缩小',{speak:false})})
 await act(async()=>{vi.advanceTimersByTime(10000);await pending})
 expect(hook.result.current.projection).toEqual(before)
 expect(hook.result.current.phase).toBe('projected')
 expect(hook.result.current.message).toContain('等得有点久')
})

test('a negated instruction from the interpreter never triggers local deletion',async()=>{
 const hook=setup();await project(hook)
 const before=structuredClone(hook.result.current.projection)
 vi.mocked(authFetch).mockResolvedValueOnce({status:'noop'})
 await act(async()=>{await hook.result.current.receive('不要删掉它',{speak:false})})
 expect(hook.result.current.projection).toEqual(before)
 expect(hook.commit).not.toHaveBeenCalled()
})

test('after confirming an edit, a follow-up still targets that earlier object',async()=>{
 const hook=setup()
 const objects=[{id:'first',name:'小鸟',proposals:[{...robot,x:.15,width:.18,height:.25}],aspect:1.5},{id:'second',name:'小鸟',proposals:[{...robot,x:.65,width:.18,height:.25}],aspect:1.5}]
 hook.canvas.current.getEditableObjects=()=>objects
 hook.canvas.current.getOccupancyWithoutObject=()=>Array(65536).fill(0)
 hook.canvas.current.previewWithoutObject=vi.fn()
 vi.mocked(authFetch).mockResolvedValueOnce({status:'edit',targetId:'first',actions:[{type:'color',value:'#168777'}]})
 await act(async()=>{await hook.result.current.receive('不是这只，是左边的，改成绿色',{speak:false})})
 expect(hook.result.current.projection?.editTargetId).toBe('first')
 objects[0].proposals=[hook.result.current.projection!.proposal]
 act(()=>hook.result.current.accept({speak:false}))
 await act(async()=>{await hook.result.current.receive('再小一点',{speak:false})})
 expect(hook.result.current.projection?.editTargetId).toBe('first')
 expect(hook.result.current.projection?.proposal.color).toBe('#168777')
 expect(hook.result.current.projection?.proposal.width).toBeCloseTo(.18*.85)
 expect(authFetch).toHaveBeenCalledOnce()
})

test('a new drawing mentioning wings is not mistaken for editing nonexistent objects',async()=>{
 const hook=setup()
 vi.mocked(authFetch).mockResolvedValueOnce(reply)
 await act(async()=>{await hook.result.current.receive('画一个有翅膀的机器人',{speak:false});await Promise.resolve()})
 expect(vi.mocked(authFetch).mock.calls[0][0]).toBe('/nilo/companion')
 expect(vi.mocked(authFetch).mock.calls[0][1]?.body).toMatchObject({context:{requestDrawing:true}})
})

test('a structural edit forwards every clause and restores preview when drawing fails',async()=>{
 const hook=setup();await project(hook)
 const before=structuredClone(hook.result.current.projection)
 vi.mocked(authFetch).mockResolvedValueOnce({status:'redraw',targetId:'@preview'}).mockRejectedValueOnce(new ApiError(503,'unavailable'))
 const utterance='改成戴帽子的小鸟，蓝色再小一点'
 await act(async()=>{await hook.result.current.receive(utterance,{speak:false})})
 expect(vi.mocked(authFetch).mock.calls.at(-1)?.[1]?.body).toMatchObject({context:{utterance,requestDrawing:true}})
 expect(hook.result.current.projection).toEqual(before)
 expect(hook.result.current.phase).toBe('projected')
 expect(hook.commit).not.toHaveBeenCalled()
})

test('an apparent grid contact never commits the detached part without replacing it with random local ink', async () => {
  const hook = setup()
  const detached: DrawingProposal = { ...proposal, template: 'custom', subject: '叶片',
    x: .332, y: .2, width: .15, height: .1, strokeWidth: 2,
    anchor: { x: .45, y: .1, width: .1, height: .3 }, placement: 'left', attachment: { x: .482, y: .3 },
    sketch: { aspect: 2.25, paths: [[['M', 1, 1], ['L', 0, 0]]] } }
  hook.state.occupancy[19 * 64 + 31] = .1
  vi.mocked(hook.canvas.current.hasInkAt).mockReturnValue(false)
  vi.mocked(authFetch).mockResolvedValueOnce({ reply: '接叶片', proposal: detached })
    .mockResolvedValueOnce({ reply: '连接位置不确定', status: 'clarify' })
  await act(async () => { await hook.result.current.takeTurn() })
  act(() => vi.advanceTimersByTime(1200))
  if(hook.result.current.phase==='projected')act(()=>hook.result.current.accept({speak:false}))
  expect(authFetch).toHaveBeenCalledOnce()
  expect(hook.commit).not.toHaveBeenCalled()
  expect(hook.result.current.projection).toBeNull()
})

test('a slightly misplaced model joint snaps to actual child ink and commits without another API call', async () => {
  const hook = setup()
  hook.state.document.operations = [{ type: 'stroke', owner: 'child', groupId: 'stem', eraser: false,
    brushKind: 'round', color: '#20352f', size: 6, referenceWidth: 900, referenceHeight: 600,
    points: [{ x: .5, y: .15 }, { x: .5, y: .4 }] }]
  hook.state.occupancy = Array(256 * 256).fill(0)
  for (let row = 38; row < 103; row++) hook.state.occupancy[row * 256 + 128] = .8
  vi.mocked(hook.canvas.current.hasInkAt).mockImplementation(point => Math.abs(point.x - .5) < .001)
  const p: DrawingProposal = { ...proposal, template: 'custom', subject: '叶片',
    x: .485, y: .21, width: .12, height: .12, strokeWidth: 2,
    anchor: { x: .45, y: .1, width: .1, height: .35 }, placement: 'right', attachment: { x: .485, y: .3 },
    sketch: { aspect: 1.5, paths: [[['M', 0, .75], ['L', 1, 0]]] } }
  vi.mocked(authFetch).mockResolvedValueOnce({ reply: '接一片叶子', proposal: p })
    .mockResolvedValueOnce({ reply: '没有找到', status: 'clarify' })
  await act(async () => { await hook.result.current.takeTurn() })
  act(() => vi.advanceTimersByTime(1200))
  if(hook.result.current.phase==='projected')act(()=>hook.result.current.accept({speak:false}))
  expect(hook.commit).toHaveBeenCalledOnce()
  expect(authFetch).toHaveBeenCalledOnce()
  expect(hook.canvas.current.getOccupancy).toHaveBeenCalledWith(256)
  expect(hook.commit.mock.calls[0][0][0].points[0].x).toBeCloseTo(.5)
  expect(hook.commit.mock.calls[0][0][0].points[0].y).toBeCloseTo(.3)
})

test('an explicit Nilo click animates then commits one checked contribution with explicit confirmation and a spoken preview', async () => {
  const hook = setup()
  hook.canvas.current.exportCompanionFocus = () => ({ imageBase64:'CROP',bounds:{x:.2,y:.2,width:.4,height:.4} })
  vi.mocked(authFetch).mockResolvedValueOnce(reply)
  await act(async () => { await hook.result.current.takeTurn() })
  expect(vi.mocked(authFetch).mock.calls[0][1]?.body).toMatchObject({ context: { takeTurn: true, requestDrawing: true } })
  expect(vi.mocked(authFetch).mock.calls[0][1]?.body).toMatchObject({focusImage:{imageBase64:'CROP',bounds:{x:.2,y:.2,width:.4,height:.4}}})
  expect(hook.commit).not.toHaveBeenCalled()
  expect(hook.result.current.phase).toBe('sketching')
  expect(hook.result.current.projection).toMatchObject({ turn: true, durationMs: 1200 })
  act(() => vi.advanceTimersByTime(1200))
  if(hook.result.current.phase==='projected')act(()=>hook.result.current.accept({speak:false}))
  expect(hook.commit).toHaveBeenCalledOnce()
  expect(hook.onCommitted).toHaveBeenCalledOnce()
  expect(hook.result.current.projection).toBeNull()
  expect(hook.result.current.phase).toBe('idle')
  expect(hook.onSpeak).toHaveBeenCalledExactlyOnceWith(reply.reply)
})

test.each(['ready', 'clarify'] as const)('a text-only %s response never invents local ink without retaining its invented story', async status => {
  const hook = setup()
  const caption = '我在右边的形状上加了一个小翻页，它看起来更像一本打开的书了。'
  vi.mocked(authFetch).mockResolvedValue({ status, reply: caption })
  await act(async () => { await hook.result.current.takeTurn() })
  expect(hook.result.current.message).not.toBe(caption)
  expect(hook.result.current.phase).toBe('idle')
  expect(hook.commit).not.toHaveBeenCalled()
  act(() => vi.advanceTimersByTime(1600))
  if(hook.result.current.phase==='projected')act(()=>hook.result.current.accept({speak:false}))
  expect(hook.commit).not.toHaveBeenCalled()
  await act(async () => { await hook.result.current.takeTurn() })
  expect(JSON.stringify(vi.mocked(authFetch).mock.calls[1][1]?.body)).not.toContain(caption)
})

test('model-selected free placement is previewed even when it crosses existing ink', async () => {
  const hook = setup()
  hook.state.occupancy.fill(1)
  const selected: DrawingProposal = { ...robot, contribution: 'object', placementPolicy: 'free' }
  vi.mocked(authFetch).mockResolvedValueOnce({ reply: '添一个机器人', geometryReviewed: true, proposal: selected })
  await act(async () => { await hook.result.current.takeTurn() })
  expect(hook.result.current.projection?.proposal).toMatchObject(selected)
  expect(hook.commit).not.toHaveBeenCalled()
  act(() => vi.advanceTimersByTime(1200))
  act(() => hook.result.current.accept({ speak: false }))
  expect(hook.commit).toHaveBeenCalledOnce()
  expect(authFetch).toHaveBeenCalledOnce()
})

test('a saturated canvas is protected and a cancelled request cannot trigger local ink', async () => {
  const hook = setup()
  hook.state.occupancy.fill(1)
  vi.mocked(authFetch).mockResolvedValue(reply)
  await act(async () => { await hook.result.current.takeTurn() })
  expect(authFetch).toHaveBeenCalledOnce()
  expect(hook.commit).not.toHaveBeenCalled()
  expect(hook.result.current.message).toContain('数据')
  act(() => vi.advanceTimersByTime(1600))
  if(hook.result.current.phase==='projected')act(()=>hook.result.current.accept({speak:false}))
  let resolve!: (value: CompanionReply) => void
  vi.mocked(authFetch).mockImplementationOnce(() => new Promise(done => { resolve = done }))
  let pending!: Promise<void> | undefined
  await act(async () => { pending = hook.result.current.takeTurn() })
  act(() => hook.result.current.cancel())
  hook.state.occupancy.fill(0)
  await act(async () => { resolve(reply); await pending })
  act(() => vi.advanceTimersByTime(1200))
  if(hook.result.current.phase==='projected')act(()=>hook.result.current.accept({speak:false}))
  expect(hook.commit).not.toHaveBeenCalled()
})

test.each(['child stroke', 'canvas change', 'disabled'])('a %s during Nilo animation prevents stale marks being committed', async cause => {
  const hook = setup()
  vi.mocked(authFetch).mockResolvedValueOnce(reply)
  await act(async () => { await hook.result.current.takeTurn() })
  act(() => vi.advanceTimersByTime(500))
  if (cause === 'child stroke') act(() => hook.result.current.cancel())
  else if (cause === 'canvas change') hook.state.revision++
  else hook.rerender({ ownerId: 'child-a', artworkId: 'work-a', allowDrawing: true, enabled: false })
  act(() => vi.advanceTimersByTime(1200))
  if(hook.result.current.phase==='projected')act(()=>hook.result.current.accept({speak:false}))
  expect(hook.commit).not.toHaveBeenCalled()
  expect(hook.result.current.projection).toBeNull()
})

test('a Nilo click rejects an invalid unsolicited group without a random stroke and never commits occupied or cancelled work', async () => {
  const hook = setup()
  vi.mocked(authFetch).mockResolvedValueOnce({ ...reply, additions: [proposal] })
  await act(async () => { await hook.result.current.takeTurn() })
  expect(hook.commit).not.toHaveBeenCalled()
  act(() => vi.advanceTimersByTime(1600))
  if(hook.result.current.phase==='projected')act(()=>hook.result.current.accept({speak:false}))
  expect(hook.commit).not.toHaveBeenCalled()
  hook.commit.mockClear()
  hook.state.occupancy.fill(1)
  vi.mocked(authFetch).mockResolvedValueOnce(reply)
  await act(async () => { await hook.result.current.takeTurn() })
  expect(hook.commit).not.toHaveBeenCalled()
  hook.state.occupancy.fill(0)
  act(() => vi.advanceTimersByTime(1600))
  if(hook.result.current.phase==='projected')act(()=>hook.result.current.accept({speak:false}))
  let resolve!: (value: CompanionReply) => void
  vi.mocked(authFetch).mockImplementationOnce(() => new Promise(done => { resolve = done }))
  act(() => { void hook.result.current.takeTurn() })
  act(() => hook.result.current.cancel())
  await act(async () => resolve(reply))
  expect(hook.commit).not.toHaveBeenCalled()
})

test.each(['unclear_target', 'misplaced_detail', 'duplicate_detail', 'uncertain_review'] as const)('click clarification %s does not fabricate a local drawing or present a stock menu', async reason => {
  const hook = setup()
  vi.mocked(authFetch).mockResolvedValue({ status: 'clarify', reason, reply: '我还没看清刚画的这一部分。它是什么呀？' })
  await act(async () => { await hook.result.current.takeTurn() })
  expect(hook.result.current.projection).toBeNull()
  expect(hook.result.current.message).not.toContain('什么')
  act(() => vi.advanceTimersByTime(1200))
  if(hook.result.current.phase==='projected')act(()=>hook.result.current.accept({speak:false}))
  expect(hook.commit).not.toHaveBeenCalled()
  expect(hook.onSpeak).toHaveBeenCalledExactlyOnceWith(hook.result.current.message)
})

test.each(['model_rejected','offline','blocked'])('a multi-stroke picture never receives meaningless fallback ink: %s',async failure=>{
  const hook=setup()
  hook.state.scene.recentContributions[0].strokeCount=6
  if(failure==='offline')vi.mocked(authFetch).mockRejectedValueOnce(new Error('offline'))
  else if(failure==='blocked'){
    hook.state.occupancy.fill(1)
    vi.mocked(authFetch).mockResolvedValueOnce(reply)
  } else vi.mocked(authFetch).mockResolvedValueOnce({status:'clarify',reason:'misplaced_detail',reply:'位置还没准备好'})
  await act(async()=>{await hook.result.current.takeTurn()})
  act(()=>vi.advanceTimersByTime(1600))
  expect(hook.commit).not.toHaveBeenCalled()
  expect(hook.result.current.phase).toBe('idle')
  expect(hook.result.current.projection).toBeNull()
  expect(hook.result.current.message).not.toContain('一起选')
  expect(hook.onSpeak).toHaveBeenCalledExactlyOnceWith(hook.result.current.message)
  expect((vi.mocked(authFetch).mock.calls[0][1]?.body as {context:{useDrawingKnowledge:boolean}}).context.useDrawingKnowledge).toBe(true)
})

test('a failed scene turn keeps the canvas intact and permits a fresh model request', async () => {
  const hook=setup()
  vi.mocked(authFetch).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(reply)
  await act(async()=>{await hook.result.current.takeTurn()})
  expect(hook.result.current.phase).toBe('idle')
  expect(hook.result.current.projection).toBeNull()
  await act(async()=>{await hook.result.current.takeTurn()})
  act(()=>vi.advanceTimersByTime(1200))
  expect(hook.result.current.phase).toBe('projected')
  expect(hook.commit).not.toHaveBeenCalled()
  act(()=>hook.result.current.accept({speak:false}))
  expect(hook.commit).toHaveBeenCalledOnce()
})

test('click protocol sends the exact current canvas collision decisions without changing the drawing',async()=>{
  const hook=setup()
  hook.state.occupancy=Array(65536).fill(0)
  hook.state.occupancy[0]=.025;hook.state.occupancy[1]=.03;hook.state.occupancy[12000]=1
  vi.mocked(authFetch).mockResolvedValueOnce({status:'clarify',reply:'一起选个主意'})
  await act(async()=>{await hook.result.current.takeTurn()})
  const body=vi.mocked(authFetch).mock.calls[0][1]?.body as {context:{drawingProtocol:number;collisionMap:unknown}}
  expect(body.context.drawingProtocol).toBe(3)
  const grid=decodeOccupancy(body.context.collisionMap)!
  expect(grid[0]).toBe(0);expect(grid[1]).toBe(1);expect(grid[12000]).toBe(1)
  expect(hook.commit).not.toHaveBeenCalled()
})

test.each(['revision','cancel','hidden','disabled'] as const)('model-selected ideas cannot commit across %s',async change=>{
  const hook=setup()
  hook.state.scene.recentContributions[0].strokeCount=6
  vi.mocked(authFetch).mockResolvedValueOnce({...reply, geometryReviewed:true, proposal:{...robot,contribution:'object',placementPolicy:'free'}})
  await act(async()=>{await hook.result.current.takeTurn()})
  if(change==='revision')hook.state.revision++
  if(change==='cancel')act(()=>hook.result.current.cancel())
  if(change==='hidden')act(()=>{vi.spyOn(document,'visibilityState','get').mockReturnValue('hidden');document.dispatchEvent(new Event('visibilitychange'))})
  if(change==='disabled')hook.rerender({ownerId:'child-a',artworkId:'work-a',allowDrawing:true,enabled:false})
  act(()=>vi.advanceTimersByTime(2000))
  act(()=>hook.result.current.accept({speak:false}))
  expect(hook.commit).not.toHaveBeenCalled()
  expect(hook.result.current.projection).toBeNull()
  expect(authFetch).toHaveBeenCalledOnce()
})

test('an offline click reports the connection failure without arbitrary drawing', async () => {
  const hook = setup()
  vi.mocked(authFetch).mockRejectedValueOnce(new TypeError('Failed to fetch'))
  await act(async () => { await hook.result.current.takeTurn() })
  expect(hook.result.current.phase).toBe('idle')
  act(() => vi.advanceTimersByTime(1200))
  if(hook.result.current.phase==='projected')act(()=>hook.result.current.accept({speak:false}))
  expect(hook.commit).not.toHaveBeenCalled()
  expect(hook.onSpeak).toHaveBeenCalledExactlyOnceWith(hook.result.current.message)
  expect(hook.onUnavailable).toHaveBeenCalledOnce()
})

test('a slow click reports a timeout at sixteen seconds without double commit', async () => {
  const hook = setup()
  let resolve!: (value: CompanionReply) => void
  vi.mocked(authFetch).mockImplementationOnce(() => new Promise(done => { resolve = done }))
  let request!: Promise<void> | undefined
  act(() => { request = hook.result.current.takeTurn() })
  act(() => vi.advanceTimersByTime(15999))
  expect(hook.result.current.phase).toBe('thinking')
  await act(async () => { vi.advanceTimersByTime(1); await request })
  expect(hook.result.current.phase).toBe('idle')
  act(() => vi.advanceTimersByTime(1200))
  if(hook.result.current.phase==='projected')act(()=>hook.result.current.accept({speak:false}))
  expect(hook.commit).not.toHaveBeenCalled()
  await act(async () => { resolve(reply); await Promise.resolve() })
  act(() => vi.advanceTimersByTime(1200))
  if(hook.result.current.phase==='projected')act(()=>hook.result.current.accept({speak:false}))
  expect(hook.commit).not.toHaveBeenCalled()
  expect(authFetch).toHaveBeenCalledOnce()
})

test('no commit during sketching; explicit acceptance commits exactly the shown paths once', async () => {
  const hook = setup()
  vi.mocked(authFetch).mockResolvedValueOnce(reply)
  await act(async () => { await hook.result.current.ask('帮飞船画尾焰', true) })
  expect(hook.result.current.phase).toBe('sketching')
  act(() => { void hook.result.current.receive('留下来') })
  expect(hook.commit).not.toHaveBeenCalled()
  act(() => vi.advanceTimersByTime(550))
  const shown = hook.result.current.projection!
  expect(shown.proposal.width * shown.aspect / shown.proposal.height).toBeCloseTo(.65)
  act(() => { hook.result.current.receive('留下来'); hook.result.current.accept() })
  expect(hook.commit).toHaveBeenCalledTimes(1)
  expect(hook.commit).toHaveBeenCalledWith(proposalStrokes(shown.proposal, shown.aspect), 1, expect.objectContaining({proposals:expect.any(Array)}), undefined)
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

test('a custom subject previews and edits with the child brush, commits once and remembers its meaning', async () => {
  const hook = setup()
  vi.mocked(authFetch).mockResolvedValueOnce({ reply: '先看看这个机器人。', proposal: robot })
  await act(async () => { await hook.result.current.ask('画一个机器人', true, { speak: false }) })
  expect(hook.commit).not.toHaveBeenCalled()
  act(() => vi.advanceTimersByTime(550))
  expect(hook.result.current.projection?.proposal.subject).toBe('机器人')
  act(() => { void hook.result.current.receive('smaller', { speak: false }) })
  act(() => hook.result.current.edit({ color: '#123456' }))
  const preview = hook.result.current.projection!
  expect(preview.proposal.width * preview.aspect / preview.proposal.height).toBeCloseTo(.8)
  expect(preview.proposal.sketch).toEqual(robot.sketch)
  const paths = proposalStrokes(preview.proposal, preview.aspect)
  expect(paths).toHaveLength(7)
  expect(paths.every(path => path.brushKind === 'crayon' && path.color === '#123456')).toBe(true)
  act(() => { hook.result.current.accept({ speak: false }); hook.result.current.accept({ speak: false }) })
  expect(hook.commit).toHaveBeenCalledExactlyOnceWith(paths, 1, expect.objectContaining({proposals:expect.any(Array)}), undefined)
  expect(authFetch).toHaveBeenCalledOnce()
  expect(hook.onSpeak.mock.calls.every(([text]) => text === '')).toBe(true)
  expect(readMemory('child-a', 'work-a')).toMatchObject({ recentTemplates: [], recentSubjects: ['机器人'] })
})

test('rejecting one custom subject preserves other custom ideas and sends bounded semantic memory', async () => {
  const hook = setup()
  vi.mocked(authFetch).mockResolvedValueOnce({ reply: '先看看机器人。', proposal: robot })
  await act(async () => { await hook.result.current.ask('帮我画机器人', true) })
  act(() => vi.advanceTimersByTime(550))
  act(() => hook.result.current.dismiss({ speak: false }))
  expect(readMemory('child-a', 'work-a')).toMatchObject({ rejectedTemplates: [], rejectedSubjects: ['机器人'] })
  act(() => vi.advanceTimersByTime(1500))
  vi.mocked(authFetch).mockResolvedValueOnce({ reply: '先看看火箭。', proposal: { ...robot, subject: '火箭' } })
  await act(async () => { await hook.result.current.ask('画一架火箭', true, { speak: false }) })
  const body = vi.mocked(authFetch).mock.calls[1][1]?.body as { context: { rejectedTemplates: string[]; rejectedSubjects: string[] } }
  expect(body.context.rejectedTemplates).toEqual([])
  expect(body.context.rejectedSubjects).toEqual(['机器人'])
  act(() => vi.advanceTimersByTime(550))
  expect(hook.result.current.projection?.proposal.subject).toBe('火箭')
  expect(hook.commit).not.toHaveBeenCalled()
})

test('plain Chinese object requests reach the drawing planner and malformed custom paths never project', async () => {
  const hook = setup()
  vi.mocked(authFetch).mockResolvedValueOnce({ reply: '先看看机器人。', proposal: { ...robot, sketch: { ...robot.sketch!, paths: [] } } })
  await act(async () => { hook.result.current.receive('画一个机器人', { speak: false }); await Promise.resolve() })
  const body = vi.mocked(authFetch).mock.calls[0][1]?.body as { context: { requestDrawing: boolean } }
  expect(body.context.requestDrawing).toBe(true)
  expect(hook.result.current.phase).toBe('idle')
  expect(hook.result.current.projection).toBeNull()
  expect(hook.result.current.message).toContain('没准备完整')
  expect(hook.commit).not.toHaveBeenCalled()
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
  expect(hook.commit).toHaveBeenCalledExactlyOnceWith(displayedPaths, 1, expect.objectContaining({proposals:expect.any(Array)}), undefined)
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
  act(() => { void hook.result.current.receive('left', { speak: false }) })
  const moved = getItems()
  moved.forEach((item, index) => {
    expect(item.x).toBeCloseTo(styled[index].x - .035)
    expect(item.y).toBeCloseTo(styled[index].y)
    expect(item.width).toBe(styled[index].width)
  })
  const cx = (Math.min(...moved.map(item => item.x)) + Math.max(...moved.map(item => item.x + item.width))) / 2
  const cy = (Math.min(...moved.map(item => item.y)) + Math.max(...moved.map(item => item.y + item.height))) / 2
  act(() => { void hook.result.current.receive('smaller', { speak: false }) })
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
  expect(hook.commit).toHaveBeenCalledExactlyOnceWith(resized.flatMap(item => proposalStrokes(item, 1.5)), 1, expect.objectContaining({proposals:expect.any(Array)}), undefined)
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
  expect(hook.canvas.current.getOccupancy).toHaveBeenCalledWith(256)
})

test.each(['cancel', 'revision', 'hidden', 'disabled'])('a complete model-selected idea respects %s before committing', async reason => {
  const hook = setup()
  vi.mocked(authFetch).mockResolvedValueOnce({ ...reply, geometryReviewed:true, proposal:{...robot,contribution:'object',placementPolicy:'free'} })
  await act(async () => { await hook.result.current.takeTurn() })
  expect(hook.result.current.phase).toBe('sketching')
  if (reason === 'cancel') act(() => hook.result.current.cancel())
  if (reason === 'revision') hook.state.revision++
  if (reason === 'hidden') act(() => {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
  })
  if (reason === 'disabled') hook.rerender({ ownerId: 'child-a', artworkId: 'work-a', allowDrawing: false, enabled: true })
  act(() => vi.advanceTimersByTime(1200))
  if(hook.result.current.phase==='projected')act(()=>hook.result.current.accept({speak:false}))
  expect(hook.commit).not.toHaveBeenCalled()
  expect(hook.result.current.projection).toBeNull()
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
  act(() => { void hook.result.current.receive('left', { speak: false }) })
  expect(hook.result.current.projection?.proposal.x).toBeCloseTo(previousX - .035)
  expect(hook.onSpeak.mock.calls.every(([text]) => text === '')).toBe(true)
  act(() => { void hook.result.current.receive('再小一点') })
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

test.each(['画太阳', '画小猫', '给我画恐龙'])('short request %s leaves undoable ink after preview confirmation', async utterance => {
  const hook = setup()
  vi.mocked(authFetch).mockResolvedValueOnce(reply)
  await act(async () => { hook.result.current.receive(utterance); await Promise.resolve() })
  const body = vi.mocked(authFetch).mock.calls[0][1]?.body as { imageBase64: string; context: { requestDrawing: boolean } }
  expect(body.context.requestDrawing).toBe(true)
  expect(body.imageBase64).toBe('COMPOSITE')
  expect(hook.commit).not.toHaveBeenCalled()
  act(()=>vi.advanceTimersByTime(550))
  act(()=>hook.result.current.accept({speak:false}))
  expect(hook.commit).toHaveBeenCalledOnce()
})

test('natural requests outside the fast pattern use semantic inference in the same request', async () => {
  const hook = setup()
  vi.mocked(authFetch).mockResolvedValueOnce(reply)
  await act(async () => { hook.result.current.receive('可以给它一个朋友吗'); await Promise.resolve() })
  expect(authFetch).toHaveBeenCalledTimes(1)
  const body = vi.mocked(authFetch).mock.calls[0][1]?.body as { imageBase64: string; context: { requestDrawing: boolean; inferDrawingIntent: boolean } }
  expect(body.context).toMatchObject({ requestDrawing: false, inferDrawingIntent: true })
  expect(body.imageBase64).toBe('COMPOSITE')
  act(() => vi.advanceTimersByTime(550))
  expect(hook.commit).not.toHaveBeenCalled()
  act(()=>hook.result.current.accept({speak:false}))
  expect(hook.result.current.projection).toBeNull()
  expect(hook.commit).toHaveBeenCalledOnce()
})

test('semantic inference is disabled in solo mode even for indirect requests', async () => {
  const hook = setup({ ownerId: 'child-a', artworkId: 'work-a', allowDrawing: false, enabled: true })
  vi.mocked(authFetch).mockResolvedValueOnce(reply)
  await act(async () => { hook.result.current.receive('可以给它一个朋友吗'); await Promise.resolve() })
  const body = vi.mocked(authFetch).mock.calls[0][1]?.body as { context: { requestDrawing: boolean; inferDrawingIntent: boolean } }
  expect(body.context).toMatchObject({ requestDrawing: false, inferDrawingIntent: false })
  expect(hook.result.current.projection).toBeNull()
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
  act(() => { void hook.result.current.receive('忘掉这个故事') })
  expect(hook.result.current.memory).toEqual({ theme: '', recentTemplates: [], rejectedTemplates: [], recentSubjects: [], rejectedSubjects: [] })
  expect(readMemory('child-a', 'work-a').theme).toBe('')
  expect(hook.result.current.projection).toBeNull()
  expect(hook.state.revision).toBe(revision)
  expect(hook.commit).not.toHaveBeenCalled()
  expect(authFetch).not.toHaveBeenCalled()
})

test('reviewed geometry is committed at exactly its reviewed position without local relocation',async()=>{
  const hook=setup()
  const reviewed={...proposal,x:.4,y:.3,width:.13,height:.3}
  vi.mocked(authFetch).mockResolvedValueOnce({reply:'接一笔',geometryReviewed:true,proposal:reviewed})
  await act(async()=>{await hook.result.current.takeTurn()})
  expect(hook.result.current.projection?.proposal).toEqual(reviewed)
  act(()=>vi.advanceTimersByTime(1200))
  if(hook.result.current.phase==='projected')act(()=>hook.result.current.accept({speak:false}))
  expect(hook.commit).toHaveBeenCalledOnce()
  expect(hook.commit.mock.calls[0][0]).toEqual(proposalStrokes(reviewed,1.5))
  expect(hook.onSpeak).toHaveBeenCalledExactlyOnceWith('接一笔')
})

test('repeated Nilo clicks keep the child story, and changing artwork clears it',async()=>{
  const hook=setup()
  vi.mocked(authFetch).mockResolvedValue({reply:'一起画吧'})
  await act(async()=>{await hook.result.current.ask('这条小鱼要回月球上的家',false)})
  vi.mocked(authFetch).mockResolvedValue(reply)
  for(let i=0;i<8;i++) {
    await act(async()=>{await hook.result.current.takeTurn()})
    act(()=>vi.advanceTimersByTime(1200))
  if(hook.result.current.phase==='projected')act(()=>hook.result.current.accept({speak:false}))
  }
  const last=vi.mocked(authFetch).mock.calls.at(-1)![1]?.body as {context:{history:{role:string;text:string}[]}}
  expect(last.context.history.filter(x=>x.role==='user')).toEqual([{role:'user',text:'这条小鱼要回月球上的家'}])
  hook.rerender({ownerId:'child-a',artworkId:'another-work',allowDrawing:true,enabled:true})
  await act(async()=>{await hook.result.current.takeTurn()})
  const changed=vi.mocked(authFetch).mock.calls.at(-1)![1]?.body as {context:{history:unknown[]}}
  expect(changed.context.history).toEqual([])
})

test('ambiguous committed objects require a choice; choosing the earlier object edits only that ID without another API call',()=>{
  const hook=setup()
  const p:DrawingProposal={...robot,contribution:'object',recipeId:'squirrel-2',subject:'松鼠',sketch:getDrawingRecipe('squirrel-2')!.sketch,width:.18,height:.25,x:.2,y:.2}
  const objects=[{id:'first',name:'松鼠',proposals:[p],aspect:1.5},{id:'second',name:'松鼠',proposals:[{...p,x:.6}],aspect:1.5}]
  hook.canvas.current.getEditableObjects=()=>objects
  hook.canvas.current.getOccupancyWithoutObject=vi.fn(()=>Array(65536).fill(0))
  hook.canvas.current.previewWithoutObject=vi.fn()
  act(() => { void hook.result.current.receive('把松鼠改成蓝色',{speak:false}) })
  expect(hook.result.current.objectChoices?.objects).toHaveLength(2)
  expect(hook.result.current.projection).toBeNull()
  act(()=>hook.result.current.chooseObject('first'))
  expect(hook.result.current.projection).toMatchObject({editTargetId:'first',proposal:{color:'#459fd1'}})
  expect(hook.commit).not.toHaveBeenCalled()
  act(()=>hook.result.current.accept({speak:false}))
  expect(hook.commit.mock.calls[0][3]).toBe('first')
  expect(authFetch).not.toHaveBeenCalled()
  expect(hook.canvas.current.previewWithoutObject).toHaveBeenLastCalledWith(null)
})
test('voice deletion previews, cancellation preserves the group, and a second confirmed deletion targets one object',()=>{
  const hook=setup(),p:DrawingProposal={...robot,contribution:'object',recipeId:'bird-2',subject:'小鸟',sketch:getDrawingRecipe('bird-2')!.sketch,width:.2,height:.2}
  hook.canvas.current.getEditableObjects=()=>[{id:'bird',name:'小鸟',proposals:[p],aspect:1.5}]
  hook.canvas.current.getOccupancyWithoutObject=()=>Array(65536).fill(0)
  hook.canvas.current.previewWithoutObject=vi.fn()
  act(() => { void hook.result.current.receive('不要那只鸟了',{speak:false}) })
  expect(hook.result.current.projection).toMatchObject({editTargetId:'bird',deleting:true})
  expect(hook.commit).not.toHaveBeenCalled()
  act(()=>hook.result.current.dismiss({speak:false}))
  expect(hook.commit).not.toHaveBeenCalled()
  act(() => { void hook.result.current.receive('不要那只鸟了',{speak:false}) })
  act(()=>hook.result.current.accept({speak:false}))
  expect(hook.commit.mock.calls[0][0]).toEqual([])
  expect(hook.commit.mock.calls[0][3]).toBe('bird')
})


test('spoken partial-shape constraints keep the exact projection position through confirmation',async()=>{
 const hook=setup()
 const half={template:'custom',subject:'太阳',x:.04,y:.04,width:.2,height:.15,rotation:0,color:'#edcd70',strokeWidth:4,brushKind:'pencil',target:'太阳',relation:'左上角',sketch:{aspect:2,paths:[[['M',.1,1],['Q',.5,0,.9,1]]]}}
 vi.mocked(authFetch).mockResolvedValueOnce({status:'ready',placementLocked:true,proposal:half,reply:'半个太阳放在左上角给你看看。'})
 await act(async()=>{await hook.result.current.receive('只画一半的太阳，放在左上角',{traceId:'voice-test',alternatives:['画半个太阳，放在左上角']});await Promise.resolve()})
 const body=vi.mocked(authFetch).mock.calls[0][1]?.body
 expect(body).toMatchObject({context:{utterance:'只画一半的太阳，放在左上角',takeTurn:false,asrAlternatives:['画半个太阳，放在左上角']}})
 act(()=>vi.advanceTimersByTime(550))
 expect(hook.result.current.projection?.proposal).toEqual(half)
 expect(hook.onSpeak).toHaveBeenCalledWith('半个太阳放在左上角给你看看。')
 expect(hook.commit).not.toHaveBeenCalled()
 act(()=>hook.result.current.accept({speak:false}))
 expect(hook.commit.mock.calls[0][0]).toEqual(proposalStrokes(half as DrawingProposal,1.5))
})


test('tracing guides remain editable over new child ink and keep commands never commit model strokes', async () => {
  const hook = setup({ ownerId: 'child-a', artworkId: 'work-a', allowDrawing: true, enabled: true, tracing: true })
  await project(hook)
  expect(hook.result.current.projection?.tracing).toBe(true)
  hook.state.revision++
  hook.state.occupancy.fill(1)
  act(() => hook.result.current.interrupt())
  const original = hook.result.current.projection!.proposal
  act(() => hook.result.current.edit({ x: original.x + .02 }))
  expect(hook.result.current.projection?.proposal.x).toBeCloseTo(original.x + .02)
  await act(async () => hook.result.current.receive('小一点', { speak: false }))
  expect(hook.result.current.projection?.proposal.width).toBeLessThan(original.width)
  await act(async () => hook.result.current.receive('留下来', { speak: false }))
  expect(hook.commit).not.toHaveBeenCalled()
  expect(hook.onCommitted).not.toHaveBeenCalled()
  expect(hook.result.current.projection?.tracing).toBe(true)
  await act(async () => hook.result.current.receive('清除底图', { speak: false }))
  expect(hook.result.current.projection).toBeNull()
  expect(hook.result.current.memory.rejectedTemplates).toEqual([])
  expect(hook.commit).not.toHaveBeenCalled()
})

test('a failed replacement retains the tracing guide and restores its editing controls', async () => {
  const hook = setup({ ownerId: 'child-a', artworkId: 'work-a', allowDrawing: true, enabled: true, tracing: true })
  await project(hook)
  const shown = hook.result.current.projection
  act(() => vi.advanceTimersByTime(1600))
  vi.mocked(authFetch).mockRejectedValueOnce(new Error('offline'))
  await act(async () => hook.result.current.ask('请画太阳', true, { speak: false }))
  expect(hook.result.current.projection?.proposal).toEqual(shown?.proposal)
  expect(hook.result.current.phase).toBe('projected')
  act(() => hook.result.current.dismiss({ speak: false }))
  expect(hook.result.current.projection).toBeNull()
  expect(hook.commit).not.toHaveBeenCalled()
})

test('another style cycles the spoken sun locally, ignoring a cached moon and retaining the adjusted frame', async () => {
  const hook = setup({ ownerId: 'child-a', artworkId: 'work-a', allowDrawing: true, enabled: true, tracing: true })
  vi.mocked(authFetch).mockResolvedValueOnce({ reply: '太阳的底图来啦。', theme: '太阳', proposal: plan[2], alternatives: [{ ...plan[2], template: 'moon' }] })
  await act(async () => hook.result.current.receive('请画太阳', { speak: false }))
  expect(hook.result.current.projection?.proposal.template).toBe('sun')
  expect(hook.result.current.projection?.alternatives[0].template).toBe('moon')
  act(() => hook.result.current.edit({ x: .58, y: .15, width: .16, height: .18, rotation: 12, color: '#ff9900' }))
  const original = hook.result.current.projection!.proposal
  const sketches = new Set<string>()
  for (let i = 0; i < 3; i++) {
    await act(async () => { await hook.result.current.alternative({ speak: false }) })
    const current = hook.result.current.projection!.proposal
    expect(current.subject).toBe('太阳')
    expect(getDrawingRecipe(current.recipeId!)?.subject).toBe('sun')
    expect(current).toMatchObject({ x: original.x, y: original.y, width: original.width, height: original.height, rotation: 12, color: '#ff9900', strokeWidth: original.strokeWidth })
    sketches.add(JSON.stringify(current.sketch))
    expect(hook.result.current.phase).toBe('projected')
  }
  expect(sketches.size).toBe(3)
  expect(authFetch).toHaveBeenCalledOnce()
  expect(hook.result.current.memory).toMatchObject({ theme: '太阳', rejectedTemplates: [], rejectedSubjects: [] })
  expect(hook.result.current.metrics.rejected).toBe(0)
  expect(hook.commit).not.toHaveBeenCalled()
})

test('another style preserves the other objects in a tracing group', async () => {
  const hook = setup({ ownerId: 'child-a', artworkId: 'work-a', allowDrawing: true, enabled: true, tracing: true })
  vi.mocked(authFetch).mockResolvedValueOnce({ reply: '太阳和小云朵。', proposal: plan[2], additions: [plan[3]] })
  await act(async () => hook.result.current.ask('请画太阳和云朵', true))
  const before = structuredClone(hook.result.current.projection!)
  expect(before.additions).toHaveLength(1)
  await act(async () => { await hook.result.current.alternative({ speak: false }) })
  expect(hook.result.current.projection?.proposal.subject).toBe('太阳')
  expect(hook.result.current.projection?.additions).toEqual(before.additions)
  expect(authFetch).toHaveBeenCalledOnce()
  expect(hook.commit).not.toHaveBeenCalled()
})

test.each(['only-reference', 'other-rejected'] as const)('a raster guide with %s stays unchanged without requesting a vector fallback', async scenario => {
  const previous = getMaterialCuration()
  try {
    setMaterialCuration({ version: 1, decisions: {} })
    const hook = setup({ ownerId: 'child-a', artworkId: 'work-a', allowDrawing: true, enabled: true, tracing: true })
    const raster: DrawingProposal = { ...proposal, template: 'illustration',
      illustrationId: scenario === 'only-reference' ? 'illustration-medium-bakery' : 'illustration-reading-child',
      subject: scenario === 'only-reference' ? '面包店' : '读书的孩子',
      contribution: 'object', x: .14, y: .15, width: .55, height: .66 }
    const otherDecisions = Object.fromEntries(drawingIllustrations
      .filter(item => item.subject === (scenario === 'only-reference' ? 'bakery' : 'readingchild') && item.id !== raster.illustrationId)
      .map(item => [item.id, 'reject' as const]))
    if (scenario === 'only-reference') setMaterialCuration({ version: 1, decisions: otherDecisions })
    vi.mocked(authFetch).mockResolvedValueOnce({ reply: '参考图准备好啦。', proposal: raster })
    await act(async () => hook.result.current.ask('请画一个参考图', true))
    const before = structuredClone(hook.result.current.projection!)
    expect(before.proposal.template).toBe('illustration')
    if (scenario === 'other-rejected') {
      vi.mocked(refreshMaterialCuration).mockImplementationOnce(async () => {
        setMaterialCuration({ version: 1, decisions: otherDecisions })
      })
    }
    await act(async () => { await hook.result.current.alternative() })
    expect(hook.result.current.projection).toEqual(before)
    expect(hook.result.current.phase).toBe('projected')
    expect(hook.result.current.message).toBe('这张参考图暂时没有别的画法，可以试试自己添细节。')
    expect(hook.onSpeak).toHaveBeenLastCalledWith(hook.result.current.message)
    expect(authFetch).toHaveBeenCalledOnce()
    expect(hook.commit).not.toHaveBeenCalled()
    expect(hook.onCommitted).not.toHaveBeenCalled()
  } finally { setMaterialCuration(previous) }
})

test('a free drawing requests a same-subject variation and restores its frame instead of accepting server movement', async () => {
  const hook = setup({ ownerId: 'child-a', artworkId: 'work-a', allowDrawing: true, enabled: true, tracing: true })
  vi.mocked(authFetch).mockResolvedValueOnce({ reply: '机器人来啦。', proposal: robot })
  await act(async () => hook.result.current.ask('请画机器人', true))
  const before = structuredClone(hook.result.current.projection!)
  const changed = { ...robot, x: .6, y: .5, width: .12, height: .18, color: '#ff0000', sketch: { ...robot.sketch!, paths: [...robot.sketch!.paths, [['M', .4, .39], ['L', .6, .39]]] } }
  vi.mocked(authFetch).mockResolvedValueOnce({ reply: '另一种机器人。', theme: '别的故事', proposal: changed })
  await act(async () => { await hook.result.current.alternative({ speak: false }) })
  const body = vi.mocked(authFetch).mock.calls[1][1]?.body
  expect(body).toMatchObject({ context: { variantOnly: true, takeTurn: false, useDrawingKnowledge: false, currentProposal: before.proposal, currentAdditions: before.additions, history: [{ role: 'user', text: '请画机器人' }] } })
  expect(JSON.stringify(body)).not.toContain('换一个和我的画有关的小主意')
  const result = hook.result.current.projection!.proposal
  expect(result.subject).toBe('机器人')
  expect(result.sketch).not.toEqual(before.proposal.sketch)
  expect(result).toMatchObject({ x: before.proposal.x, y: before.proposal.y, width: before.proposal.width, height: before.proposal.height, color: before.proposal.color })
  expect(hook.result.current.memory.theme).not.toBe('别的故事')
  expect(hook.commit).not.toHaveBeenCalled()
})

test.each(['wrong-subject', 'offline', 'clarify'] as const)('a %s variation retains the original free guide without drawing ink', async failure => {
  const hook = setup({ ownerId: 'child-a', artworkId: 'work-a', allowDrawing: true, enabled: true, tracing: true })
  vi.mocked(authFetch).mockResolvedValueOnce({ reply: '机器人来啦。', proposal: robot })
  await act(async () => hook.result.current.ask('请画机器人', true))
  const original = structuredClone(hook.result.current.projection!)
  if (failure === 'offline') vi.mocked(authFetch).mockRejectedValueOnce(new Error('offline'))
  else vi.mocked(authFetch).mockResolvedValueOnce(failure === 'wrong-subject' ? { reply: '换成月亮。', proposal: { ...plan[2], template: 'moon' } } : { status: 'clarify', reply: '你想画什么？' })
  await act(async () => { await hook.result.current.alternative({ speak: false }) })
  expect(hook.result.current.projection?.proposal).toEqual(original.proposal)
  expect(hook.result.current.phase).toBe('projected')
  expect(hook.result.current.memory).toMatchObject({ rejectedTemplates: [], rejectedSubjects: [] })
  expect(hook.commit).not.toHaveBeenCalled()
})

test('an explicit new spoken subject may still replace a sun guide with a moon', async () => {
  const hook = setup({ ownerId: 'child-a', artworkId: 'work-a', allowDrawing: true, enabled: true, tracing: true })
  vi.mocked(authFetch).mockResolvedValueOnce({ reply: '太阳来啦。', proposal: plan[2] })
  await act(async () => hook.result.current.receive('请画太阳'))
  act(() => vi.advanceTimersByTime(1600))
  vi.mocked(authFetch).mockResolvedValueOnce({ reply: '月亮来啦。', proposal: { ...plan[2], template: 'moon' } })
  await act(async () => hook.result.current.receive('请画月亮'))
  expect(hook.result.current.projection?.proposal.template).toBe('moon')
  const body = vi.mocked(authFetch).mock.calls[1][1]?.body as { context: { variantOnly?: boolean } }
  expect(body.context.variantOnly).toBeUndefined()
  expect(hook.commit).not.toHaveBeenCalled()
})

test('another style applies freshly reviewed exclusions before selecting a local recipe', async () => {
  const previous = getMaterialCuration()
  try {
    setMaterialCuration({ version: 1, decisions: {} })
    const hook = setup({ ownerId: 'child-a', artworkId: 'work-a', allowDrawing: true, enabled: true, tracing: true })
    vi.mocked(authFetch).mockResolvedValueOnce({ reply: '太阳来啦。', proposal: plan[2] })
    await act(async () => hook.result.current.ask('请画太阳', true))
    vi.mocked(refreshMaterialCuration).mockImplementationOnce(async () => { setMaterialCuration({ version: 1, decisions: { 'sun-0': 'reject' } }) })
    await act(async () => { await hook.result.current.alternative({ speak: false }) })
    expect(hook.result.current.projection?.proposal.recipeId).toMatch(/^sun-[12]$/)
    expect(getMaterialCuration().decisions['sun-0']).toBe('reject')
    expect(hook.commit).not.toHaveBeenCalled()
  } finally { setMaterialCuration(previous) }
})

test('clearing a guide while review decisions load cannot replace it with a late local variant', async () => {
  const hook = setup({ ownerId: 'child-a', artworkId: 'work-a', allowDrawing: true, enabled: true, tracing: true })
  vi.mocked(authFetch).mockResolvedValueOnce({ reply: '太阳来啦。', proposal: plan[2] })
  await act(async () => hook.result.current.ask('请画太阳', true))
  let finish!: () => void
  vi.mocked(refreshMaterialCuration).mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  let pending!: Promise<void>
  act(() => { pending = hook.result.current.alternative({ speak: false }) })
  act(() => hook.result.current.dismiss({ speak: false }))
  await act(async () => { finish(); await pending })
  expect(hook.result.current.projection).toBeNull()
  expect(hook.commit).not.toHaveBeenCalled()
})
