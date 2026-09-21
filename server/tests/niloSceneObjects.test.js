import {expect,test,vi} from 'vitest'
import {PNG} from 'pngjs'
import {drawingRecipes,recipeCatalogue,getDrawingRecipe,creativeRecipeCatalogue,matchingRecipeSubjects} from '../../shared/niloRecipes.mjs'
import {validateSketch} from '../../shared/niloSketch.mjs'
import {validateDrawingDocument} from '../../shared/niloDocument.mjs'
import {compileDrawingPlan,drawingScene,fitDrawingPlan} from '../src/services/niloDrawingProtocol.js'
import {validateProposal,generateNiloDialogue} from '../src/services/niloDialogue.js'
const observed={subjects:[{subject:'tree',id:'tree',family:'plant',confidence:.9,evidence:'trunk and canopy',visible:'trunk and canopy',bounds:{x:.1,y:.1,width:.35,height:.7},existingParts:['trunk','canopy']}]}
const scene=drawingScene(observed)
const context={locale:'zh',takeTurn:true,requestDrawing:true,useDrawingKnowledge:true,drawingProtocol:2,turnScope:'scene',utterance:'轮到你了',canvasAspect:1.5,canvasSize:{width:900,height:600},history:[],drawingStyle:{color:'#203b34',brushSize:3,brushKind:'pencil'}}
const plan=id=>({intent:{kind:'object',subjectId:'S1',regionId:'S1R0',detail:getDrawingRecipe(id)?.name??'松鼠',relationship:'在树旁生活的小伙伴'},drawing:{recipeId:id,placement:{mode:'scene',at:[.73,.66],scale:.32}}})

test('270 distinct executable recipes expose all IDs without sending path data to the model',()=>{
  expect(drawingRecipes.length).toBeGreaterThanOrEqual(270)
  expect(new Set(drawingRecipes.map(r=>r.subject)).size).toBeGreaterThanOrEqual(90)
  expect(new Set(drawingRecipes.map(r=>r.id)).size).toBe(drawingRecipes.length)
  expect(new Set(drawingRecipes.map(r=>JSON.stringify(r.sketch))).size).toBe(drawingRecipes.length)
  const catalogue=creativeRecipeCatalogue([{subject:'独角兽 unicorn'}])
  for(const r of drawingRecipes){
    expect(catalogue.index).toContain(r.id+'=')
    expect(catalogue.index).toContain(r.label)
    expect(matchingRecipeSubjects(r.name)).toContain(r.subject)
    expect(matchingRecipeSubjects(r.subject)).toContain(r.subject)
    expect(Object.values(r.parts).flat().sort((a,b)=>a-b)).toEqual(r.sketch.paths.map((_,i)=>i))
  }
  expect(catalogue.relevant).toHaveLength(12)
  expect(catalogue.relevant[0].subject).toBe('unicorn')
  expect(JSON.stringify(catalogue).length).toBeLessThan(8000)
  expect(JSON.stringify(catalogue)).not.toContain('"paths"')
})

test.each([
 ['把鲸鱼改成蓝色',['whale']],['让熊猫小一点',['panda']],['给纸杯蛋糕换个画法',['cupcake']],
 ['make cupcake smaller',['cupcake']],['把鲸鱼和鱼一起画上',['fish','whale']],
 ['move the unicorn left',['unicorn']],['换一种猫头鹰',['owl']],
])('voice names do not confuse nested subjects: %s',(text,expected)=>{
 expect(matchingRecipeSubjects(text).sort()).toEqual(expected.sort())
})
test.each(drawingRecipes)('recipe $id has finite executable paths and clear-space placement',r=>{
  expect(validateSketch(r.sketch)).toBeTruthy()
  const c=compileDrawingPlan(plan(r.id),scene,context,validateProposal)
  expect(c.ok).toBe(true)
  expect(c.proposal.recipeId).toBe(r.id)
  expect(c.proposal.sketch).toEqual(r.sketch)
  expect(fitDrawingPlan(c.proposal,Array(65536).fill(0),1.5,context.canvasSize)).toBeTruthy()
  expect(fitDrawingPlan(c.proposal,Array(65536).fill(1),1.5,context.canvasSize)).toBeNull()
})
test('knowledge has structural variants; recent variants rank behind unused ones',()=>{
  const groups=Map.groupBy(drawingRecipes,r=>r.subject)
  for(const items of groups.values()){expect(items).toHaveLength(3);expect(new Set(items.map(r=>JSON.stringify(r.sketch))).size).toBe(3)}
  const list=recipeCatalogue(observed.subjects,['squirrel-0'])
  expect(list.findIndex(r=>r.id==='squirrel-1')).toBeLessThan(list.findIndex(r=>r.id==='squirrel-0'))
})
test('ordinary subject permits independent objects while detached details still fail',()=>{
  expect(compileDrawingPlan(plan('squirrel-0'),scene,context,validateProposal).ok).toBe(true)
  expect(compileDrawingPlan({...plan('squirrel-0'),intent:{...plan().intent,kind:'detail'}},scene,context,validateProposal)).toMatchObject({ok:false,code:'recipe_requires_object'})
  expect(compileDrawingPlan(plan('not-a-recipe'),scene,context,validateProposal)).toMatchObject({ok:false,code:'recipe_reference'})
  expect(compileDrawingPlan({...plan('boat-0'),intent:{...plan('boat-0').intent,detail:'海草'}},scene,context,validateProposal)).toMatchObject({ok:false,code:'recipe_subject_mismatch'})
})
test('uncertain identity with confidently visible structure permits scene ideas, never anatomical edits',()=>{
  const s=drawingScene({subjects:[{...observed.subjects[0],confidence:.6,regions:[{name:'visible shape',bounds:observed.subjects[0].bounds,confidence:.9}]}]})
  expect(s.subjects[0].objectOnly).toBe(true)
  expect(compileDrawingPlan(plan('squirrel-1'),s,context,validateProposal).ok).toBe(true)
  expect(compileDrawingPlan({...plan('squirrel-1'),intent:{...plan().intent,kind:'detail'}},s,context,validateProposal).ok).toBe(false)
  expect(drawingScene({subjects:[{...observed.subjects[0],confidence:.6,regions:[]}]}).subjects).toHaveLength(0)
})
test('production pipeline retrieves a target recipe, reviews a full separate object and preserves the deadline/call count',async()=>{
  const png=new PNG({width:900,height:600});png.data.fill(255)
  const model=vi.fn().mockResolvedValueOnce(observed).mockResolvedValueOnce({version:2,plans:[plan('squirrel-1')]}).mockResolvedValueOnce({targetVisible:true,detailRelated:true,usesExistingDrawing:true,placementCorrect:true,alreadyPresent:false,confidence:.9,geometryConfidence:.9,relationConfidence:.9})
  const result=await generateNiloDialogue({imageBase64:PNG.sync.write(png).toString('base64'),context,chatWithImage:model})
  expect(result.status).toBe('ready');expect(result.proposal.recipeId).toBe('squirrel-1')
  expect(model).toHaveBeenCalledTimes(3)
  expect(model.mock.calls[1][1]).toContain('squirrel-1')
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
