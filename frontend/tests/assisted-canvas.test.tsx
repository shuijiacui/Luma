import {createRef} from 'react'
import {act,cleanup,fireEvent,render} from '@testing-library/react'
import {afterEach,beforeEach,expect,test,vi} from 'vitest'
import {DrawingCanvas,type DrawingCanvasHandle} from '@/features/child/components/DrawingCanvas'
import {visibleOperations,type CanvasDocument,type CanvasStroke} from '@/features/child/canvasDocument'
import type {CanvasDraft} from '@/features/child/draft'
import {validateDrawingDocument} from '../../shared/niloDocument.mjs'

const stroke=(id:string,x=.3):CanvasStroke=>({type:'stroke',owner:'child',groupId:id,color:'#ff0000',size:4,brushKind:'round',eraser:false,referenceWidth:800,referenceHeight:600,points:[{x,y:.3},{x:x+.1,y:.4}]})
beforeEach(()=>{
 vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockImplementation(()=>({save:vi.fn(),restore:vi.fn(),scale:vi.fn(),clearRect:vi.fn(),drawImage:vi.fn(),translate:vi.fn(),rotate:vi.fn(),beginPath:vi.fn(),closePath:vi.fn(),arc:vi.fn(),moveTo:vi.fn(),lineTo:vi.fn(),fill:vi.fn(),fillRect:vi.fn(),globalAlpha:1,globalCompositeOperation:'source-over'}) as unknown as CanvasRenderingContext2D)
 vi.spyOn(HTMLCanvasElement.prototype,'toDataURL').mockReturnValue('data:image/png;base64,aW5r')
 vi.spyOn(HTMLCanvasElement.prototype,'getBoundingClientRect').mockReturnValue({left:0,top:0,width:800,height:600} as DOMRect)
 vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}})
})
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals()})
function setup(operations:CanvasDocument['operations']=[stroke('sun'),stroke('cloud',.65)]){
 const ref=createRef<DrawingCanvasHandle>()
 const draft:CanvasDraft={history:[''],document:{version:1,baseSource:'child',operations:structuredClone(operations)}}
 const change=vi.fn()
 const props={ref,draft,onStrokeComplete:vi.fn(),onSelectionChange:change,color:'#20352f',brushSize:4,isEraser:false}
 const view=render(<DrawingCanvas {...props}/>)
 const canvas=view.getByLabelText('自由绘画画布') as HTMLCanvasElement
 canvas.setPointerCapture=vi.fn();canvas.hasPointerCapture=vi.fn().mockReturnValue(true);canvas.releasePointerCapture=vi.fn()
 return {ref,draft,view,props,canvas,change}
}
function draw(canvas:HTMLCanvasElement){
 for(const name of ['pointerdown','pointerup']){
  const event=new Event(name,{bubbles:true})
  Object.assign(event,{pointerId:1,isPrimary:true,button:0,clientX:300,clientY:230})
  fireEvent(canvas,event)
 }
}

test('a compound explicit edit changes only selected ink, keeps originals, and undoes as one operation',()=>{
 const {ref,draft}=setup()
 const original=structuredClone(draft.document!)
 expect(ref.current!.getEditableTargets!()).toEqual([])
 act(()=>ref.current!.setSelection!(['sun']))
 const target=ref.current!.getSelectedTarget!()!
 expect(target.groupIds).toEqual(['sun'])
 let committed=false
 act(()=>{committed=ref.current!.applyAssistedEdit!(target.id,[{type:'color',value:'#0000ff'},{type:'scale',factor:.85},{type:'move',dx:-.035,dy:0}],ref.current!.getRevision())})
 expect(committed).toBe(true)
 expect(draft.document!.operations.slice(0,2)).toEqual(original.operations)
 expect(draft.document!.operations.at(-1)?.type).toBe('assist')
 const ink=visibleOperations(draft.document!).filter(op=>op.type==='stroke')
 expect(ink[0].color).toBe('#0000ff')
 expect(ink[1]).toEqual(original.operations[1])
 expect(validateDrawingDocument(draft.document)).toBe(true)
 expect(ref.current!.exportChildImage()).toBeNull()
 expect(ref.current!.exportImage()).not.toBeNull()
 act(()=>{ref.current!.undoCompanionStroke()})
 expect(visibleOperations(draft.document!)).toEqual(original.operations)
 expect(draft.document!.operations.at(-1)?.type).toBe('assist-revert')
 expect(ref.current!.getSelectedTarget!()?.groupIds).toEqual(['sun'])
})

