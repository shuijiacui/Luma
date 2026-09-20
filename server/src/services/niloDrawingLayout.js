// The same relative layout contract works for built-in parts and novel paths.
export function readDrawingLayout(proposal) {
  const position=proposal.position??{u:.5,v:.5},scale=proposal.scale??.35
  if(!position||typeof position!=='object'||Array.isArray(position)||Object.keys(position).some(k=>!['u','v'].includes(k))
    ||![position.u,position.v].every(n=>typeof n==='number'&&Number.isFinite(n)&&n>=.1&&n<=.9)
    ||typeof scale!=='number'||!Number.isFinite(scale)||scale<.12||scale>.65)return null
  if(proposal.position!==undefined&&(proposal.attachment||proposal.placement!=='inside'))return null
  return {position,scale,joined:!!proposal.attachment}
}
