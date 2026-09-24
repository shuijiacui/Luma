// Rebuild the original recipe contact sheet from production stroke geometry. Run from server.
import {PNG} from 'pngjs';
import {mkdirSync,writeFileSync} from 'node:fs';
import {drawingRecipes} from '../../shared/niloRecipes.mjs';
import {renderReviewCandidate} from '../src/services/niloPreview.js';
import {sampleProposalGeometry} from '../../shared/niloGeometry.mjs';
const groups=[...new Set(drawingRecipes.map(r=>r.subject))];
const recipes=groups.flatMap(s=>drawingRecipes.filter(r=>r.subject===s));
const size=180,cell=200,cols=6,rows=Math.ceil(recipes.length/cols),perPage=54;
const sheets=Array.from({length:Math.ceil(recipes.length/perPage)},(_,page)=>{
 const sheet=new PNG({width:cols*cell,height:Math.ceil(Math.min(perPage,recipes.length-page*perPage)/cols)*cell});sheet.data.fill(248);
 for(let i=3;i<sheet.data.length;i+=4)sheet.data[i]=255;
 return sheet;
});
const svg=[`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="${rows*220}" viewBox="0 0 1200 ${rows*220}"><rect width="100%" height="100%" fill="#faf9f4"/>`];
for(const [index,r] of recipes.entries()){
 const blank=new PNG({width:size,height:size});blank.data.fill(255);
 const w=.83*Math.min(1,r.sketch.aspect),h=.83/Math.max(1,r.sketch.aspect);
 const p={template:'custom',sketch:r.sketch,x:(1-w)/2,y:(1-h)/2,width:w,height:h,color:r.colors[0],rotation:0,strokeWidth:2,brushKind:'round'};
 const after=renderReviewCandidate(PNG.sync.write(blank).toString('base64'),p,{canvasAspect:1,canvasSize:{width:size,height:size},fixedGeometry:true});
 const sheet=sheets[Math.floor(index/perPage)],local=index%perPage;
 const png=PNG.sync.read(Buffer.from(after.imageBase64,'base64')),x=local%cols*cell+10,y=Math.floor(local/cols)*cell+10;
 for(let row=0;row<size;row++)png.data.copy(sheet.data,((y+row)*sheet.width+x)*4,row*size*4,(row+1)*size*4);
 const paths=sampleProposalGeometry(p,1).map(s=>`<polyline fill="none" stroke="${p.color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" points="${s.points.map(pt=>`${pt.x*180},${pt.y*180}`).join(' ')}"/>`).join('');
 svg.push(`<g transform="translate(${index%cols*200+10},${Math.floor(index/cols)*220+5})"><rect width="180" height="180" rx="15" fill="white"/>${paths}<text x="90" y="199" font-family="sans-serif" font-size="12" text-anchor="middle" fill="#365449">${r.name} · ${r.label}</text><text x="90" y="214" font-family="sans-serif" font-size="10" text-anchor="middle" fill="#758478">${r.id}</text></g>`);
}
svg.push('</svg>');mkdirSync('.tmp',{recursive:true});
sheets.forEach((sheet,i)=>writeFileSync(`.tmp/nilo-recipes-expanded-${i+1}.png`,PNG.sync.write(sheet)));
mkdirSync('../knowledge/nilo/previews',{recursive:true});writeFileSync('../knowledge/nilo/previews/nilo-recipes.svg',svg.join('\n'));
console.log(`${recipes.length} recipes rendered`);
