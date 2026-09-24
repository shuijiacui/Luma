// Data-only drawing helpers for Luma's original editable line library.
export const P=(...commands)=>commands
export const E=(x,y,rx,ry)=>[['E',x,y,rx,ry]]
export const L=(...xy)=>xy.reduce((p,n,i)=>i%2?p:[...p,[i?'L':'M',n,xy[i+1]]],[])
export const R=(x,y,w,h)=>P(['M',x,y],['L',x+w,y],['L',x+w,y+h],['L',x,y+h],['Z'])
export const poly=(...xy)=>[...L(...xy),['Z']]
export const arc=(x,y,rx,ry,start,end,steps=8)=>L(...Array.from({length:steps+1},(_,i)=>{const a=start+(end-start)*i/steps;return [x+rx*Math.cos(a),y+ry*Math.sin(a)]}).flat())
export const movePaths=(paths,x,y,w,h)=>paths.map(path=>path.map(([op,...n])=>op==='E'?[op,x+n[0]*w,y+n[1]*h,n[2]*w,n[3]*h]:[op,...n.map((a,i)=>(i%2?y:x)+a*(i%2?h:w))]))
export const moveParts=(parts,x,y,w,h)=>Object.fromEntries(Object.entries(parts).map(([name,paths])=>[name,movePaths(paths,x,y,w,h)]))
export const eyes=(x=.35,y=.42,gap=.3)=>[E(x,y,.022,.028),E(x+gap,y,.022,.028)]
export const smile=(x=.5,y=.62)=>P(['M',x-.09,y],['Q',x,y+.1,x+.09,y])

// Pose changes affect body, limbs and framing, never only colour or reflection.
export function portraitPoses(face,variant,neck=false) {
  if(variant===2)return moveParts(face,.07,.07,.86,.86)
  const head=moveParts(face,.19,.035,.62,neck?.38:.48)
  const y=neck?.65:.5
  return {...head,
    neck:neck?[L(.43,.35,.41,.67),L(.57,.35,.59,.67)]:[L(.44,.44,.4,.5),L(.56,.44,.6,.5)],
    body:[variant===0?P(['M',.33,y],['Q',.19,.73,.28,.85],['L',.72,.85],['Q',.81,.73,.67,y]):P(['M',.35,y],['Q',.1,.91,.3,.94],['L',.7,.94],['Q',.9,.91,.65,y])],
    feet:variant===0?[poly(.28,.82,.39,.82,.39,.96,.24,.96),poly(.61,.82,.72,.82,.76,.96,.61,.96)]:[E(.29,.91,.12,.055),E(.71,.91,.12,.055)],
    paws:variant===0?[L(.31,y+.07,.21,.73),L(.69,y+.07,.79,.73)]:[P(['M',.36,.63],['Q',.34,.81,.46,.8]),P(['M',.64,.63],['Q',.66,.81,.54,.8])],
  }
}
