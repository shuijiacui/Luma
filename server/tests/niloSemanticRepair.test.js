import {expect,test,vi} from 'vitest'
import {PNG} from 'pngjs'
import {generateNiloDialogue} from '../src/services/niloDialogue.js'
import {protocolReviewFailure} from '../src/services/niloProtocolTurn.js'
import {LLMParseError} from '../src/services/llmClient.js'
import {encodeOccupancy,pixelOccupancy} from '../../shared/niloOccupancy.mjs'
import {traceNode} from '../src/services/tracing.js'

vi.mock('../src/services/tracing.js',()=>({traceNode:vi.fn(),traceLLM:vi.fn(),startSpan:vi.fn(()=>({end:vi.fn()}))}))

const left={x:.08,y:.15,width:.35,height:.65},right={x:.56,y:.15,width:.35,height:.65}
const observed={subjects:[
  {subject:'画板',family:'object',confidence:.9,evidence:'左侧竖直轮廓',bounds:left,existingParts:[],regions:[{name:'中央空白',confidence:.9,bounds:{x:.15,y:.3,width:.18,height:.32}}]},
  {subject:'机器人',family:'object',confidence:.9,evidence:'右侧竖直轮廓',bounds:right,existingParts:[],regions:[{name:'胸前面板',confidence:.9,bounds:{x:.64,y:.3,width:.18,height:.32}}]},
]}
const first={intent:{subjectId:'S1',regionId:'S1R1',detail:'铅笔',relationship:'画板中央的铅笔'},drawing:{aspect:.7,paths:[[['E',.5,.5,.35,.4]]],placement:{mode:'inside',at:[.5,.5],scale:.3,joinId:null}}}
const alternative={...first,intent:{subjectId:'S2',regionId:'S2R1',detail:'按钮',relationship:'机器人的胸前按钮'}}
const approval={targetVisible:true,usesExistingDrawing:true,detailRelated:true,placementCorrect:true,alreadyPresent:false,confidence:.9,geometryConfidence:.9,relationConfidence:.9}
const context={takeTurn:true,requestDrawing:true,useDrawingKnowledge:true,drawingProtocol:2,turnScope:'scene',locale:'zh',utterance:'轮到你了',canvasAspect:1,canvasSize:{width:256,height:256},drawingStyle:{color:'#20352f',brushKind:'round',brushSize:3},scene:{childBounds:{x:.05,y:.1,width:.9,height:.8},niloBounds:null,recentContributions:[{owner:'child',bounds:{x:.05,y:.1,width:.9,height:.8},color:'#20352f',brushKind:'round',strokeCount:8}]}}
function canvas() {
  const png=new PNG({width:256,height:256});png.data.fill(255)
  for(const box of [left,right]){
    const x1=Math.round(box.x*256),x2=Math.round((box.x+box.width)*256),y1=Math.round(box.y*256),y2=Math.round((box.y+box.height)*256)
    for(let y=y1;y<=y2;y++)for(let x=x1;x<=x2;x++)if(x===x1||x===x2||y===y1||y===y2){const i=(y*256+x)*4;png.data[i]=png.data[i+1]=png.data[i+2]=30}
  }
  return {imageBase64:PNG.sync.write(png).toString('base64'),collisionMap:encodeOccupancy(pixelOccupancy(png))}
}
async function run(responses,{observation=observed,extraContext={},signal}={}) {
  const model=vi.fn().mockResolvedValueOnce(observation)
  for(const value of responses){if(value instanceof Error)model.mockRejectedValueOnce(value);else if(typeof value==='function')model.mockImplementationOnce(value);else model.mockResolvedValueOnce(value)}
  const {imageBase64,collisionMap}=canvas()
  const result=await generateNiloDialogue({imageBase64,context:{...context,collisionMap,...extraContext},signal,chatWithImage:model})
  return {result,model}
}
const plans=(...items)=>({version:2,plans:items})
const reviewCalls=model=>model.mock.calls.filter(c=>c[2].kind==='nilo_companion_review')

test('a disputed target unlocks the idea and can use another existing subject within five calls',async()=>{
  const {result,model}=await run([plans(first),{...approval,targetVisible:false},plans(alternative),approval])
  expect(result).toMatchObject({status:'ready',proposal:{target:'机器人',subject:'按钮'},drawingMetrics:{reviews:2,repairs:1}})
  expect(model).toHaveBeenCalledTimes(5)
  const repair=model.mock.calls[3][1]
  expect(repair).toContain('wrong_target');expect(repair).toContain('rejectedIntent');expect(repair).not.toContain('"lockedIntent":')
  expect(traceNode).toHaveBeenCalledWith('nilo_protocol',expect.objectContaining({stage:'review',code:'wrong_target',repairKind:'semantic'}))
})

test('a cached alternative is still independently compiled, placed and reviewed without replanning',async()=>{
  const {result,model}=await run([plans(first,alternative),{...approval,targetVisible:false},approval])
  expect(result.status).toBe('ready');expect(model).toHaveBeenCalledTimes(4)
  expect(result.drawingMetrics).toMatchObject({reviews:2,repairs:0,preflight:2})
  expect(reviewCalls(model)[0][2].reviewImage).not.toBe(reviewCalls(model)[1][2].reviewImage)
})

