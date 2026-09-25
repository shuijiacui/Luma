import { P, E, L, poly, R, moveParts } from '../primitives.mjs'
export { P, E, L, poly, R, moveParts }
export const styles = ['storybook', 'illustrated', 'realistic']
export const styleNames = ['可爱', '精美', '写实']
export const roundBox = (x,y,w,h,r=.04) => P(['M',x+r,y],['L',x+w-r,y],['Q',x+w,y,x+w,y+r],['L',x+w,y+h-r],['Q',x+w,y+h,x+w-r,y+h],['L',x+r,y+h],['Q',x,y+h,x,y+h-r],['L',x,y+r],['Q',x,y,x+r,y],['Z'])
export const arch = (x,y,w,h) => P(['M',x,y+h],['L',x,y+w*.5],['C',x,y-w*.18,x+w,y-w*.18,x+w,y+w*.5],['L',x+w,y+h])
export const leaf = (x,y,w,h) => P(['M',x,y+h],['C',x-w,y+h*.45,x-w*.7,y+h*.05,x,y],['C',x+w*.7,y+h*.05,x+w,y+h*.45,x,y+h],['Z'])
export const flower = (x,y,r,n=5) => P(...Array.from({length:n*2},(_,i)=>{const a=-Math.PI/2+i*Math.PI/n,d=i%2?r*.45:r;return [i?'L':'M',x+Math.cos(a)*d,y+Math.sin(a)*d]}),['Z'])
export const sprig = (x,y,w,h) => [P(['M',x,y+h],['Q',x+w*.1,y+h*.35,x,y]),leaf(x-w*.2,y+h*.22,w*.25,h*.24),leaf(x+w*.25,y+h*.48,w*.26,h*.22)]
// A continuous limb contour around a bent centreline; the rounded end is a hand/foot.
export function limb(a,b,c,r=.025){
 const normal=(u,v)=>{const d=Math.hypot(v[0]-u[0],v[1]-u[1]);return [-(v[1]-u[1])/d*r,(v[0]-u[0])/d*r]}
 const n=normal(a,b),m=normal(b,c)
 return P(['M',a[0]+n[0],a[1]+n[1]],['Q',b[0]+n[0],b[1]+n[1],c[0]+m[0],c[1]+m[1]],['Q',c[0]+(c[0]-b[0])*.16,c[1]+(c[1]-b[1])*.16,c[0]-m[0],c[1]-m[1]],['Q',b[0]-n[0],b[1]-n[1],a[0]-n[0],a[1]-n[1]])
}
export function registerStudio(add,definition,render){
 const {id,name,category,related=[],aliases=[],poses=['正面','侧面'],aspect=1}=definition
 for(let s=0;s<3;s++)for(let pose=0;pose<2;pose++){
  const drawing=render(definition,s,pose),fitted=fitParts(drawing.parts??drawing,drawing.aspect??aspect),ratio=fitted.aspect
  add(id,name,s*2+pose,`${styleNames[s]}·${poses[pose]}`,ratio,fitted.parts,
   [category,...related],{style:styles[s],category,collection:'studio',aliases,poses,
    // Preserve readability without making the legacy bounded protocol impossible.
    minPixels:Math.min([144,168,180][s],Math.floor(210*Math.min(ratio,1/ratio))),
    learning:s===0?'整体轮廓与大形':s===1?'层次、装饰与构图':'自然比例、体积与透视'})
 }
}

// Fit control points as well as visible outlines; never clip or drop a stroke.
function fitParts(parts,aspect){
 let left=0,top=0,right=1,bottom=1
 for(const path of Object.values(parts).flat())for(const c of path){
  if(c[0]==='E'){left=Math.min(left,c[1]-c[3]);right=Math.max(right,c[1]+c[3]);top=Math.min(top,c[2]-c[4]);bottom=Math.max(bottom,c[2]+c[4])}
  else for(let i=1;i<c.length;i+=2){left=Math.min(left,c[i]);right=Math.max(right,c[i]);top=Math.min(top,c[i+1]);bottom=Math.max(bottom,c[i+1])}
 }
 const w=right-left,h=bottom-top
 const mapped=moveParts(parts,.015-left*.97/w,.015-top*.97/h,.97/w,.97/h)
 // Stable decimal coordinates make archived recipes and SVG exports reproducible.
 for(const paths of Object.values(mapped))for(const path of paths)for(const c of path)for(let i=1;i<c.length;i++)c[i]=Number(c[i].toFixed(6))
 return {parts:mapped,aspect:Number((aspect*w/h).toFixed(6))}
}
