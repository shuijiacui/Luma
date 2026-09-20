// Layered evaluation on synthetic scenes. No network without explicit --live.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { PNG } from 'pngjs'
import { ablationCases, ablationVersion, fixtureHash, fixtureManifest } from './fixtures/niloAblation.mjs'
import { ablationReport, ablationMarkdown } from './nilo-ablation-report.mjs'
import { encodeOccupancy, pixelOccupancy } from '../../shared/niloOccupancy.mjs'
import { placementFits, projectionFits } from '../../shared/niloCollision.mjs'

// Set before importing tracing-owning production modules. Synthetic evaluation
// must not pollute the live application trace stream or parent statistics.
process.env.NODE_ENV='test'
const {generateNiloDialogue,sanitizeDialogueContext,validateProposal}=await import('../src/services/niloDialogue.js')
const {drawingScene,compileDrawingPlan,fitDrawingPlan}=await import('../src/services/niloDrawingProtocol.js')
const {generateProtocolTurn}=await import('../src/services/niloProtocolTurn.js')
const {drawingInkAnchors}=await import('../src/services/niloInkAnchors.js')
const {retrieveDrawingKnowledge,sanitizeKnowledgeObservation}=await import('../src/services/niloDrawingKnowledge.js')
const {renderReviewCandidate}=await import('../src/services/niloPreview.js')
const {chatWithImage,llmConfig}=await import('../src/services/llmClient.js')

export function renderSynthetic(points,aspect=1,size=512){
  const width=Math.round(size*aspect),png=new PNG({width,height:size});png.data.fill(255)
  for(let p=1;p<points.length;p++){
    const a=points[p-1],b=points[p];if(b.move)continue
    const steps=Math.max(1,Math.ceil(Math.hypot((a.x-b.x)*width,(a.y-b.y)*size)*2))
    for(let i=0;i<=steps;i++){
      const x=Math.round((a.x+(b.x-a.x)*i/steps)*width),y=Math.round((a.y+(b.y-a.y)*i/steps)*size)
      for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){
        if(dx*dx+dy*dy>4||x+dx<0||y+dy<0||x+dx>=width||y+dy>=size)continue
        const at=((y+dy)*width+x+dx)*4;png.data[at]=32;png.data[at+1]=53;png.data[at+2]=47
      }
    }
  }
  const bytes=PNG.sync.write(png)
  return {png,bytes,imageBase64:bytes.toString('base64'),occupancy:pixelOccupancy(png)}
}
export function syntheticContext(fixture,raster){
  const p=fixture.points,bounds={x:Math.min(...p.map(v=>v.x)),y:Math.min(...p.map(v=>v.y)),
    width:Math.max(...p.map(v=>v.x))-Math.min(...p.map(v=>v.x)),height:Math.max(...p.map(v=>v.y))-Math.min(...p.map(v=>v.y))}
  return sanitizeDialogueContext({locale:'zh',utterance:'轮到你了，请看着我的画接一小笔。',history:[],takeTurn:true,requestDrawing:true,
    drawingProtocol:2,useDrawingKnowledge:true,turnScope:'scene',imageProvenance:'child',revision:1,
    canvasSize:{width:raster.png.width,height:raster.png.height},drawingStyle:{color:'#20352f',brushKind:'round',brushSize:4},
    collisionMap:encodeOccupancy(raster.occupancy),scene:{childBounds:bounds,niloBounds:null,recentContributions:[{owner:'child',bounds,brushKind:'round',color:'#20352f',strokeCount:p.filter(v=>v.move).length}]}})
}
export async function goldKnowledge(fixture,raster){
  const knowledge=retrieveDrawingKnowledge(sanitizeKnowledgeObservation(fixture.observation))
  knowledge.inkAnchors=drawingInkAnchors(raster.imageBase64,knowledge.observation)
  const contactFile=new URL('../src/services/niloContactPlacement.js',import.meta.url)
  if(existsSync(contactFile)){
    const {drawingInkContacts}=await import(contactFile.href)
    knowledge.inkContacts=drawingInkContacts(raster.imageBase64,knowledge.observation)
  }
  return knowledge
}
export async function runGoldPlans(fixture){
  const raster=renderSynthetic(fixture.points,fixture.aspect),context=syntheticContext(fixture,raster)
  const knowledge=await goldKnowledge(fixture,raster),scene=drawingScene(knowledge.observation,knowledge.inkAnchors,knowledge.inkContacts)
  const records=[]
  for(const control of fixture.controls){
    const started=performance.now(),compiled=compileDrawingPlan(control.plan,scene,context,validateProposal)
    const proposal=compiled.ok?fitDrawingPlan(compiled.proposal,raster.occupancy,context.canvasAspect,context.canvasSize,raster.png):null
    const valid=proposal&&validateProposal(proposal,{...context,takeTurn:false})
    const canvasFits=!!valid&&placementFits(valid,context.canvasAspect,context.canvasSize)&&projectionFits(valid,raster.occupancy,context.canvasAspect,context.canvasSize,raster.png)
    records.push({case:fixture.id,group:fixture.group,mode:'gold-plan',model:'deterministic',control:control.id,expected:control.expected,
      executed:true,canvasFits,failureCode:canvasFits?null:compiled.ok?'collision_or_placement':compiled.code,
      expectedCodes:control.expectedCodes??null,latencyMs:Math.round(performance.now()-started),calls:[],proposal:valid??null,compiledProposal:compiled.ok?compiled.proposal:null,
      semanticStatus:control.expected==='human_reject'?'author_semantic_negative_requires_human_review':'author_control_not_model_semantics'})
  }
  return {records,raster,context,knowledge}
}