test('a disputed sole subject returns recovery without inventing a new observation or ID',async()=>{
  const {result,model}=await run([plans(first),{...approval,targetVisible:false}],{observation:{subjects:[observed.subjects[0]]}})
  expect(result).toMatchObject({status:'clarify',reason:'unclear_target'});expect(result.proposal).toBeUndefined()
  expect(model).toHaveBeenCalledTimes(3)
})

test.each([
  ['same disputed subject',()=>({...first,intent:{...first.intent,detail:'重命名后的装饰'}})],
  ['fabricated subject',()=>({...alternative,intent:{...alternative.intent,subjectId:'S999'}})],
  ['out of range coordinates',()=>({...alternative,drawing:{...alternative.drawing,paths:[[['M',0,0],['L',2,2]]]}})],
])('semantic repair cannot evade grounding through %s',async(_label,bad)=>{
  const {result,model}=await run([plans(first),{...approval,targetVisible:false},plans(bad())])
  expect(result.proposal).toBeUndefined();expect(model).toHaveBeenCalledTimes(4);expect(reviewCalls(model)).toHaveLength(1)
})

test('format repair keeps intent locked and rejects a new idea even when that idea would compile',async()=>{
  const broken={...first,drawing:{...first.drawing,paths:[[['BAD',.5,.5]]]}}
  const changed=await run([plans(broken),plans(alternative)])
  expect(changed.result.proposal).toBeUndefined();expect(reviewCalls(changed.model)).toHaveLength(0)
  expect(changed.model.mock.calls[2][1]).toContain('"lockedIntent":')
  const fixed=await run([plans(broken),plans(first),approval])
  expect(fixed.result.status).toBe('ready');expect(fixed.model).toHaveBeenCalledTimes(4)
})

test('collision repair cannot change the intent or lower the occupancy checks',async()=>{
  const {result,model}=await run([plans(first),plans(alternative)],{extraContext:{collisionMap:encodeOccupancy(Array(65536).fill(1))}})
  expect(result.proposal).toBeUndefined();expect(reviewCalls(model)).toHaveLength(0)
  expect(model.mock.calls[2][1]).toContain('collision_or_placement')
  expect(model.mock.calls[2][1]).toContain('"lockedIntent":')
})

test.each([
  ['detailRelated',false,'unrelated_detail'],['usesExistingDrawing',false,'unrelated_detail'],['alreadyPresent',true,'duplicate_detail'],
])('%s failure permits a different detail but never repeats the rejected one',async(field,value,code)=>{
  const different={...first,intent:{...first.intent,detail:'边框花纹',relationship:'在原有框架内添花纹'}}
  const good=await run([plans(first),{...approval,[field]:value},plans(different),approval])
  expect(good.result.status).toBe('ready');expect(good.model.mock.calls[3][1]).toContain(code)
  const repeated=await run([plans(first),{...approval,[field]:value},plans({...first,intent:{...first.intent,relationship:'换一种说法'}})])
  expect(repeated.result.proposal).toBeUndefined();expect(reviewCalls(repeated.model)).toHaveLength(1)
})

test('placement semantic repair may choose another idea but still must pass visual review',async()=>{
  const {result,model}=await run([plans(first),{...approval,placementCorrect:false},plans(alternative),{...approval,placementCorrect:false}])
  expect(result.proposal).toBeUndefined();expect(model).toHaveBeenCalledTimes(5);expect(reviewCalls(model)).toHaveLength(2)
})

test('two rejected cached candidates consume the review budget without an extra plan or third review',async()=>{
  const {result,model}=await run([plans(first,alternative),{...approval,placementCorrect:false},{...approval,placementCorrect:false}])
  expect(result.proposal).toBeUndefined();expect(model).toHaveBeenCalledTimes(4);expect(result.drawingMetrics.reviews).toBe(2)
})

test('review JSON errors count against the same review budget and retain the original idea',async()=>{
  const {result,model}=await run([plans(first),new LLMParseError('bad review','{'),plans(first),approval])
  expect(result.status).toBe('ready');expect(model).toHaveBeenCalledTimes(5);expect(result.drawingMetrics.reviews).toBe(2)
  expect(model.mock.calls[3][1]).toContain('invalid_review');expect(model.mock.calls[3][1]).toContain('"lockedIntent":')
})

test('review sees neutral pixel geometry and child statements without the planner labels',async()=>{
  const secret={...first,intent:{...first.intent,detail:'独有意图标签XYZ',relationship:'未经证实的关系ABC'}}
  const {result,model}=await run([plans(secret),approval])
  expect(result.status).toBe('ready')
  const prompt=reviewCalls(model)[0][1]
  expect(prompt).toContain('pixels FIRST');expect(prompt).toContain('SUPPORTING PIXEL BOX')
  for(const label of ['独有意图标签XYZ','未经证实的关系ABC','中央空白','画板'])expect(prompt).not.toContain(label)
})

test('cancellation after a failed review starts no repair and never yields replacement ink',async()=>{
  const controller=new AbortController()
  const {result,model}=await run([plans(first),()=>{controller.abort();return {...approval,targetVisible:false}}],{signal:controller.signal})
  expect(result.proposal).toBeUndefined();expect(model).toHaveBeenCalledTimes(3)
})

test('uncertain confidence and invalid field shapes are not promoted to semantic permission',()=>{
  expect(protocolReviewFailure({...approval,relationConfidence:.6})).toEqual({kind:'confidence',code:'uncertain_review'})
  expect(protocolReviewFailure({...approval,targetVisible:'false'})).toEqual({kind:'format',code:'invalid_review'})
})
