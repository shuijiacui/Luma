import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { authFetch } from '@/lib/api/authFetch'
import { useCompanion } from '@/features/child/hooks/useCompanion'
import type { DrawingCanvasHandle } from '@/features/child/components/DrawingCanvas'
import type { CanvasEditTarget } from '@/features/child/companion/editTargets'
import type { DrawingProposal } from '@/features/child/companion/proposals'
import type { TracingGuide } from '@/features/child/companion/tracingGuide'
import { undoCanvasOwner, type CanvasDocument, type CanvasStroke } from '@/features/child/canvasDocument'
import { CompanionDock } from '@/features/child/components/CompanionDock'
import type { CompanionVoiceController } from '@/features/child/hooks/useCompanionVoice'

vi.mock('@/lib/api/authFetch',()=>({authFetch:vi.fn()}))
vi.mock('@/features/child/companion/materialCuration',()=>({refreshMaterialCuration:vi.fn(async()=>{})}))
const target:CanvasEditTarget={id:'child-sun',name:'太阳',groupIds:['stroke-a','stroke-b'],bounds:{x:.2,y:.2,width:.2,height:.2},source:'child',subjects:['sun']}
const guide:DrawingProposal={template:'sun',x:.2,y:.2,width:.2,height:.2,rotation:0,color:'#abcdef',strokeWidth:4,target:'canvas',relation:'a sun'}
beforeEach(()=>{
  vi.useFakeTimers();vi.mocked(authFetch).mockReset();localStorage.clear()
  vi.spyOn(document,'visibilityState','get').mockReturnValue('visible')
  vi.stubGlobal('matchMedia',vi.fn(()=>({matches:true})))
})
afterEach(()=>{cleanup();vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals()})

function setup(initialGuide?:TracingGuide){
  const state={revision:1,targets:[structuredClone(target)],selected:structuredClone(target) as CanvasEditTarget|null}
  const commit=vi.fn(()=>true),onCommitted=vi.fn(),onSpeak=vi.fn(),requestSelection=vi.fn()
  const apply=vi.fn((...args:[string,unknown,number])=>{void args;state.revision++;return true})
  const canvas={current:{
    getRevision:()=>state.revision,getEditableTargets:()=>state.targets,getSelectedTarget:()=>state.selected,
    selectEditTarget:(id:string)=>{state.selected=state.targets.find(t=>t.id===id)??null;state.revision++;return !!state.selected},
    applyAssistedEdit:apply,requestSelection,getDocument:()=>({version:1,baseSource:'child',operations:[]}),
    getCompanionScene:()=>({childBounds:target.bounds,niloBounds:null,recentContributions:[]}),
    getOccupancy:(n=64)=>Array(n*n).fill(0),getInkGrid:(n=8)=>Array(n*n).fill(0),getLastStroke:()=>null,
    exportObservation:()=> 'data:image/png;base64,CHILD',exportCompanionObservation:()=> 'data:image/png;base64,CHILD',
    commitCompanionStrokes:commit,previewWithoutObject:vi.fn(),hasInkAt:()=>true,
  } as unknown as DrawingCanvasHandle}
  const hook=renderHook(()=>useCompanion({ownerId:'child',artworkId:'work',enabled:true,allowDrawing:true,locale:'zh',canvas,
    aspect:()=>1.5,surfaceSize:()=>({width:900,height:600}),initialGuide,onCommitted,onSpeak}))
  return {...hook,state,canvas,apply,commit,onCommitted,onSpeak,requestSelection}
}

