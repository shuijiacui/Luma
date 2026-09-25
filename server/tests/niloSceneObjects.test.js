import {expect,test,vi} from 'vitest'
import {PNG} from 'pngjs'
import {deletedMaterialIds,materialAvailability} from '../../shared/niloCuration.mjs'
import {drawingRecipes,recipeCatalogue,getDrawingRecipe,creativeRecipeCatalogue,matchingRecipeSubjects,requestedRecipeStyle} from '../../shared/niloRecipes.mjs'
import {validateSketch} from '../../shared/niloSketch.mjs'
import {validateDrawingDocument} from '../../shared/niloDocument.mjs'
import {compileDrawingPlan,drawingScene,fitDrawingPlan} from '../src/services/niloDrawingProtocol.js'
import {validateProposal,generateNiloDialogue} from '../src/services/niloDialogue.js'
const observed={subjects:[{subject:'tree',id:'tree',family:'plant',confidence:.9,evidence:'trunk and canopy',visible:'trunk and canopy',bounds:{x:.1,y:.1,width:.35,height:.7},existingParts:['trunk','canopy']}]}
const scene=drawingScene(observed)
const context={locale:'zh',takeTurn:true,requestDrawing:true,useDrawingKnowledge:true,drawingProtocol:2,turnScope:'scene',utterance:'轮到你了',canvasAspect:1.5,canvasSize:{width:900,height:600},history:[],drawingStyle:{color:'#203b34',brushSize:3,brushKind:'pencil'}}
const plan=id=>({intent:{kind:'object',subjectId:'S1',regionId:'S1R0',detail:getDrawingRecipe(id)?.name??'松鼠',relationship:'在树旁生活的小伙伴'},drawing:{recipeId:id,placement:{mode:'scene',at:[.73,.66],scale:.32}}})

test('audited records physically omit rejected IDs and expose only selectable IDs compactly',()=>{
  expect(drawingRecipes).toHaveLength(508)
  expect(deletedMaterialIds).toHaveLength(794)
  expect(drawingRecipes.filter(r=>materialAvailability(r.id)==='archived')).toHaveLength(178)
  const active=drawingRecipes.filter(r=>materialAvailability(r.id)==='active')
  expect(active).toHaveLength(330)
  for(const id of deletedMaterialIds)expect(getDrawingRecipe(id)).toBeUndefined()
  expect(new Set(drawingRecipes.map(r=>r.id)).size).toBe(drawingRecipes.length)
  expect(new Set(drawingRecipes.map(r=>JSON.stringify(r.sketch))).size).toBe(drawingRecipes.length)
  const catalogue=creativeRecipeCatalogue([{subject:'雏菊 daisy'}])
  const exposed=new Set([...catalogue.index.matchAll(/\b([a-z]+-\d+)=/g)].map(m=>m[1]))
  for(const m of catalogue.index.matchAll(/^([a-z]+)\/.* @6 /gm))for(let i=0;i<6;i++)exposed.add(m[1]+'-'+i)
  expect(exposed).toEqual(new Set(active.map(r=>r.id)))
  for(const r of drawingRecipes){
    expect(matchingRecipeSubjects(r.name)).toContain(r.subject)
    expect(matchingRecipeSubjects(r.subject)).toContain(r.subject)
    expect(Object.values(r.parts).flat().sort((a,b)=>a-b)).toEqual(r.sketch.paths.map((_,i)=>i))
  }
  expect(catalogue.relevant[0].subject).toBe('daisy')
  expect(JSON.stringify(catalogue).length).toBeLessThan(14000)
  expect(JSON.stringify(catalogue)).not.toContain('"paths"')
})

test('people and architecture are kept for historic documents and excluded from new vector choices',()=>{
  const list=recipeCatalogue()
  expect(list.some(r=>['people','architecture','building'].includes(r.category))).toBe(false)
  for(const subject of ['house','castle','tent','lighthouse','windmill','astronaut','teapotcottage'])expect(list.some(r=>r.subject===subject)).toBe(false)
  expect(getDrawingRecipe('school-2')).toBeTruthy()
  expect(getDrawingRecipe('shorthairedchild-2')).toBeTruthy()
})

test('explicit styles still prioritize approved choices without reviving rejected variants',()=>{
 expect(requestedRecipeStyle('不要可爱风，要写实风')).toBe('realistic')
 expect(requestedRecipeStyle('not cute, draw a detailed vase')).toBe('illustrated')
 expect(requestedRecipeStyle('不要写实风')).toBeUndefined()
 expect(recipeCatalogue([{subject:'写实风的雏菊'}],['daisy-4'])[0].id).toBe('daisy-5')
 expect(recipeCatalogue([{subject:'精美风的花瓶'}],['vase-2'])[0].id).toBe('vase-2')
 expect(recipeCatalogue([{subject:'可爱风的小熊猫'}])[0].id).toBe('redpanda-0')
})

