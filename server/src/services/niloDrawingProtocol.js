import { validateCustomSketch } from './niloSketch.js'
import { normalizeTurnSketch } from './niloCoCreation.js'
import { projectionFits, placementFits } from '../../../shared/niloCollision.mjs'
import { placeContactSketch } from './niloContactPlacement.js'
import { observedSubjectRegions } from './niloObservedRegions.js'

const text=(v,n=100)=>typeof v==='string'?v.replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,n):''
const unit=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=1
const within=(a,b)=>a.x>=b.x-.002&&a.y>=b.y-.002&&a.x+a.width<=b.x+b.width+.002&&a.y+a.height<=b.y+b.height+.002

/** IDs and references are assigned by code. Model names never become tools. */
export function drawingScene(observation, anchors=[], contacts=[]) {
  const subjects=observation.subjects.flatMap((s,index)=>{
    const id=`S${index+1}`
    const regions=observedSubjectRegions(s).map(r=>({...r,id:`${id}${r.id}`}))
    if(!regions.length)return []
    return [{id,name:s.subject,family:s.family,evidence:s.visible,bounds:s.bounds,existingParts:s.existingParts,regions,
      anchors:anchors.filter(a=>a.id.startsWith(`${id}_`)).map(({id,x,y,side})=>({id,x,y,side})),
      contacts:contacts.filter(c=>c.subjectId===id&&regions.some(r=>r.id===c.regionId)).slice(0,8)}]
  })
  return {version:2,subjects}
}

export function readDrawingIntent(raw,scene) {
  const subject=scene.subjects.find(s=>s.id===raw?.subjectId)
  const region=subject?.regions.find(r=>r.id===raw?.regionId)
  const detail=text(raw?.detail,60),relationship=text(raw?.relationship,180)
  if(!subject||!region||!detail||!relationship)return null
  return {subjectId:subject.id,regionId:region.id,detail,relationship}
}

/** Attached paths use an outward local frame, independent of object identity.
 * Rotate quarter turns in physical space, preserving curves and the join. */
export function orientAttachedSketch(sketch,anchor,region) {
  const first=sketch.paths[0][0]
  if(first[0]!=='M')return null
  const [,x,y]=first
  const edges=[{distance:x,axis:0},{distance:y,axis:1},{distance:1-x,axis:2},{distance:1-y,axis:3}].sort((a,b)=>a.distance-b.distance)
  if(edges[0].distance>.15)return null
  const side=anchor.side
  let target=side==='right'?0:side==='bottom'?1:side==='left'?2:side==='top'?3:null
  if(target===null){
    const dx=(anchor.x-region.x)/region.width-.5,dy=(anchor.y-region.y)/region.height-.5
    target=Math.abs(dx)>Math.abs(dy)?dx>=0?0:2:dy>=0?1:3
  }
  const turns=(target-edges[0].axis+4)%4
  const point=(a,b)=>turns===1?[1-b,a]:turns===2?[1-a,1-b]:turns===3?[b,1-a]:[a,b]
  return {aspect:turns%2?1/sketch.aspect:sketch.aspect,paths:sketch.paths.map(path=>path.map(([op,...coords])=>{
    if(op==='E')return [op,...point(coords[0],coords[1]),...(turns%2?[coords[3],coords[2]]:[coords[2],coords[3]])]
    return [op,...coords.flatMap((n,i)=>i%2?[]:point(n,coords[i+1]))]
  }))}
}

/** Recover only representation errors (flat command arrays, extra M moves).
 * Missing identity/geometry is never invented. All objects use this contract. */