// Only synthetic response bodies are retained. Authorization headers, prompts,
// endpoint configuration and error messages are deliberately never serialized.
export async function modelTurn(fixture,mode,model,raster,context,knowledge){
  const started=performance.now(),calls=[],controller=new AbortController()
  const timer=setTimeout(()=>controller.abort(new Error('evaluation_deadline')),14000)
  const originalFetch=globalThis.fetch
  let activeCall
  globalThis.fetch=async(...args)=>{
    const response=await originalFetch(...args)
    try{const body=await response.clone().json();if(activeCall&&body?.usage)activeCall.tokens=body.usage}catch{}
    return response
  }
  const provider=async(image,prompt,opts)=>{
    if(calls.length>=(mode==='full'?5:4))throw new Error('evaluation_call_budget')
    const call={stage:opts.kind,maxTokens:opts.maxTokens,tokens:null,latencyMs:null,outcome:'pending'},t=performance.now()
    calls.push(call);activeCall=call
    try{
      const raw=await chatWithImage(image,prompt,{...opts,model,signal:controller.signal,retries:0,privateContent:true,disableThinking:true,requireFinalContent:true,responseFormat:{type:'json_object'}})
      call.outcome='parsed';call.data=raw;return raw
    }catch(error){call.outcome=controller.signal.aborted?'timeout':error.name==='LLMParseError'?'invalid_json':'provider_error';throw error}
    finally{call.latencyMs=Math.round(performance.now()-t);activeCall=null}
  }
  let result
  try{
    if(mode==='full')result=await generateNiloDialogue({imageBase64:raster.imageBase64,context,chatWithImage:provider,signal:controller.signal,timeoutMs:14000})
    else result=await generateProtocolTurn({imageBase64:raster.imageBase64,context,knowledge,validateProposal,
      opts:{signal:controller.signal,retries:0,privateContent:true,disableThinking:true,requireFinalContent:true,responseFormat:{type:'json_object'}},
      call:(prompt,options)=>provider(raster.imageBase64,prompt,{...options,...(options.kind==='nilo_companion_vision'?{referenceSheet:knowledge.referenceSheet}:{})})})
  }catch(error){result={status:'clarify',reason:controller.signal.aborted?'timeout':error.name==='LLMParseError'?'invalid_json':'provider_error'}}
  finally{clearTimeout(timer);globalThis.fetch=originalFetch}
  const proposal=result?.proposal&&validateProposal(result.proposal,{...context,takeTurn:false})
  const canvasFits=!!proposal&&placementFits(proposal,context.canvasAspect,context.canvasSize)&&projectionFits(proposal,raster.occupancy,context.canvasAspect,context.canvasSize,raster.png)
  const latencyMs=Math.round(performance.now()-started)
  // Replay each returned candidate through the compiler for failure diagnosis;
  // this does not replace, repair or count as another production model turn.
  const observed=mode==='full'?calls.find(c=>c.stage==='nilo_knowledge_observe')?.data:fixture.observation
  const diagnosticObservation=sanitizeKnowledgeObservation(observed)
  const diagnosticKnowledge=await goldKnowledge({...fixture,observation:diagnosticObservation.subjects.length?{
    subjects:diagnosticObservation.subjects.map(s=>({...s,evidence:s.visible}))}: {subjects:[]}},raster)
  const diagnosticScene=drawingScene(diagnosticKnowledge.observation,diagnosticKnowledge.inkAnchors,diagnosticKnowledge.inkContacts)
  const candidateChecks=calls.filter(c=>c.stage==='nilo_companion_vision').flatMap((c,attempt)=>(c.data?.plans??[]).map((raw,index)=>{
    const compiled=compileDrawingPlan(raw,diagnosticScene,context,validateProposal)
    return {attempt,index,compileCode:compiled.ok?'compiled':compiled.code,
      preflightCode:compiled.ok?(fitDrawingPlan(compiled.proposal,raster.occupancy,context.canvasAspect,context.canvasSize,raster.png)?'fit':'collision_or_placement'):null}
  }))
  return {case:fixture.id,group:fixture.group,mode,model,executed:true,canvasFits,latencyMs,calls,candidateChecks,
    failureCode:canvasFits?null:result.reason??(proposal?'final_canvas_check':'missing_proposal'),result,proposal:proposal??null,semanticStatus:'independent_human_review_required'}
}
export function parseOptions(args){
  const value=(key,fallback)=>args.find(a=>a.startsWith(`--${key}=`))?.slice(key.length+3)??fallback
  const modes=value('modes','full,gold-scene,gold-plan').split(','),models=value('models','current').split(',')
  const cases=value('cases','all').split(',')
  if(args.some(a=>!['--live','--retest'].includes(a)&&!/^--(?:modes|models|cases|out)=/.test(a)))throw new Error('Unknown evaluation option')
  if(modes.some(m=>!['full','gold-scene','gold-plan'].includes(m))||new Set(modes).size!==modes.length)throw new Error('Invalid or duplicate modes')
  if(cases[0]!=='all'&&cases.some(c=>!ablationCases.some(f=>f.id===c)))throw new Error('Unknown synthetic case')
  if(cases.includes('all')&&cases.length!==1||new Set(cases).size!==cases.length)throw new Error('Invalid or duplicate case selection')
  if(models.some(m=>!m||m.length>160||m.includes('://')||!/^[-\w./:]+$/.test(m))||models.length>3||new Set(models).size!==models.length)throw new Error('Use 1–3 distinct model IDs on the configured provider; no endpoints or keys')
  return {live:args.includes('--live'),retest:args.includes('--retest'),modes,models,cases,out:value('out',fileURLToPath(new URL('../../frontend/.tmp/nilo-ablation/',import.meta.url)))}
}
export async function main(args=process.argv.slice(2)){
  const options=parseOptions(args)
  try{process.loadEnvFile(new URL('../.env',import.meta.url))}catch{}
  const config=llmConfig()
  if(options.live&&!config.apiKey)throw new Error('LLM key is not configured; no request sent')
  const frozen=JSON.parse(readFileSync(new URL('../evals/nilo/ablation-v1-manifest.json',import.meta.url),'utf8'))
  if(frozen.sha256!==fixtureHash)throw new Error('Frozen fixture hash changed; create a new fixture version before evaluation')
  const runId=new Date().toISOString().replace(/[:.]/g,'-'),out=resolve(options.out,runId);mkdirSync(out,{recursive:true})
  const records=[],models=options.models.map(m=>m==='current'?config.visionModel:m)
  const previousLive=resolve(options.out,`${ablationVersion}-live-seen.json`)
  const split=options.live?(options.retest||existsSync(previousLive)?'regression_from_frozen':'first_live_frozen'):'offline_controls'
  if(options.live)writeFileSync(previousLive,JSON.stringify({fixtureHash,runId}))
  for(const fixture of ablationCases.filter(f=>options.cases[0]==='all'||options.cases.includes(f.id))){
    const prepared=await runGoldPlans(fixture),{raster,context,knowledge}=prepared
    writeFileSync(resolve(out,`${fixture.id}-before.png`),raster.bytes)
    const append=record=>{
      records.push(record)
      const name=`${record.case}-${record.mode}-${record.model.replace(/[^\w-]/g,'_')}${record.control?`-${record.control}`:''}`
      if(record.canvasFits||record.compiledProposal){
        const preview=renderReviewCandidate(raster.imageBase64,record.proposal??record.compiledProposal,{...context,fixedGeometry:true})
        writeFileSync(resolve(out,`${name}-${record.canvasFits?'after':'rejected-candidate'}.png`),Buffer.from(preview.imageBase64,'base64'))
      }
      writeFileSync(resolve(out,`${name}.json`),JSON.stringify(record,null,2))
      console.log(JSON.stringify({case:record.case,mode:record.mode,model:record.model,control:record.control,executed:record.executed,canvasFits:record.canvasFits,failureCode:record.failureCode,calls:record.calls.length,latencyMs:record.latencyMs}))
      // Persist after every sample, including failures, so interrupted runs are reviewable.
      writeFileSync(resolve(out,'records.json'),JSON.stringify(records,null,2))
    }
    if(options.modes.includes('gold-plan'))prepared.records.forEach(append)
    for(const mode of options.modes.filter(m=>m!=='gold-plan'))for(const model of models){
      append(options.live?await modelTurn(fixture,mode,model,raster,context,knowledge):{case:fixture.id,group:fixture.group,mode,model,
        executed:false,canvasFits:false,failureCode:'not_run_requires_live',latencyMs:0,calls:[],semanticStatus:'not_evaluated'})
    }
  }
  const report=ablationReport(records,{fixtureVersion:ablationVersion,fixtureHash,runId,split,live:options.live,
    modelEndpointPolicy:'All explicit model IDs use the existing configured provider; no automatic discovery or provider changes.',fixtureManifest})
  writeFileSync(resolve(out,'evaluation.json'),JSON.stringify(report,null,2));writeFileSync(resolve(out,'evaluation.md'),ablationMarkdown(report))
  console.log(`Report: ${resolve(out,'evaluation.md')}`)
  return {out,report,records}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  main().catch(error=>{console.error(error.message.startsWith('LLM')?'Evaluation unavailable; inspect local configuration.':error.message);process.exitCode=1})
}
