import { decodeCanvas, renderReviewCandidate } from './niloPreview.js'
import { decodeOccupancy, pixelOccupancy } from '../../../shared/niloOccupancy.mjs'
import { compileDrawingPlan, drawingScene, drawingProtocolPrompt, fitDrawingPlan, recoverDrawingPlans } from './niloDrawingProtocol.js'
import { coCreationReviewFailure, turnAttentionFailure } from './niloCoCreation.js'
import { traceNode } from './tracing.js'
import { LLMParseError } from './llmClient.js'

const sameIntent=(a,b)=>['subjectId','regionId','detail','relationship'].every(k=>a[k]===b[k])
const detailKey=intent=>`${intent.subjectId}\u0000${intent.detail.trim().toLowerCase()}`

/** Keep transport/geometry repairs separate from a pixel review that disputes
 * the idea itself. Confidence thresholds still come from the shared validator. */
export function protocolReviewFailure(review) {
  const code=coCreationReviewFailure(review)
  if(!code)return null
  if(code==='invalid_review')return {kind:'format',code}
  if(review.targetVisible===false)return {kind:'semantic',code:'wrong_target'}
  if(review.alreadyPresent)return {kind:'semantic',code:'duplicate_detail'}
  if(!review.placementCorrect)return {kind:'semantic',code:'misplaced_detail'}
  if(!review.detailRelated||!review.usesExistingDrawing)return {kind:'semantic',code:'unrelated_detail'}
  return {kind:'confidence',code}
}

function reviewPrompt(context,region,proposal) {
  // Deliberately withhold the planner's subject/detail names and relationship.
  // Its interpretation must not become evidence for its own visual reviewer.
  const {x,y,width,height,rotation,sketch,attachment,contact}=proposal
  return `Review a child co-creation BEFORE/AFTER using the pixels FIRST. Image 1 is the untouched original; Image 2 adds one proposed mark, not committed. First describe the visible original shape and the added mark in at most 12 words each, without guessing a story. Then judge their actual relationship. The supplied boxes locate pixels, not object identities. No planner interpretation is supplied and none should be inferred from an API label.
Does the added mark use an actually visible supporting structure, match its anatomy/function and orientation, belong to the child's stated story, stay small and leave the original intact? Reject duplicate details, detached limbs/leaves, eye near tail, window on roof and unrelated decoration. Unusual child art is allowed. No emotional/personality inference.
Return only a JSON object {"visibleOriginal":"short pixel description","visibleAddition":"short pixel description","targetVisible":boolean,"detailRelated":boolean,"usesExistingDrawing":boolean,"placementCorrect":boolean,"alreadyPresent":boolean,"confidence":0..1,"geometryConfidence":0..1,"relationConfidence":0..1}. targetVisible means the original contains a recognizable supporting structure for this addition, not merely any ink in the box. Identity uncertainty must not masquerade as geometric certainty. No alternative geometry.
SUPPORTING PIXEL BOX: ${JSON.stringify(region.bounds)}\nNEW INK GEOMETRY: ${JSON.stringify({x,y,width,height,rotation,sketch,attachment,contact})}\nCHILD STORY: ${JSON.stringify(context.history.filter(x=>x.role==='user'))}`
}

/** Observe -> intent/path plan -> deterministic compile/fit -> visual review.
 * Two candidates, one bounded repair, two reviews max; same request deadline. */
