import { addAnimalRecipes } from './animals.mjs'
import { addNatureRecipes } from './nature.mjs'
import { addPlaceRecipes } from './places.mjs'
import { addFoodRecipes } from './food.mjs'
import { addObjectRecipes } from './objects.mjs'
import { addFantasyRecipes } from './fantasy.mjs'
import { addRecipeExpansion } from './classics.mjs'
import { findRecipeSubjects } from './names.mjs'
import { addCuteRecipes } from './cute.mjs'
import { addPlaytimeRecipes } from './playtime.mjs'
import { addPeopleRecipes } from './studio/people.mjs'
import { addArchitectureRecipes } from './studio/architecture.mjs'
import { addNatureStudioRecipes } from './studio/nature.mjs'
import { addObjectStudioRecipes } from './studio/objects.mjs'
import { compareRecipeStyle, requestedRecipeStyle } from './styles.mjs'
import { isMaterialEnabled } from '../../../shared/niloCuration.mjs'
export { requestedRecipeStyle } from './styles.mjs'
// Original Luma vector recipes. These are drawing resources, not recognition evidence.
// Variants change silhouette/pose and structural parts; no random coordinate jitter.
const E=(x,y,rx,ry)=>[['E',x,y,rx,ry]];
const P=(...commands)=>commands;
const variants=[];
function add(subject,zh,variant,label,aspect,parts,related,options={}) {
  const paths=Object.values(parts).flat();
  let index=0;const ranges={};
  for(const [name,strokes] of Object.entries(parts)){ranges[name]=strokes.map(()=>index++);}
  variants.push({id:`${subject}-${variant}`,subject,name:zh,label,related,sketch:{aspect,paths},parts:ranges,source:'Luma original',minPixels:48,...options});
}
for(let v=0;v<3;v++) {
  add('squirrel','松鼠',v,['抱松果','翘尾坐姿','舒展尾巴'][v],1.1,{
    tail:[v===0?P(['M',.54,.8],['C',.98,.95,.99,.12,.73,.1],['C',.42,.05,.55,.5,.72,.49],['C',.85,.47,.85,.28,.76,.27]):v===1?P(['M',.52,.83],['C',.99,.83,.98,.02,.71,.09],['C',.44,.15,.56,.47,.7,.38]):P(['M',.52,.74],['C',.92,.76,.99,.39,.92,.13],['C',.77,.42,.68,.29,.59,.59])],
    body:[P(['M',.35,.41],['C',.63,.38,.7,.86,.47,.9],['Q',.19,.97,.24,.69])],
    head:[P(['M',.17,.42],['L',.2,.25],['Q',.13,.06,.26,.1],['Q',.35,.1,.32,.28],['Q',.57,.3,.49,.49],['Q',.4,.6,.15,.5],['L',.09,.43],['Z']),E(.36,.37,.018,.02)],
    paws:[P(['M',.27,.69],['Q',.35,.77,.44,.67]),P(['M',.33,.87],['L',.16,.92]),P(['M',.47,.88],['L',v===2?.7:.55,.95])],
    ...(v===0?{acorn:[E(.34,.63,.06,.07),P(['M',.28,.6],['L',.4,.6])]}:{}),
  },['plant','landscape','tree','forest']);
  add('bird','小鸟',v,['站立','飞翔','回头'][v],1.2,{
    body:[P(['M',.29,.45],['C',.07,.95,.75,.97,.77,.49],['L',.94,.39],['L',.7,.43],['Q',.59,.24,.45,.35])],
    head:[E(.32,.3,.16,.17),E(v===2?.26:.38,.27,.017,.02),P(['M',v===2?.16:.47,.3],['L',v===2?.05:.59,.35],['L',v===2?.18:.46,.39])],
    wing:[v===1?P(['M',.4,.52],['Q',.52,.04,.76,.09],['Q',.79,.38,.56,.62]):P(['M',.4,.51],['Q',.75,.48,.55,.75],['Q',.4,.69,.4,.51])],
    feet:v===1?[]:[P(['M',.38,.85],['L',.36,.97],['L',.26,.97]),P(['M',.55,.85],['L',.57,.97],['L',.67,.97])],
  },['plant','landscape','building','tree','sky']);
  add('boat','小船',v,['三角帆','双帆','小划艇'][v],1.2,{
    hull:[P(['M',.06,.69],['L',.94,.69],['L',.77,.93],['L',.22,.93],['Z'])],
    sail:v===2?[P(['M',.29,.54],['L',.73,.92]),P(['M',.66,.83],['L',.81,.98])]:[P(['M',.48,.7],['L',.48,.05],['L',.12,.61],['L',.48,.61]),...(v===1?[P(['M',.54,.13],['L',.86,.61],['L',.54,.61],['Z'])]:[])],
    details:[P(['M',.23,.8],['L',.76,.8])],
  },['landscape','vehicle','fish','water','sea']);
  add('kite','风筝',v,['菱形','燕子','三角'][v],.8,{
    body:[v===0?P(['M',.5,.04],['L',.85,.3],['L',.5,.64],['L',.15,.3],['Z']):v===1?P(['M',.5,.28],['L',.09,.09],['L',.25,.5],['L',.5,.62],['L',.75,.5],['L',.91,.09],['Z']):P(['M',.5,.04],['L',.91,.58],['L',.09,.58],['Z']),P(['M',.5,.08],['L',.5,.6])],
    string:[P(['M',.5,.64],['C',.75,.79,.25,.83,.53,.98])],
    bows:[P(['M',.55,.77],['L',.39,.72],['L',.42,.83],['Z'])],
  },['character','landscape','person','park']);
  add('bench','长椅',v,['木条椅','圆靠背','公园长椅'][v],1.5,{
    back:[v===1?P(['M',.15,.48],['C',.14,.02,.84,.02,.85,.48]):P(['M',.14,.46],['L',.14,.13],['L',.86,.13],['L',.86,.46]),P(['M',.18,.3],['L',.82,.3])],
    seat:[P(['M',.12,.48],['L',.88,.48],['L',.96,.65],['L',.04,.65],['Z'])],
    legs:[P(['M',.2,.65],['L',.17,.95]),P(['M',.8,.65],['L',.83,.95])],
    ...(v===2?{arms:[P(['M',.07,.55],['L',.07,.38],['L',.22,.38]),P(['M',.93,.55],['L',.93,.38],['L',.78,.38])]}:{}),
  },['plant','building','character','landscape','park']);
  add('butterfly','蝴蝶',v,['圆翅','尖翅','小花纹'][v],1,{
    body:[E(.5,.55,.045,.3)],
    wings:[v===1?P(['M',.45,.45],['L',.07,.06],['L',.12,.57],['L',.39,.78]):P(['M',.45,.45],['C',.02,.01,.01,.63,.38,.61],['C',.01,.65,.25,.99,.45,.72]),v===1?P(['M',.55,.45],['L',.93,.06],['L',.88,.57],['L',.61,.78]):P(['M',.55,.45],['C',.98,.01,.99,.63,.62,.61],['C',.99,.65,.75,.99,.55,.72])],
    antenna:[P(['M',.48,.28],['Q',.37,.09,.33,.17]),P(['M',.52,.28],['Q',.63,.09,.67,.17])],
    ...(v===2?{spots:[E(.24,.4,.06,.09),E(.76,.4,.06,.09)]}:{}),
  },['plant','landscape','flower','garden']);
}
addRecipeExpansion(add);
addAnimalRecipes(add);
addNatureRecipes(add);
addPlaceRecipes(add);
addFoodRecipes(add);
addObjectRecipes(add);
addFantasyRecipes(add);
addCuteRecipes(add);
addPeopleRecipes(add);
addArchitectureRecipes(add);
addNatureStudioRecipes(add);
addObjectStudioRecipes(add);
addPlaytimeRecipes(add);
const colors = {
 squirrel:['#a66532','#bc7540','#805a3e'], bird:['#328ab5','#ad7042','#7655a8'], boat:['#b56a34','#337ea5','#498667'],
 kite:['#d34f60','#7260b5','#dd8032'], bench:['#956337','#617c57'], butterfly:['#ac55a1','#d56c39','#4b8ebc'],
 cat:['#bd7d3d','#716985','#515e70'], rabbit:['#ab6986','#887086','#767a91'], fish:['#e07931','#378faf','#a35da3'],
 turtle:['#53804a','#3b8e80'], flower:['#ce557d','#c2842a','#9960b9'], mushroom:['#c25b46','#966d42','#9a608b'],
 tree:['#52874e','#3c7e70','#85983a'], house:['#af7453','#9a759d','#548798'], rocket:['#cf554c','#477eb7','#9170b3'],
 balloon:['#d95475','#8e66b2','#3e92b5'], umbrella:['#477cb8','#b860a1','#c88534'], robot:['#4d91a4','#7f72b2','#bf783f'],
};
const categoryColors={animal:['#a87349','#718899','#bd8460'],plant:['#53854e','#438b78','#a17f38'],landscape:['#4e96af','#b89738','#7c80ab'],vehicle:['#3c88b0','#b57243','#9670ad'],building:['#ad7750','#688e88','#917bab'],food:['#c45c54','#c39138','#65924f'],object:['#548d9b','#a97650','#996dad'],fantasy:['#9570b6','#488eac','#c0883b']};
Object.assign(colors,{sun:['#c99628','#da8930'],moon:['#a28b3d','#8072a9'],cloud:['#659bb2','#8e86ac'],rainbow:['#b36cad','#488ea9'],apple:['#c55a52','#729947'],strawberry:['#cc5c71','#b55353'],carrot:['#d88337','#ba743e'],banana:['#bd9632','#b88842'],whale:['#478bab','#687caa'],dolphin:['#598fa6','#7c82b2'],penguin:['#4b6377','#776880'],panda:['#4b635a','#767085']});
for (const recipe of variants) recipe.colors=colors[recipe.subject]??categoryColors[recipe.related.find(r=>categoryColors[r])]??['#568570','#9b7656'];
export const drawingRecipes=variants;
export const getDrawingRecipe=id=>variants.find(r=>r.id===id);
export const matchingRecipeSubjects=(text,exact=false)=>findRecipeSubjects(text,variants,exact);
export function recipeMatchesSubject(recipe,name) {
 return matchingRecipeSubjects(name).includes(recipe.subject);
}
export function recipeCatalogue(subjects=[],recent=[],preferred) {
  const words=subjects.flatMap(s=>[s.family,s.id,s.subject]).filter(Boolean).join(' ').toLowerCase();
  const named=matchingRecipeSubjects(words);
  preferred??=requestedRecipeStyle(words);
  const score=r=>Number(named.includes(r.subject))*5+r.related.filter(w=>words.includes(w)).length;
  return variants.filter(r=>isMaterialEnabled(r.id)).sort((a,b)=>score(b)-score(a)
    || compareRecipeStyle(a,b,preferred)
    || Number(recent.includes(a.id))-Number(recent.includes(b.id))
    || Number(b.style==='storybook')-Number(a.style==='storybook'))
    .map(({id,subject,name,label,related,colors,style,collection,poses,category})=>({id,subject,name,variant:label,related,colors,style,collection,poses,category}));
}

