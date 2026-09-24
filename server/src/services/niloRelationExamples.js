// Opt-in offline prototype. No production caller imports this module.
import {readFileSync} from 'node:fs'
import {validateSketch,compileSketch} from '../../../shared/niloSketch.mjs'
import {projectionFits} from '../../../shared/niloCollision.mjs'
import {validateContact} from '../../../shared/niloContact.mjs'
import {placeContactSketch} from './niloContactPlacement.js'
import {orientAttachedSketch} from './niloDrawingProtocol.js'

const resource=new URL('../../../knowledge/nilo/references/legacy/relation-examples.json',import.meta.url)
const relations=['inside','single-point','two-points','contour','abstract-continuation']
const box=b=>b&&['x','y','width','height'].every(k=>Number.isFinite(b[k]))&&b.x>=0&&b.y>=0&&b.width>0&&b.height>0&&b.x+b.width<=1.000001&&b.y+b.height<=1.000001
const point=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=0&&p.y>=0&&p.x<=1&&p.y<=1
const contains=(b,p)=>point(p)&&p.x>=b.x-.000001&&p.y>=b.y-.000001&&p.x<=b.x+b.width+.000001&&p.y<=b.y+b.height+.000001
const positiveRange=r=>Array.isArray(r)&&r.length===2&&r.every(Number.isFinite)&&r[0]>0&&r[1]>=r[0]
const distanceToSegment=(p,a,b)=>{
  const dx=b.x-a.x,dy=b.y-a.y,length=dx*dx+dy*dy
  const t=length?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/length)):0
  return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy)
}
let cached

/** Reject malformed author assets rather than silently dropping their strokes. */
export function validateRelationLibrary(library){
  const issues=[],seen=new Set()
  if(library?.source?.kind!=='original-synthetic'||!Array.isArray(library?.examples)||library.examples.length>20)return ['invalid_library']
  for(const e of library.examples){
    const fail=code=>issues.push(`${e?.id??'unknown'}:${code}`)
    if(typeof e?.id!=='string'||seen.has(e.id)){fail('duplicate_or_missing_id');continue}seen.add(e.id)
    if(e.source!=='original-synthetic'||!relations.includes(e.relation))fail('source_or_relation')
    if(!validateSketch(e.before)||!validateSketch(e.addition?.sketch))fail('sketch')
    if(!box(e.supportRegion?.bounds))fail('support_region')
    if(!positiveRange(e.scaleConstraints?.relativeSpan)||e.scaleConstraints.relativeSpan[1]>.75||!positiveRange(e.scaleConstraints?.supportAspect)
      ||!Number.isFinite(e.scaleConstraints?.minimumFreeSpan)||e.scaleConstraints.minimumFreeSpan<=0)fail('scale_limits')
    if(!Array.isArray(e.wrongExamples)||!e.wrongExamples.length||e.wrongExamples.some(w=>!w.description||!w.reason))fail('negative_example')
    const p=e.addition?.placement
    if(e.relation==='inside'&&(p?.mode!=='inside'||!box(p)))fail('inside_placement')
    if(['single-point','abstract-continuation'].includes(e.relation)&&(p?.mode!=='single-point'||!point(p.point)||!p.width||!p.height))fail('point_placement')
    if(['two-points','contour'].includes(e.relation)&&(p?.mode!=='contact'||p.kind!==(e.relation==='contour'?'contour':'points')
      ||!box(e.supportRegion?.bounds)||!validateContact({kind:p.kind,points:p.points},e.supportRegion.bounds,1)))fail('contact_placement')
    // Contact examples must really touch the original synthetic ink. This does
    // not claim that the example's semantic choice has been user validated.
    const ink=compileSketch(e.before)??[]
    const joins=p?.mode==='single-point'?[p.point]:p?.mode==='contact'&&Array.isArray(p.points)?p.points:[]
    if(joins.some(j=>!point(j)||!ink.some(path=>path.some((v,i)=>i>0&&distanceToSegment(j,path[i-1],v)<.003))))fail('contact_not_on_original_ink')
  }
  return issues
}
export function relationExampleLibrary(){
  if(!cached){
    const raw=JSON.parse(readFileSync(resource,'utf8')),issues=validateRelationLibrary(raw)
    if(issues.length)throw new Error(`Invalid relation example assets: ${issues.join(', ')}`)
    cached=raw
  }
  // Callers can annotate a local copy without changing subsequent retrieval.
  return structuredClone(cached)
}

/** Deterministic render geometry for original before/after review sheets. */
export function relationExampleGeometry(example){
  const p=example.addition.placement,sketch=example.addition.sketch
  let geometry
  if(p.mode==='contact')geometry=placeContactSketch(sketch,{points:p.points,side:p.side},p.kind,1)
  else if(p.mode==='single-point'){
    const first=sketch.paths[0][0]
    geometry={x:p.point.x-first[1]*p.width,y:p.point.y-first[2]*p.height,width:p.width,height:p.height,sketch,attachment:p.point}
  }else geometry={x:p.x,y:p.y,width:p.width,height:p.height,sketch}
  if(!geometry||!box(geometry))throw new Error(`Unrenderable relation example: ${example.id}`)
  return {template:'custom',subject:example.title,target:example.supportRegion.name,relation:example.lesson,
    anchor:example.supportRegion.bounds,placement:p.mode==='inside'?'inside':'near',rotation:0,
    color:'#d74952',strokeWidth:4,brushKind:'round',...geometry}
}

