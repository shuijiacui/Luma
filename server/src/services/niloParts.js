// Reusable missing PARTS, not complete objects or a recognition fallback.
// The visual planner selects a meaningful part and location; every expanded
// path still goes through the normal visual review and canvas checks.
const parts = {
  // Original Luma component paths; the reference sheet teaches when to use them.
  hat: { names:['小帽子','little hat'],join:true,directions:['above'],aspect:1.8,paths:[[['M',.5,1],['L',.04,1],['L',.04,.82],['L',.22,.82],['L',.22,.1],['L',.78,.1],['L',.78,.82],['L',.96,.82],['L',.96,1],['L',.5,1]],[['M',.22,.67],['L',.78,.67]]] },
  crown: { names:['小皇冠','little crown'],join:true,directions:['above'],aspect:1.7,paths:[[['M',.5,1],['L',.05,1],['L',.05,.2],['L',.27,.58],['L',.5,.08],['L',.73,.58],['L',.95,.2],['L',.95,1],['L',.5,1]]] },
  fringe: { names:['弯弯的刘海','wavy fringe'],aspect:2.8,paths:[[['M',.04,.12],['Q',.18,.98,.32,.3],['Q',.47,1,.61,.27],['Q',.78,.96,.96,.14]]] },
  hair_bow: { names:['蝴蝶结发饰','hair bow'],aspect:2.3,paths:[[['M',.42,.4],['Q',.2,.05,.04,.08],['L',.04,.92],['Q',.24,.92,.42,.6]],[['E',.5,.5,.09,.2]],[['M',.58,.4],['Q',.8,.05,.96,.08],['L',.96,.92],['Q',.76,.92,.58,.6]]] },
  nose: { names:['小鼻子','little nose'],aspect:.6,paths:[[['M',.55,.1],['Q',.5,.5,.2,.8],['Q',.45,.99,.8,.8]]] },
  button: { names:['衣服纽扣','clothing button'],aspect:1,paths:[[['E',.5,.5,.38,.38]],[['M',.4,.4],['L',.6,.6]],[['M',.6,.4],['L',.4,.6]]] },
  balloon_string: { names:['气球绳','balloon string'], join:true, directions:['below'], aspect:.4, paths:[[['M',.5,0],['C',.9,.3,.1,.65,.5,1]]] },
  tail: { names:['弯尾巴','curved tail'], join:true, directions:['left','right'], aspect:1.4, paths:[[['M',0,.75],['C',.4,.8,.95,.5,.8,.15],['Q',.65,0,.55,.2]]] },
  fin: { names:['鱼鳍','fin'], join:true, directions:['above','below'], aspect:1.2, paths:[[['M',.1,0],['Q',.55,.6,.9,1],['Q',.3,.85,.1,0]]] },
  leg: { names:['一条腿','one leg'], join:true, directions:['below'], aspect:.5, paths:[[['M',.4,0],['L',.4,.85],['L',.9,.85]]] },
  eye: { names:['眼睛','eye'], aspect:1, paths:[[['E',.5,.5,.32,.32]]] },
  eyes: { names:['一双眼睛','eyes'], aspect:2.5, paths:[[['E',.23,.5,.1,.25]],[['E',.77,.5,.1,.25]]] },
  smile: { names:['弯弯的嘴','curved mouth'], aspect:2, paths:[[['M',.1,.25],['Q',.5,.95,.9,.25]]] },
  window: { names:['窗户','window'], aspect:1, paths:[[['M',.1,.1],['L',.9,.1],['L',.9,.9],['L',.1,.9],['Z']],[['M',.5,.1],['L',.5,.9]],[['M',.1,.5],['L',.9,.5]]] },
  hub: { names:['车轮轴心','wheel hub'], aspect:1, paths:[[['E',.5,.5,.35,.35]]] },
}

export function expandDrawingPart(proposal, locale = 'zh') {
  // Keep legacy cached plans readable, but never advertise the ambiguous name.
  const name = proposal?.part === 'string' ? 'balloon_string' : proposal?.part
  const part = typeof name === 'string' && Object.hasOwn(parts, name) ? parts[name] : null
  if (!part || proposal.template !== 'part' || proposal.sketch !== undefined || proposal.subject !== undefined) return null
  if (part.join ? !proposal.attachment || !part.directions.includes(proposal.placement) : proposal.attachment || proposal.placement !== 'inside') return null
  const position = proposal.position ?? {u:.5,v:.5}
  if (!position || typeof position !== 'object' || Array.isArray(position) || Object.keys(position).some(k=>!['u','v'].includes(k))
    || ![position.u,position.v].every(n=>typeof n==='number' && Number.isFinite(n) && n>=.1 && n<=.9)) return null
  const scale = proposal.scale ?? .35
  if (typeof scale !== 'number' || !Number.isFinite(scale) || scale < .12 || scale > .65) return null
  const flipX = proposal.placement === 'left', flipY = proposal.part === 'fin' && proposal.placement === 'above'
  const paths = part.paths.map(path=>path.map(([op,...coords])=>op==='E' ? [op,...coords]
    : [op,...coords.map((n,i)=>i%2 ? flipY?1-n:n : flipX?1-n:n)]))
  const {part: id,position: _position,scale: _scale,...rest}=proposal
  return { proposal:{...rest,template:'custom',subject:part.names[locale==='en'?1:0],sketch:{aspect:part.aspect,paths}},
    layout:{position,scale,id,joined:!!part.join} }
}

export function drawingPartsPrompt() {
  return `For these common missing parts prefer template="part" and part=${Object.keys(parts).join('|')}, omitting subject/sketch. The app draws their tested curves; this does NOT identify objects for you. Connected parts: balloon_string grows below a visible balloon outline ONLY; it is not a generic line or bark tool. For tree bark and unlisted details use custom paths; tail grows left/right from a visible body; fin grows above/below from a fish body; leg grows below from a visible body. These REQUIRE attachment on that visible structure. eye/eyes/smile/window/hub require placement="inside", NO attachment, and position:{u,v} in the EXISTING anchor (0.1..0.9), e.g. a fish eye is near its head, not always the body centre. Establish orientation from visible features before choosing position: on a fish, the head is opposite its visible tail, so the eye belongs near that opposite end, never beside the tail. When visible anatomy conflicts with a generic default, follow the visible anatomy. scale:0.12..0.65 controls the part's longest physical side relative to the target's longest side. Choose a readable size; do not always use the default. Keep target, relation, anchor, placement. Never add an existing feature again or substitute a part for a whole requested object. For other ideas, custom remains available. A meaningful contribution can be a missing facial feature, functional part, attached extension, or scene interaction; not just contour tracing.`
}
