// Offline review of original synthetic relationship examples. No LLM calls.
import {mkdirSync,writeFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {PNG} from 'pngjs'
import {compileSketch} from '../../shared/niloSketch.mjs'
import {relationExampleLibrary,relationExampleGeometry} from '../src/services/niloRelationExamples.js'
import {renderReviewCandidate} from '../src/services/niloPreview.js'

export function renderRelationBefore(example,size=512){
  const png=new PNG({width:size,height:size});png.data.fill(255)
  for(const path of compileSketch(example.before))for(let i=1;i<path.length;i++){
    const a=path[i-1],b=path[i],steps=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)*size*2))
    for(let j=0;j<=steps;j++){
      const x=Math.round((a.x+(b.x-a.x)*j/steps)*size),y=Math.round((a.y+(b.y-a.y)*j/steps)*size)
      for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){
        if(dx*dx+dy*dy>4||x+dx<0||y+dy<0||x+dx>=size||y+dy>=size)continue
        const at=((y+dy)*size+x+dx)*4;png.data[at]=32;png.data[at+1]=53;png.data[at+2]=47
      }
    }
  }
  return {png,bytes:PNG.sync.write(png)}
}
export function renderRelationExamples(out=fileURLToPath(new URL('../.tmp/nilo-relation-examples/',import.meta.url))){
  const destination=resolve(out,new Date().toISOString().replace(/[:.]/g,'-'));mkdirSync(destination,{recursive:true})
  const library=relationExampleLibrary(),manifest=[]
  for(const example of library.examples){
    const before=renderRelationBefore(example),proposal=relationExampleGeometry(example)
    const after=renderReviewCandidate(before.bytes.toString('base64'),proposal,{canvasAspect:1,canvasSize:{width:512,height:512},fixedGeometry:true})
    writeFileSync(resolve(destination,`${example.id}-before.png`),before.bytes)
    writeFileSync(resolve(destination,`${example.id}-after.png`),Buffer.from(after.imageBase64,'base64'))
    manifest.push({id:example.id,title:example.title,relation:example.relation,
      before:`${example.id}-before.png`,after:`${example.id}-after.png`,wrongExamples:example.wrongExamples,
      meaning:'Green original ink; red proposed addition. Illustrative reference, not model output or validated child preference.'})
  }
  writeFileSync(resolve(destination,'catalogue.json'),JSON.stringify({version:library.version,status:library.status,source:library.source,examples:manifest},null,2))
  writeFileSync(resolve(destination,'README.md'),`# 原创添画关系参考原型\n\n当前仅离线资源，未接入生产提示词或默认绘图链路；不能据此声称有效共创率改善。深绿色是原画，红色是示例新增笔迹。\n\n${manifest.map(e=>`- ${e.title}（${e.relation}）：[原画](${e.before}) / [示例添画](${e.after})；错误反例：${e.wrongExamples[0].description}`).join('\n')}\n\n资源为原创合成矢量，没有下载或保存真实儿童画。`)
  return destination
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const out=process.argv.slice(2).find(a=>a.startsWith('--out='))?.slice(6)
  console.log(renderRelationExamples(out))
}
