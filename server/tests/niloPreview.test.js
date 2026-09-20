import { expect, test, vi } from 'vitest'
import { PNG } from 'pngjs'
import { renderReviewCandidate, decodeCanvas, clearInternalPlacement } from '../src/services/niloPreview.js'
import { structureFailure, readStructure, fitStructuralPart } from '../src/services/niloStructure.js'
import { generateNiloDialogue } from '../src/services/niloDialogue.js'

function canvas(width=512,height=512) {
  const png=new PNG({width,height}); png.data.fill(255)
  png.data[0]=25 // Original ink must survive composition.
  return PNG.sync.write(png).toString('base64')
}
const p={template:'custom',subject:'眼睛',target:'鱼',relation:'鱼头的眼睛',x:.58,y:.4,width:.06,height:.06,rotation:0,color:'#d74952',strokeWidth:5,brushKind:'round',placement:'inside',anchor:{x:.25,y:.3,width:.5,height:.3},sketch:{aspect:1,paths:[[['E',.5,.5,.32,.32]]]}}
const structure={kind:'fish',confidence:.9,regions:{body:{x:.25,y:.3,width:.5,height:.3},head:{x:.55,y:.33,width:.17,height:.2},tail:{x:.1,y:.32,width:.15,height:.26}}}
const context={locale:'zh',takeTurn:true,requestDrawing:true,utterance:'轮到你了',canvasSize:{width:512,height:512}}
const approved={targetVisible:true,usesExistingDrawing:true,detailRelated:true,placementCorrect:true,alreadyPresent:false,confidence:.9,geometryConfidence:.9,relationConfidence:.9}

test('composite keeps original pixels, adds actual paths at their physical aspect and changes no source buffer',()=>{
  const image=canvas(768,384),original=decodeCanvas(image)
  const result=renderReviewCandidate(image,{...p,width:.1,height:.2}, {...context,canvasAspect:2,canvasSize:{width:1536,height:768}})
  const after=decodeCanvas(result.imageBase64)
  expect(result.proposal.width*2/result.proposal.height).toBeCloseTo(1)
  expect(after.data[0]).toBe(25)
  expect(after.data.equals(original.data)).toBe(false)
  expect(decodeCanvas(image).data.equals(original.data)).toBe(true)
  const changed=[]
  for(let i=0;i<after.data.length;i+=4) if(after.data[i]!==original.data[i]) changed.push({x:(i/4%768)/768,y:Math.floor(i/4/768)/384})
  expect(changed.length).toBeGreaterThan(20)
  expect(changed.every(q=>q.x>=result.proposal.x-.02 && q.x<=result.proposal.x+result.proposal.width+.02 && q.y>=result.proposal.y-.02 && q.y<=result.proposal.y+result.proposal.height+.02)).toBe(true)
})

test('invalid PNG, CRC corruption, mismatched aspect and oversized dimensions fail without a review call',async()=>{
  const large=Buffer.from(canvas(),'base64'); large.writeUInt32BE(50000,16)
  expect(()=>decodeCanvas(large.toString('base64'))).toThrow('canvas_too_large')
  const corrupt=Buffer.from(canvas(),'base64'); corrupt[29]^=255
  expect(()=>decodeCanvas(corrupt.toString('base64'))).toThrow()
  expect(()=>renderReviewCandidate(canvas(512,256),p,{canvasAspect:1})).toThrow('canvas_aspect_mismatch')
  const vision=vi.fn().mockResolvedValue({sceneType:'object',grounding:{visible:'鱼轮廓',confidence:.9},reply:'画眼睛',structure,proposal:p})
  const result=await generateNiloDialogue({imageBase64:'invalid',context,chatWithImage:vision})
  expect(result.proposal).toBeUndefined();expect(vision).toHaveBeenCalledOnce()
})

test.each([false,true])('head/tail constraints reject a tail-side eye in both horizontal directions, mirrored=%s',mirror=>{
  const box=b=>mirror?{...b,x:1-b.x-b.width}:b
  const s={...structure,regions:Object.fromEntries(Object.entries(structure.regions).map(([k,b])=>[k,box(b)]))}
  const raw={structure:s,proposal:{template:'part',part:'eye'}}
  expect(structureFailure(raw,box(p))).toBeNull()
  expect(structureFailure(raw,box({...p,x:.3}))).toBe('misplaced_detail')
})

test('window must fit the wall and custom renderers cannot bypass required structure',()=>{
  const raw={structure:{kind:'house',confidence:.9,regions:{wall:{x:.3,y:.45,width:.4,height:.35},roof:{x:.2,y:.2,width:.6,height:.25}}},proposal:{template:'custom',subject:'窗户'}}
  expect(structureFailure(raw,{x:.4,y:.55,width:.12,height:.12})).toBeNull()
  expect(structureFailure(raw,{x:.4,y:.25,width:.12,height:.12})).toBe('misplaced_detail')
  expect(structureFailure({...raw,structure:undefined},p)).toBe('missing_structure')
  expect(readStructure({...structure,confidence:NaN})).toBeNull()
  expect(readStructure({...structure,regions:{head:{x:-1,y:0,width:.1,height:.1}}})).toBeNull()
})

