// Frozen 20-scene comparison. Offline by default; explicit --live is billable.
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {freshCases,freshHash,freshManifest,freshVersion} from './fixtures/niloFreshScenes.mjs'
import {renderSynthetic,syntheticContext} from './check-nilo-ablation.mjs'
import {placementFits,projectionFits} from '../../shared/niloCollision.mjs'

process.env.NODE_ENV='test'
const {generateNiloDialogue,validateProposal}=await import('../src/services/niloDialogue.js')
const {chatWithImage,llmConfig}=await import('../src/services/llmClient.js')
const {renderReviewCandidate}=await import('../src/services/niloPreview.js')
const maxMs=14000,maxCalls=5
const stamp=()=>new Date().toISOString().replace(/[:.]/g,'-')

export function freshOptions(args=[]){
  const value=(key,fallback)=>args.find(a=>a.startsWith(`--${key}=`))?.slice(key.length+3)??fallback
  if(args.some(a=>!['--live','--retest'].includes(a)&&!/^--(?:variants|cases|out|model)=/.test(a)))throw new Error('Unknown fresh-evaluation option')
  const variants=value('variants','baseline,numbered').split(','),cases=value('cases','all').split(','),model=value('model','current')
  if(variants.some(v=>!['baseline','numbered'].includes(v))||new Set(variants).size!==variants.length)throw new Error('Invalid variants')
  if(cases.some(c=>c!=='all'&&!freshCases.some(f=>f.id===c))||cases.includes('all')&&cases.length!==1||new Set(cases).size!==cases.length)throw new Error('Invalid cases')
  if(!/^[-\w./:]+$/.test(model)||model.includes('://')||model.length>160)throw new Error('Use one existing-provider model ID, not an endpoint')
  return {live:args.includes('--live'),retest:args.includes('--retest'),variants,cases,model,
    out:value('out',fileURLToPath(new URL('../.tmp/nilo-fresh-scenes/',import.meta.url)))}
}

// makeProviderAdapter wraps only observation; the baseline and numbered variants
// otherwise execute the same production pipeline, deadlines and token budgets.
export async function evaluateFreshFixture(fixture,variant,{model='synthetic-test',provider=chatWithImage,makeProviderAdapter,onGrounding}={}){
  const raster=renderSynthetic(fixture.points,fixture.aspect),context=syntheticContext(fixture,raster)
  const calls=[],started=performance.now(),controller=new AbortController()
  const timer=setTimeout(()=>controller.abort(new Error('evaluation_deadline')),maxMs)
  let activeCall,grounding=null,result
  const originalFetch=globalThis.fetch
  // Sequential calls only. Never persist request headers, keys or endpoint URLs.
  globalThis.fetch=async(...args)=>{
    const response=await originalFetch(...args)
    try{const body=await response.clone().json();if(activeCall&&body?.usage)activeCall.tokens=body.usage}catch{}
    return response
  }
  const measured=async(image,prompt,options)=>{
    if(calls.length>=maxCalls)throw new Error('evaluation_call_budget')
    const call={stage:options.kind,maxTokens:options.maxTokens,tokens:null,outcome:'pending'},t=performance.now()
    activeCall=call;calls.push(call)
    try{
      const raw=await provider(image,prompt,{...options,model,signal:controller.signal,retries:0,privateContent:true,
        disableThinking:true,requireFinalContent:true,responseFormat:{type:'json_object'}})
      call.outcome='parsed';call.data=raw;return raw
    }catch(error){call.outcome=controller.signal.aborted?'timeout':error.name==='LLMParseError'?'invalid_json':'provider_error';throw error}
    finally{call.latencyMs=Math.round(performance.now()-t);activeCall=null}
  }
  try{
    let selected=measured
    if(variant==='numbered'){
      const factory=makeProviderAdapter??(await import('../src/services/niloGroundedRegions.js')).makeGroundedProvider
      selected=factory(measured,{onObservation:data=>{grounding=data;onGrounding?.(data)}})
    }else if(variant!=='baseline')throw new Error('invalid_variant')
    result=await generateNiloDialogue({imageBase64:raster.imageBase64,context,chatWithImage:selected,signal:controller.signal,timeoutMs:maxMs})
  }catch(error){result={status:'clarify',reason:controller.signal.aborted?'timeout':error.name==='LLMParseError'?'invalid_json':'provider_error'}}
  finally{clearTimeout(timer);globalThis.fetch=originalFetch}
  const proposal=result?.proposal&&validateProposal(result.proposal,{...context,takeTurn:false})
  const canvasFits=!!proposal&&placementFits(proposal,context.canvasAspect,context.canvasSize)&&projectionFits(proposal,raster.occupancy,context.canvasAspect,context.canvasSize,raster.png)
  // Observation and rubric are saved for the human reviewer only, never supplied
  // to either evaluated variant. Geometry passing is not meaningful co-creation.
  const record={case:fixture.id,group:fixture.group,variant,model,executed:true,canvasFits,
    failureCode:canvasFits?null:result.reason??'missing_proposal',latencyMs:Math.round(performance.now()-started),calls,result,proposal:proposal??null,
    authorObservation:fixture.observation,semanticChecklist:fixture.semanticChecklist,geometryBounds:fixture.geometryBounds,
    review:structuredClone(fixture.review),semanticStatus:'independent_review_required'}
  return {record,raster,context,grounding}
}

