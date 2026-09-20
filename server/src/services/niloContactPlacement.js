import { decodeCanvas } from './niloPreview.js'
import { compileSketch } from '../../../shared/niloSketch.mjs'
import { validateContact } from '../../../shared/niloContact.mjs'
import { observedSubjectRegions } from './niloObservedRegions.js'

const distance=(a,b,aspect)=>Math.hypot((a.x-b.x)*aspect,a.y-b.y)
const inside=(p,b)=>p.x>=b.x&&p.y>=b.y&&p.x<=b.x+b.width&&p.y<=b.y+b.height

/** Short ORIGINAL ink contours. IDs convey location, never anatomical truth.
 * Pixel data stays in request memory; no model-supplied collision exemptions. */
export function drawingInkContacts(imageBase64,observation) {
  const png=decodeCanvas(imageBase64),aspect=png.width/png.height,result=[],shortSide=Math.min(1,aspect)
  const ink=(x,y)=>{const i=(y*png.width+x)*4;return png.data[i+3]>8&&Math.min(png.data[i],png.data[i+1],png.data[i+2])<242}
  for(const [si,subject] of (observation?.subjects??[]).entries()) {
    if(!subject.bounds||subject.confidence<.65)continue
    const subjectId=`S${si+1}`
    const regions=observedSubjectRegions(subject)
    const candidates=[]
    for(const region of regions) {
      const b=region.bounds,regionId=`${subjectId}${region.id}`
      for(const side of ['top','bottom','left','right']) {
        const horizontal=side==='top'||side==='bottom'
        const span=Math.min(.22*shortSide,horizontal?b.width*aspect*.45:b.height*.45)
        if(span<.04*shortSide)continue
        const centre=horizontal?b.x+b.width/2:b.y+b.height/2
        const start=centre-span/(horizontal?aspect:1)/2,points=[]
        for(let j=0;j<12;j++) {
          const t=start+j/11*span/(horizontal?aspect:1)
          const fixed=Math.min((horizontal?png.width:png.height)-1,Math.max(0,Math.floor(t*(horizontal?png.width:png.height))))
          const lo=Math.max(0,Math.ceil((horizontal?b.y:b.x)*(horizontal?png.height:png.width)))
          const hi=Math.min((horizontal?png.height:png.width)-1,Math.floor((horizontal?b.y+b.height:b.x+b.width)*(horizontal?png.height:png.width)))
          const reverse=side==='bottom'||side==='right'
          let found=null
          for(let k=reverse?hi:lo;reverse?k>=lo:k<=hi;k+=reverse?-1:1) {
            const x=horizontal?fixed:k,y=horizontal?k:fixed
            if(ink(x,y)){found={x:(x+.5)/png.width,y:(y+.5)/png.height};break}
          }
          if(!found||!inside(found,b)){points.length=0;break}
          if(!points.length||distance(points.at(-1),found,aspect)>1e-6)points.push(found)
        }
        const lengths=points.slice(1).map((p,i)=>distance(p,points[i],aspect))
        const length=lengths.reduce((sum,d)=>sum+d,0)
        if(points.length<4||length<.04*shortSide||length>.30*shortSide||lengths.some(d=>d>.04*shortSide)
          ||!validateContact({kind:'contour',points},b,aspect))continue
        candidates.push({id:`${regionId}_${side}`,subjectId,regionId,side,points})
      }
    }
    // Prefer measured local regions over whole-subject extrema; bounded prompt.
    result.push(...candidates.sort((a,b)=>Number(a.regionId.endsWith('R0'))-Number(b.regionId.endsWith('R0'))).slice(0,8))
  }
  return result
}

function along(points,u,aspect) {
  const lengths=points.slice(1).map((p,i)=>distance(p,points[i],aspect)),total=lengths.reduce((a,b)=>a+b,0)
  let left=u*total
  for(let i=0;i<lengths.length;i++) {
    if(left<=lengths[i]||i===lengths.length-1){const t=lengths[i]?left/lengths[i]:0;return {x:points[i].x+(points[i+1].x-points[i].x)*t,y:points[i].y+(points[i+1].y-points[i].y)*t}}
    left-=lengths[i]
  }
  return points[0]
}

