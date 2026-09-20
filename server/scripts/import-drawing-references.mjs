// Explicit, bounded import of public drawing DATA only. No downloaded code.
// Review the generated contact sheet before selecting anything for runtime.
import { mkdirSync, writeFileSync } from 'node:fs'
import { PNG } from 'pngjs'
const output=new URL('../../.tmp/drawing-references/',import.meta.url)
mkdirSync(output,{recursive:true})
const categories=['hat','crown','bowtie','eyeglasses','nose','ear']
const samples=[]
for (const category of categories) {
  const url=`https://storage.googleapis.com/quickdraw_dataset/full/simplified/${encodeURIComponent(category)}.ndjson`
  const res=await fetch(url,{headers:{Range:'bytes=0-131071'},signal:AbortSignal.timeout(20000)})
  if(!res.ok)throw Error(`Reference download failed: ${res.status}`)
  const reader=res.body.getReader(),chunks=[];let bytes=0
  try { while(bytes<131072){const {done,value}=await reader.read();if(done)break;chunks.push(Buffer.from(value).subarray(0,131072-bytes));bytes+=value.length} }
  finally {await reader.cancel()}
  const rows=Buffer.concat(chunks).toString('utf8').split('\n').slice(0,-1).map(line=>JSON.parse(line))
  for(const row of rows.filter(row=>row.recognized && row.drawing.length<=8 && row.drawing.every(s=>s[0].length>=2 && s[0].length<=48)).slice(0,4)) {
    samples.push({category,key:row.key_id,source:url,drawing:row.drawing})
  }
}
writeFileSync(new URL('candidates.json',output),JSON.stringify(samples,null,2))
const png=new PNG({width:800,height:categories.length*160});png.data.fill(255)
for(const [row,category] of categories.entries())for(const [col,sample] of samples.filter(s=>s.category===category).entries()) {
  for(const [xs,ys] of sample.drawing)for(let i=1;i<xs.length;i++){
    const steps=Math.max(1,Math.ceil(Math.hypot(xs[i]-xs[i-1],ys[i]-ys[i-1])))
    for(let j=0;j<=steps;j++){
      const x=Math.round(col*200+24+(xs[i-1]+(xs[i]-xs[i-1])*j/steps)*.52)
      const y=Math.round(row*160+12+(ys[i-1]+(ys[i]-ys[i-1])*j/steps)*.52)
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
        const k=((y+dy)*png.width+x+dx)*4;png.data[k]=32;png.data[k+1]=53;png.data[k+2]=47
      }
    }
  }
}
writeFileSync(new URL('contact-sheet.png',output),PNG.sync.write(png))
console.log(JSON.stringify({categories,counts:categories.map(category=>samples.filter(s=>s.category===category).length),output:output.pathname}))
