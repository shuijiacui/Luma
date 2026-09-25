import {drawingRecipes} from '../../shared/niloRecipes.mjs'
import {validateSketch} from '../../shared/niloSketch.mjs'
import {materialAvailability,deletedMaterialIds,isMaterialEnabled} from '../../shared/niloCuration.mjs'
const invalid=[],duplicates=[],duplicateIds=[],seen=new Map(),ids=new Set(),categories={},styles={}
for(const r of drawingRecipes){
 const key=JSON.stringify(r.sketch),count=r.sketch.paths.reduce((n,p)=>n+p.length,0)
 if(ids.has(r.id))duplicateIds.push(r.id);ids.add(r.id)
 if(!validateSketch(r.sketch))invalid.push({id:r.id,paths:r.sketch.paths.length,commands:count,longest:Math.max(...r.sketch.paths.map(p=>p.length))})
 if(seen.has(key))duplicates.push([seen.get(key),r.id]);else seen.set(key,r.id)
 categories[r.category??'original']=(categories[r.category??'original']??0)+1
 styles[r.style??'simple']=(styles[r.style??'simple']??0)+1
}
console.log(JSON.stringify({recipes:drawingRecipes.length,selectable:drawingRecipes.filter(r=>isMaterialEnabled(r.id)).length,archived:drawingRecipes.filter(r=>materialAvailability(r.id)==='archived').length,deleted:deletedMaterialIds.length,subjects:new Set(drawingRecipes.map(r=>r.subject)).size,categories,styles,invalid,duplicates,duplicateIds},null,2))
if(invalid.length||duplicates.length||duplicateIds.length)process.exitCode=1
