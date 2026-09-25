import { visibleOperations, type CanvasDocument, type NiloObjectData } from '../canvasDocument'
import { validateProposal, type DrawingProposal } from './proposals'
import { getDrawingRecipe, matchingRecipeSubjects } from '../../../../../shared/niloRecipes.mjs'
import { nextDrawingVariant } from '../../../../../shared/niloVariants.mjs'

export interface EditableNiloObject extends NiloObjectData { id: string; legacy?: boolean }
export function editableObjects(document: CanvasDocument): EditableNiloObject[] {
  const groups = new Map<string, ReturnType<typeof visibleOperations>>()
  for (const op of visibleOperations(document)) if (op.owner === 'nilo' && op.type === 'stroke') groups.set(op.groupId, [...(groups.get(op.groupId) ?? []), op])
  return [...groups].flatMap(([id, ops], index) => {
    const strokes = ops.filter(op => op.type === 'stroke')
    const data = strokes.find(op => op.object)?.object
    if (data && Array.isArray(data.proposals) && data.proposals.length && data.proposals.every(validateProposal)) return [{ ...data, id }]
    // Legacy groups have no semantic identity. Show a numbered choice, never guess a name.
    if (!strokes.length || strokes.length > 24) return []
    const points = strokes.flatMap(op => op.points)
    let x=1,y=1,right=0,bottom=0
    for(const p of points){x=Math.min(x,p.x);y=Math.min(y,p.y);right=Math.max(right,p.x);bottom=Math.max(bottom,p.y)}
    const width=Math.max(.026,right-x),height=Math.max(.026,bottom-y),aspect=strokes[0].referenceWidth/strokes[0].referenceHeight
    const paths=strokes.map(op=>{
      const count=Math.min(Math.floor(96/strokes.length),op.points.length)
      return Array.from({length:count},(_,i)=>{const p=op.points[Math.round(i*(op.points.length-1)/Math.max(1,count-1))];return [i?'L':'M',(p.x-x)/width,(p.y-y)/height]})
    })
    const p=validateProposal({template:'custom',subject:`Nilo ${index+1}`,target:'canvas',relation:'Edit the selected existing Nilo group',contribution:'object',x,y,width,height,rotation:0,
      color:strokes[0].color,strokeWidth:4,brushKind:strokes[0].brushKind,sketch:{aspect:width*aspect/height,paths}})
    return p?[{id,name:`Nilo ${index+1}`,proposals:[p],aspect,legacy:true}]:[]
  })
}

