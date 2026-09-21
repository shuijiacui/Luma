import {readFileSync,mkdtempSync,rmSync,readdirSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {describe,expect,test,vi} from 'vitest'
import {freshCases,freshHash,freshManifest} from '../scripts/fixtures/niloFreshScenes.mjs'
import {ablationCases} from '../scripts/fixtures/niloAblation.mjs'
import {freshOptions,freshReport,evaluateFreshFixture,main} from '../scripts/check-nilo-fresh-scenes.mjs'
import {renderSynthetic,syntheticContext} from '../scripts/check-nilo-ablation.mjs'
import {sanitizeKnowledgeObservation} from '../src/services/niloDrawingKnowledge.js'
import {buildGroundedRegions,makeGroundedProvider} from '../src/services/niloGroundedRegions.js'

test('20 frozen new drawings cover different subjects, density, proportions and aspect ratios',()=>{
  const frozen=JSON.parse(readFileSync(new URL('../evals/nilo/fresh-scenes-v1-manifest.json',import.meta.url),'utf8'))
  expect(frozen).toEqual(freshManifest);expect(frozen.sha256).toBe(freshHash)
  expect(freshCases).toHaveLength(20);expect(new Set(freshCases.map(f=>f.id)).size).toBe(20)
  expect(new Set(freshCases.map(f=>f.group)).size).toBeGreaterThanOrEqual(9)
  expect(new Set(freshCases.map(f=>f.aspect))).toEqual(new Set([.75,1,1.5]))
  for(const f of freshCases){
    expect(ablationCases.some(old=>old.id===f.id||JSON.stringify(old.points)===JSON.stringify(f.points))).toBe(false)
    expect(f.semanticChecklist.plausibleIdeas.length).toBeGreaterThan(0)
    expect(Object.values(f.review).every(v=>v===null)).toBe(true)
    expect(f.points.every(p=>p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1)).toBe(true)
    expect(sanitizeKnowledgeObservation(f.observation).subjects).toHaveLength(f.observation.subjects.length)
    for(const s of f.observation.subjects)for(const r of s.regions){
      expect(r.bounds.x).toBeGreaterThanOrEqual(s.bounds.x)
      expect(r.bounds.y).toBeGreaterThanOrEqual(s.bounds.y)
      expect(r.bounds.x+r.bounds.width).toBeLessThanOrEqual(s.bounds.x+s.bounds.width)
      expect(r.bounds.y+r.bounds.height).toBeLessThanOrEqual(s.bounds.y+s.bounds.height)
    }
  }
})

test.each([.75,1,1.5])('context preserves physical canvas aspect %s without leaking author labels',aspect=>{
  const fixture=freshCases.find(f=>f.aspect===aspect),raster=renderSynthetic(fixture.points,aspect,256),context=syntheticContext(fixture,raster)
  expect(context.canvasAspect).toBe(aspect)
  const raw=JSON.stringify(context)
  expect(raw).not.toContain(fixture.observation.subjects[0].subject)
  expect(raw).not.toContain(fixture.semanticChecklist.plausibleIdeas[0])
  expect(raw).not.toContain('semanticChecklist')
})

test('CLI is offline by default and rejects endpoints, duplicate and unknown selections',()=>{
  expect(freshOptions()).toMatchObject({live:false,variants:['baseline','numbered'],cases:['all'],model:'current'})
  for(const args of [['--live=true'],['--variants=baseline,baseline'],['--variants=gold'],['--cases=all,round_face'],['--cases=bogus'],['--model=https://invalid'],['--model=']])expect(()=>freshOptions(args)).toThrow()
})

test('offline preparation saves all 20 before PNGs and 40 unexecuted rows without any network',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'nilo-fresh-test-'))
  const network=vi.spyOn(globalThis,'fetch').mockRejectedValue(new Error('No network'))
  try{
    const {out,records,report}=await main([`--out=${directory}`])
    expect(network).not.toHaveBeenCalled();expect(records).toHaveLength(40)
    expect(readdirSync(out).filter(f=>f.endsWith('-before.png'))).toHaveLength(20)
    expect(report.groups.every(g=>g.executed===0&&g.notRun===20&&g.semanticPasses===null)).toBe(true)
    expect(JSON.parse(readFileSync(join(out,'records.json'),'utf8'))).toHaveLength(40)
  }finally{network.mockRestore();rmSync(directory,{recursive:true,force:true})}
})

