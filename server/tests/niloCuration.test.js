import {describe,it,expect,afterEach} from 'vitest'
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import request from 'supertest'
import {createMaterialCurationStore} from '../src/services/niloCurationStore.js'
import {filterApprovedMaterials,normalizeMaterialCuration,setMaterialCuration,materialDecision,materialAvailability,isMaterialEnabled,getRetiredMaterialIdentity} from '../../shared/niloCuration.mjs'
import {createReviewServer} from '../scripts/review-nilo-library.mjs'
import {compileDrawingPlan,drawingScene} from '../src/services/niloDrawingProtocol.js'
import {validateDialogue,validateProposal} from '../src/services/niloDialogue.js'
import {getDrawingRecipe} from '../../shared/niloRecipes.mjs'
import {sameDrawingSubject} from '../../shared/niloVariants.mjs'
import {drawingIllustrations} from '../../shared/niloIllustrations.mjs'

const directories=[]
afterEach(()=>{for(const path of directories.splice(0))rmSync(path,{recursive:true,force:true});setMaterialCuration({version:1,decisions:{}})})
function fixture(allowedIds=new Set(['orchid-0','illustration-school'])){const dir=mkdtempSync(join(tmpdir(),'nilo-curation-'));directories.push(dir);const path=join(dir,'curation.json');writeFileSync(path,'{"version":1,"decisions":{}}');return{path,store:createMaterialCurationStore({path,allowedIds})}}
describe('material curation',()=>{
 it('imports all registered illustration decisions and saves subsequent changes',async()=>{
  const medium=drawingIllustrations
  expect(medium.length).toBeGreaterThanOrEqual(34)
  const {store}=fixture(new Set(drawingIllustrations.map(r=>r.id)))
  const server=createReviewServer({store});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
  const url='http://127.0.0.1:'+server.address().port
  try{
   const init=await request(url).get('/api/curation').expect(200)
   const decisions=Object.fromEntries(medium.map(r=>[r.id,'keep']))
   await request(url).post('/api/curation').set('X-Nilo-Review-Token',init.body.token).send({version:1,decisions}).expect(200)
   expect(store.read().decisions).toEqual(decisions)
   await request(url).post('/api/curation/decision').set('X-Nilo-Review-Token',init.body.token).send({id:medium[0].id,decision:'reject'}).expect(200)
   expect(store.read().decisions[medium[0].id]).toBe('reject')
   expect(Object.keys(store.read().decisions)).toHaveLength(medium.length)
  }finally{await new Promise(resolve=>server.close(resolve))}
 })
 it('archives explicitly kept old people/buildings without relabeling keep, and retains deleted draft identity',()=>{
  setMaterialCuration({version:1,decisions:{'school-2':'keep'}})
  expect(materialDecision('school-2')).toBe('keep')
  expect(materialAvailability('school-2')).toBe('archived')
  expect(isMaterialEnabled('school-2')).toBe(false)
  expect(getDrawingRecipe('school-2')).toBeTruthy()
  expect(getDrawingRecipe('squirrel-0')).toBeUndefined()
  expect(getRetiredMaterialIdentity('squirrel-0')?.subject).toBe('squirrel')
  expect(sameDrawingSubject({template:'custom',recipeId:'squirrel-0',subject:'松鼠'},{template:'custom',recipeId:'squirrel-2',subject:'松鼠'})).toBe(true)
  expect(sameDrawingSubject({template:'custom',recipeId:'squirrel-0',subject:'小鱼'},{template:'custom',recipeId:'squirrel-2',subject:'松鼠'})).toBe(false)
 })
 it('blocks downlisted ids at model boundaries but preserves existing-guide restore and edits',()=>{
  const recipe=getDrawingRecipe('orchid-0')
  const proposal={template:'custom',recipeId:recipe.id,subject:recipe.name,sketch:recipe.sketch,x:.2,y:.2,width:.3,height:.2,rotation:0,color:'#476b5d',strokeWidth:3,target:'画布',relation:'在空白处画一所学校'}
  const context={locale:'zh',requestDrawing:true,utterance:'画一所学校',canvasAspect:1,history:[]}
  const scene=drawingScene({subjects:[{subject:'tree',family:'plant',confidence:.9,visible:'trunk and canopy',bounds:{x:.1,y:.1,width:.35,height:.7},existingParts:[]}]})
  setMaterialCuration({version:1,decisions:{'orchid-0':'reject','illustration-school':'reject'}})
  expect(compileDrawingPlan({intent:{kind:'object',subjectId:'S1',regionId:'S1R0',detail:'学校',relationship:'在树旁'},drawing:{recipeId:'orchid-0',placement:{mode:'scene',at:[.7,.7],scale:.3}}},scene,context,validateProposal)).toMatchObject({ok:false,code:'recipe_unavailable'})
  expect(validateProposal(proposal,context)).toBeTruthy()
  expect(validateDialogue({intent:'draw',reply:'这是一所学校。',proposal},context,true)).toBeNull()
  expect(validateDialogue({intent:'edit',reply:'把学校移到这里。',proposal:{...proposal,x:.3}},{...context,currentProposal:proposal,utterance:'向右移动'},true)?.proposal.x).toBe(.3)
  const illustration={template:'illustration',illustrationId:'illustration-school',subject:'学校',x:.1,y:.1,width:.5,height:.5,color:'#476b5d',strokeWidth:3,target:'画布',relation:'观察学校'}
  expect(validateProposal(illustration,context)).toBeTruthy()
  expect(validateDialogue({intent:'draw',reply:'看一看这所学校。',proposal:illustration},context,true)).toBeNull()
 })
 it('persists keep/reject, filters new choices, and restores without deleting originals',()=>{
  const {path,store}=fixture();const originals=[{id:'orchid-0'},{id:'illustration-school'}]
  store.set('orchid-0','reject');store.set('illustration-school','keep')
  expect(JSON.parse(readFileSync(path,'utf8')).decisions).toEqual({'orchid-0':'reject','illustration-school':'keep'})
  expect(filterApprovedMaterials(originals)).toEqual([{id:'illustration-school'}]);expect(originals).toHaveLength(2)
  const reopened=createMaterialCurationStore({path,allowedIds:new Set(originals.map(r=>r.id))})
  expect(reopened.read().decisions['orchid-0']).toBe('reject');reopened.set('orchid-0','pending')
  expect(filterApprovedMaterials(originals)).toHaveLength(2)
 })
 it('rejects unknown ids, invalid states and malformed imports without overwriting decisions',()=>{
  const {store}=fixture();store.set('orchid-0','reject')
  expect(()=>store.set('../secrets','keep')).toThrow();expect(()=>store.set('orchid-0','delete')).toThrow()
  expect(()=>store.save({version:1,decisions:{'unknown-0':'keep'}})).toThrow()
  expect(()=>normalizeMaterialCuration({version:1,decisions:[]})).toThrow()
  expect(store.read().decisions).toEqual({'orchid-0':'reject'})
 })
 it('serves and writes only with loopback host and session token',async()=>{
  const {store}=fixture();const server=createReviewServer({store,illustrations:[]});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url=`http://127.0.0.1:${server.address().port}`
  try{
   const init=await request(url).get('/api/curation').expect(200)
   await request(url).post('/api/curation/decision').send({id:'orchid-0',decision:'reject'}).expect(403)
   await request(url).post('/api/curation/decision').set('X-Nilo-Review-Token',init.body.token).set('Origin','https://other.example').send({id:'orchid-0',decision:'reject'}).expect(403)
   await request(url).get('/api/curation').set('Host','attacker.example').expect(403)
   await request(url).get('/assets/..%2f..%2fcuration.json').expect(404)
   const saved=await request(url).post('/api/curation/decision').set('X-Nilo-Review-Token',init.body.token).set('Origin',url).send({id:'orchid-0',decision:'reject'}).expect(200)
   expect(saved.body.manifest.decisions['orchid-0']).toBe('reject');expect(store.read().decisions['orchid-0']).toBe('reject')
   await request(url).post('/api/curation').set('X-Nilo-Review-Token',init.body.token).send({version:1,decisions:{'illustration-school':'keep'}}).expect(200)
   expect(store.read().decisions).toEqual({'orchid-0':'reject','illustration-school':'keep'})
  }finally{await new Promise(resolve=>server.close(resolve))}
 })
})
