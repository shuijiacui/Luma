// A bounded snapshot of the canvas collision decision, not a second image.
// Both runtimes use exactly the same threshold and bit order.
export function encodeOccupancy(cells) {
  if(!Array.isArray(cells)||cells.length!==256*256||cells.some(n=>!Number.isFinite(n)||n<0||n>1))return null
  const bytes=new Uint8Array(8192)
  for(let i=0;i<cells.length;i++)if(cells[i]>.025)bytes[i>>3]|=1<<(i&7)
  return {size:256,bits:btoa(String.fromCharCode(...bytes))}
}
export function decodeOccupancy(value) {
  if(value?.size!==256||typeof value.bits!=='string'||value.bits.length!==10924||!/^[A-Za-z0-9+/]+=$/.test(value.bits))return null
  let bytes;try{bytes=atob(value.bits)}catch{return null}
  if(bytes.length!==8192)return null
  return Array.from({length:65536},(_,i)=>(bytes.charCodeAt(i>>3)>>(i&7))&1)
}
export function pixelOccupancy({data,width,height},size=256) {
  const hits=new Uint32Array(size*size),totals=new Uint32Array(size*size)
  const step=Math.max(1,Math.floor(Math.min(width,height)/(size*6)))
  for(let y=0;y<height;y+=step)for(let x=0;x<width;x+=step){
    const cell=Math.floor(y/height*size)*size+Math.floor(x/width*size),i=(y*width+x)*4
    totals[cell]++;if(data[i+3]>8&&Math.min(data[i],data[i+1],data[i+2])<242)hits[cell]++
  }
  return Array.from(hits,(hit,i)=>hit/Math.max(1,totals[i]))
}