test('selection changes, new ink and unsupported commands cannot apply stale or partial edits',()=>{
 const {ref,canvas}=setup()
 act(()=>ref.current!.setSelection!(['sun']))
 const first=ref.current!.getSelectedTarget!()!, revision=ref.current!.getRevision()
 act(()=>ref.current!.setSelection!(['cloud']))
 expect(ref.current!.applyAssistedEdit!(first.id,[{type:'color',value:'#0000ff'}],revision)).toBe(false)
 const selected=ref.current!.getSelectedTarget!()!,before=ref.current!.getDocument(),now=ref.current!.getRevision()
 expect(ref.current!.applyAssistedEdit!(selected.id,[{type:'color',value:'#0000ff'},{type:'delete'}],now)).toBe(false)
 expect(ref.current!.applyAssistedEdit!(selected.id,[{type:'color',value:'#0000ff'},{type:'move',dx:.5,dy:0}],now)).toBe(false)
 expect(ref.current!.getDocument()).toEqual(before)
 act(()=>draw(canvas))
 expect(ref.current!.applyAssistedEdit!(selected.id,[{type:'color',value:'#0000ff'}],now)).toBe(false)
})

test('only explicit tracing attaches guide identity; a visible guide merely marks exposure',()=>{
 const {ref,props,view,canvas,draft}=setup([])
 view.rerender(<DrawingCanvas {...props} guideVisible />)
 act(()=>draw(canvas))
 expect(draft.document?.guided).toBe(true)
 expect(draft.document?.operations[0]).not.toHaveProperty('guidance')
 const context={guideId:'guide-sun',name:'太阳',subjects:['sun'],bounds:{x:.2,y:.2,width:.3,height:.3}}
 view.rerender(<DrawingCanvas {...props} guideVisible tracingContext={context}/>)
 act(()=>draw(canvas));act(()=>draw(canvas))
 const targets=ref.current!.getEditableTargets!()
 expect(targets).toHaveLength(1)
 expect(targets[0]).toMatchObject({name:'太阳',source:'guided',guideId:'guide-sun'})
 expect(targets[0].groupIds).toHaveLength(2)
 act(()=>ref.current!.setSelection!([targets[0].groupIds[0]]))
 expect(ref.current!.getSelectedTarget!()).not.toHaveProperty('guideId')
})

test('saved assisted strokes reopen with their editable guide and original geometry',()=>{
 const original={...stroke('traced'),guidance:{guideId:'sun-guide',name:'太阳',subjects:['sun']}}
 const first=setup([original]),target=first.ref.current!.getEditableTargets!()[0]
 act(()=>{expect(first.ref.current!.applyAssistedEdit!(target.id,[{type:'color',value:'#0000ff'},{type:'scale',factor:.8}],first.ref.current!.getRevision())).toBe(true)})
 const editedBounds=first.ref.current!.getEditableTargets!()[0].bounds
 const saved=JSON.parse(JSON.stringify(first.ref.current!.getDocument())) as CanvasDocument
 first.view.unmount()
 const second=setup(saved.operations)
 expect(second.ref.current!.getEditableTargets!()[0].bounds).toEqual(editedBounds)
 expect(editedBounds.width).toBeCloseTo(target.bounds.width*.8)
 expect(second.ref.current!.getDocument().operations[0]).toEqual(original)
 expect(visibleOperations(second.ref.current!.getDocument()).find(op=>op.type==='stroke')).toMatchObject({color:'#0000ff'})
 act(()=>{second.ref.current!.undoCompanionStroke()})
 expect(visibleOperations(second.ref.current!.getDocument())).toEqual([original])
 expect(validateDrawingDocument(second.ref.current!.getDocument())).toBe(true)
})
test('edge-clipped marks have valid visible target bounds and can still change colour',()=>{
 const {ref}=setup([{...stroke('edge',0),points:[{x:0,y:0},{x:.1,y:.1}]}])
 act(()=>ref.current!.setSelection!(['edge']))
 const target=ref.current!.getSelectedTarget!()!
 expect(target.bounds.x).toBe(0);expect(target.bounds.y).toBe(0)
 expect(ref.current!.applyAssistedEdit!(target.id,[{type:'color',value:'#0000ff'}],ref.current!.getRevision())).toBe(true)
})