export async function generateProtocolTurn({imageBase64,context,knowledge,call,opts,validateProposal}) {
  const scene=drawingScene(knowledge.observation,knowledge.inkAnchors,knowledge.inkContacts??[])
  const metrics={plans:0,compiled:0,preflight:0,reviews:0,repairs:0}
  const fallback=reason=>({status:'clarify',reason,reply:context.locale==='en'?'Let’s pick a little idea together.':'我们一起选个小主意吧。',protocolVersion:2,drawingMetrics:metrics})
  const emit=(stage,code,extra={})=>traceNode('nilo_protocol',{stage,code,revision:context.revision,...extra})
  if(!scene.subjects.length){emit('observe','no_grounded_region');return fallback('unclear_target')}
  const pixels=decodeCanvas(imageBase64)
  const occupancy=decodeOccupancy(context.collisionMap)??pixelOccupancy(pixels)
  const base=drawingProtocolPrompt(context,scene,knowledge.cards)
  const disputedSubjects=new Set(),rejectedDetails=new Set()
  let repair=null,reviews=0
  for(let attempt=0;attempt<2;attempt++) {
    opts.signal.throwIfAborted()
    if(attempt)metrics.repairs++
    let raw
    const locks=Array.isArray(repair)?repair.map(r=>r.lockedIntent).filter(Boolean):[]
    const semanticRepair=Array.isArray(repair)&&repair.some(r=>r.kind==='semantic')
    try {
      raw=await call(attempt?`${base}\nBOUNDED REPAIR: ${JSON.stringify(repair)}. For format/geometry/confidence errors retain a valid lockedIntent exactly and repair only its representation or placement. A semantic error disputes the idea: you may choose a genuinely different grounded candidate from the EXISTING SCENE IDs after inspecting the ORIGINAL image again. Never fabricate or reinterpret a disputed subject ID, merely rename a rejected detail, or repeat an already-present detail. Wrong target IDs cannot be used again this turn. There is no new observation request. Disputed subject IDs: ${JSON.stringify([...disputedSubjects])}. All candidates must pass the same compiler, placement and pixel review. If no grounded alternative exists, return plans:[]. Return the SAME version:2 protocol.`:base,
        {...opts,kind:'nilo_companion_vision',maxTokens:attempt?2200:1800})
    }catch(e){
      if(!(e instanceof LLMParseError))throw e
      raw=recoverDrawingPlans(e.raw)
      if(!raw){emit('plan','invalid_json',{attempt,repairKind:'format'});repair={kind:'format',code:'invalid_json'};continue}
      emit('plan','complete_candidate_recovered',{attempt})
    }
    opts.signal.throwIfAborted()
    const plans=raw?.version===2&&Array.isArray(raw.plans)&&raw.plans.length<=2?raw.plans:null
    if(!plans){emit('plan','protocol_shape',{attempt,repairKind:'format'});repair={kind:'format',code:'protocol_shape'};continue}
    if(!plans.length){emit('plan','no_candidate',{attempt});return fallback('unclear_target')}
    metrics.plans+=plans.length
    repair=[]
    for(const plan of plans) {
      opts.signal.throwIfAborted()
      const compiled=compileDrawingPlan(plan,scene,context,validateProposal)
      if(!compiled.ok){emit('compile',compiled.code,{attempt,repairKind:'format'});repair.push({kind:'format',code:compiled.code,lockedIntent:compiled.intent});continue}
      const {intent}=compiled
      metrics.compiled++
      if(disputedSubjects.has(intent.subjectId)||rejectedDetails.has(detailKey(intent))) {
        const code=disputedSubjects.has(intent.subjectId)?'disputed_target_repeated':'rejected_detail_repeated'
        emit('compile',code,{attempt,repairKind:'semantic'});repair.push({kind:'semantic',code,rejectedIntent:intent});continue
      }
      if(attempt&&!semanticRepair&&locks.length&&!locks.some(lock=>sameIntent(lock,intent))) {
        emit('compile','intent_changed',{attempt,repairKind:'format'});repair.push({kind:'format',code:'intent_changed',lockedIntent:locks[0]});continue
      }
      const attention=turnAttentionFailure(context,compiled.proposal)
      const region=scene.subjects.find(s=>s.id===intent.subjectId).regions.find(r=>r.id===intent.regionId)
      const required=/眼|嘴|窗|\b(?:eyes?|mouth|smile|window)\b/i.test(intent.detail)
      if(attention||(required&&region.id.endsWith('R0'))){const code=attention??'specific_region_required';emit('compile',code,{attempt,repairKind:'geometry'});repair.push({kind:'geometry',code,lockedIntent:intent});continue}
      let proposal=fitDrawingPlan(compiled.proposal,occupancy,context.canvasAspect||1,context.canvasSize,pixels)
      if(!proposal){emit('preflight','collision_or_placement',{attempt,repairKind:'geometry'});repair.push({kind:'geometry',code:'collision_or_placement',lockedIntent:intent});continue}
      // Revalidate all numeric limits after bounded local fit.
      proposal=validateProposal(proposal,{...context,takeTurn:false})
      if(!proposal){emit('preflight','geometry_contract',{attempt,repairKind:'geometry'});repair.push({kind:'geometry',code:'geometry_contract',lockedIntent:intent});continue}
      emit('preflight','passed',{attempt})
      metrics.preflight++
      if(reviews>=2)break
      const preview=renderReviewCandidate(imageBase64,proposal,{...context,fixedGeometry:true})
      let review
      reviews++;metrics.reviews++
      try {
        review=await call(reviewPrompt(context,region,proposal),
          {...opts,kind:'nilo_companion_review',maxTokens:350,reviewImage:preview.imageBase64})
      }catch(e){if(!(e instanceof LLMParseError))throw e}
      opts.signal.throwIfAborted()
      const issue=protocolReviewFailure(review)
      if(issue){
        emit('review',issue.code,{attempt,repairKind:issue.kind})
        repair.push({...issue,...(issue.kind==='semantic'?{rejectedIntent:intent}:{lockedIntent:intent})})
        if(issue.code==='wrong_target'){
          disputedSubjects.add(intent.subjectId)
          if(scene.subjects.every(s=>disputedSubjects.has(s.id))){emit('result','no_observed_alternative',{attempt,repairKind:'semantic'});return fallback('unclear_target')}
        }
        if(['duplicate_detail','unrelated_detail'].includes(issue.code))rejectedDetails.add(detailKey(intent))
        continue
      }
      emit('result','ready',{attempt})
      return {status:'ready',protocolVersion:2,geometryReviewed:true,proposal,drawingMetrics:metrics,
        reply:context.locale==='en'?`I have an idea: ${intent.detail}.`:`我想添上${intent.detail}。`}
    }
    if(reviews>=2)break
  }
  emit('result','recovery_needed')
  return fallback('invalid_response')
}
