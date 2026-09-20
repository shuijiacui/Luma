// Explicit experimental adapters only. Production prompts/compiler unchanged.
import {existsSync,mkdirSync,readFileSync,readdirSync,writeFileSync} from 'node:fs'
import {resolve,dirname} from 'node:path'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {ablationCases,ablationVersion,fixtureHash} from './fixtures/niloAblation.mjs'
import {renderSynthetic,syntheticContext,goldKnowledge} from './check-nilo-ablation.mjs'
import {ablationReport,ablationMarkdown} from './nilo-ablation-report.mjs'

// The imported harness sets NODE_ENV=test before importing tracing services.
const {generateProtocolTurn}=await import('../src/services/niloProtocolTurn.js')
const {drawingScene,recoverDrawingPlans}=await import('../src/services/niloDrawingProtocol.js')
const {compileWaypointSketch}=await import('../src/services/niloWaypointSketch.js')
const {selectRelationExamples}=await import('../src/services/niloRelationExamples.js')
const {validateProposal}=await import('../src/services/niloDialogue.js')
const {chatWithImage,llmConfig,LLMParseError}=await import('../src/services/llmClient.js')
const {renderReviewCandidate}=await import('../src/services/niloPreview.js')
const {placementFits,projectionFits}=await import('../../shared/niloCollision.mjs')

export const pilotCases=['round_face','tilted_face','pointy_cat','branch_tree','dining_chair','linked_loops']
const waypointInstruction=`\nEXPERIMENT_WAYPOINTS: This experimental instruction replaces ONLY the earlier drawing paths format. Keep version:2, plans, intent and placement exactly as otherwise specified. For EACH plan return drawing:{"aspect":1,"grid":32,"strokes":[{"points":[[0,16],[16,8],[32,16]],"smooth":true,"closed":false}],"placement":{...}}. Example coordinates illustrate syntax, not a suggested shape. There must be NO paths, sketch, M/L/Q/C/E commands or alternate fallback format. Draw only the intended new detail with local integer waypoint pairs 0..32. grid must be exactly 32; aspect remains physical width/height .2..5. Use 1–8 strokes, each 2–16 DISTINCT vertices and both boolean smooth/closed. A closed shape needs at least 3 non-collinear points; do not repeat the first vertex at the end. smooth rounds interior corners inside their convex hull; endpoints stay fixed. Closed shapes keep an exact final-to-first edge. For attached, the first vertex is the joining endpoint on the local box edge. For contact, local y=32 follows the measured joining edge and y=0 grows outward; contour needs a continuous joining edge. Use existing placement/subject/region/contact IDs. The program, not the model, converts valid waypoints to curves. Invalid waypoints cannot fall back to paths. Return JSON only.`

export function adaptWaypointPlans(raw){
  const conversions=[]
  if(!Array.isArray(raw?.plans))return {value:raw,conversions}
  const plans=raw.plans.map((plan,index)=>{
    const drawing=plan?.drawing&&typeof plan.drawing==='object'&&!Array.isArray(plan.drawing)?plan.drawing:{}
    const hasFallback=!!drawing&&('paths' in drawing||'sketch' in drawing)
    const compiled=!hasFallback&&compileWaypointSketch({aspect:drawing?.aspect,grid:drawing?.grid,strokes:drawing?.strokes})
    const code=compiled?'waypoint_compiled':hasFallback?'path_fallback_disallowed':'invalid_waypoints'
    conversions.push({index,ok:!!compiled,code,compiledSketch:compiled||null})
    // Empty paths cause the existing production repair, preserving intent and
    // placement. No invented vertex or old-path fallback is ever supplied.
    return {...plan,drawing:{aspect:compiled?.aspect??drawing?.aspect,paths:compiled?.paths??[],placement:drawing?.placement}}
  })
  return {value:{...raw,plans},conversions}
}