export function compileDrawingPlan(raw,scene,context,validateProposal) {
  const intent=readDrawingIntent(raw?.intent,scene)
  if(!intent)return {ok:false,code:'intent_reference',intent:null}
  const failure=code=>({ok:false,code,intent})
  const drawing=raw.drawing,layout=drawing?.placement??raw.placement
  if(!drawing||typeof drawing!=='object')return failure('path_syntax')
  if(!layout||!['inside','attached','contact','above','below','left','right'].includes(layout.mode))return failure('layout_mode')
  if(layout.mode!=='contact'&&(!unit(layout.scale)||layout.scale<.08||layout.scale>.65))return failure('layout_scale')
  let sketch=validateCustomSketch(normalizeTurnSketch({aspect:drawing.aspect,paths:drawing.paths}))
  if(!sketch||sketch.paths.length>8)return failure('path_syntax')
  const subject=scene.subjects.find(s=>s.id===intent.subjectId),region=subject.regions.find(r=>r.id===intent.regionId),a=region.bounds
  if(layout.mode==='contact') {
    const candidate=subject.contacts?.find(c=>c.id===layout.contactId&&c.regionId===region.id)
    if(!candidate)return failure('contact_reference')
    const placed=placeContactSketch(sketch,candidate,layout.contactKind,context.canvasAspect||1)
    if(!placed)return failure('contact_geometry')
    const style=context.drawingStyle??{color:'#568570',brushSize:4,brushKind:'round'}
    const proposal=validateProposal({template:'custom',subject:intent.detail,target:subject.name,relation:intent.relationship,
      anchor:a,placement:'near',...placed,rotation:0,color:style.color,strokeWidth:style.brushSize,brushKind:style.brushKind},
      {...context,takeTurn:false})
    if(!proposal||proposal.sketch.paths.length>4&&proposal.width*proposal.height>.06)return failure('geometry_contract')
    return {ok:true,intent,proposal}
  }
  // Object extensions need a real joint. Detached scene additions (e.g. rain
  // below an observed sky/cloud) are reserved for observed landscape regions.
  if(!['inside','attached'].includes(layout.mode)&&subject.family!=='landscape')return failure('connection_required')
  let attachment
  if(layout.mode==='attached') {
    attachment=subject.anchors.find(p=>p.id===layout.joinId)
    if(!attachment||!within({x:attachment.x,y:attachment.y,width:0,height:0},a))return failure('connection_reference')
    sketch=orientAttachedSketch(sketch,attachment,a)
    if(!sketch||!validateCustomSketch(sketch))return failure('connection_start')
  }
  const aspect=context.canvasAspect||1,ratio=sketch.aspect
  const minimum=Math.max(.026*aspect/Math.min(1,ratio),.026*Math.max(1,ratio))
  const maximum=Math.min(.45*aspect/Math.min(1,ratio),.45*Math.max(1,ratio),Math.sqrt((sketch.paths.length>4?.0599:.1599)*aspect*Math.max(1,ratio)/Math.min(1,ratio)))
  const span=Math.min(maximum,Math.max(minimum,Math.max(a.width*aspect,a.height)*layout.scale))
  const width=span*Math.min(1,sketch.aspect)/aspect,height=span/Math.max(1,sketch.aspect)
  let x,y
  if(layout.mode==='attached') {
    x=attachment.x-sketch.paths[0][0][1]*width;y=attachment.y-sketch.paths[0][0][2]*height
  } else {
    if(!Array.isArray(layout.at)||layout.at.length!==2||!layout.at.every(unit))return failure('layout_position')
    x=a.x+a.width*layout.at[0]-width/2;y=a.y+a.height*layout.at[1]-height/2
    const gap=.02
    if(layout.mode==='above')y=a.y-height-gap
    if(layout.mode==='below')y=a.y+a.height+gap
    if(layout.mode==='left')x=a.x-width-gap/aspect
    if(layout.mode==='right')x=a.x+a.width+gap/aspect
  }
  const style=context.drawingStyle??{color:'#568570',brushSize:4,brushKind:'round'}
  const proposal=validateProposal({template:'custom',subject:intent.detail,target:subject.name,relation:intent.relationship,
    anchor:a,placement:layout.mode==='attached'?'near':layout.mode,sketch,x,y,width,height,rotation:0,
    color:style.color,strokeWidth:style.brushSize,brushKind:style.brushKind,
    ...(attachment?{attachment:{x:attachment.x,y:attachment.y}}:{})}, {...context,takeTurn:false})
  if(!proposal)return failure('geometry_contract')
  if(proposal.sketch.paths.length>4&&width*height>.060000001)return failure('path_budget')
  return {ok:true,intent,proposal}
}

/** Recover complete candidate objects preceding a malformed/truncated sibling.
 * Never close brackets, invent coordinates or evaluate model text. */
