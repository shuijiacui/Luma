// A bounded edit language shared by the API and the canvas. Never contains paths,
// code or an auto-commit instruction. The canvas separately authorizes targets.
const finite=(n,min,max)=>typeof n==='number'&&Number.isFinite(n)&&n>=min&&n<=max
export function validateVoiceActions(value){
 if(!Array.isArray(value)||value.length<1||value.length>6)return null
 const result=[]
 for(const a of value){
  if(!a||typeof a!=='object'||Array.isArray(a))return null
  let allowed
  if(a.type==='color'&&/^#[0-9a-f]{6}$/i.test(a.value)){allowed=['type','value'];result.push({type:a.type,value:a.value.toLowerCase()})}
  else if(a.type==='scale'&&finite(a.factor,.5,2)){allowed=['type','factor'];result.push({type:a.type,factor:a.factor})}
  else if(a.type==='move'&&finite(a.dx,-.5,.5)&&finite(a.dy,-.5,.5)){allowed=['type','dx','dy'];result.push({type:a.type,dx:a.dx,dy:a.dy})}
  else if(a.type==='place'&&finite(a.x,0,1)&&finite(a.y,0,1)){allowed=['type','x','y'];result.push({type:a.type,x:a.x,y:a.y})}
  else if(a.type==='variant'||a.type==='delete'){allowed=['type'];result.push({type:a.type})}
  else if(a.type==='part'&&['tail','wing','sail'].includes(a.part)&&finite(a.factor,.5,1.5)){allowed=['type','part','factor'];result.push({type:a.type,part:a.part,factor:a.factor})}
  else return null
  if(Object.keys(a).some(k=>!allowed.includes(k)))return null
 }
 // Deletion must not hide discarded edits behind a misleading success message.
 if(result.some(a=>a.type==='delete')&&result.length!==1)return null
 return result
}

export function validateVoicePlan(raw,ids){
 if(!raw||typeof raw!=='object')return null
 if(raw.status==='noop'||raw.status==='unhandled')return {status:raw.status}
 if(raw.status==='clarify')return {status:'clarify',reason:raw.reason==='target'?'target':'instruction',candidateIds:Array.isArray(raw.candidateIds)?[...new Set(raw.candidateIds.filter(id=>ids.includes(id)))].slice(0,12):[]}
 if(raw.status==='redraw'&&ids.includes(raw.targetId))return {status:'redraw',targetId:raw.targetId}
 if(raw.status!=='edit'||!ids.includes(raw.targetId))return null
 const actions=validateVoiceActions(raw.actions)
 return actions?{status:'edit',targetId:raw.targetId,actions}:null
}

/** Direct help changes attributes of existing ink; new geometry remains a guide. */
export function validateAssistedActions(value){
 const actions=validateVoiceActions(value)
 return actions&&actions.every(a=>['color','move','scale','place'].includes(a.type))?actions:null
}