test('explicit compound edits commit atomically to selected child ink with no new AI paths',async()=>{
  const hook=setup({id:'unrelated-guide',proposal:guide,additions:[],aspect:1.5})
  const original=hook.result.current.projection
  const actions=[{type:'color',value:'#459fd1'},{type:'scale',factor:.85},{type:'move',dx:-.035,dy:0}]
  vi.mocked(authFetch).mockResolvedValueOnce({status:'edit',targetId:target.id,actions})
  await act(async()=>{await hook.result.current.receive('把这个改成蓝色，再小一点，往左挪')})
  expect(hook.apply).toHaveBeenCalledExactlyOnceWith(target.id,actions,1)
  expect(hook.commit).not.toHaveBeenCalled()
  expect(hook.onCommitted).toHaveBeenCalledOnce()
  expect(hook.result.current.projection).toBe(original)
  expect(hook.onSpeak).toHaveBeenCalledWith('改好啦！保留了你的线条，不喜欢可以撤销。')
  const payload=vi.mocked(authFetch).mock.calls[0][1]!.body as {selectedTargetId:string;editingMode:string;objects:unknown[]}
  expect(payload).toMatchObject({selectedTargetId:target.id,editingMode:'assisted'})
  expect(payload.objects).toContainEqual(expect.objectContaining({id:target.id,source:'child'}))
})

test('local direct colour preserves the complete selected ink group',async()=>{
  const hook=setup()
  await act(async()=>{await hook.result.current.receive('把这个改成蓝色',{speak:false})})
  expect(hook.apply).toHaveBeenCalledExactlyOnceWith(target.id,[{type:'color',value:'#459fd1'}],1)
  expect(authFetch).not.toHaveBeenCalled()
  expect(hook.onSpeak).not.toHaveBeenCalled()
})

test('no selected ink means an existing projection is adjusted as a guide only',async()=>{
  const hook=setup({id:'guide',proposal:guide,additions:[],aspect:1.5});hook.state.selected=null
  await act(async()=>{await hook.result.current.receive('改成蓝色',{speak:false})})
  expect(hook.result.current.projection?.proposal.color).toBe('#459fd1')
  expect(hook.result.current.projection?.tracing).toBe(true)
  act(()=>hook.result.current.accept({speak:false}))
  expect(hook.apply).not.toHaveBeenCalled();expect(hook.commit).not.toHaveBeenCalled()
})

test('projection controls expose only labelled replace and clear actions without an adjustment menu',async()=>{
  const hook=setup({id:'guide',proposal:guide,additions:[],aspect:1.5})
  const voice={status:'idle',cancel:vi.fn()} as unknown as CompanionVoiceController
  render(<CompanionDock companion={hook.result.current} voice={voice} mode="together" visible enabled isDrawing={false} onVisible={vi.fn()} onInvite={vi.fn()} />)
  const originalGuide=hook.result.current.projection
  const choose=screen.getByRole('button',{name:'换一个'})
  expect(choose.textContent).toContain('换一个')
  await act(async()=>{fireEvent.click(choose)})
  expect(hook.result.current.materialPicker?.subject).toBe('sun')
  expect(hook.result.current.projection).toBe(originalGuide)
  expect(hook.state.selected?.id).toBe(target.id)
  act(()=>hook.result.current.closeMaterialPicker())
  expect(screen.getByRole('button',{name:'清除底图'}).textContent).toContain('清除底图')
  for(const name of ['调整','向左','沿着画','描好了']) expect(screen.queryByRole('button',{name,exact:true})).toBeNull()
  fireEvent.click(screen.getByRole('button',{name:'清除底图'}))
  expect(hook.result.current.projection).toBeNull()
  expect(hook.state.selected?.id).toBe(target.id)
  expect(hook.apply).not.toHaveBeenCalled()
  expect(hook.commit).not.toHaveBeenCalled()
})

