import {afterEach,expect,test,vi} from 'vitest'
import {buildStrokeSelection} from '@/features/child/companion/strokeSelection'
import {visibleOperations,type CanvasDocument,type CanvasStroke} from '@/features/child/canvasDocument'

const stroke=(id:string,eraser=false):CanvasStroke=>({owner:'child',type:'stroke',groupId:id,eraser,brushKind:'round',color:'#20352f',size:8,referenceWidth:1000,referenceHeight:600,points:[{x:.2,y:.3},{x:.8,y:.3}]})
function context(paint:'empty'|'left') {
 const composites:string[]=[]
 const ctx={save:vi.fn(),restore:vi.fn(),scale:vi.fn(),translate:vi.fn(),setTransform:vi.fn(),rotate:vi.fn(),beginPath:vi.fn(),closePath:vi.fn(),arc:vi.fn(),moveTo:vi.fn(),lineTo:vi.fn(),fill:vi.fn(),fillRect:vi.fn(),drawImage:vi.fn(),globalCompositeOperation:'source-over',globalAlpha:1,
  getImageData:vi.fn((_x:number,_y:number,width:number,height:number)=>{
   const data=new Uint8ClampedArray(width*height*4)
   if(paint==='left')for(let row=0;row<height;row++)for(let col=0;col<Math.max(1,Math.floor(width/3));col++)data[(row*width+col)*4+3]=255
   return{data,width,height}
  })}
 ctx.fill.mockImplementation(()=>{composites.push(ctx.globalCompositeOperation)})
 vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D)
 vi.spyOn(HTMLCanvasElement.prototype,'toDataURL').mockReturnValue('data:image/png;base64,aW5r')
 return{ctx,composites}
}
afterEach(()=>vi.restoreAllMocks())

test('selection can resolve erasure masks before the first assistance without changing legacy rendering',()=>{
 const source:CanvasDocument={version:1,baseSource:'child',operations:[stroke('ink'),stroke('eraser',true)]}
 expect(visibleOperations(source)).toEqual(source.operations)
 const resolved=visibleOperations(source,{maskErasers:true})
 expect(resolved[1]).toMatchObject({groupId:'ink',erasures:[source.operations[1]]})
 expect(source.operations[0]).not.toHaveProperty('erasures')
})

test('fully erased ink disappears from selectable records while unaffected ink requires no raster read',()=>{
 const{ctx}=context('empty'),plain=stroke('plain'),masked={...stroke('masked'),erasures:[stroke('eraser',true)]}
 const items=buildStrokeSelection([plain,masked],1000,600)
 expect(items.map(item=>item.stroke.groupId)).toEqual(['plain'])
 expect(items[0].candidate.coverage).toBeUndefined()
 expect(ctx.getImageData).toHaveBeenCalledOnce()
})

test('surviving alpha controls visible bounds, hit coverage and highlight; masks never overwrite original paths',()=>{
 const{composites}=context('left'),masked={...stroke('masked'),erasures:[stroke('eraser',true)]}
 const original=structuredClone(masked)
 const[item]=buildStrokeSelection([masked],1000,600)
 expect(item.candidate.bounds.width).toBeLessThan(.3)
 expect(item.candidate.coverage?.alpha.some(value=>value===255)).toBe(true)
 expect(item.candidate.highlight?.url).toBe('data:image/png;base64,aW5r')
 expect(composites).toContain('source-over');expect(composites).toContain('destination-out')
 expect(masked).toEqual(original)
})

test('raster work is locally cropped and bounded across many erased strokes',()=>{
 const{ctx}=context('left')
 const masked={...stroke('masked'),points:[{x:.1,y:.1},{x:.9,y:.9}],erasures:[stroke('eraser',true)]}
 const items=buildStrokeSelection(Array.from({length:50},(_,i)=>({...masked,groupId:String(i)})),2000,1200)
 let pixels=0
 for(const call of ctx.getImageData.mock.calls){const width=call[2],height=call[3];expect(Math.max(width,height)).toBeLessThanOrEqual(512);expect(width*height).toBeLessThan(67000);pixels+=width*height}
 expect(pixels).toBeLessThan(2_100_000)
 expect(items).toHaveLength(50)
})