export type ObjectEditCommand = 'smaller'|'larger'|'left'|'right'|'up'|'down'|'delete'|'variant'|'undo'|{color:string}|{part:string;factor:number}
export function objectEditCommand(text:string):ObjectEditCommand|null {
  const s=text.trim().toLowerCase().replace(/[。！!?.？]/g,'')
  if (/^(恢复刚才的样子|撤销(?:刚才的)?修改|undo(?: (?:that|edit))?)$/.test(s)) return 'undo'
  const part=/尾巴|tail/.test(s)?'tail':/翅膀|wing/.test(s)?'wing':/船帆|sail/.test(s)?'sail':null
  if(part&&/大|larger|bigger|小|smaller/.test(s))return {part,factor:/小|smaller/.test(s)?.85:1.15}
  if(/换.*(一种|个画法|姿势)|another (?:style|pose)|different (?:style|pose)/.test(s))return 'variant'
  if(/不要删|不要去掉|别删|don't (?:delete|remove)|do not (?:delete|remove)/.test(s))return null
  if(/删除|删掉|去掉|拿掉|不要那|不要这|^(delete|remove)\b/.test(s))return 'delete'
  if(/不要.*(小|大|移|改)|别|不想|不要换|\b(don't|do not)\b/.test(s))return null
  const colors:Record<string,string>={'红':'#d64b55','蓝':'#459fd1','绿':'#168777','黄':'#efba43','紫':'#9672bd','粉':'#dc89b1','橙':'#f18a36','黑':'#203b34',red:'#d64b55',blue:'#459fd1',green:'#168777',yellow:'#efba43',purple:'#9672bd',pink:'#dc89b1',orange:'#f18a36',black:'#203b34'}
  if(/改|换|变|change|make|color|colour/.test(s))for(const [name,color]of Object.entries(colors))if(s.includes(name))return {color}
  if(/小一点|缩小|smaller/.test(s))return 'smaller'
  if(/大一点|放大|bigger|larger/.test(s))return 'larger'
  // Relational requests ('right of the tree') need scene understanding, not a blind nudge.
  if(/(树|人|房|tree|house|person).*(左|右|上|下)|(?:left|right|above|below) (?:of )?(?:the )?\w+/.test(s))return null
  if(/往左|向左|左移|move.*left|^left$/.test(s))return 'left'
  if(/往右|向右|右移|move.*right|^right$/.test(s))return 'right'
  if(/往上|向上|上移|move.*up|^up$/.test(s))return 'up'
  if(/往下|向下|下移|move.*down|^down$/.test(s))return 'down'
  return null
}
export function resolveObject(text:string,objects:EditableNiloObject[],explicitOnly=false):EditableNiloObject[] {
  const s=text.toLowerCase()
  const named=matchingRecipeSubjects(s)
  const matches=objects.filter(o=>o.proposals.some(p=>{const r=getDrawingRecipe(p.recipeId??'');return r?named.includes(r.subject):s.includes(o.name.toLowerCase())}))
  if(matches.length)return matches
  if(named.length||explicitOnly)return []
  if(/刚才|上一个|最后|that|it|last|recent|小一点|大一点|往|向|smaller|larger|bigger/.test(s))return objects.slice(-1)
  return objects.length===1?objects:objects
}
export function changeVariant(p:DrawingProposal,aspect?:number):DrawingProposal|null {
  return validateProposal(nextDrawingVariant(p,aspect))
}
export function changePart(p:DrawingProposal,part:string,factor:number):DrawingProposal|null {
  const recipe=getDrawingRecipe(p.recipeId??''),indices=recipe?.parts[part]??recipe?.parts[`${part}s`]
  if(!indices||!p.sketch)return null
  // Keep the first join fixed. Grow the containing box instead of clipping a larger tail.
  const first=p.sketch.paths[indices[0]][0],cx=first[1],cy=first[2]
  if(cx===undefined||cy===undefined)return null
  const sketch=structuredClone(p.sketch)
  for(const index of indices)sketch.paths[index]=sketch.paths[index].map(command=>command[0]==='E'
    ? ['E',cx+(command[1]-cx)*factor,cy+(command[2]-cy)*factor,command[3]*factor,command[4]*factor]
    : command.map((v,i)=>i===0?v:typeof v==='number'?(i%2?cx+(v-cx)*factor:cy+(v-cy)*factor):v)) as typeof sketch.paths[number]
  let left=0,top=0,right=1,bottom=1
  for(const path of sketch.paths)for(const c of path){
    if(c[0]==='E'){left=Math.min(left,c[1]-c[3]);right=Math.max(right,c[1]+c[3]);top=Math.min(top,c[2]-c[4]);bottom=Math.max(bottom,c[2]+c[4])}
    else for(let i=1;i<c.length;i+=2){left=Math.min(left,c[i] as number);right=Math.max(right,c[i] as number);top=Math.min(top,c[i+1] as number);bottom=Math.max(bottom,c[i+1] as number)}
  }
  const width=right-left,height=bottom-top
  sketch.paths=sketch.paths.map(path=>path.map(c=>c[0]==='E'?['E',(c[1]-left)/width,(c[2]-top)/height,c[3]/width,c[4]/height]
    :c.map((v,i)=>i===0?v:typeof v==='number'?(i%2?(v-left)/width:(v-top)/height):v))) as typeof sketch.paths
  sketch.aspect*=width/height
  return validateProposal({...p,x:p.x+left*p.width,y:p.y+top*p.height,width:p.width*width,height:p.height*height,sketch})
}