test('starting selection during guide reveal finishes its animation and keeps the complete guide editable',async()=>{
  const hook=setup()
  vi.mocked(authFetch).mockResolvedValueOnce({reply:'底图来了',proposal:guide})
  await act(async()=>{await hook.result.current.takeTurn()})
  expect(hook.result.current.phase).toBe('sketching')
  expect(hook.result.current.projection?.turn).toBe(true)
  act(()=>hook.result.current.notifySelectionChanged(false))
  expect(hook.result.current.phase).toBe('projected')
  expect(hook.result.current.projection).toMatchObject({tracing:true,turn:false})
  expect(hook.result.current.projection?.durationMs).toBeUndefined()
  const before=hook.result.current.projection!.proposal.x
  act(()=>hook.result.current.edit({x:before+.01}))
  expect(hook.result.current.projection!.proposal.x).toBeCloseTo(before+.01)
  act(()=>vi.advanceTimersByTime(2000))
  expect(hook.result.current.phase).toBe('projected')
  expect(hook.commit).not.toHaveBeenCalled()
})

test('no selection never guesses the final or sole child stroke',async()=>{
  const hook=setup();hook.state.selected=null
  await act(async()=>{await hook.result.current.receive('改成蓝色')})
  expect(hook.apply).not.toHaveBeenCalled();expect(hook.requestSelection).toHaveBeenCalledOnce()
  expect(hook.result.current.message).toContain('圈起来')
})

test('selection completion replays the complete utterance, candidates and speak flag once',async()=>{
  const hook=setup();hook.state.selected=null
  const text='改成红色，哦不，改成蓝色，再小一点',alternatives=['换成蓝色，再小一点']
  vi.mocked(authFetch).mockResolvedValueOnce({status:'clarify',reason:'target',candidateIds:[target.id]})
  await act(async()=>{await hook.result.current.receive(text,{speak:true,alternatives,traceId:'original'})})
  hook.state.selected=hook.state.targets[0];hook.state.revision++
  act(()=>hook.result.current.notifySelectionChanged(false))
  expect(authFetch).toHaveBeenCalledOnce();expect(hook.apply).not.toHaveBeenCalled()
  vi.mocked(authFetch).mockResolvedValueOnce({status:'edit',targetId:target.id,actions:[{type:'color',value:'#459fd1'},{type:'scale',factor:.85}]})
  await act(async()=>{hook.result.current.notifySelectionChanged();await Promise.resolve()})
  const options=vi.mocked(authFetch).mock.calls[1][1]!
  expect(options.body).toMatchObject({utterance:text,asrAlternatives:alternatives,selectedTargetId:target.id})
  expect(hook.apply).toHaveBeenCalledOnce();expect(hook.apply.mock.calls[0][2]).toBe(2)
  expect(hook.onSpeak).toHaveBeenLastCalledWith('改好啦！保留了你的线条，不喜欢可以撤销。')
  act(()=>hook.result.current.notifySelectionChanged())
  expect(hook.apply).toHaveBeenCalledOnce();expect(authFetch).toHaveBeenCalledTimes(2)
})

test.each(['selection','draw','new-command'])('late interpretation cannot change an obsolete %s context',async(cause)=>{
  const hook=setup();let resolve!:(value:unknown)=>void
  vi.mocked(authFetch).mockImplementationOnce(()=>new Promise(r=>{resolve=r}))
  let pending!:Promise<void>
  act(()=>{pending=hook.result.current.receive('蓝色再小一点')})
  if(cause==='selection'){hook.state.revision++;act(()=>hook.result.current.notifySelectionChanged(false))}
  if(cause==='draw')hook.state.revision++
  if(cause==='new-command')await act(async()=>{await hook.result.current.receive('改成绿色')})
  await act(async()=>{resolve({status:'edit',targetId:target.id,actions:[{type:'color',value:'#459fd1'}]});await pending})
  expect(hook.apply).toHaveBeenCalledTimes(cause==='new-command'?1:0)
  if(cause==='new-command')expect(hook.apply.mock.calls[0][1]).toEqual([{type:'color',value:'#168777'}])
})

