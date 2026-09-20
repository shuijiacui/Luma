import {expect,test,vi} from 'vitest'
import {PNG} from 'pngjs'
import {drawingScene,compileDrawingPlan,fitDrawingPlan,recoverDrawingPlans,orientAttachedSketch} from '../src/services/niloDrawingProtocol.js'
import {LLMParseError} from '../src/services/llmClient.js'
import {generateNiloDialogue,validateProposal,sanitizeDialogueContext} from '../src/services/niloDialogue.js'
import {encodeOccupancy,decodeOccupancy,pixelOccupancy} from '../../shared/niloOccupancy.mjs'
import {projectionFits,placementFits} from '../../shared/niloCollision.mjs'
import {sanitizeKnowledgeObservation} from '../src/services/niloDrawingKnowledge.js'
import {evaluationReport} from '../scripts/nilo-eval-report.mjs'

const box={x:.2,y:.2,width:.6,height:.6}
const observed={subjects:[{id:'tree',subject:'树',family:'plant',evidence:'一个有宽树干的树形轮廓',confidence:.9,bounds:box,existingParts:['树干'],regions:[{name:'树干',bounds:{x:.35,y:.4,width:.3,height:.35},confidence:.9}]}]}
const observation={subjects:observed.subjects.map(s=>({...s,visible:s.evidence}))}
const scene=drawingScene(observation)
const plan={intent:{subjectId:'S1',regionId:'S1R1',detail:'树节',relationship:'树干中的小树节'},drawing:{aspect:.7,paths:[[['E',.5,.5,.35,.4]]],placement:{mode:'inside',at:[.5,.5],scale:.3,joinId:null}}}
const approval={targetVisible:true,usesExistingDrawing:true,detailRelated:true,placementCorrect:true,alreadyPresent:false,confidence:.9,geometryConfidence:.9,relationConfidence:.9}
const context={takeTurn:true,requestDrawing:true,useDrawingKnowledge:true,drawingProtocol:2,turnScope:'scene',locale:'zh',utterance:'轮到你了',canvasAspect:1,canvasSize:{width:256,height:256},drawingStyle:{color:'#20352f',brushKind:'round',brushSize:3},scene:{childBounds:box,niloBounds:null,recentContributions:[{owner:'child',bounds:box,color:'#20352f',brushKind:'round',strokeCount:4}]}}
function canvas() {
  const png=new PNG({width:256,height:256});png.data.fill(255)
  for(let y=52;y<205;y++)for(const x of [52,53,202,203]){const i=(y*256+x)*4;png.data[i]=png.data[i+1]=png.data[i+2]=30}
  return {png,imageBase64:PNG.sync.write(png).toString('base64')}
}
async function run(responses,extra={}) {
  const model=vi.fn();for(const r of responses)model.mockResolvedValueOnce(r)
  const image=canvas()
  const result=await generateNiloDialogue({imageBase64:image.imageBase64,context:{...context,collisionMap:encodeOccupancy(pixelOccupancy(image.png)),...extra},chatWithImage:model})
  return {result,model}
}

test.each(['人物','大树','小猫','汽车','机器人','吉他','长角的想象生物','未知曲线'])('one primitive contract compiles details for %s without a matching template',name=>{
  const s=drawingScene({subjects:[{...observation.subjects[0],subject:name}]})
  const compiled=compileDrawingPlan(plan,s,context,validateProposal)
  expect(compiled.ok).toBe(true);expect(compiled.proposal.target).toBe(name)
  expect(compiled.proposal.template).toBe('custom');expect(compiled.proposal.color).toBe('#20352f')
})

test('region references are contained, program assigned and cannot point to an absent subject',()=>{
  expect(drawingScene({subjects:[{...observation.subjects[0],regions:[{name:'bad',confidence:.9,bounds:{x:0,y:0,width:1,height:1}}]}]}).subjects[0].regions).toHaveLength(1)
  expect(compileDrawingPlan({...plan,intent:{...plan.intent,subjectId:'S999'}},scene,context,validateProposal)).toMatchObject({ok:false,code:'intent_reference'})
  expect(compileDrawingPlan({intent:plan.intent,placement:plan.drawing.placement},scene,context,validateProposal)).toMatchObject({ok:false,code:'path_syntax',intent:plan.intent})
  expect(compileDrawingPlan({...plan,drawing:{...plan.drawing,paths:[['EXEC','anything']]}},scene,context,validateProposal)).toMatchObject({ok:false,code:'path_syntax',intent:plan.intent})
})

test('all pixels use the exact canvas occupancy threshold; malformed payloads are bounded',()=>{
  const grid=Array(65536).fill(0);grid[0]=.025;grid[1]=.026;grid[65535]=1
  const encoded=encodeOccupancy(grid),decoded=decodeOccupancy(encoded)
  expect(decoded[0]).toBe(0);expect(decoded[1]).toBe(1);expect(decoded[65535]).toBe(1)
  expect(decodeOccupancy({...encoded,size:1024})).toBeNull()
  expect(decodeOccupancy({...encoded,bits:encoded.bits+'x'})).toBeNull()
  expect(sanitizeDialogueContext({...context,collisionMap:encoded}).collisionMap).toEqual(encoded)
  expect(sanitizeDialogueContext({...context,takeTurn:false,collisionMap:encoded}).collisionMap).toBeUndefined()
})

