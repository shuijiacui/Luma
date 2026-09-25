// A standalone gallery. The optional loopback server saves reviews to the project.
import {writeFileSync,mkdirSync,readFileSync,existsSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {drawingRecipes} from '../../shared/niloRecipes.mjs'
import {sampleProposalGeometry} from '../../shared/niloGeometry.mjs'
import {readMaterialCuration} from '../src/services/niloCurationStore.js'
import {materialAvailability,deletedMaterialIds} from '../../shared/niloCuration.mjs'
import {materialCategories,materialCategory} from '../../shared/niloMaterialLibrary.mjs'
const categories=materialCategories
const review=readMaterialCuration()
const difficultyOrder={beginner:0,medium:1,detailed:2}
const featured=['readingchild-2','readingchild-4','gardener-2','gardener-4','school-2','school-4','bookshop-2','bookshop-5','braidedchild-2','longhairedchild-4','pavilion-2','archedbridge-4','flowerfairy-0','teapotcottage-1','patchworkdoll-0','moonboat-0','vase-2','orchid-4']
const moduleUrl=new URL('../../knowledge/nilo/illustrations/index.mjs',import.meta.url)
const illustrations=existsSync(moduleUrl)?(await import(moduleUrl.href)).drawingIllustrations:[]
const ordered=[...drawingRecipes].sort((a,b)=>(featured.indexOf(a.id)<0?9999:featured.indexOf(a.id))-(featured.indexOf(b.id)<0?9999:featured.indexOf(b.id)))
const vectorRows=ordered.map(r=>{
 const w=.87*Math.min(1,r.sketch.aspect),h=.87/Math.max(1,r.sketch.aspect)
 const p={template:'custom',sketch:r.sketch,x:(1-w)/2,y:(1-h)/2,width:w,height:h,rotation:0,color:r.colors[0],strokeWidth:1.6}
 const lines=sampleProposalGeometry(p,1).map(s=>s.points.map(pt=>[Number((pt.x*240).toFixed(2)),Number((pt.y*240).toFixed(2))]))
 return {id:r.id,availability:materialAvailability(r.id),kind:'vector',difficulty:'beginner',subject:r.subject,name:r.name,label:r.label,category:materialCategory(r),style:r.style??'simple',aliases:r.aliases??[],learning:r.learning,lines}
})
const imageRows=[...illustrations].sort((a,b)=>Number(review.decisions[a.id]!==undefined)-Number(review.decisions[b.id]!==undefined)||(difficultyOrder[a.difficulty]??2)-(difficultyOrder[b.difficulty]??2)).map(r=>({...r,category:materialCategory(r),difficulty:r.difficulty??(r.detail==='rich'?'detailed':'medium'),availability:materialAvailability(r.id),kind:'illustration',name:r.name??r.title,label:r.label??r.title??'',aliases:r.aliases??[],imageSrc:(r.imageSrc??r.src??'').replace(/^\//,'../../../frontend/public/')}))
const rows=[...imageRows,...vectorRows]
const activeRows=rows.filter(r=>r.availability==='active'),archivedRows=rows.filter(r=>r.availability==='archived')
const json=value=>JSON.stringify(value).replaceAll('<','\\u003c')
const behavior=readFileSync(new URL('./nilo-library-ui.js',import.meta.url),'utf8')
const css=readFileSync(new URL('./nilo-library-ui.css',import.meta.url),'utf8')
const html=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Nilo · 素材审阅室</title><style>${css}</style>
<header><h1>Nilo · 素材审阅室</h1><p>${activeRows.length} 份当前素材 · ${activeRows.filter(r=>r.kind==='vector').length} 份线条图案 · ${imageRows.length} 幅绘本插画</p><p class="note">已按审核从素材库删除 ${deletedMaterialIds.length} 份图案；${archivedRows.length} 份已保留的人物、建筑旧线稿仅供旧作品兼容，可在归档中查看。新插画优先展示；线稿统一归为初级。孩子不需要选择风格名称。</p></header>
<main><div id="save-state" class="save-state" role="status">正在读取审核记录…</div><div class="review-tools"><button id="export">导出审核记录</button><button id="import">导入审核记录</button><input id="import-file" type="file" accept="application/json,.json"><button id="apply-local" hidden>将本机暂存应用到项目</button><span class="note">下架后不再进入 Nilo 的新素材推荐；已有画作保留。</span></div>
<div class="tools"><label>素材范围<select id="availability"><option value="active">当前素材</option><option value="archived">已归档线稿</option><option value="">包括归档</option></select></label><label>搜索<input id="query" type="search" placeholder="学校、人物、花瓶、camera…"></label><label>表现形式<select id="kind"><option value="">所有素材</option><option value="illustration">绘本插画</option><option value="vector">线条图案</option></select></label><label>类型<select id="category"><option value="">全部类型</option>${Object.entries(categories).map(([id,name])=>'<option value="'+id+'">'+name+'</option>').join('')}</select></label><label>画风<select id="style"><option value="">全部画风</option><option value="storybook">可爱绘本</option><option value="illustrated">精美插画</option><option value="realistic">写实观察</option><option value="simple">原有简笔画</option></select></label><label>练习难度<select id="difficulty"><option value="">全部难度</option><option value="beginner">初级</option><option value="medium">中级</option><option value="detailed">细节丰富</option></select></label><label>审核状态<select id="decision"><option value="">全部状态</option><option value="pending">待审核</option><option value="keep">已保留</option><option value="reject">已下架</option><option value="available">可用素材</option></select></label><label class="check"><input id="tracing" type="checkbox">线条显示灰色虚线</label></div><p id="status" role="status"></p><section id="grid" class="grid" aria-label="素材预览"></section><nav class="pager" aria-label="图库分页"><button id="previous">上一页</button><span id="page"></span><button id="next">下一页</button></nav></main>
<dialog id="preview-dialog"><button id="close-preview" aria-label="关闭大图">关闭</button><h2 id="preview-title"></h2><div id="preview-content"></div></dialog>
<script>const recipes=${json(rows)};const embeddedCuration=${json(review)};const deletedIds=${json(deletedMaterialIds)};\n${behavior}</script></html>`
const output=new URL('../../knowledge/nilo/previews/nilo-library.html',import.meta.url)
mkdirSync(new URL('../../knowledge/nilo/previews/',import.meta.url),{recursive:true})
writeFileSync(output,html)
console.log(`Review gallery: ${rows.length} materials → ${fileURLToPath(output)}`)