export async function runPilotTurn(fixture,pilot,{provider=chatWithImage,model=llmConfig().visionModel}={}){
  if(!['waypoints','relations'].includes(pilot))throw new Error('Unknown pilot')
  const raster=renderSynthetic(fixture.points,fixture.aspect),context=syntheticContext(fixture,raster),knowledge=await goldKnowledge(fixture,raster)
  const scene=drawingScene(knowledge.observation,knowledge.inkAnchors,knowledge.inkContacts)
  const references=pilot==='relations'?selectRelationExamples(scene,{limit:2,occupancy:raster.occupancy,canvasAspect:context.canvasAspect,canvasSize:context.canvasSize}):[]
  const started=performance.now(),controller=new AbortController(),timer=setTimeout(()=>controller.abort(new Error('pilot_deadline')),14000)
  const calls=[],reviewImages=[],originalFetch=globalThis.fetch
  let activeCall,plans=0,reviews=0,result
  globalThis.fetch=async(...args)=>{
    const response=await originalFetch(...args)
    try{const data=await response.clone().json();if(activeCall&&data?.usage)activeCall.tokens=data.usage}catch{}
    return response
  }
  try{
    result=await generateProtocolTurn({imageBase64:raster.imageBase64,context,knowledge,validateProposal,
      opts:{signal:controller.signal,retries:0,privateContent:true,disableThinking:true,requireFinalContent:true,responseFormat:{type:'json_object'}},
      call:async(prompt,options)=>{
        const planning=options.kind==='nilo_companion_vision'
        if(planning?++plans>2:++reviews>2)throw new Error('pilot_call_budget')
        if(calls.length>=4)throw new Error('pilot_call_budget')
        let sentPrompt=prompt
        if(planning)sentPrompt+=pilot==='waypoints'?waypointInstruction:
          `\nEXPERIMENT_RELATIONS: The following at most two ORIGINAL SYNTHETIC examples teach a relationship, not the identity or contents of the child's image. Only use a lesson when the actual current support/space permits it; do not copy an example object or force an irrelevant addition. They are reference-only, not a proposal. Keep the production version:2 intent/drawing protocol.\n${JSON.stringify(references)}`
        const call={stage:options.kind,maxTokens:options.maxTokens,tokens:null,latencyMs:null,outcome:'pending'},begin=performance.now()
        calls.push(call);activeCall=call
        if(options.reviewImage){call.reviewImageIndex=reviewImages.length+1;reviewImages.push(options.reviewImage)}
        try{
          let raw
          try{
            raw=await provider(raster.imageBase64,sentPrompt,{...options,model,signal:controller.signal,retries:0,privateContent:true,disableThinking:true,requireFinalContent:true,responseFormat:{type:'json_object'},
              ...(planning?{referenceSheet:knowledge.referenceSheet}:{})})
          }catch(error){
            if(!(error instanceof LLMParseError))throw error
            call.rawText=typeof error.raw==='string'?error.raw.slice(0,32000):null
            // Protect the experiment from production JSON salvage bypassing
            // the waypoint adapter and accepting a raw paths candidate.
            if(planning&&pilot==='waypoints'){
              raw=recoverDrawingPlans(error.raw)
              if(!raw)throw new LLMParseError('Malformed waypoint JSON','')
              call.recoveredCompleteCandidate=true
            }else throw error
          }
          call.raw=raw
          if(planning&&pilot==='waypoints'){
            const adapted=adaptWaypointPlans(raw);call.waypointConversions=adapted.conversions;call.adapted=adapted.value
            raw=adapted.value
          }
          call.outcome='parsed';return raw
        }catch(error){call.outcome=controller.signal.aborted?'timeout':error instanceof LLMParseError?'invalid_json':'provider_error';throw error}
        finally{call.latencyMs=Math.round(performance.now()-begin);activeCall=null}
      }})
  }catch(error){result={status:'clarify',reason:controller.signal.aborted?'timeout':error instanceof LLMParseError?'invalid_json':'provider_error'}}
  finally{clearTimeout(timer);globalThis.fetch=originalFetch}
  const proposal=result?.proposal&&validateProposal(result.proposal,{...context,takeTurn:false})
  const canvasFits=!!proposal&&placementFits(proposal,context.canvasAspect,context.canvasSize)&&projectionFits(proposal,raster.occupancy,context.canvasAspect,context.canvasSize)
  const record={case:fixture.id,group:fixture.group,mode:'gold-scene',pilot,model,executed:true,canvasFits,latencyMs:Math.round(performance.now()-started),
    calls,selectedReferences:references,result,proposal:proposal??null,failureCode:canvasFits?null:result.reason??'final_canvas_check',semanticStatus:'independent_human_review_required'}
  return {record,raster,context,reviewImages}
}

export function loadPilotBaseline(model,explicitFile){
  const root=fileURLToPath(new URL('../.tmp/nilo-ablation/',import.meta.url))
  let file=explicitFile
  if(!file&&existsSync(root)){
    for(const dir of readdirSync(root,{withFileTypes:true}).filter(d=>d.isDirectory()).sort((a,b)=>a.name.localeCompare(b.name))){
      const folder=resolve(root,dir.name),reportFile=resolve(folder,'evaluation.json')
      if(!existsSync(reportFile))continue
      const report=JSON.parse(readFileSync(reportFile,'utf8'))
      if(report.live&&report.split==='first_live_frozen'&&report.fixtureHash===fixtureHash){file=resolve(folder,'records.json');break}
    }
  }
  if(!file||!existsSync(file))return {status:'unavailable',reason:'No matching first gold-scene baseline was found',records:[]}
  const meta=JSON.parse(readFileSync(resolve(dirname(file),'evaluation.json'),'utf8'))
  if(meta.fixtureHash!==fixtureHash||!meta.live||meta.split!=='first_live_frozen')throw new Error('Baseline must be the first live evaluation of the identical frozen fixtures')
  const records=JSON.parse(readFileSync(file,'utf8')).filter(r=>r.mode==='gold-scene'&&r.model===model&&pilotCases.includes(r.case))
  return {status:records.length===pilotCases.length?'loaded':'incomplete',source:resolve(file),runId:meta.runId,
    missingCases:pilotCases.filter(id=>!records.some(r=>r.case===id)),
    summary:ablationReport(records,{fixtureVersion:ablationVersion,fixtureHash,split:'reused_first_gold_scene_six_case_subset'}),
    cases:records.map(r=>({case:r.case,canvasFits:r.canvasFits,failureCode:r.failureCode,latencyMs:r.latencyMs,calls:r.calls.length})),
    records:[]}
}