function available(geometry,subjectId,scene,options){
  if(!box(geometry))return false
  // Bounds can only establish room inside the canvas and between known objects.
  // If exact occupancy is supplied, also use the production collision checker.
  if(options.occupancy)return projectionFits(geometry,options.occupancy,options.canvasAspect??1,options.canvasSize)
  return !(scene.subjects??[]).some(s=>s.id!==subjectId&&box(s.bounds)
    &&Math.min(geometry.x+geometry.width,s.bounds.x+s.bounds.width)-Math.max(geometry.x,s.bounds.x)>.003
    &&Math.min(geometry.y+geometry.height,s.bounds.y+s.bounds.height)-Math.max(geometry.y,s.bounds.y)>.003)
}
const physicalSpan=(b,aspect)=>Math.max(b.width*aspect,b.height)

/** Retrieve at most two compact relation lessons. No subject-name matching,
 * provider calls, fallback object invention or automatic drawing occurs here.
 * scene is the program-assigned drawingScene; optional occupancy makes free
 * space checks exact. Without it, results explicitly say bounds-only. */
export function selectRelationExamples(scene,{limit=2,...options}={}){
  if(!Number.isInteger(limit)||limit<=0)return []
  limit=Math.min(2,limit)
  const aspect=Number.isFinite(options.canvasAspect)&&options.canvasAspect>0?options.canvasAspect:1
  if(options.canvasAspect!==undefined&&(!Number.isFinite(options.canvasAspect)||options.canvasAspect<=0))return []
  if(options.occupancy&&(!Array.isArray(options.occupancy)||options.occupancy.length!==65536))return []
  const candidates=[],examples=relationExampleLibrary().examples
  for(const subject of (scene?.subjects??[]).slice(0,2)){
    if(!subject.id||!box(subject.bounds))continue
    for(const region of (subject.regions??[]).slice(0,5)){
      if(!region.id||!box(region.bounds)||!contains(subject.bounds,region.bounds)||!contains(subject.bounds,{x:region.bounds.x+region.bounds.width,y:region.bounds.y+region.bounds.height}))continue
      const b=region.bounds,ratio=b.width*aspect/b.height
      for(const example of examples){
        const limits=example.scaleConstraints
        if(ratio<limits.supportAspect[0]||ratio>limits.supportAspect[1])continue
        if(example.relation==='abstract-continuation'&&subject.family!=='abstract')continue
        const span=physicalSpan(b,aspect)*(limits.relativeSpan[0]+limits.relativeSpan[1])/2,sketch=example.addition.sketch
        const width=span*Math.min(1,sketch.aspect)/aspect,height=span/Math.max(1,sketch.aspect)
        const base={template:'custom',subject:example.title,target:subject.name??'',relation:example.lesson,anchor:b,
          rotation:0,strokeWidth:options.brushSize??4,brushKind:'round',color:'#20352f'}
        const add=(geometry,match,score)=>{
          if(Math.min(geometry.width*aspect,geometry.height)<.025||physicalSpan(geometry,aspect)<limits.minimumFreeSpan
            ||!available(geometry,subject.id,scene,options))return
          candidates.push({example,match:{subjectId:subject.id,regionId:region.id,...match},score:score+(region.id.endsWith('R0')?0:.15)})
        }
        if(example.relation==='inside'){
          if(width>b.width*.8||height>b.height*.8)continue
          const geometry={...base,x:b.x+(b.width-width)/2,y:b.y+(b.height-height)/2,width,height,sketch,placement:'inside'}
          add(geometry,{},1-Math.min(1,Math.abs(Math.log(ratio/sketch.aspect))*.35))
        }else if(['single-point','abstract-continuation'].includes(example.relation)){
          for(const anchor of (subject.anchors??[]).slice(0,8)){
            if(!anchor.id||!contains(b,anchor)||!limits.allowedSides.includes(anchor.side))continue
            const oriented=orientAttachedSketch(sketch,anchor,b);if(!oriented)continue
            const w=span*Math.min(1,oriented.aspect)/aspect,h=span/Math.max(1,oriented.aspect),[,u,v]=oriented.paths[0][0]
            add({...base,x:anchor.x-u*w,y:anchor.y-v*h,width:w,height:h,sketch:oriented,attachment:{x:anchor.x,y:anchor.y},placement:'near'},
              {anchorId:anchor.id},example.relation==='abstract-continuation'?1.25:.95)
          }
        }else{
          for(const contact of (subject.contacts??[]).slice(0,8)){
            if(!contact.id||contact.subjectId!==subject.id||contact.regionId!==region.id||!limits.allowedSides.includes(contact.side)
              ||!validateContact({kind:'contour',points:contact.points},b,aspect))continue
            const geometry=placeContactSketch(sketch,contact,example.relation==='contour'?'contour':'points',aspect)
            if(!geometry)continue
            const relative=physicalSpan(geometry,aspect)/physicalSpan(b,aspect)
            if(relative<limits.relativeSpan[0]||relative>limits.relativeSpan[1])continue
            add({...base,...geometry,placement:'near'},{contactId:contact.id,contactKind:example.relation==='contour'?'contour':'points'},1.1)
          }
        }
      }
    }
  }
  candidates.sort((a,b)=>b.score-a.score||a.example.id.localeCompare(b.example.id))
  const chosen=[],seen=new Set()
  for(const c of candidates){
    if(seen.has(c.example.id))continue
    seen.add(c.example.id);chosen.push(c);if(chosen.length===limit)break
  }
  return chosen.map(({example,match})=>({id:example.id,relation:example.relation,lesson:example.lesson,
    localSketch:example.addition.sketch,relativeSpan:example.scaleConstraints.relativeSpan,
    avoid:example.wrongExamples[0].reason,match,
    spaceEvidence:options.occupancy?'occupancy-checked':'bounds-only-needs-collision-check',
    source:'original-synthetic',usage:'reference-only-not-a-proposal'}))
}
