import { validateSketch } from './niloSketch.mjs'
const range=(v,a,b)=>typeof v==='number'&&Number.isFinite(v)&&v>=a&&v<=b
const id=v=>typeof v==='string'&&v.length>0&&v.length<=100
const brushes=new Set(['round','pencil','marker','crayon','star'])
/** Shared persistence boundary. Edit events can address only visible Nilo groups. */
export function validateDrawingDocument(value) {
  if(!value||value.version!==1||!['child','unknown'].includes(value.baseSource)||!Array.isArray(value.operations)||value.operations.length>20000)return false
  if(value.coCreated!==undefined&&value.coCreated!==true)return false
  if(value.baseImage!==undefined&&(typeof value.baseImage!=='string'||value.baseImage.length>14000000||!/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value.baseImage)))return false
  let total=0;const visible=new Set()
  const stroke=op=>{
    if(op.type!=='stroke'||!brushes.has(op.brushKind)||!/^#[0-9a-f]{6}$/i.test(op.color)||typeof op.eraser!=='boolean'||!range(op.size,.01,1024)
      ||!range(op.referenceWidth,1,32768)||!range(op.referenceHeight,1,32768)||!Array.isArray(op.points)||!op.points.length)return false
    total+=op.points.length
    if(total>500000||op.points.some(p=>!p||!range(p.x,0,1)||!range(p.y,0,1)))return false
    if(op.object!==undefined){
      const o=op.object
      if(op.owner!=='nilo'||!o||typeof o.name!=='string'||o.name.length>240||!range(o.aspect,.2,5)||!Array.isArray(o.proposals)||!o.proposals.length||o.proposals.length>4)return false
      if(o.proposals.some(p=>!p||!range(p.x,0,1)||!range(p.y,0,1)||!range(p.width,.025,.45)||!range(p.height,.025,.45)||p.x+p.width>1||p.y+p.height>1
        ||!/^#[0-9a-f]{6}$/i.test(p.color)||!range(p.strokeWidth,1,32)||(p.template==='custom'&&!validateSketch(p.sketch))))return false
    }
    return true
  }
  for(const op of value.operations){
    if(!op||!id(op.groupId)||!['child','nilo'].includes(op.owner))return false
    if(op.type==='clear'){if(op.owner!=='child')return false;visible.clear();continue}
    if(op.type==='edit'){
      if(op.owner!=='nilo'||!id(op.targetId)||!visible.has(op.targetId)||!Array.isArray(op.replacement)||op.replacement.length>64)return false
      if(op.replacement.some(s=>!s||s.owner!=='nilo'||s.eraser||s.groupId!==op.targetId||!stroke(s)))return false
      if(!op.replacement.length)visible.delete(op.targetId)
    }else{
      if(!stroke(op))return false
      if(op.owner==='nilo')visible.add(op.groupId)
    }
  }
  return JSON.stringify(value).length<=24000000
}