export async function main(args=process.argv.slice(2)){
  const option=key=>args.find(a=>a.startsWith(`--${key}=`))?.slice(key.length+3)
  const pilot=option('pilot'),live=args.includes('--live')
  if(!['waypoints','relations'].includes(pilot)||args.some(a=>a!=='--live'&&!/^--(?:pilot|out|baseline)=/.test(a)))throw new Error('Use --pilot=waypoints|relations, optional --live, --out=directory and --baseline=records.json')
  try{process.loadEnvFile(new URL('../.env',import.meta.url))}catch{}
  const model=llmConfig().visionModel
  if(live&&!llmConfig().apiKey)throw new Error('LLM key not configured; no request sent')
  const manifest=JSON.parse(readFileSync(new URL('../evals/nilo/ablation-v1-manifest.json',import.meta.url),'utf8'))
  if(manifest.sha256!==fixtureHash)throw new Error('Frozen fixture hash mismatch')
  const baseline=loadPilotBaseline(model,option('baseline'))
  const runId=new Date().toISOString().replace(/[:.]/g,'-'),out=resolve(option('out')??fileURLToPath(new URL('../.tmp/nilo-drawing-pilots/',import.meta.url)),`${runId}-${pilot}`)
  mkdirSync(out,{recursive:true});const records=[]
  for(const fixture of ablationCases.filter(f=>pilotCases.includes(f.id))){
    let record,raster,context,reviewImages=[]
    if(live)({record,raster,context,reviewImages}=await runPilotTurn(fixture,pilot,{model}))
    else{
      raster=renderSynthetic(fixture.points,fixture.aspect);context=syntheticContext(fixture,raster)
      record={case:fixture.id,mode:'gold-scene',pilot,model,executed:false,canvasFits:false,latencyMs:0,calls:[],failureCode:'not_run_requires_live',semanticStatus:'not_evaluated'}
    }
    records.push(record);writeFileSync(resolve(out,`${fixture.id}-before.png`),raster.bytes)
    reviewImages.forEach((base64,index)=>writeFileSync(resolve(out,`${fixture.id}-review-${index+1}-candidate.png`),Buffer.from(base64,'base64')))
    if(record.canvasFits){
      const preview=renderReviewCandidate(raster.imageBase64,record.proposal,{...context,fixedGeometry:true})
      writeFileSync(resolve(out,`${fixture.id}-after.png`),Buffer.from(preview.imageBase64,'base64'))
    }
    writeFileSync(resolve(out,`${fixture.id}.json`),JSON.stringify(record,null,2))
    writeFileSync(resolve(out,'records.json'),JSON.stringify(records,null,2))
    console.log(JSON.stringify({case:record.case,pilot,executed:record.executed,canvasFits:record.canvasFits,failureCode:record.failureCode,calls:record.calls.length,latencyMs:record.latencyMs}))
  }
  const report=ablationReport(records,{fixtureVersion:ablationVersion,fixtureHash,runId,split:'regression_frozen_six_case_gold_scene_subset',live,pilot,baseline})
  report.notes.unshift('This is a six-case regression subset of the SAME frozen fixtures with author-provided observations, NOT new holdout and NOT comparable to the twelve-scene full end-to-end rate.',
    'Baseline is reused without paid calls. These small nonrandomized runs do not establish a causal improvement; semantic quality needs independent human review.')
  const baselineText=`\n## Reused gold-scene baseline\n\nStatus: ${baseline.status}. Source: ${baseline.source??'unavailable'}. No additional baseline provider calls.\n\n| Case | Baseline geometry | Pilot geometry |\n|---|---:|---:|\n${records.map(r=>`| ${r.case} | ${baseline.cases?.find(b=>b.case===r.case)?.canvasFits??'unknown'} | ${r.executed?r.canvasFits:'not run'} |`).join('\n')}\n`
  writeFileSync(resolve(out,'evaluation.json'),JSON.stringify(report,null,2));writeFileSync(resolve(out,'evaluation.md'),ablationMarkdown(report)+baselineText)
  console.log(`Report: ${resolve(out,'evaluation.md')}`)
  return {out,records,report}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  main().catch(()=>{console.error('Pilot failed; check explicit options, fixture manifest, baseline path or local provider configuration.');process.exitCode=1})
}
