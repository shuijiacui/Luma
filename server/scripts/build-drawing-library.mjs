// Fetch DATA from the official public dataset, never third-party code.
// Review contact sheets, then explicitly record selected IDs before --build.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { PNG } from 'pngjs'
const candidateCount=Number(process.argv.find(arg=>arg.startsWith('--candidates='))?.split('=')[1]??3)
if(!Number.isInteger(candidateCount)||candidateCount<3||candidateCount>12)throw Error('Candidate count must be an integer from 3 to 12')
const root=new URL('../../knowledge/nilo/',import.meta.url)
const out=new URL('../../.tmp/drawing-knowledge/',import.meta.url)
mkdirSync(out,{recursive:true})
const cards=JSON.parse(readFileSync(new URL('lessons/drawing-knowledge.json',root))).cards
const categories=[...new Set(cards.flatMap(card=>card.categories))]
const candidatePath=new URL('candidates.json',out)
if(process.argv.includes('--build')) {
  const candidates=JSON.parse(readFileSync(candidatePath))
  const selections=JSON.parse(readFileSync(new URL('references/quickdraw/drawing-library-selection.json',root)))
  const records=selections.map(({category,keys})=>{
    if(!categories.includes(category)||!Array.isArray(keys)||!keys.length||keys.length>3)throw Error('Invalid selection')
    return keys.map(key=>{
      const sample=candidates.find(s=>s.category===category&&s.key===key)
      if(!sample)throw Error('Selected reference missing: '+key)
      return {...sample,credit:'Google Quick, Draw! contributors',license:'CC-BY-4.0',licenseUrl:'https://creativecommons.org/licenses/by/4.0/',modifications:'Simplified source strokes; runtime uniformly scales, recolours and lays out selected samples.'}
    })
  }).flat()
  writeFileSync(new URL('references/quickdraw/drawing-library.json',root),JSON.stringify({version:1,source:'https://github.com/googlecreativelab/quickdraw-dataset',review:'Manually inspected contact sheets; selected drawable, relevant line examples. Not child-only data.',records},null,2)+'\n')
  console.log(JSON.stringify({cards:cards.length,categories:selections.length,references:records.length}))
} else {
  const samples=[]
  for(let start=0;start<categories.length;start+=4) {
    const batch=await Promise.allSettled(categories.slice(start,start+4).map(async category=>{
      const source=`https://storage.googleapis.com/quickdraw_dataset/full/simplified/${encodeURIComponent(category)}.ndjson`
      const res=await fetch(source,{headers:{Range:'bytes=0-131071'},signal:AbortSignal.timeout(20000)})
      if(!res.ok)throw Error(category+': HTTP '+res.status)
      const reader=res.body.getReader(),chunks=[];let bytes=0
      try {while(bytes<131072){const {done,value}=await reader.read();if(done)break;chunks.push(Buffer.from(value).subarray(0,131072-bytes));bytes+=value.length}}
      finally {await reader.cancel()}
      const rows=Buffer.concat(chunks).toString('utf8').split('\n').slice(0,-1).map(line=>JSON.parse(line))
      return rows.filter(row=>row.recognized&&row.drawing.length>=2&&row.drawing.length<=12&&row.drawing.every(s=>s[0].length>=2&&s[0].length<=60)).slice(0,candidateCount)
        .map(row=>({category,key:String(row.key_id),source,drawing:row.drawing}))
    }))
    for(const result of batch){if(result.status==='rejected')throw result.reason;samples.push(...result.value)}
  }
  writeFileSync(candidatePath,JSON.stringify(samples,null,2))
  const groupSize=candidateCount>3?1:6,rowsPerCategory=Math.ceil(candidateCount/3)
  for(let offset=0;offset<categories.length;offset+=groupSize) {
    const group=categories.slice(offset,offset+groupSize),png=new PNG({width:600,height:group.length*rowsPerCategory*160});png.data.fill(255)
    for(const [row,category] of group.entries())for(const [col,sample] of samples.filter(s=>s.category===category).entries()) {
      for(const [xs,ys] of sample.drawing)for(let i=1;i<xs.length;i++){
        const steps=Math.max(1,Math.ceil(Math.hypot(xs[i]-xs[i-1],ys[i]-ys[i-1])))
        for(let j=0;j<=steps;j++){
          const x=Math.round(col%3*200+25+(xs[i-1]+(xs[i]-xs[i-1])*j/steps)*.5),y=Math.round((row*rowsPerCategory+Math.floor(col/3))*160+12+(ys[i-1]+(ys[i]-ys[i-1])*j/steps)*.5)
          for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const k=((y+dy)*png.width+x+dx)*4;png.data[k]=32;png.data[k+1]=53;png.data[k+2]=47}
        }
      }
    }
    const sheet=candidateCount>3?`review-${group[0].replaceAll(' ','-')}.png`:`review-${offset/groupSize+1}.png`
    writeFileSync(new URL(sheet,out),PNG.sync.write(png))
    console.log(JSON.stringify({sheet,rows:group,counts:group.map(c=>samples.filter(s=>s.category===c).length)}))
  }
}