test('the complete protocol observes, compiles, checks and reviews exactly the returned geometry',async()=>{
  const {result,model}=await run([observed,{version:2,plans:[plan]},approval])
  expect(result).toMatchObject({status:'ready',protocolVersion:2,geometryReviewed:true})
  expect(model).toHaveBeenCalledTimes(3)
  expect(model.mock.calls[1][1]).not.toContain('balloon_string')
  expect(model.mock.calls[1][1]).not.toContain('collisionMap')
  expect(model.mock.calls[2][2].reviewImage).toBeTruthy()
  const grid=pixelOccupancy(canvas().png)
  expect(projectionFits(result.proposal,grid,1,context.canvasSize)).toBe(true)
  expect(placementFits(result.proposal,1,context.canvasSize)).toBe(true)
})

test('a blocked first candidate falls through to its already planned backup without another planning call',async()=>{
  const tooBig={...plan,drawing:{...plan.drawing,placement:{...plan.drawing.placement,at:[.1,.1],scale:.65}}}
  const {result,model}=await run([observed,{version:2,plans:[tooBig,plan]},approval])
  expect(result.status).toBe('ready');expect(model).toHaveBeenCalledTimes(3)
})

test('a syntax repair retains intent, and changing that intent during repair is rejected',async()=>{
  const broken={...plan,drawing:{...plan.drawing,paths:[[['BAD',.5,.5]]]}}
  const fixed=await run([observed,{version:2,plans:[broken]},{version:2,plans:[plan]},approval])
  expect(fixed.result.status).toBe('ready');expect(fixed.model).toHaveBeenCalledTimes(4)
  expect(fixed.model.mock.calls[2][1]).toContain('lockedIntent')
  const changed=await run([observed,{version:2,plans:[broken]},{version:2,plans:[{...plan,intent:{...plan.intent,detail:'宇宙飞船'}}]}])
  expect(changed.result.proposal).toBeUndefined();expect(changed.model).toHaveBeenCalledTimes(3)
})

test('no geometry survives a saturated canvas, rejected visual review or cancellation',async()=>{
  const full=await run([observed,{version:2,plans:[plan]},{version:2,plans:[plan]}],{collisionMap:encodeOccupancy(Array(65536).fill(1))})
  expect(full.result.proposal).toBeUndefined();expect(full.model.mock.calls.some(c=>c[2].kind==='nilo_companion_review')).toBe(false)
  const rejected=await run([observed,{version:2,plans:[plan]},{...approval,placementCorrect:false},{version:2,plans:[plan]},{...approval,placementCorrect:false}])
  expect(rejected.result.proposal).toBeUndefined();expect(rejected.model).toHaveBeenCalledTimes(5)
  const signal=new AbortController();signal.abort()
  const model=vi.fn()
  const result=await generateNiloDialogue({imageBase64:canvas().imageBase64,context,signal:signal.signal,chatWithImage:model})
  expect(result.proposal).toBeUndefined();expect(model).not.toHaveBeenCalled()
})

test('flat command arrays repair losslessly; unknown commands and impossible scales stay errors',()=>{
  const flat={...plan,drawing:{...plan.drawing,paths:[['M',.1,.1],['Q',.5,.7,.9,.9]]}}
  expect(compileDrawingPlan(flat,scene,context,validateProposal).ok).toBe(true)
  expect(compileDrawingPlan({...plan,drawing:{...plan.drawing,placement:{...plan.drawing.placement,scale:2}}},scene,context,validateProposal).code).toBe('layout_scale')
  const p=compileDrawingPlan(plan,scene,context,validateProposal).proposal
  expect(fitDrawingPlan(p,Array(65536).fill(1),1,context.canvasSize)).toBeNull()
})

test('root-level observed regions can be recovered only with one unambiguous owner',()=>{
  const region={name:'trunk',bounds:{x:.35,y:.4,width:.3,height:.35},confidence:.9}
  const subject={...observed.subjects[0],regions:undefined}
  expect(sanitizeKnowledgeObservation({subjects:[subject],regions:[region]}).subjects[0].regions).toHaveLength(1)
  expect(sanitizeKnowledgeObservation({subjects:[subject,{...subject,subject:'another'}],regions:[region]}).subjects[0].regions).toBeUndefined()
})

test('a whole-body eye without a specific supporting region never reaches visual review',async()=>{
  const p={...plan,intent:{...plan.intent,detail:'眼睛',regionId:'S1R0'}}
  const {result,model}=await run([observed,{version:2,plans:[p]},{version:2,plans:[p]}])
  expect(result.proposal).toBeUndefined();expect(model.mock.calls.some(c=>c[2].kind==='nilo_companion_review')).toBe(false)
})

