import {expect,test} from 'vitest'
import {editableObjects,changePart,changeVariant,objectEditCommand,resolveObject} from '@/features/child/companion/objects'
import {visibleOperations,undoCanvasOwner,cloneCanvasDocument,type CanvasDocument,type CanvasStroke} from '@/features/child/canvasDocument'
import {proposalStrokes,type DrawingProposal} from '@/features/child/companion/proposals'
import {getDrawingRecipe,drawingRecipes} from '../../shared/niloRecipes.mjs'
import {isMaterialEnabled} from '../../shared/niloCuration.mjs'
import {validateDrawingDocument} from '../../shared/niloDocument.mjs'
import {compileSketch,type DrawingSketch} from '../../shared/niloSketch.mjs'
const proposal:DrawingProposal={template:'custom',subject:'松鼠',contribution:'object',recipeId:'squirrel-2',sketch:getDrawingRecipe('squirrel-2')!.sketch,
  x:.6,y:.4,width:.22,height:.3,rotation:0,color:'#203b34',strokeWidth:4,target:'树',relation:'树旁的小伙伴'}
const stroke:CanvasStroke={type:'stroke',owner:'nilo',groupId:'squirrel',points:[{x:.6,y:.4},{x:.7,y:.7}],color:'#203b34',size:4,brushKind:'round',eraser:false,referenceWidth:900,referenceHeight:600,object:{name:'松鼠',proposals:[proposal],aspect:1.5}}
const child:CanvasStroke={...stroke,owner:'child',groupId:'child',object:undefined,color:'#ff0000'}
const base:CanvasDocument={version:1,baseSource:'child',operations:[stroke,child]}
const sketchBounds=(sketch:DrawingSketch)=>{
 const points=compileSketch(sketch)!.flat(),xs=points.map(p=>p.x),ys=points.map(p=>p.y)
 return {width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys)}
}

const eligibleRecipes=drawingRecipes.filter(recipe=>isMaterialEnabled(recipe.id))
const firstPerSubject=eligibleRecipes.filter((recipe,index)=>eligibleRecipes.findIndex(other=>other.subject===recipe.subject)===index)

test.each(firstPerSubject)('voice can select $subject and cycle all available drawings before wrapping',recipe=>{
 const p={...proposal,subject:recipe.name,recipeId:recipe.id,sketch:recipe.sketch}
 const object={id:recipe.id,name:recipe.name,proposals:[p],aspect:1.5}
 expect(resolveObject(`把${recipe.name}缩小`,[object])).toEqual([object])
 expect(resolveObject(`make ${recipe.subject} smaller`,[object])).toEqual([object])
 const available=eligibleRecipes.filter(candidate=>candidate.subject===recipe.subject)
 if(available.length===1){expect(changeVariant(p,object.aspect)).toBeNull();return}
 const visited=new Set([recipe.id])
 const firstNext=changeVariant(p,object.aspect)
 let current=p
 for(let i=1;i<=available.length;i++){
  const next=changeVariant(current,object.aspect)
  expect(next).not.toBeNull()
  const selected=getDrawingRecipe(next!.recipeId!)!
  expect(selected.subject).toBe(recipe.subject)
  expect(next).toMatchObject({x:p.x,y:p.y,width:p.width,height:p.height,rotation:p.rotation,color:p.color,strokeWidth:p.strokeWidth,target:p.target,relation:p.relation})
  expect(next!.sketch!.paths.map(path=>path.map(command=>command[0]))).toEqual(selected.sketch.paths.map(path=>path.map(command=>command[0])))
  const actual=sketchBounds(next!.sketch!),natural=sketchBounds(selected.sketch)
  expect(actual.width*p.width*object.aspect/(actual.height*p.height)).toBeCloseTo(natural.width*selected.sketch.aspect/natural.height)
  expect(next!.sketch!.aspect).toBeCloseTo(p.width*object.aspect/p.height)
  if(i<available.length){
   expect(visited.has(selected.id)).toBe(false)
   visited.add(selected.id)
  }else expect(selected.id).toBe(recipe.id)
  current=next!
 }
 expect(visited).toEqual(new Set(available.map(candidate=>candidate.id)))
 expect(current.recipeId).toBe(p.recipeId)
 expect(changeVariant(current,object.aspect)).toEqual(firstNext)
})

test('naming an absent new subject never changes the previous Nilo object',()=>{
 const objects=editableObjects(base)
 expect(resolveObject('把独角兽缩小',objects)).toEqual([])
 expect(resolveObject('make whale smaller',objects)).toEqual([])
})
test('save/reopen edits retain object identity, child strokes and original layer order; undo restores replacement and deletion',()=>{
  const doc=cloneCanvasDocument(base),changed={...stroke,color:'#0000ff',object:{...stroke.object!,proposals:[{...proposal,color:'#0000ff'}]}}
  doc.operations.push({type:'edit',owner:'nilo',groupId:'edit1',targetId:'squirrel',replacement:[changed]})
  expect(validateDrawingDocument(doc)).toBe(true)
  const restored=JSON.parse(JSON.stringify(doc))
  expect(editableObjects(restored)[0].proposals[0].color).toBe('#0000ff')
  expect(visibleOperations(restored)).toEqual([changed,child])
  restored.operations.push({type:'edit',owner:'nilo',groupId:'delete1',targetId:'squirrel',replacement:[]})
  expect(editableObjects(restored)).toEqual([])
  undoCanvasOwner(restored,'nilo')
  expect(visibleOperations(restored)).toEqual([changed,child])
  undoCanvasOwner(restored,'nilo')
  expect(visibleOperations(restored)).toEqual([stroke,child])
})
test('clear hides old object identities and an edit cannot resurrect them',()=>{
  const doc=cloneCanvasDocument(base)
  doc.operations.push({type:'clear',owner:'child',groupId:'clear'})
  expect(editableObjects(doc)).toEqual([])
  doc.operations.push({type:'edit',owner:'nilo',groupId:'bad',targetId:'squirrel',replacement:[stroke]})
  expect(editableObjects(doc)).toEqual([]);expect(validateDrawingDocument(doc)).toBe(false)
})
test('changing a tail preserves all other paths in physical canvas coordinates',()=>{
  const changed=changePart(proposal,'tail',1.15)!
  expect(changed).toBeTruthy()
  const before=proposalStrokes(proposal,1.5),after=proposalStrokes(changed,1.5)
  expect(after[0].points).not.toEqual(before[0].points)
  for(let i=1;i<before.length;i++){
    expect(after[i].points).toHaveLength(before[i].points.length)
    before[i].points.forEach((p,j)=>{expect(after[i].points[j].x).toBeCloseTo(p.x,8);expect(after[i].points[j].y).toBeCloseTo(p.y,8)})
  }
  expect(changeVariant(proposal)?.sketch).not.toEqual(proposal.sketch)
})
test.each([['把松鼠改成蓝色',{color:'#459fd1'}],['尾巴再大一点',{part:'tail',factor:1.15}],['不要那只鸟了','delete'],['换一种松鼠','variant'],['恢复刚才的样子','undo'],['make it smaller','smaller'],['move the bird left','left'],['把松鼠移到树右边',null],['不要变小',null]])('voice parses %s without paid generation', (text,expected)=>{
  expect(objectEditCommand(text as string)).toEqual(expected)
})
test('ambiguous named objects are offered for selection, while explicit last targets the most recent',()=>{
  const first=editableObjects(base)[0],second={...first,id:'second'}
  expect(resolveObject('把松鼠改成蓝色',[first,second])).toHaveLength(2)
  expect(resolveObject('刚才那个小一点',[first,second])).toEqual([second])
})