// Legacy IDs are explicit. The studio's fixed six suffixes keep all 960 choices
// available without repeating six full identifiers and style labels per subject.
export function creativeRecipeCatalogue(subjects=[],recent=[]){
 const families=new Map();
 for(const r of recipeCatalogue(subjects,recent)){
  if(!families.has(r.subject))families.set(r.subject,{name:r.name,subject:r.subject,related:r.related,colors:r.colors,collection:r.collection,poses:r.poses,variants:[]});
  families.get(r.subject).variants.push({id:r.id,pose:r.variant,style:r.style});
 }
 return {
  index:'STUDIO SIX: lines marked @6 expose EXACT recipe IDs SUBJECT-0 and SUBJECT-1 [cute], SUBJECT-2 and SUBJECT-3 [illustrated], SUBJECT-4 and SUBJECT-5 [realistic]. Even suffixes use the first pose; odd suffixes use the second pose. Replace SUBJECT with the English prefix before /. All six IDs exist. Other lines list ONLY eligible IDs explicitly.\n'+[...families.values()].map(r=>r.collection==='studio'&&r.variants.length===6?`${r.subject}/${r.name} @6 ${r.poses.join('/')}`:`${r.name}: ${r.variants.map(v=>`${v.id}=${v.pose}${v.style?` [${v.style==='storybook'?'cute':v.style}]`:''}`).join('; ')}`).join('\n'),
  relevant:[...families.values()].slice(0,12).map(({subject,related,colors})=>({subject,related,colors})),
 };
}