test('before/after review receives actual PNG; failed review cannot produce committed geometry',async()=>{
  const image=canvas()
  const raw={sceneType:'object',grounding:{visible:'鱼身体与左侧尾巴',confidence:.9},reply:'补一只眼睛',structure,
    proposal:{template:'part',part:'eye',target:'鱼',relation:'鱼头眼睛',placement:'inside',anchor:p.anchor,position:{u:.72,v:.44},scale:.15}}
  const vision=vi.fn(async(_image,_prompt,opts)=>opts.kind==='nilo_companion_review'?approved:raw)
  const result=await generateNiloDialogue({imageBase64:image,context,chatWithImage:vision})
  expect(result.geometryReviewed).toBe(true)
  expect(vision).toHaveBeenCalledTimes(2)
  const call=vision.mock.calls[1]
  expect(call[0]).toBe(image);expect(call[1]).toContain('BEFORE/AFTER')
  expect(decodeCanvas(call[2].reviewImage).width).toBe(512)
  expect(call[2].reviewImage).not.toBe(image)
  const reject=vi.fn(async(_image,_prompt,opts)=>opts.kind==='nilo_companion_review'?{...approved,placementCorrect:false}:raw)
  const failed=await generateNiloDialogue({imageBase64:image,context,chatWithImage:reject})
  expect(failed.proposal).toBeUndefined();expect(failed.geometryReviewed).toBeUndefined()
  expect(reject).toHaveBeenCalledTimes(4)
})

test('structure rejects wrong location before spending a visual-review call',async()=>{
  const raw={sceneType:'object',grounding:{visible:'鱼身体与左侧尾巴',confidence:.9},reply:'补眼睛',structure,
    proposal:{template:'part',part:'eye',target:'鱼',relation:'眼睛',placement:'inside',anchor:p.anchor,position:{u:.15,v:.44},scale:.15}}
  const vision=vi.fn().mockResolvedValue(raw)
  const result=await generateNiloDialogue({imageBase64:canvas(),context,chatWithImage:vision})
  expect(result.proposal).toBeUndefined();expect(vision).toHaveBeenCalledTimes(2)
  expect(vision.mock.calls.every(call=>call[2].kind==='nilo_companion_vision')).toBe(true)
})

test('small feature offsets may fit the supporting region before review, but cannot cross the body',()=>{
 const raw={structure,proposal:{template:'part',part:'eye'}}
 const nearby={...p,x:.53}
 const fitted=fitStructuralPart(raw,nearby)
 expect(fitted.x).toBeGreaterThanOrEqual(.55)
 expect(structureFailure(raw,fitted)).toBeNull()
 const wrong={...p,x:.3}
 expect(fitStructuralPart(raw,wrong)).toEqual(wrong)
 expect(structureFailure(raw,wrong)).toBe('misplaced_detail')
})

test('a near-outline internal detail gets only a small pre-review move, leaving original ink intact',()=>{
  const png=decodeCanvas(canvas())
  for(let y=60;y<150;y++)for(let x=180;x<185;x++){
    const i=(y*512+x)*4;png.data[i]=30;png.data[i+1]=45;png.data[i+2]=40
  }
  const fringe={...p,subject:'刘海',x:.368,y:.153,width:.204,height:.204/2.8,strokeWidth:8,
    anchor:{x:.29,y:.04,width:.36,height:.68},sketch:{aspect:2.8,paths:[[['M',.04,.12],['Q',.18,.98,.32,.3],['Q',.47,1,.61,.27],['Q',.78,.96,.96,.14]]]}}
  const before=Buffer.from(png.data),fixed=clearInternalPlacement(png,fringe,1,{height:512})
  expect(fixed.x).toBeGreaterThan(fringe.x)
  expect(fixed.x-fringe.x).toBeLessThanOrEqual(.031)
  expect(fixed.y).toBe(fringe.y)
  expect(fixed.sketch).toEqual(fringe.sketch)
  expect(fixed.width).toBe(fringe.width)
  expect(png.data.equals(before)).toBe(true)
  const result=renderReviewCandidate(PNG.sync.write(png).toString('base64'),fringe,context)
  expect(result.proposal).toEqual(fixed)
  const after=decodeCanvas(result.imageBase64)
  expect([...after.data.subarray((100*512+182)*4,(100*512+182)*4+4)]).toEqual([30,45,40,255])
})

test('pixel fitting never shifts attached parts or relocates a blocked detail to a distant blank area',()=>{
  const png=decodeCanvas(canvas());png.data.fill(0)
  for(let i=3;i<png.data.length;i+=4)png.data[i]=255
  expect(clearInternalPlacement(png,p,1,{height:512})).toEqual(p)
  const joined={...p,attachment:{x:.5,y:.5}}
  expect(clearInternalPlacement(png,joined,1,{height:512})).toBe(joined)
})

test('unused optional structure does not veto a button, while required eye regions remain mandatory',()=>{
  const invalidStructure={kind:'robot',confidence:.9,regions:{body:{x:.2,y:.3,width:.5,height:.4}}}
  expect(structureFailure({structure:invalidStructure,proposal:{template:'part',part:'button'}},p)).toBeNull()
  expect(structureFailure({structure:invalidStructure,proposal:{template:'part',part:'eye'}},p)).toBe('missing_structure')
})
