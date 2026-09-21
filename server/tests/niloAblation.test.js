import {readFileSync} from 'node:fs'
import {describe,expect,test,vi} from 'vitest'
import {ablationCases,fixtureHash,fixtureManifest} from '../scripts/fixtures/niloAblation.mjs'
import {renderSynthetic,syntheticContext,runGoldPlans,parseOptions,modelTurn} from '../scripts/check-nilo-ablation.mjs'
import {ablationReport,ablationMarkdown} from '../scripts/nilo-ablation-report.mjs'
import {decodeOccupancy} from '../../shared/niloOccupancy.mjs'

test('frozen fixture manifest matches twelve independently authored scene definitions',()=>{
  const manifest=JSON.parse(readFileSync(new URL('../evals/nilo/ablation-v1-manifest.json',import.meta.url),'utf8'))
  expect(manifest.sha256).toBe(fixtureHash)
  expect(manifest).toEqual(fixtureManifest)
  expect(ablationCases).toHaveLength(12)
  expect(new Set(ablationCases.map(f=>f.group)).size).toBeGreaterThanOrEqual(6)
  expect(ablationCases.flatMap(f=>f.controls).filter(c=>c.requires==='contact')).toHaveLength(6)
})

test('synthetic context contains no gold subject names, plans or desired additions',()=>{
  for(const fixture of ablationCases){
    const raster=renderSynthetic(fixture.points,fixture.aspect,256),context=syntheticContext(fixture,raster)
    expect(context.drawingProtocol).toBe(2)
    expect(context.scene.childBounds.width).toBeGreaterThan(0)
    expect(decodeOccupancy(context.collisionMap)).toHaveLength(65536)
    const encoded=JSON.stringify(context)
    expect(encoded).not.toContain(fixture.observation.subjects[0].subject)
    expect(encoded).not.toContain(fixture.controls[0].plan.intent.detail)
    expect(encoded).not.toContain('semanticRubric')
  }
})

describe('author supplied compiler controls without any model call',()=>{
  test.each(ablationCases.map(f=>[f.id,f]))('%s inside plan works and invalid subject IDs are rejected',async(_id,fixture)=>{
    const provider=vi.spyOn(globalThis,'fetch').mockRejectedValue(new Error('No network in offline evaluation'))
    try{
      const {records}=await runGoldPlans(fixture)
      expect(records.find(r=>r.control==='positive')).toMatchObject({canvasFits:true,calls:[]})
      expect(records.find(r=>r.control==='invalid_reference')).toMatchObject({canvasFits:false,failureCode:'intent_reference',calls:[]})
      expect(provider).not.toHaveBeenCalled()
    }finally{provider.mockRestore()}
  })
  test('semantically wrong but physically valid plan is explicitly unscored',async()=>{
    const {records}=await runGoldPlans(ablationCases[0])
    const wrong=records.find(r=>r.control==='wrong_semantics')
    expect(wrong).toMatchObject({canvasFits:true,expected:'human_reject',semanticStatus:'author_semantic_negative_requires_human_review'})
    const report=ablationReport(records)
    expect(report.groups[0].semanticPasses).toBeNull()
    expect(report.groups[0].semanticNegativeControls).toBe(1)
  })
})

test('layer report retains failures, unknown token usage and nearest rank p95',()=>{
  const record={mode:'full',model:'synthetic-model',executed:true,canvasFits:true,latencyMs:10,calls:[{tokens:{total_tokens:100}}]}
  const report=ablationReport([record,{...record,canvasFits:false,failureCode:'unclear_target',latencyMs:100,calls:[{tokens:null}]},
    {...record,mode:'gold-scene',executed:false,canvasFits:false,calls:[]}])
  expect(report.groups[0]).toMatchObject({executed:2,canvasPasses:1,failures:{unclear_target:1},latencyP95Ms:100,
    semanticPasses:null,tokenUsage:{knownCalls:1,missingCalls:1,totalTokens:100}})
  expect(report.groups[1]).toMatchObject({executed:0,notRun:1,tokenUsage:{totalTokens:null}})
  expect(ablationMarkdown(report)).toContain('Semantic success: **not measured**')
})

test('CLI is offline by default, bounded to explicit existing-provider model IDs',()=>{
  expect(parseOptions([])).toMatchObject({live:false,models:['current'],modes:['full','gold-scene','gold-plan']})
  expect(parseOptions(['--live','--models=current,another-model','--modes=full','--cases=round_face,linked_loops'])).toMatchObject({live:true,models:['current','another-model']})
  for(const args of [['--models=https://host.invalid'],['--models=a,b,c,d'],['--modes=other'],['--cases=all,round_face'],['--cases=unknown'],['--liv']]){
    expect(()=>parseOptions(args)).toThrow()
  }
})

test.each(['full','gold-scene'])('%s exercises the production planner with explicit token budgets and usage accounting',async mode=>{
  const fixture=ablationCases[0],prepared=await runGoldPlans(fixture)
  const approved={targetVisible:true,usesExistingDrawing:true,detailRelated:true,placementCorrect:true,alreadyPresent:false,confidence:.95,geometryConfidence:.95,relationConfidence:.95}
  const responses=[...(mode==='full'?[fixture.observation]:[]),{version:2,plans:[fixture.controls[0].plan]},approved]
  const sent=[]
  const fetcher=vi.spyOn(globalThis,'fetch').mockImplementation(async(_url,options)=>{
    sent.push(JSON.parse(options.body))
    return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(responses.shift())}}],usage:{prompt_tokens:100,completion_tokens:30,total_tokens:130}}),{status:200,headers:{'Content-Type':'application/json'}})
  })
  try{
    const result=await modelTurn(fixture,mode,'synthetic-model',prepared.raster,prepared.context,prepared.knowledge)
    expect(result.canvasFits).toBe(true)
    expect(result.calls).toHaveLength(mode==='full'?3:2)
    expect(result.calls.every(call=>call.tokens.total_tokens===130)).toBe(true)
    expect(sent.map(body=>body.max_tokens)).toEqual(mode==='full'?[1100,2400,350]:[2400,350])
    expect(sent.every(body=>body.model==='synthetic-model')).toBe(true)
    expect(result.candidateChecks).toEqual([{attempt:0,index:0,compileCode:'compiled',preflightCode:'fit'}])
  }finally{fetcher.mockRestore()}
})
