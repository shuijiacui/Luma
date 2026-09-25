import { validateSketch } from './niloSketch.mjs'
import { applyAssistedActions, applyAssistedReversal, assistedReversal } from './niloCanvasEdits.mjs'
const range=(v,a,b)=>typeof v==='number'&&Number.isFinite(v)&&v>=a&&v<=b
const id=v=>typeof v==='string'&&v.length>0&&v.length<=100
const brushes=new Set(['round','pencil','marker','crayon','star'])
/** Shared persistence boundary. Legacy replacements remain Nilo-only; explicit
 * assistance can transform visible ink without ever replacing its source data. */
export function validateDrawingDocument(value) {
  if(!value||value.version!==1||!['child','unknown'].includes(value.baseSource)||!Array.isArray(value.operations)||value.operations.length>20000)return false
  if(value.coCreated!==undefined&&value.coCreated!==true)return false
  if(value.guided!==undefined&&value.guided!==true)return false
  if(value.baseImage!==undefined&&(typeof value.baseImage!=='string'||value.baseImage.length>14000000||!/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value.baseImage)))return false
  let total=0;const visible=new Set();let ink=[]
  const assistIds=new Set(),reversals=new Map(),groupCounts=new Map(),owners=new Map()
  for(const op of value.operations)groupCounts.set(op?.groupId,(groupCounts.get(op?.groupId)??0)+1)
  const stroke=op=>{
    if(op.type!=='stroke'||!brushes.has(op.brushKind)||!/^#[0-9a-f]{6}$/i.test(op.color)||typeof op.eraser!=='boolean'||!range(op.size,.01,1024)
      ||!range(op.referenceWidth,1,32768)||!range(op.referenceHeight,1,32768)||!Array.isArray(op.points)||!op.points.length)return false
    total+=op.points.length
    if(total>500000||op.points.some(p=>!p||!range(p.x,0,1)||!range(p.y,0,1)))return false
    // Erasure masks are reconstructed from the log, never accepted as client input.
    if(op.erasures!==undefined)return false
    if(op.guidance!==undefined){
      const g=op.guidance
      if(op.owner!=='child'||op.eraser||!g||!id(g.guideId)||typeof g.name!=='string'||!g.name.length||g.name.length>160
        ||!Array.isArray(g.subjects)||g.subjects.length>8||g.subjects.some(s=>typeof s!=='string'||!s.length||s.length>60))return false
    }
    if(op.object!==undefined){
      const o=op.object
      if(op.owner!=='nilo'||!o||typeof o.name!=='string'||o.name.length>240||!range(o.aspect,.2,5)||!Array.isArray(o.proposals)||!o.proposals.length||o.proposals.length>4)return false
      if(o.proposals.some(p=>!p||p.template==='illustration'||p.illustrationId!==undefined||!range(p.x,0,1)||!range(p.y,0,1)||!range(p.width,.025,.45)||!range(p.height,.025,.45)||p.x+p.width>1||p.y+p.height>1
        ||!/^#[0-9a-f]{6}$/i.test(p.color)||!range(p.strokeWidth,1,32)||(p.template==='custom'&&!validateSketch(p.sketch))))return false
    }
    return true
  }
  for(const op of value.operations){
    if(!op||!id(op.groupId)||!['child','nilo'].includes(op.owner))return false
    if(op.type==='clear'){if(op.owner!=='child')return false;visible.clear();owners.clear();ink=[];continue}
    if(op.type==='assist'){
      if(op.owner!=='nilo'||assistIds.has(op.groupId)||groupCounts.get(op.groupId)!==1)return false
      const transformed=applyAssistedActions(ink,op.targetIds,op.actions)
      if(!transformed)return false
      assistIds.add(op.groupId);reversals.set(op.groupId,assistedReversal(ink,transformed,op.targetIds));ink=transformed;continue
    }
    if(op.type==='assist-revert'){
      if(op.owner!=='nilo'||!id(op.targetId)||!reversals.has(op.targetId)
        ||[...reversals.keys()].at(-1)!==op.targetId||groupCounts.get(op.groupId)!==1)return false
      ink=applyAssistedReversal(ink,reversals.get(op.targetId));reversals.delete(op.targetId);continue
    }
    if(op.type==='edit'){
      if(op.owner!=='nilo'||!id(op.targetId)||!visible.has(op.targetId)||!Array.isArray(op.replacement)||op.replacement.length>64)return false
      if(op.replacement.some(s=>!s||s.owner!=='nilo'||s.eraser||s.groupId!==op.targetId||!stroke(s)))return false
      if(!op.replacement.length)visible.delete(op.targetId)
      const first=ink.findIndex(item=>item.owner==='nilo'&&item.groupId===op.targetId)
      ink=ink.filter(item=>item.owner!=='nilo'||item.groupId!==op.targetId)
      if(first>=0)ink.splice(first,0,...op.replacement)
    }else{
      if(!stroke(op))return false
      if(assistIds.has(op.groupId))return false
      // A group must have one author; otherwise selecting it could change unrelated ink.
      if(!op.eraser&&owners.has(op.groupId)&&owners.get(op.groupId)!==op.owner)return false
      if(!op.eraser){owners.set(op.groupId,op.owner);ink.push(op)}
      if(op.owner==='nilo')visible.add(op.groupId)
    }
  }
  return JSON.stringify(value).length<=24000000
}