test.each([
 ['把鲸鱼改成蓝色',['whale']],['让熊猫小一点',['panda']],['给纸杯蛋糕换个画法',['cupcake']],
 ['make cupcake smaller',['cupcake']],['把鲸鱼和鱼一起画上',['fish','whale']],
 ['move the unicorn left',['unicorn']],['换一种猫头鹰',['owl']],
 ['画小熊猫和熊猫',['redpanda','panda']],['画六角恐龙',['axolotl']],['draw a red panda',['redpanda']],
 ['移动小提琴手',['violinist']],['把小提琴和小提琴手缩小',['violin','violinist']],['draw a railway station',['railwaystation']],
])('voice names do not confuse nested subjects: %s',(text,expected)=>{
 expect(matchingRecipeSubjects(text).sort()).toEqual(expected.sort())
})
test.each(drawingRecipes)('recipe $id has finite executable paths and clear-space placement',r=>{
  expect(validateSketch(r.sketch)).toBeTruthy()
  const c=compileDrawingPlan(plan(r.id),scene,context,validateProposal)
  if(materialAvailability(r.id)==='archived'){expect(c).toMatchObject({ok:false,code:'recipe_unavailable'});return}
  expect(c.ok).toBe(true)
  expect(c.proposal.recipeId).toBe(r.id)
  expect(c.proposal.sketch).toEqual(r.sketch)
  expect(fitDrawingPlan(c.proposal,Array(65536).fill(0),1.5,context.canvasSize)).toBeTruthy()
  expect(fitDrawingPlan(c.proposal,Array(65536).fill(1),1.5,context.canvasSize)).toBeNull()
})
test('knowledge has structural variants; recent variants rank behind unused ones',()=>{
  const groups=Map.groupBy(drawingRecipes,r=>r.subject)
  for(const items of groups.values()){
    expect(items.length).toBeGreaterThanOrEqual(1)
    expect(new Set(items.map(r=>JSON.stringify(r.sketch))).size).toBe(items.length)
  }
  const list=recipeCatalogue([{subject:'兰花'}],['orchid-0'])
  expect(list.findIndex(r=>r.id==='orchid-1')).toBeLessThan(list.findIndex(r=>r.id==='orchid-0'))
})
test('cute preference follows subject relevance and gives unused variants priority',()=>{
  expect(recipeCatalogue([{subject:'cat'}])[0].id).toBe('cat-0')
  expect(recipeCatalogue([{subject:'cat'}],['cat-3'])[0].id).toBe('cat-0')
  expect(recipeCatalogue([{subject:'小熊猫'}])[0].subject).toBe('redpanda')
  expect(recipeCatalogue([{subject:'六角恐龙'}]).some(r=>r.subject==='axolotl')).toBe(false)
  expect(matchingRecipeSubjects('长着翅膀的水豚',true)).toEqual([])
  expect(matchingRecipeSubjects('red panda',true)).toEqual(['redpanda'])
})

test('ordinary subject permits independent objects while detached details still fail',()=>{
  expect(compileDrawingPlan(plan('squirrel-2'),scene,context,validateProposal).ok).toBe(true)
  expect(compileDrawingPlan({...plan('squirrel-2'),intent:{...plan().intent,kind:'detail'}},scene,context,validateProposal)).toMatchObject({ok:false,code:'recipe_requires_object'})
  expect(compileDrawingPlan(plan('not-a-recipe'),scene,context,validateProposal)).toMatchObject({ok:false,code:'recipe_reference'})
  expect(compileDrawingPlan({...plan('boat-0'),intent:{...plan('boat-0').intent,detail:'海草'}},scene,context,validateProposal)).toMatchObject({ok:false,code:'recipe_subject_mismatch'})
})
test('uncertain identity with confidently visible structure permits scene ideas, never anatomical edits',()=>{
  const s=drawingScene({subjects:[{...observed.subjects[0],confidence:.6,regions:[{name:'visible shape',bounds:observed.subjects[0].bounds,confidence:.9}]}]})
  expect(s.subjects[0].objectOnly).toBe(true)
  expect(compileDrawingPlan(plan('squirrel-3'),s,context,validateProposal).ok).toBe(true)
  expect(compileDrawingPlan({...plan('squirrel-3'),intent:{...plan().intent,kind:'detail'}},s,context,validateProposal).ok).toBe(false)
  expect(drawingScene({subjects:[{...observed.subjects[0],confidence:.6,regions:[]}]}).subjects).toHaveLength(0)
})
test('production pipeline retrieves a target recipe, reviews a full separate object and preserves the deadline/call count',async()=>{
  const png=new PNG({width:900,height:600});png.data.fill(255)
  const model=vi.fn().mockResolvedValueOnce(observed).mockResolvedValueOnce({version:2,plans:[plan('squirrel-3')]}).mockResolvedValueOnce({targetVisible:true,detailRelated:true,usesExistingDrawing:true,placementCorrect:true,alreadyPresent:false,confidence:.9,geometryConfidence:.9,relationConfidence:.9})
  const result=await generateNiloDialogue({imageBase64:PNG.sync.write(png).toString('base64'),context,chatWithImage:model})
  expect(result.status).toBe('ready');expect(result.proposal.recipeId).toBe('squirrel-3')
  expect(model).toHaveBeenCalledTimes(3)
  expect(model.mock.calls[1][1]).toContain('squirrel-3')
  expect(model.mock.calls[2][1]).toContain('NOT physical attachment')
  expect(model.mock.calls[2][2].reviewImage).toBeTruthy()
})
test('persistence accepts bounded replacement, rejects editing child or cleared groups',()=>{
  const stroke={type:'stroke',owner:'nilo',groupId:'bird',points:[{x:.1,y:.1},{x:.2,y:.2}],color:'#203b34',size:4,brushKind:'round',eraser:false,referenceWidth:900,referenceHeight:600}
  const edit={type:'edit',owner:'nilo',groupId:'edit1',targetId:'bird',replacement:[{...stroke,color:'#ff0000'}]}
  const doc={version:1,baseSource:'child',operations:[stroke,edit]}
  expect(validateDrawingDocument(doc)).toBe(true)
  expect(validateDrawingDocument({...doc,operations:[{...stroke,owner:'child'},edit]})).toBe(false)
  expect(validateDrawingDocument({...doc,operations:[stroke,{type:'clear',owner:'child',groupId:'clear'},edit]})).toBe(false)
  expect(validateDrawingDocument({...doc,operations:[stroke,{...edit,replacement:[{...stroke,owner:'child'}]}]})).toBe(false)
})
