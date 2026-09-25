import {createServer} from 'node:http'
import {randomBytes} from 'node:crypto'
import {readFileSync,existsSync} from 'node:fs'
import {resolve,sep,extname} from 'node:path'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {drawingRecipes} from '../../shared/niloRecipes.mjs'
import {deletedMaterialIds} from '../../shared/niloCuration.mjs'
import {createMaterialCurationStore} from '../src/services/niloCurationStore.js'

const publicRoot=resolve(fileURLToPath(new URL('../../frontend/public/',import.meta.url)))
const galleryPath=fileURLToPath(new URL('../../knowledge/nilo/previews/nilo-library.html',import.meta.url))
const illustrationUrl=new URL('../../knowledge/nilo/illustrations/index.mjs',import.meta.url)
const illustrationMaterials=existsSync(illustrationUrl)?(await import(illustrationUrl.href)).drawingIllustrations:[]

export function createReviewServer({store,htmlPath=galleryPath,illustrations=illustrationMaterials}={}) {
 const knownIds=new Set([...drawingRecipes.map(r=>r.id),...illustrations.map(r=>r.id),...deletedMaterialIds])
 store??=createMaterialCurationStore({allowedIds:knownIds})
 const token=randomBytes(24).toString('hex')
 const assets=new Map(illustrations.map(r=>{
  const source=r.src??r.imageSrc??''
  if(!source.startsWith('/'))throw Error('插画必须位于 frontend/public 中。')
  const path=resolve(publicRoot,source.slice(1))
  if(!path.startsWith(publicRoot+sep)||!['.png','.webp','.jpg','.jpeg'].includes(extname(path).toLowerCase()))throw Error('插画文件路径无效。')
  return [r.id,path]
 }))
 const server=createServer(async(req,res)=>{
  const port=server.address()?.port
  const expectedHost=`127.0.0.1:${port}`
  const json=(code,value)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value))}
  // Reject DNS rebinding/foreign browser pages. No wildcard bind, CORS, generic
  // static-file serving, or request-controlled filesystem paths.
  if(req.headers.host!==expectedHost)return json(403,{error:'仅允许本机审阅地址。'})
  const url=new URL(req.url,`http://${expectedHost}`)
  try{
   if(req.method==='GET'&&url.pathname==='/api/curation')return json(200,{manifest:store.read(),token})
   if(req.method==='POST'&&['/api/curation','/api/curation/decision'].includes(url.pathname)){
    if(req.headers['x-nilo-review-token']!==token||req.headers.origin&&req.headers.origin!==`http://${expectedHost}`)return json(403,{error:'审核保存令牌无效，请刷新本地图库。'})
    if(!String(req.headers['content-type']).startsWith('application/json'))return json(415,{error:'需要 JSON 审核记录。'})
    let text='',length=0
    for await(const chunk of req){length+=chunk.length;if(length>512000)return json(413,{error:'审核记录过大。'});text+=chunk}
    const body=JSON.parse(text)
    // Imports merge with the latest disk state, preserving decisions made from
    // another reviewer tab while this page was open.
    const manifest=url.pathname.endsWith('/decision')?store.set(body.id,body.decision):store.merge(body)
    return json(200,{manifest})
   }
   if(req.method==='GET'&&['/','/nilo-library.html'].includes(url.pathname)){
    const html=readFileSync(htmlPath)
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"})
    return res.end(html)
   }
   if(req.method==='GET'&&url.pathname.startsWith('/assets/')){
    const path=assets.get(decodeURIComponent(url.pathname.slice(8)))
    if(!path)return json(404,{error:'素材不存在。'})
    const data=readFileSync(path)
    const types={'.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.jpeg':'image/jpeg'}
    res.writeHead(200,{'Content-Type':types[extname(path).toLowerCase()],'X-Content-Type-Options':'nosniff'})
    return res.end(data)
   }
   return json(404,{error:'页面不存在。'})
  }catch(error){return json(error.code==='ENOENT'?404:400,{error:error.code==='ENOENT'?'预览或素材文件尚未生成。':error.message})}
 })
 return server
}

if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 // Rebuild the preview before serving so new materials and embedded fallback
 // decisions always match the current source catalogue.
 await import('./render-nilo-studio.mjs')
 const port=Number(process.env.NILO_REVIEW_PORT??4177)
 if(!Number.isInteger(port)||port<1024||port>65535)throw Error('NILO_REVIEW_PORT 必须在 1024–65535 之间。')
 const server=createReviewServer()
 server.on('error',error=>{console.error(error.code==='EADDRINUSE'?`端口 ${port} 已被占用。请打开现有审阅页，或设置 NILO_REVIEW_PORT。`:error.message);process.exitCode=1})
 server.listen(port,'127.0.0.1',()=>console.log(`Nilo 素材审阅室：http://127.0.0.1:${port}\n保留 / 下架会保存到 knowledge/nilo/curation.json；原素材始终保留。`))
}
