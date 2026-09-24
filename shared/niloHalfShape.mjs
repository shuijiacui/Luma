import { sampleProposalGeometry } from './niloGeometry.mjs'
import { validateSketch } from './niloSketch.mjs'

// Clip actual strokes, not a CSS mask: projection, saved ink and export agree.
export function halfShape(proposal, side='top', aspect=1) {
 proposal={rotation:0,...proposal}
 if(!['top','bottom','left','right'].includes(side))return null
 const horizontal=side==='left'||side==='right',axis=horizontal?'x':'y'
 const cut=proposal[axis]+proposal[horizontal?'width':'height']/2
 const inside=p=>side==='top'||side==='left'?p[axis]<=cut:p[axis]>=cut
 const paths=[]
 for(const stroke of sampleProposalGeometry(proposal,aspect)){
  let part=[]
  const flush=()=>{part=part.filter((p,i)=>!i||Math.hypot(p.x-part[i-1].x,p.y-part[i-1].y)>1e-8);if(part.length>1)paths.push(part);part=[]}
  for(let i=1;i<stroke.points.length;i++){
   const a=stroke.points[i-1],b=stroke.points[i],ai=inside(a),bi=inside(b)
   if(ai&&!part.length)part.push(a)
   if(ai!==bi){const t=(cut-a[axis])/(b[axis]-a[axis]),cross={x:a.x+t*(b.x-a.x),y:a.y+t*(b.y-a.y)};part.push(cross);if(ai)flush()}
   if(bi)part.push(b)
  }
  flush()
 }
 if(!paths.length||paths.length>24)return null
 const x=proposal.x+(side==='right'?proposal.width/2:0),y=proposal.y+(side==='bottom'?proposal.height/2:0)
 const width=proposal.width/(horizontal?2:1),height=proposal.height/(horizontal?1:2)
 const perPath=Math.min(32,Math.floor(96/paths.length))
 const sketch=validateSketch({aspect:width*aspect/height,paths:paths.map(path=>{
  const count=Math.min(perPath,path.length)
  return Array.from({length:count},(_,i)=>{const p=path[Math.round(i*(path.length-1)/(count-1))];return [i?'L':'M',Math.max(0,Math.min(1,(p.x-x)/width)),Math.max(0,Math.min(1,(p.y-y)/height))]})
 })})
 if(!sketch)return null
 const next={...proposal,template:'custom',subject:proposal.subject??proposal.template,x,y,width,height,rotation:0,sketch,contribution:'object',placementPolicy:'free'}
 for(const key of ['recipeId','echoPoints','anchor','placement','attachment','contact'])delete next[key]
 return next
}