test('a failed atomic edit leaves guide untouched and never reports success',async()=>{
  const hook=setup({id:'guide',proposal:guide,additions:[],aspect:1.5})
  hook.state.selected={...target,guideId:'guide',source:'guided'}
  const before=hook.result.current.projection
  hook.apply.mockReturnValueOnce(false)
  await act(async()=>{await hook.result.current.receive('改成蓝色')})
  expect(hook.result.current.projection).toBe(before)
  expect(hook.onCommitted).not.toHaveBeenCalled()
  expect(hook.result.current.message).toContain('没有完成')
})

test('linked guide follows the ink transform about the traced group centre, not its own centre',async()=>{
  const hook=setup({id:'guide',proposal:{...guide,x:.1,y:.1,width:.4,height:.4},additions:[],aspect:1.5})
  hook.state.selected={...target,source:'guided',guideId:'guide',bounds:{x:.1,y:.1,width:.1,height:.1}}
  vi.mocked(authFetch).mockResolvedValueOnce({status:'edit',targetId:target.id,actions:[{type:'scale',factor:.5},{type:'move',dx:.1,dy:0}]})
  await act(async()=>{await hook.result.current.receive('缩小一半，再往右挪')})
  expect(hook.apply).toHaveBeenCalledOnce()
  expect(hook.result.current.projection).toMatchObject({id:'guide',tracing:true})
  const p=hook.result.current.projection!.proposal
  expect(p.x).toBeCloseTo(.225);expect(p.y).toBeCloseTo(.125);expect(p.width).toBeCloseTo(.2)
})

test('guide overflow rejects the entire linked edit before changing child ink',async()=>{
  const hook=setup({id:'guide',proposal:{...guide,x:.01,width:.7},additions:[],aspect:1.5})
  hook.state.selected={...target,guideId:'guide',source:'guided'}
  vi.mocked(authFetch).mockResolvedValueOnce({status:'edit',targetId:target.id,actions:[{type:'color',value:'#459fd1'},{type:'move',dx:-.1,dy:0}]})
  await act(async()=>{await hook.result.current.receive('变蓝，往左挪一点')})
  expect(hook.apply).not.toHaveBeenCalled()
  expect(hook.result.current.projection!.proposal.color).toBe('#abcdef')
})

test('edge-clipped targets synchronize their guide using the original brush footprint',async()=>{
  const hook=setup({id:'guide',proposal:{...guide,x:.1,y:.1,width:.4,height:.4},additions:[],aspect:1.5})
  hook.state.selected={...target,source:'guided',guideId:'guide',bounds:{x:0,y:.1,width:.18,height:.1},transformBounds:{x:-.02,y:.1,width:.2,height:.1}}
  vi.mocked(authFetch).mockResolvedValueOnce({status:'edit',targetId:target.id,actions:[{type:'scale',factor:.5}]})
  await act(async()=>{await hook.result.current.receive('把它缩小一半')})
  expect(hook.apply).toHaveBeenCalledOnce()
  expect(hook.result.current.projection!.proposal.x).toBeCloseTo(.09)
  const body=vi.mocked(authFetch).mock.calls[0][1]!.body as {objects:unknown[]}
  expect(body.objects[0]).not.toHaveProperty('transformBounds')
})

test('redraw is a new tracing guide and never stages removal of child ink',async()=>{
  const hook=setup()
  vi.mocked(authFetch).mockResolvedValueOnce({status:'redraw',targetId:target.id}).mockResolvedValueOnce({reply:'试试这样的太阳',proposal:guide,theme:'sun'})
  await act(async()=>{await hook.result.current.receive('把这个太阳换个造型')})
  expect(hook.result.current.projection).toMatchObject({tracing:true,editTargetId:undefined})
  expect(hook.canvas.current.previewWithoutObject).not.toHaveBeenCalledWith(target.id)
  expect(vi.mocked(authFetch).mock.calls[1][1]!.body).toMatchObject({context:{selectedDrawing:{id:target.id,source:'child'}}})
  act(()=>hook.result.current.accept())
  expect(hook.apply).not.toHaveBeenCalled();expect(hook.commit).not.toHaveBeenCalled()
})

