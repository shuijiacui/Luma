const roles = ['body','head','tail','face','wall','roof','stem','feature']
const bounds = b => b && typeof b==='object' && !Array.isArray(b)
  && Object.keys(b).every(k=>['x','y','width','height'].includes(k))
  && ['x','y','width','height'].every(k=>typeof b[k]==='number' && Number.isFinite(b[k]))
  && b.x>=0 && b.y>=0 && b.width>=.01 && b.height>=.01 && b.x+b.width<=1 && b.y+b.height<=1
const center = b => ({x:b.x+b.width/2,y:b.y+b.height/2})
const inside = (a,b,margin=.005) => a.x>=b.x-margin && a.y>=b.y-margin && a.x+a.width<=b.x+b.width+margin && a.y+a.height<=b.y+b.height+margin

export function readStructure(raw) {
  if (!raw || !['fish','house','face','plant','imaginary','other'].includes(raw.kind)
    || typeof raw.confidence!=='number' || raw.confidence<.75 || raw.confidence>1 || !Number.isFinite(raw.confidence)
    || !raw.regions || typeof raw.regions!=='object' || Array.isArray(raw.regions)) return null
  const entries=Object.entries(raw.regions)
  if (!entries.length || entries.length>6 || entries.some(([role,b])=>!roles.includes(role)||!bounds(b))) return null
  return {kind:raw.kind,confidence:raw.confidence,regions:Object.fromEntries(entries.map(([role,b])=>[role,{...b}]))}
}

function featureName(raw) {
  const p=raw?.proposal
  if (p?.template==='part') return p.part
  const text=p?.subject ?? p?.template ?? ''
  if (/眼|\beyes?\b/i.test(text)) return 'eye'
  if (/窗|\bwindow\b/i.test(text)) return 'window'
  if (/嘴|\b(?:mouth|smile)\b/i.test(text)) return 'smile'
  return null
}

// Correct only small in-region offsets before raster review. Never move a
// feature across an object or silently turn a tail-side eye into a head-side eye.
export function fitStructuralPart(raw, proposal) {
  const s=readStructure(raw?.structure), feature=featureName(raw)
  if (!s || !['eye','eyes','smile','window'].includes(feature) || proposal.attachment) return proposal
  const r=s.regions, region=s.kind==='fish'?r.head:s.kind==='house'?r.wall:s.kind==='face'?(r.face??r.head):r.feature
  if (!region) return proposal
  const scale=Math.min(1,region.width*.9/proposal.width,region.height*.9/proposal.height)
  const width=proposal.width*scale,height=proposal.height*scale,c=center(proposal)
  if (scale<.65 || width<.025 || height<.025) return proposal
  const x=Math.max(region.x+.001,Math.min(region.x+region.width-width-.001,c.x-width/2))
  const y=Math.max(region.y+.001,Math.min(region.y+region.height-height-.001,c.y-height/2))
  const limit=Math.min(.04,Math.max(proposal.anchor?.width??0,proposal.anchor?.height??0)*.15)
  if (Math.hypot(x+width/2-c.x,y+height/2-c.y)>limit) return proposal
  return {...proposal,x,y,width,height}
}

export function structureFailure(raw, proposal) {
  const feature=featureName(raw), structure=readStructure(raw?.structure)
  if (['eye','eyes','smile','window'].includes(feature) && !structure) return 'missing_structure'
  // Malformed optional anatomy must not veto an unrelated valid custom part.
  // Required facial/window regions remain mandatory above and below.
  if (!structure) return null
  const r=structure.regions
  let region=r.feature
  if (structure.kind==='fish' && ['eye','eyes','smile'].includes(feature)) {
    if (!r.body || !r.head || !r.tail) return 'invalid_structure'
    const hc=center(r.head)
    if (hc.x<r.body.x || hc.x>r.body.x+r.body.width || hc.y<r.body.y || hc.y>r.body.y+r.body.height) return 'invalid_structure'
    if (!inside(proposal,r.body)) return 'misplaced_detail'
    const head=center(r.head), tail=center(r.tail), part=center(proposal)
    const dx=head.x-tail.x,dy=head.y-tail.y
    if (Math.hypot(dx,dy)<Math.max(r.body.width,r.body.height)*.3
      || (part.x-(head.x+tail.x)/2)*dx+(part.y-(head.y+tail.y)/2)*dy<=0) return 'misplaced_detail'
    region=r.head
  } else if (structure.kind==='house' && feature==='window') {
    if (!r.wall || !r.roof) return 'invalid_structure'
    region=r.wall
  } else if (structure.kind==='face' && ['eye','eyes','smile'].includes(feature)) region=r.face ?? r.head
  if (['eye','eyes','smile','window'].includes(feature) && (!region || !inside(proposal,region))) return 'misplaced_detail'
  return null
}

export const structurePrompt = `Before choosing a location for eyes, a mouth or a window, return structure:{kind:"fish|house|face|plant|imaginary|other",confidence:0..1,regions:{role:{x,y,width,height}}}. All boxes use the ORIGINAL full-canvas coordinates and describe only visible existing structure. Allowed roles: body,head,tail,face,wall,roof,stem,feature; at most 6 regions. Fish facial features require body,head,tail; locate the head at the end OPPOSITE the visible tail and put the new feature wholly within head. A house window requires wall and roof, with the new window wholly inside wall. Facial features require face or head. For other or imaginary forms, supply feature: the visible region supporting the addition, respect the child's stated story. If required structure is unclear, choose a different grounded contribution instead of inventing boxes. This applies equally to part and custom renderers. Never infer anatomy from empty space. Include structure only when you can support it from visible ink.`