test('a hanging model is aborted within the shared click budget',async()=>{
  const model=vi.fn(()=>new Promise(()=>{}))
  const result=await generateNiloDialogue({imageBase64:canvas().imageBase64,context,chatWithImage:model,timeoutMs:20})
  expect(result.reason).toBe('timeout');expect(model).toHaveBeenCalledOnce()
  expect(model.mock.calls[0][2].signal.aborted).toBe(true)
})

test('evaluation denominators include failures and never promote geometry to semantic success',()=>{
  const report=evaluationReport([{name:'ok',result:{status:'ready',drawingMetrics:{compiled:1,preflight:1}},prepared:{},latencyMs:20,calls:3},{name:'fail',result:{status:'clarify'},prepared:null,latencyMs:10,calls:2}],{suite:'holdout',fixtureVersion:'v1',live:true})
  expect(report.samples).toBe(2);expect(report.canvasPasses).toBe(1)
  expect(report.semanticPasses).toBeNull();expect(report.rows).toHaveLength(2)
})

test('a complete candidate survives a malformed sibling, while incomplete coordinates never get fabricated',async()=>{
  const text=`{"version":2,"plans":[${JSON.stringify(plan)},{"intent":{`
  expect(recoverDrawingPlans(text)).toEqual({version:2,plans:[plan]})
  expect(recoverDrawingPlans('{"version":2,"plans":[{"intent":{},"drawing":{"paths":[')).toBeNull()
  expect(recoverDrawingPlans('garbage'+text)).toBeNull()
  const model=vi.fn().mockResolvedValueOnce(observed).mockRejectedValueOnce(new LLMParseError('malformed sibling',text)).mockResolvedValueOnce(approval)
  const {imageBase64,png}=canvas()
  const result=await generateNiloDialogue({imageBase64,context:{...context,collisionMap:encodeOccupancy(pixelOccupancy(png))},chatWithImage:model})
  expect(result.status).toBe('ready');expect(model).toHaveBeenCalledTimes(3)
})

test('generic layout recovery reparents a misplaced field and fits path-count budgets before validation',()=>{
  const p={...plan,drawing:{...plan.drawing,placement:undefined},placement:plan.drawing.placement}
  expect(compileDrawingPlan(p,scene,context,validateProposal).ok).toBe(true)
  const detailed={...plan,intent:{...plan.intent,regionId:'S1R0'},drawing:{...plan.drawing,aspect:1,paths:Array.from({length:6},(_,i)=>[['M',i*.1,.1],['L',i*.1+.03,.9]]),placement:{...plan.drawing.placement,scale:.65}}}
  const c=compileDrawingPlan(detailed,scene,context,validateProposal)
  expect(c.ok).toBe(true);expect(c.proposal.width*c.proposal.height).toBeLessThanOrEqual(.06)
})

test('connected plans use actual subject anchor IDs and keep the first path pinned',()=>{
  const a={id:'S1_right',x:203.5/256,y:.5,side:'right'}
  const s=drawingScene(observation,[a])
  const p={intent:{...plan.intent,regionId:'S1R0',detail:'连接的小弧'},drawing:{aspect:1.5,paths:[[['M',0,.5],['Q',.5,.1,1,.4]]],placement:{mode:'attached',at:null,scale:.2,joinId:a.id}}}
  const c=compileDrawingPlan(p,s,context,validateProposal)
  expect(c.ok).toBe(true);expect(c.proposal.attachment).toEqual({x:a.x,y:a.y})
  const fit=fitDrawingPlan(c.proposal,pixelOccupancy(canvas().png),1,context.canvasSize)
  expect(fit).toBeTruthy()
  const [,u,v]=fit.sketch.paths[0][0]
  expect(fit.x+u*fit.width).toBeCloseTo(a.x);expect(fit.y+v*fit.height).toBeCloseTo(a.y)
  expect(compileDrawingPlan({...p,drawing:{...p.drawing,placement:{...p.drawing.placement,joinId:'imaginary_joint'}}},s,context,validateProposal).code).toBe('connection_reference')
})

test.each(['top','right','bottom','left'])('attached parts grow outward at the %s instead of becoming internal antennae',side=>{
  const original={aspect:.4,paths:[[['M',.5,0],['L',.5,1]] ]}
  const shape=orientAttachedSketch(original,{side,x:.5,y:.2},box)
  const [start,end]=shape.paths[0]
  if(side==='top')expect(end[2]).toBeLessThan(start[2])
  if(side==='bottom')expect(end[2]).toBeGreaterThan(start[2])
  if(side==='right')expect(end[1]).toBeGreaterThan(start[1])
  if(side==='left')expect(end[1]).toBeLessThan(start[1])
  expect(original.paths[0][0]).toEqual(['M',.5,0])
})

test('external object details cannot evade connection checks by choosing above',()=>{
  const p={...plan,drawing:{...plan.drawing,placement:{...plan.drawing.placement,mode:'above'}}}
  expect(compileDrawingPlan(p,scene,context,validateProposal).code).toBe('connection_required')
  const sky=drawingScene({subjects:[{...observation.subjects[0],family:'landscape'}]})
  expect(compileDrawingPlan(p,sky,context,validateProposal).ok).toBe(true)
})
