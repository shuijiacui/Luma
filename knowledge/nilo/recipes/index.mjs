import curated from './curated-recipes.json' with { type: 'json' }
import legacy from './legacy-recipes.json' with { type: 'json' }
import { findRecipeSubjects } from './names.mjs'
import { compareRecipeStyle, requestedRecipeStyle } from './styles.mjs'
import { isMaterialEnabled, retiredMaterialIdentities } from '../../../shared/niloCuration.mjs'
export { requestedRecipeStyle } from './styles.mjs'
// Audited originals only. Deleted records have no geometry in this registry.
// Legacy records are kept for old documents; selection excludes their IDs.
const variants = [...curated, ...legacy]
const vocabulary = [...variants, ...retiredMaterialIdentities]
export const drawingRecipes=variants;
export const getDrawingRecipe=id=>variants.find(r=>r.id===id);
export const matchingRecipeSubjects=(text,exact=false)=>findRecipeSubjects(text,vocabulary,exact);
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