describe('injected provider runs actual pipeline without external calls',()=>{
  test.each(['baseline','numbered'])('%s retains no-plan failure, bounded budgets and unknown semantics',async variant=>{
    const fixture=freshCases[0],sent=[],adapterCalls=[]
    const provider=vi.fn(async(_image,prompt,options)=>{
      sent.push({prompt,options})
      return options.kind==='nilo_knowledge_observe'?fixture.observation:{version:2,plans:[]}
    })
    const factory=(inner,{onObservation})=>async(image,prompt,options)=>{
      adapterCalls.push(options.kind)
      if(options.kind==='nilo_knowledge_observe')onObservation({catalog:{regions:[]},adapted:fixture.observation})
      return inner(image,prompt,options)
    }
    const {record,grounding}=await evaluateFreshFixture(fixture,variant,{provider,makeProviderAdapter:factory})
    expect(record).toMatchObject({executed:true,canvasFits:false,failureCode:'unclear_target',semanticStatus:'independent_review_required'})
    expect(record.calls.map(c=>c.maxTokens)).toEqual([1100,2400])
    expect(record.calls.every(c=>c.tokens===null)).toBe(true)
    expect(record.review.meaningfulAddition).toBeNull()
    expect(sent[0].prompt).not.toContain(fixture.semanticChecklist.plausibleIdeas[0])
    expect(adapterCalls.length).toBe(variant==='numbered'?2:0)
    expect(!!grounding).toBe(variant==='numbered')
  })
  test('provider exception is kept as a failed executed sample without raw error text',async()=>{
    const {record}=await evaluateFreshFixture(freshCases[0],'baseline',{provider:async()=>{throw new Error('secret host and key should not be recorded')}})
    expect(record.canvasFits).toBe(false);expect(record.executed).toBe(true)
    expect(record.calls.length).toBeGreaterThan(0)
    expect(JSON.stringify(record)).not.toContain('secret host')
  })
  test('real numbered adapter uses actual candidate IDs with one observation call and keeps author answers out',async()=>{
    const fixture=freshCases[0],raster=renderSynthetic(fixture.points,fixture.aspect),catalog=buildGroundedRegions(raster.imageBase64)
    const largest=[...catalog.candidates].sort((a,b)=>b.bounds.width*b.bounds.height-a.bounds.width*a.bounds.height)[0]
    const provider=vi.fn(async(_image,prompt,options)=>{
      if(options.kind==='nilo_knowledge_observe'){
        expect(options.referenceSheet.imageBase64).toBeTruthy()
        expect(prompt).not.toContain(fixture.semanticChecklist.plausibleIdeas[0])
        return {subjects:[{subject:'已有尖头发人物',family:'character',confidence:.95,evidence:'头部连接上衣与两条腿',
          existingParts:['头部','上衣','腿'],regionIds:[largest.id],regions:[]}]}
      }
      return {version:2,plans:[]}
    })
    const {record,grounding}=await evaluateFreshFixture(fixture,'numbered',{provider,makeProviderAdapter:makeGroundedProvider})
    expect(record.calls.map(c=>c.maxTokens)).toEqual([1100,2400])
    expect(grounding.rejected).toEqual([])
    expect(grounding.adapted.subjects[0].bounds).toEqual(largest.bounds)
    expect(record.canvasFits).toBe(false)
  })
})

test('report includes failures and missing usage, with no invented semantic score',()=>{
  const rows=[{variant:'baseline',executed:true,canvasFits:true,latencyMs:100,calls:[{tokens:{total_tokens:20}}]},
    {variant:'baseline',executed:true,canvasFits:false,failureCode:'bad_scene',latencyMs:300,calls:[{tokens:null}]},
    {variant:'numbered',executed:false,canvasFits:false,calls:[],latencyMs:0}]
  const report=freshReport(rows)
  expect(report.groups[0]).toMatchObject({executed:2,canvasPasses:1,failures:{bad_scene:1},latencyP95Ms:300,
    semanticPasses:null,tokenUsage:{knownCalls:1,missingCalls:1,totalTokens:20}})
  expect(report.groups[1]).toMatchObject({executed:0,notRun:1,semanticPasses:null})
})