const percentile=(values,p)=>values.length?[...values].sort((a,b)=>a-b)[Math.ceil(values.length*p)-1]:null
export function freshReport(records,meta={}){
  return {...meta,groups:[...new Set(records.map(r=>r.variant))].map(variant=>{
    const rows=records.filter(r=>r.variant===variant),executed=rows.filter(r=>r.executed),calls=executed.flatMap(r=>r.calls)
    const known=calls.filter(c=>Number.isFinite(c.tokens?.total_tokens)&&c.tokens.total_tokens>=0),failures={}
    for(const r of executed.filter(r=>!r.canvasFits))failures[r.failureCode??'unknown']=(failures[r.failureCode??'unknown']??0)+1
    return {variant,total:rows.length,executed:executed.length,notRun:rows.length-executed.length,canvasPasses:executed.filter(r=>r.canvasFits).length,
      failures,calls:calls.length,latencyP50Ms:percentile(executed.map(r=>r.latencyMs),.5),latencyP95Ms:percentile(executed.map(r=>r.latencyMs),.95),
      tokenUsage:{knownCalls:known.length,missingCalls:calls.length-known.length,totalTokens:known.length?known.reduce((n,c)=>n+c.tokens.total_tokens,0):null},semanticPasses:null}
  }),notes:[
    'Both variants run full production observation → planning → review. The numbered variant changes only observation input and deterministic region-ID decoding.',
    'One attempt per case and variant; no best-of-N selection. Every failure stays in the denominator. Deadline 14 s, at most 5 model calls, unchanged per-stage token limits.',
    'Author observations, expected ideas and checklists never enter model prompts. Semantic pass rate remains null until independent before/after review.',
    'This small first run is an experiment, not a general accuracy claim. Subsequent runs on any previously executed cases are regression.',
  ]}
}
const markdown=report=>`# Fresh scene comparison\n\n${report.fixtureVersion}; SHA-256: \`${report.fixtureHash}\`\n\nRun: ${report.runId}; ${report.split}; live: ${report.live}\n\n| Variant | Executed / planned | Canvas passes | P50 / P95 ms | Calls | Known tokens |\n|---|---:|---:|---:|---:|---:|\n${report.groups.map(g=>`| ${g.variant} | ${g.executed} / ${g.total} | ${g.canvasPasses} | ${g.latencyP50Ms??'—'} / ${g.latencyP95Ms??'—'} | ${g.calls} | ${g.tokenUsage.totalTokens??'unknown'} |`).join('\n')}\n\nSemantic success: **not measured**. Fill the separate review checklist after comparing before/after images.\n\n${report.groups.map(g=>`- ${g.variant} failures: \`${JSON.stringify(g.failures)}\``).join('\n')}\n\n${report.notes.map(n=>`- ${n}`).join('\n')}\n`

export async function main(args=process.argv.slice(2)){
  const options=freshOptions(args),frozen=JSON.parse(readFileSync(new URL('../evals/nilo/fresh-scenes-v1-manifest.json',import.meta.url),'utf8'))
  if(JSON.stringify(frozen)!==JSON.stringify(freshManifest))throw new Error('Frozen fresh fixtures changed; create a new version before running')
  try{process.loadEnvFile(new URL('../.env',import.meta.url))}catch{}
  const config=llmConfig(),model=options.model==='current'?config.visionModel:options.model
  if(options.live&&!config.apiKey)throw new Error('No configured provider key; no requests sent')
  const runId=stamp(),out=resolve(options.out,runId),seenFile=resolve(options.out,`${freshVersion}-live-seen.json`)
  const seen=existsSync(seenFile)?JSON.parse(readFileSync(seenFile,'utf8')):{fixtureHash:freshHash,runs:[]}
  if(seen.fixtureHash!==freshHash)throw new Error('Seen-run marker belongs to another fixture version')
  const split=options.live?(options.retest||seen.runs.length?'regression_from_frozen':'first_live_frozen'):'offline_preparation'
  mkdirSync(out,{recursive:true})
  const selected=freshCases.filter(f=>options.cases[0]==='all'||options.cases.includes(f.id)),records=[]
  const meta={runId,fixtureVersion:freshVersion,fixtureHash:freshHash,split,live:options.live,model,manifest:freshManifest,
    budget:{perTurnMs:maxMs,maxProviderCalls:maxCalls,repetitions:1},selectedCases:selected.map(f=>f.id),variants:options.variants}
  writeFileSync(resolve(out,'run.json'),JSON.stringify(meta,null,2))
  if(options.live){seen.runs.push({runId,cases:meta.selectedCases,variants:options.variants});writeFileSync(seenFile,JSON.stringify(seen,null,2))}
  const persist=()=>{
    writeFileSync(resolve(out,'records.json'),JSON.stringify(records,null,2))
    const report=freshReport(records,meta)
    writeFileSync(resolve(out,'evaluation.json'),JSON.stringify(report,null,2));writeFileSync(resolve(out,'evaluation.md'),markdown(report))
  }
  // A planned row is persisted before any call so interruptions are visible.
  for(const fixture of selected)for(const variant of options.variants)records.push({case:fixture.id,group:fixture.group,variant,model,
    executed:false,canvasFits:false,failureCode:options.live?'pending':'not_run_requires_live',latencyMs:0,calls:[],
    authorObservation:fixture.observation,semanticChecklist:fixture.semanticChecklist,geometryBounds:fixture.geometryBounds,review:structuredClone(fixture.review)})
  persist()
  for(const [index,fixture] of selected.entries()){
    writeFileSync(resolve(out,`${fixture.id}-before.png`),renderSynthetic(fixture.points,fixture.aspect).bytes)
    // Counterbalance order deterministically across cases; no cherry-picking.
    const order=index%2?[...options.variants].reverse():options.variants
    for(const variant of order){
      if(!options.live)continue
      const {record,raster,context,grounding}=await evaluateFreshFixture(fixture,variant,{model})
      const name=`${fixture.id}-${variant}`
      if(grounding){
        const saved=structuredClone(grounding),image=saved.catalog?.annotatedImageBase64
        if(image){writeFileSync(resolve(out,`${name}-numbered.png`),Buffer.from(image,'base64'));delete saved.catalog.annotatedImageBase64}
        writeFileSync(resolve(out,`${name}-grounding.json`),JSON.stringify(saved,null,2))
      }
      if(record.proposal){
        const preview=renderReviewCandidate(raster.imageBase64,record.proposal,{...context,fixedGeometry:true})
        writeFileSync(resolve(out,`${name}-after.png`),Buffer.from(preview.imageBase64,'base64'))
      }
      records[records.findIndex(r=>r.case===fixture.id&&r.variant===variant)]=record
      writeFileSync(resolve(out,`${name}.json`),JSON.stringify(record,null,2));persist()
      console.log(JSON.stringify({case:record.case,variant,canvasFits:record.canvasFits,failureCode:record.failureCode,calls:record.calls.length,latencyMs:record.latencyMs}))
    }
  }
  const report=freshReport(records,meta);persist();console.log(`Report: ${resolve(out,'evaluation.md')}`)
  return {out,records,report}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(error=>{console.error(error.message);process.exitCode=1})