function simplify(points,aspect,tolerance=.0005) {
  const keep=new Set([0,points.length-1]),stack=[[0,points.length-1]]
  while(stack.length) {
    const [start,end]=stack.pop(),a=points[start],b=points[end]
    const dx=(b.x-a.x)*aspect,dy=b.y-a.y,length=dx*dx+dy*dy
    let far=-1,max=tolerance
    for(let i=start+1;i<end;i++) {
      const p=points[i],t=length?Math.max(0,Math.min(1,((p.x-a.x)*aspect*dx+(p.y-a.y)*dy)/length)):0
      const d=Math.hypot((p.x-a.x)*aspect-t*dx,p.y-a.y-t*dy)
      if(d>max){max=d;far=i}
    }
    if(far>=0){keep.add(far);stack.push([start,far],[far,end])}
  }
  return [...keep].sort((a,b)=>a-b).map(i=>points[i])
}

/** Fit a local bottom edge (y=1) to measured ink, growing outward.
 * Contact width fixes physical size. No post-review move/scale is permitted. */
export function placeContactSketch(sketch,candidate,kind,canvasAspect=1) {
  if(!candidate||!['points','contour'].includes(kind)||!Array.isArray(candidate.points)||candidate.points.length<2)return null
  const measured=candidate.points,ends=[measured[0],measured.at(-1)],base=kind==='contour'?measured:ends
  const width=base.slice(1).reduce((s,p,i)=>s+distance(p,base[i],canvasAspect),0),height=width/sketch.aspect
  if(width<.025*Math.min(1,canvasAspect)||width>.35*Math.min(1,canvasAspect)||height>.45)return null
  const normal={top:[0,-1],bottom:[0,1],left:[-1,0],right:[1,0]}[candidate.side]
  if(!normal)return null
  const map=p=>{const q=along(base,p.x,canvasAspect);return {x:q.x+normal[0]*(1-p.y)*height/canvasAspect,y:q.y+normal[1]*(1-p.y)*height}}
  const paths=compileSketch(sketch)
  if(!paths)return null
  // Sample each segment densely enough to follow the measured contour. Bound
  // the final command count while retaining exact stroke endpoints.
  const world=paths.map(path=>{
    const dense=[map(path[0])]
    for(let i=1;i<path.length;i++) {
      const a=path[i-1],b=path[i],steps=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)*24))
      for(let j=1;j<=steps;j++)dense.push(map({x:a.x+(b.x-a.x)*j/steps,y:a.y+(b.y-a.y)*j/steps}))
    }
    return dense
  })
  const flat=world.flat();if(!flat.length)return null
  let x=Math.min(...flat.map(p=>p.x)),y=Math.min(...flat.map(p=>p.y))
  let w=Math.max(...flat.map(p=>p.x))-x,h=Math.max(...flat.map(p=>p.y))-y
  if(w<.026){x-=(.026-w)/2;w=.026}if(h<.026){y-=(.026-h)/2;h=.026}
  const ratio=w*canvasAspect/h
  if(x<0||y<0||x+w>1||y+h>1||w>.45||h>.45||ratio<.2||ratio>5)return null
  // Error-bounded simplification preserves sharp corners, unlike dropping
  // every Nth sample. Refuse excess complexity instead of silently distorting.
  const simplified=world.map(path=>simplify(path,canvasAspect,.0005*Math.min(1,canvasAspect)))
  if(simplified.some(path=>path.length>32)||simplified.reduce((sum,path)=>sum+path.length,0)>96)return null
  const commandPaths=simplified.map(path=>path.map((p,i)=>[i?'L':'M',Math.max(0,Math.min(1,(p.x-x)/w)),Math.max(0,Math.min(1,(p.y-y)/h))]))
  return {x,y,width:w,height:h,sketch:{aspect:ratio,paths:commandPaths},contact:{kind,points:kind==='contour'?measured:ends}}
}