test('requesting another named object creates a new tracing guide without requiring an ink selection',async()=>{
  const hook=setup();hook.state.selected=null;hook.state.targets=[]
  vi.mocked(authFetch).mockResolvedValueOnce({reply:'星星的底图来了',proposal:{...guide,template:'stars'},theme:'stars'})
  await act(async()=>{await hook.result.current.receive('你帮我再换一个星星吧')})
  expect(vi.mocked(authFetch).mock.calls[0][0]).toBe('/nilo/companion')
  expect(hook.requestSelection).not.toHaveBeenCalled()
  expect(hook.result.current.projection?.tracing).toBe(true)
  expect(hook.commit).not.toHaveBeenCalled()
})

test('questions and noops never authorize editing',async()=>{
  const hook=setup()
  vi.mocked(authFetch).mockResolvedValueOnce({reply:'可以试试你喜欢的颜色。'})
  await act(async()=>{await hook.result.current.receive('换成蓝色会不会更好？')})
  expect(vi.mocked(authFetch).mock.calls[0][0]).toBe('/nilo/companion')
  vi.mocked(authFetch).mockResolvedValueOnce({status:'noop'})
  await act(async()=>{await hook.result.current.receive('不要换成蓝色')})
  expect(hook.apply).not.toHaveBeenCalled();expect(hook.commit).not.toHaveBeenCalled()
})

test('child deletion cannot bypass direct-edit capability checks',async()=>{
  const hook=setup()
  await act(async()=>{await hook.result.current.receive('删掉这个')})
  expect(hook.apply).not.toHaveBeenCalled();expect(hook.commit).not.toHaveBeenCalled()
  expect(hook.result.current.message).toContain('换颜色')
})

test('voice undo finds the latest live assistance after later child strokes and earlier revert events',async()=>{
  const hook=setup()
  const stroke:CanvasStroke={type:'stroke',owner:'child',groupId:'child-first',points:[{x:.2,y:.2},{x:.4,y:.4}],color:'#abcdef',size:4,brushKind:'round',eraser:false,referenceWidth:900,referenceHeight:600}
  const document:CanvasDocument={version:1,baseSource:'child',operations:[stroke,
    {owner:'nilo',type:'assist',groupId:'first-edit',targetIds:[stroke.groupId],actions:[{type:'color',value:'#459fd1'}]},
    {owner:'nilo',type:'assist',groupId:'second-edit',targetIds:[stroke.groupId],actions:[{type:'move',dx:.1,dy:0}]},
    {...stroke,groupId:'later-child'},
  ]}
  hook.canvas.current.getDocument=()=>structuredClone(document)
  hook.canvas.current.undoCompanionStroke=vi.fn(()=>undoCanvasOwner(document,'nilo'))
  await act(async()=>{await hook.result.current.receive('恢复刚才的样子')})
  expect(document.operations.at(-1)).toMatchObject({type:'assist-revert',targetId:'second-edit'})
  await act(async()=>{await hook.result.current.receive('撤销刚才的修改')})
  expect(document.operations.at(-1)).toMatchObject({type:'assist-revert',targetId:'first-edit'})
  expect(document.operations.filter(op=>op.owner==='child')).toEqual([stroke,{...stroke,groupId:'later-child'}])
  await act(async()=>{await hook.result.current.receive('撤销修改')})
  expect(hook.canvas.current.undoCompanionStroke).toHaveBeenCalledTimes(2)
  expect(hook.result.current.message).toContain('没有可恢复')
})

test('an unrecognized explicit object name never silently edits the selected different object',async()=>{
  const hook=setup()
  vi.mocked(authFetch).mockResolvedValueOnce({status:'clarify',reason:'target',candidateIds:[]})
  await act(async()=>{await hook.result.current.receive('把红狐狸改成蓝色')})
  expect(authFetch).toHaveBeenCalledOnce()
  expect(hook.apply).not.toHaveBeenCalled()
})