export function recoverDrawingPlans(raw) {
  if(typeof raw!=='string'||raw.length>32000)return null
  const prefix=raw.match(/^\s*\{\s*"version"\s*:\s*2\s*,\s*"plans"\s*:\s*\[/)
  if(!prefix)return null
  const plans=[];let start=-1,depth=0,quoted=false,escaped=false
  for(let i=prefix[0].length;i<raw.length&&plans.length<2;i++) {
    const c=raw[i]
    if(start<0){if(/[\s,]/.test(c))continue;if(c!=='{')break;start=i;depth=1;continue}
    if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;continue}
    if(c==='"')quoted=true
    else if(c==='{')depth++
    else if(c==='}'&&--depth===0){
      try{const p=JSON.parse(raw.slice(start,i+1));if(p?.intent&&p?.drawing)plans.push(p)}catch{}
      start=-1
    }
  }
  return plans.length?{version:2,plans}:null
}

/** Bounded local fit BEFORE review. No cross-region move, rotation or style change. */
export function fitDrawingPlan(proposal,occupancy,aspect,size,pixels) {
  const fits=p=>placementFits(p,aspect,size)&&projectionFits(p,occupancy,aspect,size,pixels)
  if(fits(proposal))return proposal
  if(proposal.contact)return null // Multiple joints/contours must never drift.
  if(proposal.attachment) {
    const [,u,v]=proposal.sketch.paths[0][0]
    for(const scale of [.85,.7]) {
      const width=proposal.width*scale,height=proposal.height*scale
      if(width<.025||height<.025)continue
      const p={...proposal,width,height,x:proposal.attachment.x-u*width,y:proposal.attachment.y-v*height}
      if(fits(p))return p
    }
    return null // The actual joint and direction never move.
  }
  const a=proposal.anchor,limit=Math.min(.025,Math.max(a.width*aspect,a.height)*.08)
  for(const scale of [1,.85,.7])for(const [dx,dy] of [[0,0],[1,0],[-1,0],[0,1],[0,-1]]) {
    const width=proposal.width*scale,height=proposal.height*scale
    if(width<.025||height<.025)continue
    const p={...proposal,width,height,x:proposal.x+(proposal.width-width)/2+dx*limit/aspect,y:proposal.y+(proposal.height-height)/2+dy*limit}
    if(fits(p))return p
  }
  return null
}

export function drawingProtocolPrompt(context,scene,cards) {
  return `You are Nilo, a child drawing partner. Plan ONE meaningful new detail and a DIFFERENT backup idea. Inspect the current child drawing, not reference pictures, and respect the child's story. Return a JSON object {"version":2,"plans":[{"intent":{"subjectId":"S1","regionId":"S1R1","detail":"short name of new detail","relationship":"why it belongs on this existing region"},"drawing":{"aspect":0.7,"paths":[[["M",0.1,0.1],["Q",0.3,0.5,0.8,0.9]]],"placement":{"mode":"inside","at":[0.5,0.5],"scale":0.3,"joinId":null}}}]}. Example values are NOT a drawing instruction. At most TWO plans. Every object uses the SAME drawing contract; no templates, part names or API commands. The program supplies all colour, brush, absolute coordinates and text to the child.
Choose intent FIRST using supplied subject and region IDs. Subjects/regions are observations and may be wrong: verify against the image. No fabricated IDs. Use the WHOLE child picture; a final detached sky mark does not prohibit developing a previous tree. Prefer a specific anatomical/functional region for small details. Eyes need an observed head/face region; windows need a wall, tree bark a trunk. Do not repeat existing details or previously rejected ideas. Preserve asymmetry and leave room for the child to continue.
Then encode ONLY the new detail in local coordinates [0,1], aspect physical width/height .2..5. Commands: M x y, L x y, Q cx cy x y, C c1x c1y c2x c2y x y, Z; a separate ellipse path is E cx cy rx ry. Normally 1–4 paths, at most 8. Start every open path with M; separate strokes into separate paths. No SVG, code, prose or string coordinates.
Placement: object details MUST use inside, attached or contact. Detached above/below/left/right are allowed ONLY on subjects whose observed family is landscape (e.g. rain below a cloud). An antenna, ear, leaf or tail cannot use above/below as a substitute for attachment. Use the whole-subject region if a measured join is outside a smaller observed region. Modes inside or landscape above/below/left/right use at:[u,v] (.1..9) within the selected region, scale:.08..65 relative to its longest physical side, joinId:null. attached uses joinId from actual ink anchors of that subject (inside the selected region), at:null, and first M is the connecting end on a local box edge (prefer M 0 .5, drawing toward increasing x). The compiler rotates this local frame to grow OUTWARD from the selected ink side. It must grow AWAY from existing ink, not along or across it. An anchor label is NOT proof of anatomy. Exterior limbs/leaves/stems must be attached; separate neighboring objects need an actual scene interaction. Internal shapes must fit their region. Small details need readable gaps at the current brush size. Don't force an idea when its region is uncertain. If none is grounded return plans:[].
When a new shape should meet TWO points or a SHORT CURVED BOUNDARY, use placement:{mode:"contact",contactId:"an actual supplied contact ID",contactKind:"points" or "contour"}, with no scale/at/joinId. The chosen contact must belong to the intent's region. In your LOCAL drawing y=1 is the contact baseline and y=0 grows away from the original boundary. x=0 and x=1 meet the two measured ends. points allows touch at only these two ends; contour fits the baseline to the measured curved ink, so a hat brim can sit naturally on the head. Include endpoints in the paths and, for contour, a continuous bottom path from (0,1) to (1,1). The app warps this bottom to the real contour and sizes the detail from its width and your physical aspect. Most new ink must extend into clear space, never trace/overwrite the original as the whole contribution. Do not use a contact label as evidence of object identity. Contact is optional; use inside for surface details and attached for a single endpoint.
SCENE DATA: ${JSON.stringify(scene)}
DRAWING KNOWLEDGE (ideas only, custom local paths are universal): ${JSON.stringify(cards)}
CHILD CONTEXT: ${JSON.stringify({locale:context.locale,utterance:context.utterance,history:context.history.filter(x=>x.role==='user'),scene:context.scene,drawingStyle:context.drawingStyle,canvasSize:context.canvasSize,recentSubjects:context.recentSubjects,rejectedSubjects:context.rejectedSubjects})}
Name the new detail and relationship in ${context.locale==='en'?'English':'Chinese'}.`
}
