import { decodeCanvas } from './niloPreview.js'

// Supply a small set of actual ink locations, not another model's guessed
// coordinates. The planner still has to select the semantically right joint.
export function drawingInkAnchors(imageBase64, observation) {
  let png
  try {png=decodeCanvas(imageBase64)}catch{return []}
  const positions=[['top',.5,0],['top_right',1,0],['right',1,.5],['bottom_right',1,1],['bottom',.5,1],['bottom_left',0,1],['left',0,.5],['top_left',0,0]]
  const result=[]
  for(const [index,subject] of observation.subjects.entries()) {
    const b=subject.bounds
    if(!b||subject.confidence<.65)continue
    const candidates=[]
    for(let y=Math.floor(b.y*png.height);y<Math.min(png.height,Math.ceil((b.y+b.height)*png.height));y++) {
      for(let x=Math.floor(b.x*png.width);x<Math.min(png.width,Math.ceil((b.x+b.width)*png.width));x++) {
        const offset=(y*png.width+x)*4
        if(png.data[offset+3]>128&&Math.min(png.data[offset],png.data[offset+1],png.data[offset+2])<180)candidates.push({x:(x+.5)/png.width,y:(y+.5)/png.height})
      }
    }
    for(const [side,u,v] of positions) {
      const desired={x:b.x+b.width*u,y:b.y+b.height*v}
      let best,score=Infinity
      for(const p of candidates){
        const d=((p.x-desired.x)*png.width)**2+((p.y-desired.y)*png.height)**2
        if(d<score){score=d;best=p}
      }
      // A distant unrelated mark must not be presented as this edge.
      if(best&&Math.sqrt(score)<=Math.hypot(b.width*png.width,b.height*png.height)*.3)
        result.push({id:`S${index+1}_${side}`,subject:subject.subject??subject.id,side,x:best.x,y:best.y})
    }
  }
  return result
}

export function resolveInkAnchor(raw, anchors) {
  const id=raw?.proposal?.attachmentId
  if(id===undefined)return raw
  const match=typeof id==='string'?anchors.find(a=>a.id===id):null
  if(!match)return {...raw,proposal:undefined}
  const {attachmentId:_id,...proposal}=raw.proposal
  return {...raw,proposal:{...proposal,attachment:{x:match.x,y:match.y}}}
}
