import { PNG } from 'pngjs'
import { sampleProposalGeometry, proportionedProposal } from '../../../shared/niloGeometry.mjs'

// Images remain in request memory. Decode only bounded PNGs from our canvas.
export function decodeCanvas(imageBase64) {
  const bytes = Buffer.from(imageBase64, 'base64')
  if (bytes.length > 2 * 1024 * 1024 || bytes.length < 33
    || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a'
    || bytes.toString('ascii', 12, 16) !== 'IHDR') throw new Error('invalid_canvas_png')
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20)
  if (!width || !height || width > 1024 || height > 1024 || width * height > 1024 * 1024) throw new Error('canvas_too_large')
  return PNG.sync.read(bytes, { checkCRC: true })
}

// Correct small internal placement errors BEFORE visual review, never after.
// The bounded search keeps the chosen detail, size and supporting region; it
// cannot move a forehead detail across the face or invent another subject.
export function clearInternalPlacement(png, proposal, aspect, surfaceSize) {
  const p=proposal, a=p.anchor
  if(p.template!=='custom' || p.placement!=='inside' || p.attachment || !a) return p
  const stride=png.width+1, sums=new Uint32Array(stride*(png.height+1))
  for(let y=0;y<png.height;y++) {
    let row=0
    for(let x=0;x<png.width;x++) {
      const i=(y*png.width+x)*4
      row+=png.data[i+3]>128 && Math.min(png.data[i],png.data[i+1],png.data[i+2])<220 ? 1:0
      sums[(y+1)*stride+x+1]=sums[y*stride+x+1]+row
    }
  }
  const tip={round:1,pencil:.4,marker:1.8,crayon:1,star:2.5}[p.brushKind??'round']
  const radius=p.strokeWidth*tip/2*png.height/(surfaceSize?.height||png.height)
  // Retain a grid-cell margin, since the client also protects recorded ink
  // using its coarser occupancy grid. Pixel clearance alone is insufficient.
  const mx=radius+png.width/64, my=radius+png.height/64
  const clearPoint=(x,y)=>{
    const l=Math.max(0,Math.floor(x*png.width-mx)),r=Math.min(png.width,Math.ceil(x*png.width+mx))
    const t=Math.max(0,Math.floor(y*png.height-my)),b=Math.min(png.height,Math.ceil(y*png.height+my))
    return r>l && b>t && sums[b*stride+r]-sums[t*stride+r]-sums[b*stride+l]+sums[t*stride+l]===0
  }
  const clear=q=>sampleProposalGeometry(q,aspect).every(stroke=>stroke.points.every((b,i)=>{
    if(!i)return clearPoint(b.x,b.y)
    const start=stroke.points[i-1], steps=Math.max(1,Math.ceil(Math.hypot((b.x-start.x)*png.width,(b.y-start.y)*png.height)/2))
    for(let j=1;j<=steps;j++)if(!clearPoint(start.x+(b.x-start.x)*j/steps,start.y+(b.y-start.y)*j/steps))return false
    return true
  }))
  if(clear(p))return p
  const limit=Math.min(.03,Math.max(a.width*aspect,a.height)*.08)
  for(const distance of [limit/2,limit]) for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1],[.7,.7],[-.7,.7],[.7,-.7],[-.7,-.7]]) {
    const q={...p,x:p.x+dx*distance/aspect,y:p.y+dy*distance}
    if(q.x<a.x || q.y<a.y || q.x+q.width>a.x+a.width || q.y+q.height>a.y+a.height)continue
    if(clear(q))return q
  }
  return p // No safe nearby fit: preserve it for review and the client guard.
}

export function renderReviewCandidate(imageBase64, proposal, context) {
  const png = decodeCanvas(imageBase64)
  const aspect = context.canvasAspect || png.width / png.height
  if (Math.abs(png.width / png.height / aspect - 1) > .025) throw new Error('canvas_aspect_mismatch')
  let p = context.fixedGeometry ? proposal : proportionedProposal(proposal, aspect)
  if (p.attachment && !context.fixedGeometry) {
    // Refine small visual-coordinate error on the ORIGINAL pixels before
    // review, since the client must not move a reviewed connection afterward.
    const a=p.attachment, limit=Math.min(png.width,png.height)*.012
    let best=null, distance=Infinity
    for(let y=Math.max(0,Math.floor(a.y*png.height-limit));y<=Math.min(png.height-1,Math.ceil(a.y*png.height+limit));y++) {
      for(let x=Math.max(0,Math.floor(a.x*png.width-limit));x<=Math.min(png.width-1,Math.ceil(a.x*png.width+limit));x++) {
        const offset=(y*png.width+x)*4, px=(x+.5)/png.width, py=(y+.5)/png.height
        const d=Math.hypot(x+.5-a.x*png.width,y+.5-a.y*png.height)
        if (d<=limit && d<distance && png.data[offset+3]>128 && Math.min(...png.data.subarray(offset,offset+3))<220
          && px>=p.anchor.x && px<=p.anchor.x+p.anchor.width && py>=p.anchor.y && py<=p.anchor.y+p.anchor.height) {
          best={x:px,y:py};distance=d
        }
      }
    }
    if(best) p={...p,attachment:best}
    const [, u, v] = p.sketch.paths[0][0]
    p = { ...p, x:p.attachment.x-u*p.width, y:p.attachment.y-v*p.height }
  }
  if(!context.fixedGeometry)p=clearInternalPlacement(png,p,aspect,context.canvasSize)
  const strokes = sampleProposalGeometry(p, aspect)
  if (!strokes.length || strokes.length > 24) throw new Error('invalid_preview_geometry')
  const tipScale = { round:1, pencil:.4, marker:1.8, crayon:1, star:2.5 }[p.brushKind ?? 'round']
  const radius = Math.max(.6, p.strokeWidth * tipScale / 2 * png.height / (context.canvasSize?.height || png.height))
  const rgb = p.color.slice(1).match(/../g).map(hex=>parseInt(hex,16))
  for (const stroke of strokes) {
    for (let i=1; i<stroke.points.length; i++) {
      const a=stroke.points[i-1], b=stroke.points[i]
      if ([a,b].some(v=>!Number.isFinite(v.x)||!Number.isFinite(v.y)||v.x<0||v.x>1||v.y<0||v.y>1)) throw new Error('preview_outside_canvas')
      const ax=a.x*png.width, ay=a.y*png.height, bx=b.x*png.width, by=b.y*png.height
      const dx=bx-ax, dy=by-ay, length=dx*dx+dy*dy
      for (let y=Math.max(0,Math.floor(Math.min(ay,by)-radius-1));y<=Math.min(png.height-1,Math.ceil(Math.max(ay,by)+radius+1));y++) {
        for (let x=Math.max(0,Math.floor(Math.min(ax,bx)-radius-1));x<=Math.min(png.width-1,Math.ceil(Math.max(ax,bx)+radius+1));x++) {
          const t=length?Math.max(0,Math.min(1,((x+.5-ax)*dx+(y+.5-ay)*dy)/length)):0
          const alpha=Math.min(1,Math.max(0,radius+.5-Math.hypot(x+.5-ax-t*dx,y+.5-ay-t*dy)))
          if (!alpha) continue
          const offset=(y*png.width+x)*4
          for(let c=0;c<3;c++) png.data[offset+c]=Math.round(png.data[offset+c]*(1-alpha)+rgb[c]*alpha)
          png.data[offset+3]=255
        }
      }
    }
  }
  return { proposal:p, imageBase64:PNG.sync.write(png).toString('base64') }
}
