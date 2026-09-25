import {P,E,L,R,poly,moveParts} from './forms.mjs'

// Original building studies: a readable silhouette, shared structural edges,
// rhythm of openings and restrained detail. Coordinates are in a 100-unit page.
const arch=(x,y,w,h)=>P(['M',x,y+h],['L',x,y+w/2],['C',x,y-w*.16,x+w,y-w*.16,x+w,y+w/2],['L',x+w,y+h],['Z'])
const window=(x,y,w=9,h=13,arched=false)=>[arched?arch(x,y,w,h):R(x,y,w,h),L(x+w/2,y+(arched?w/2:0),x+w/2,y+h)]
const clock=(x,y,r=6)=>[E(x,y,r,r),L(x,y-r*.6,x,y,x+r*.5,y+r*.3)]
const shrub=(x,y,w=12)=>P(['M',x-w/2,y],['C',x-w,y-7,x-2,y-10,x,y-6],['C',x+7,y-13,x+w,y-4,x+w/2,y])
const pot=(x,y)=>poly(x-5,y,x+5,y,x+3,y+6,x-3,y+6)
const steps=(x1,x2,y)=>[L(x1,y,x2,y),L(x1-3,y+4,x2+3,y+4)]

function shop(d,s,v){
 const f=d.feature,p={}
 const upper=s===1?29:24
 p.outline=[L(16,upper,16,88,76,88,76,upper)]
 p.roof=s===1?[P(['M',11,upper],['Q',23,19,29,12],['L',67,12],['L',81,upper],['Z'])]:[poly(11,upper,25,11,69,11,81,upper),L(16,upper+3,76,upper+3)]
 p.upper=[...window(25,33,11,14,true),...window(55,33,11,14,true)]
 p.awning=[poly(13,53,77,53,81,62,10,62),P(['M',10,62],['Q',17,69,23,62],['Q',30,69,37,62],['Q',44,69,51,62],['Q',58,69,65,62],['Q',74,69,81,62])]
 p.stripes=[L(26,54,24,62),L(44,54,44,62),L(62,54,64,62)]
 p.door=[L(55,88,55,69,69,69,69,88),L(59,73,65,73,65,81,59,81,59,73)]
 p.display=[R(22,70,25,13)]
 if(f==='bread')p.goods=[P(['M',26,80],['C',23,73,43,71,43,80],['Z']),L(32,75,30,79),L(38,74,36,79)]
 if(f==='cup')p.goods=[P(['M',29,74],['L',38,74],['L',37,80],['Q',33,84,30,80],['Z']),P(['M',38,75],['C',47,72,45,83,38,79])]
 if(f==='books')p.goods=[L(27,81,27,73,31,73,31,81,35,81,35,72,39,72,39,81,43,80,40,73)]
 if(f==='plant')p.goods=[P(['M',35,82],['Q',25,74,29,72],['Q',35,72,35,77],['Q',37,68,42,71],['Q',46,76,35,80])]
 if(f==='fruit')p.goods=[E(30,78,3,3),E(38,78,3,3)]
 if(f==='plate')p.goods=[E(35,77,5,4),L(26,72,26,82),L(44,72,44,82)]
 p.threshold=[L(53,90,72,90)]
 if(v){p.side=[poly(76,upper,91,upper-8,91,79,76,88),L(81,38,86,35,86,48,81,51,81,38)];p.roofSide=[L(69,11,84,7,91,upper-8,81,upper)]}
 else if(s===1)p.planter=[pot(85,83),shrub(85,82,10)]
 else p.chimney=[L(57,11,57,5,65,5,65,11)]
 return {aspect:1.06,parts:p}
}

function home(d,s,v){
 const f=d.feature,p={}
 const barn=f==='barn',glass=f==='glass',tree=f==='tree',mill=f==='wheel'
 const l=tree?22:14,r=mill?68:76,peak=tree?51:42,roof=tree?31:40,bottom=tree?72:86
 p.walls=[L(l,roof,l,bottom,r,bottom,r,roof)]
 p.roof=barn?[poly(l-4,roof,l+7,23,peak,13,r-9,23,r+4,roof)]:[s===1?P(['M',l-5,roof+1],['Q',peak-9,24,peak,15],['Q',peak+8,25,r+5,roof+1],['L',r,roof+4],['L',peak,21],['L',l,roof+4],['Z']):poly(l-5,roof,peak,13,r+5,roof,r,roof+3,peak,19,l,roof+3)]
 p.door=[arch(45,60,14,bottom-60)]
 p.windows=[...window(23,53,13,15,s===1),E(peak,35,5,5)]
 if(f==='rows'){
  p.walls=[L(14,40,14,88,75,88,75,40)];p.roof=[poly(10,40,30,14,49,40),poly(47,40,64,21,81,40)];p.door=[arch(52,67,12,21)];p.windows=[...window(22,49,13,14,true),...window(54,48,13,13,true),arch(22,70,13,18)]
 }
 if(barn){p.door=[R(33,54,31,32),L(33,54,64,86,64,54,33,86),L(48.5,54,48.5,86)];p.windows=[E(peak,35,5,5)]}
 if(glass){p.roof=[poly(9,39,40,15,81,39),L(40,15,40,39)];p.windows=[];p.door=[R(45,57,15,29)];p.glass=[L(24,40,24,86),L(38,40,38,86),L(62,40,62,86),L(14,54,76,54),L(14,70,44,70),L(61,70,76,70)]}
 if(f==='logs')p.logs=[L(16,47,74,47),L(16,74,35,74),L(16,81,41,81),L(62,66,74,66),L(62,75,74,75)]
 if(f==='chimney'||f==='fence')p.chimney=[L(61,29,61,9,69,9,69,35),L(59,8,72,8)]
 if(f==='fence')p.fence=[L(78,77,96,77),L(78,82,96,82),L(81,72,81,90),L(93,72,93,90)]
 if(tree){
  p.tree=[P(['M',40,72],['Q',44,87,35,97],['L',58,97],['Q',50,86,56,72]),P(['M',22,40],['C',4,41,3,20,20,20],['C',13,2,42,-2,46,12]),P(['M',68,19],['C',92,1,109,32,82,40])]
  p.ladder=[L(65,73,66,97),L(74,73,75,97),L(66,82,74,82),L(66,90,75,90)]
 }else if(mill){p.windows=[...window(22,52,11,14,true)];p.wheel=[E(76,73,15,15),E(76,73,3,3),L(61,73,91,73),L(76,58,76,88),L(66,63,86,83)]}
 else if(v){p.side=[L(r,roof,r+15,roof-8,r+15,bottom-8,r,bottom),poly(r+4,54,r+11,50,r+11,64,r+4,68)];p.sideRoof=[L(peak,15,peak+15,7,r+20,roof-8,r+5,roof)]}
 else if(s===1&&!glass&&!barn)p.garden=[shrub(81,88),pot(9,85),P(['M',9,85],['Q',3,75,9,69],['Q',15,78,9,81])]
 if(f==='water'||mill)p.water=[P(['M',8,95],['Q',21,89,35,95],['Q',50,90,65,95],['Q',78,90,94,95])]
 else if(!tree)p.step=steps(42,63,88)
 return {aspect:tree?.94:1.2,parts:p}
}

function civic(d,s,v){
 const f=d.feature,side=v?12:0
 let p={}
 if(['bell','flower'].includes(f)){
  p.wings=[L(8,45,8,85,91,85,91,45),poly(4,45,15,31,36,31,36,45),poly(64,45,64,31,83,31,96,45)]
  p.hall=[L(36,36,36,85),L(64,36,64,85),poly(31,36,50,22,69,36),L(40,22,40,12,60,12,60,22),poly(36,12,50,2,64,12)]
  p.clock=clock(50,18,3.7);p.door=[arch(43,62,14,23)];p.windows=[...window(15,53,12,17,true),...window(74,53,12,17,true),...window(45,43,10,12,true)]
  if(f==='flower'){delete p.hall;delete p.clock;p.hall=[L(36,42,36,85),L(64,42,64,85),P(['M',31,42],['Q',50,2,69,42],['Z'])];p.windows[4]=E(50,48,6,6);p.windows.splice(5,1)}
 }else if(['columns','book','curtain'].includes(f)){
  p.roof=[poly(9,37,50,15,91,37),poly(22,33,50,21,78,33),R(10,38,80,5)]
  p.columns=[L(15,43,15,81,21,81,21,43),L(33,43,33,81,39,81,39,43),L(61,43,61,81,67,81,67,43),L(79,43,79,81,85,81,85,43)]
  p.entry=[arch(44,53,12,28)];p.base=steps(8,92,84)
  if(f==='book'){p.wings=[L(10,49,3,49,3,80,10,80),L(90,49,97,49,97,80,90,80)];p.crest=[P(['M',43,29],['Q',46,27,50,30],['Q',54,27,57,29])]}
  if(f==='curtain'){p.roof=[P(['M',9,37],['C',15,3,85,3,91,37],['Z']),R(10,38,80,5)];p.curtain=[P(['M',45,58],['Q',51,66,46,74]),P(['M',55,58],['Q',49,66,54,74])];p.columns.splice(1,2)}
 }else if(f==='garage'){
  p.outline=[L(12,20,12,85,89,85,89,43,40,43,40,20),R(9,16,34,5),R(40,38,52,5)]
  p.windows=[...window(22,28,9,15),...window(22,54,9,12)];p.garages=[arch(48,52,16,33),arch(70,52,13,33),L(49,65,63,65),L(71,65,82,65)];p.steps=steps(10,91,88)
 }else if(f==='station'){
  p.hall=[P(['M',28,79],['L',28,36],['C',29,3,72,3,73,36],['L',73,79]),arch(38,43,24,36)];p.clock=clock(50,26,7)
  p.wings=[L(28,39,9,39,9,80,28,80),L(73,39,92,39,92,80,73,80)];p.windows=[...window(14,47,9,15,true),...window(78,47,9,15,true)]
  p.canopy=[poly(5,67,27,67,27,73,2,73),poly(73,67,95,67,98,73,73,73)];p.base=steps(5,95,83)
 }else if(f==='terminal'){
  p.roof=[P(['M',5,51],['Q',50,20,95,51],['L',95,55],['L',5,55],['Z']),L(25,45,25,20,38,20,38,39),poly(22,20,22,13,41,13,41,20)]
  p.front=[R(9,55,82,26),L(9,68,91,68)];p.glass=[L(23,55,23,81),L(38,55,38,81),L(63,55,63,81),L(78,55,78,81)];p.door=[R(44,68,13,13)];p.base=steps(5,95,85)
 }else{
  p.front=[L(14,29,14,85,83,85,83,29),R(10,24,77,5)]
  p.windows=[...window(23,37,12,14),...window(62,37,12,14),...window(23,61,12,13),...window(62,61,12,13)]
  p.entry=[arch(43,61,13,24)];p.cornice=[L(14,55,83,55)]
  if(f==='cross')p.sign=[L(45,35,45,41,40,41,40,47,45,47,45,53,52,53,52,47,57,47,57,41,52,41,52,35,45,35)]
  else if(f==='shield')p.sign=[P(['M',43,38],['L',55,38],['L',54,48],['L',49,52],['L',44,48],['Z'])]
  else p.sign=[R(42,40,15,9),L(42,40,49,46,57,40)]
  if(f==='envelope')p.roof=[poly(11,23,23,12,74,12,86,23)]
  p.base=steps(11,86,88)
 }
 // Architectural variants change the elevation, not just arbitrary extra marks.
 if(s===1)p.garden=[shrub(7,92,10),shrub(93,92,10)]
 if(v){p=projectCivic(p,side);return {aspect:1.38,parts:p}}
 return {aspect:1.2,parts:p}
}
function projectCivic(parts,depth){
 // Compress elevation, then use a coherent oblique view for the entire building.
 const mapped=Object.fromEntries(Object.entries(parts).map(([key,paths])=>[key,paths.map(path=>path.map(([op,...n])=>op==='E'?[op,8+n[0]*.82,n[1]-.045*n[0],n[2]*.82,n[3]]:[op,...n.map((a,i)=>i%2?a-.045*n[i-1]:8+a*.82)]))]))
 // A side edge is only added where its outline can share the actual wall.
 mapped.ground=[L(7,94,85,90,85+depth,84)]
 return mapped
}

function tower(d,s,v){
 const f=d.feature,p={}
 if(f==='tank'){
  p.tank=[E(50,22,26,8),P(['M',24,22],['L',24,49],['C',26,61,74,61,76,49],['L',76,22]),P(['M',24,46],['C',28,57,73,57,76,46])];p.roof=[P(['M',22,20],['Q',50,2,78,20])]
  p.support=[L(30,56,23,94,31,94,36,59),L(65,59,70,94,78,94,70,57),L(31,68,72,87),L(69,68,28,87)]
  if(v)p.ladder=[L(49,58,49,94),L(55,58,55,94),L(49,70,55,70),L(49,80,55,80)]
 }else if(f==='clock'){
  p.outline=[L(31,39,31,88,69,88,69,39),R(27,34,46,5),poly(23,34,50,8,77,34),L(50,8,50,2)];p.clock=clock(50,48,10);p.windows=[...window(36,65,9,16,true),...window(56,65,9,16,true)];p.base=steps(26,74,90)
  if(v)p.side=[L(69,39,82,32,82,81,69,88),L(50,8,63,3,90,29,77,34)]
 }else if(f==='spire'){
  p.outline=[L(19,93,19,37,31,37,31,20,43,20,43,13,57,13,57,20,69,20,69,37,81,37,81,93,19,93),L(50,13,50,2)]
  p.glass=[L(27,46,27,84),L(39,29,39,84),L(50,26,50,87),L(61,29,61,84),L(73,46,73,84),L(20,51,80,51),L(20,65,80,65),L(20,79,80,79)]
  if(v)p.side=[L(81,37,91,32,91,87,81,93)]
  else if(s===1)p.entrance=[arch(43,84,14,9)]
 }else{
  p.outline=[L(18,23,18,91,75,91,75,23),poly(13,23,24,9,72,9,81,23),L(18,27,75,27)];p.windows=[]
  for(const y of [34,54])for(const x of [26,53])p.windows.push(...window(x,y,13,15,s===1))
  p.balconies=[L(23,47,23,51,43,51,43,47),L(50,47,50,51,70,51,70,47),L(23,67,23,71,43,71,43,67),L(50,67,50,71,70,71,70,67)]
  p.door=[arch(40,77,13,14)]
  if(v)p.side=[L(75,27,91,18,91,82,75,91),poly(80,37,86,34,86,47,80,50)]
 }
 return {aspect:.77,parts:p}
}

function structure(d,s,v){
 const f=d.feature,p={}
 if(d.kind==='bridge'){
  if(f==='arch'){
   p.top=[P(['M',5,56],['C',30,34,70,34,95,56]),P(['M',5,62],['C',30,41,70,41,95,62])]
   p.base=[L(5,62,5,81,20,81),P(['M',20,81],['C',23,47,77,47,80,81]),L(80,81,95,81,95,62)]
   p.rail=[P(['M',5,48],['C',30,26,70,26,95,48]),L(13,43,13,50),L(28,35,28,42),L(44,32,44,38),L(59,32,59,39),L(76,36,76,43),L(90,45,90,52)]
   p.stones=[L(31,61,27,54),L(44,56,43,49),L(57,56,58,49),L(70,61,74,54)]
  }else{
   p.towers=[L(26,84,26,19,31,19,31,84),L(68,84,68,19,73,19,73,84)];p.deck=[L(3,67,97,67),L(3,72,97,72)]
   p.cable=[P(['M',3,63],['Q',18,55,28,22],['Q',49,69,70,22],['Q',86,58,97,63])]
   p.hangers=[L(39,40,39,66),L(50,46,50,66),L(61,40,61,66),L(16,48,16,66),L(85,50,85,66)]
  }
  p.water=[P(['M',6,92],['Q',17,86,28,92],['Q',40,86,52,92]),P(['M',67,92],['Q',80,86,95,92])]
  if(v)p.bank=[L(2,82,15,85),L(83,85,98,82)]
 }else if(d.kind==='pagoda'||d.kind==='pavilion'||d.kind==='gate'){
  const pagoda=d.kind==='pagoda',gate=d.kind==='gate',garden=f==='garden'
  const tiers=pagoda?(v?4:3):1
  p.roofs=[];p.posts=[];p.openings=[]
  for(let i=0;i<tiers;i++){
   const y=pagoda?19+i*20:36,w=pagoda?15+i*7:38,x=50
   p.roofs.push(garden?poly(x-w,y+9,x,y-10,x+w,y+9,x+w-4,y+14,x-w+4,y+14):P(['M',x-w-4,y+6],['Q',x-w+7,y+7,x,y-9],['Q',x+w-7,y+7,x+w+4,y+6],['Q',x+w+1,y+13,x+w-3,y+13],['L',x-w+3,y+13],['Q',x-w-1,y+13,x-w-4,y+6],['Z']))
   if(pagoda&&i>0){p.roofs.pop();p.roofs.push(P(['M',x-w-4,y+6],['Q',x-w+3,y+7,x-w+14,y+1]),P(['M',x+w-14,y+1],['Q',x+w-3,y+7,x+w+4,y+6],['Q',x+w+1,y+13,x+w-3,y+13],['L',x-w+3,y+13],['Q',x-w-1,y+13,x-w-4,y+6]))}
   p.posts.push(L(x-w+7,y+13,x-w+7,pagoda?y+21:83),L(x+w-7,y+13,x+w-7,pagoda?y+21:83))
   if(pagoda)p.openings.push(arch(47,y+14,6,7))
   else if(gate)p.openings.push(arch(34,52,32,31))
   else p.openings.push(L(38,50,38,73,62,73,62,50),L(19,69,36,69),L(64,69,81,69))
  }
  p.base=steps(pagoda?18:10,pagoda?82:90,pagoda?86:85)
  p.finial=[L(50,pagoda?5:16,50,pagoda?10:27)]
  if(f==='battlement'){p.roofs=[L(7,47,7,29,18,29,18,35,32,35,32,29,43,29,43,35,57,35,57,29,68,29,68,35,82,35,82,29,93,29,93,47),L(7,47,93,47)];p.posts=[L(19,47,19,83),L(81,47,81,83)];delete p.finial}
  if(f==='temple'){p.openings=[R(31,50,38,33),arch(43,62,14,21)];p.tiles=[P(['M',50,27],['Q',34,40,20,44]),P(['M',50,27],['Q',66,40,80,44])]}
  if(v&&!pagoda)p.rear=[L(23,84,29,78),L(78,84,86,77),L(81,50,89,44,89,77,82,83)]
 }else if(d.kind==='dome'){
  if(f==='felt'){
   p.roof=[P(['M',9,43],['Q',31,25,50,15],['Q',69,25,91,43],['Z'])];p.walls=[P(['M',13,44],['L',13,83],['Q',50,94,87,83],['L',87,44])];p.door=[R(v?47:43,64,14,24)];p.trim=[P(['M',13,52],['Q',50,57,87,52]),L(50,15,29,42),L(50,15,71,42)]
  }else if(f==='ice'){
   p.dome=[P(['M',12,77],['C',2,8,98,8,89,77],['Q',72,86,59,83])];p.door=[P(['M',24,85],['L',24,70],['C',24,50,54,50,54,70],['L',54,85],['Z']),P(['M',31,85],['L',31,71],['Q',39,55,48,71],['L',48,85])];p.bricks=[P(['M',20,46],['Q',51,54,82,46]),L(47,31,47,50),L(67,50,70,72),P(['M',57,69],['Q',74,70,88,63])]
   if(v)p.snow=[P(['M',5,90],['Q',47,96,96,87])]
  }else{
   p.dome=[P(['M',17,54],['C',17,7,83,7,83,54],['Z']),P(['M',39,54],['C',37,25,43,19,50,19])];p.base=[R(17,55,66,29),L(14,87,86,87)];p.windows=[...window(24,62,11,14,true),...window(65,62,11,14,true)];p.door=[arch(v?46:44,64,12,20)]
   if(f==='telescope')p.scope=[poly(48,35,66,22,70,27,51,40),L(51,40,47,49)]
   else p.orbit=[E(64,32,6,6),P(['M',57,30],['C',47,29,66,48,72,33])]
  }
 }
 if(s===1&&!['bridge','pagoda'].includes(d.kind))p.plant=[shrub(7,92,10)]
 return {aspect:d.kind==='bridge'?1.5:d.kind==='pagoda'?.77:1.18,parts:p}
}

function landmark(d,s,v){
 const p={},f=d.feature
 if(f==='turbine'){
  p.tower=[L(46,45,42,94,55,94,51,45)];p.hub=[E(49,40,4,4)]
  p.blades=[P(['M',47,36],['Q',42,20,47,3],['L',51,3],['L',52,36]),P(['M',53,39],['Q',78,39,91,55],['L',88,58],['L',51,44]),P(['M',46,42],['Q',34,66,13,67],['L',12,63],['L',45,38])]
  p.base=steps(37,60,95)
  if(s===2)p.seam=[L(47,66,52,66)]
  if(v)p.land=[P(['M',5,95],['Q',17,83,36,91]),P(['M',61,92],['Q',77,85,96,93])]
 }else if(f==='wheel'){
  const cy=43,r=v?32:29
  p.rim=[E(50,cy,r,r),E(50,cy,r-3,r-3),E(50,cy,3,3)];p.spokes=[];p.cabins=[]
  for(let i=0;i<6;i++){const a=-Math.PI/2+i*Math.PI/3,x=50+Math.cos(a)*r,y=cy+Math.sin(a)*r;p.spokes.push(L(50,cy,x,y));p.cabins.push(P(['M',x-5,y],['Q',x,y-4,x+5,y],['L',x+4,y+8],['L',x-4,y+8],['Z']))}
  p.support=[L(48,47,33,91,39,91,50,54,62,91,68,91,52,47)];p.platform=steps(27,74,92)
  if(s===1)p.cap=[P(['M',40,6],['Q',50,1,60,6])]
 }else if(f==='carousel'){
  p.roof=[P(['M',7,35],['Q',29,33,50,10],['Q',71,33,93,35],['L',91,41],['L',9,41],['Z']),L(50,13,32,35),L(50,13,68,35)]
  p.valance=[P(['M',9,41],['Q',19,49,29,41],['Q',39,49,49,41],['Q',60,49,70,41],['Q',80,49,91,41])];p.base=[E(50,86,42,6),P(['M',8,86],['L',8,91],['Q',50,103,92,91],['L',92,86])];p.poles=[L(27,45,27,80),L(73,45,73,80)]
  p.horses=[]
  for(const x of [14,60])p.horses.push(P(['M',x,65],['Q',x+2,58,x+4,54],['L',x+10,57],['Q',x+13,58,x+12,61],['L',x+22,61],['Q',x+29,56,x+26,67],['L',x+23,75],['L',x+20,75],['L',x+20,68],['L',x+11,68],['L',x+8,76],['L',x+5,75],['L',x+7,66],['L',x,65]))
  p.flag=v?[poly(50,9,50,1,66,4)]:[E(50,7,2,3)]
  if(s===2)p.floor=[P(['M',16,88],['Q',50,95,84,88])]
 }else if(f==='fountain'){
  p.pool=[E(50,84,42,9),P(['M',8,84],['C',10,102,90,102,92,84])];p.stem=[P(['M',43,83],['Q',48,70,47,59],['L',53,59],['Q',52,70,57,83])]
  p.bowl=[P(['M',29,47],['Q',50,67,71,47],['Q',50,53,29,47],['Z']),P(['M',31,49],['Q',34,62,50,62],['Q',66,62,69,49])]
  p.water=[P(['M',49,47],['C',43,15,18,21,20,64]),P(['M',51,47],['C',58,14,83,23,80,64]),P(['M',50,45],['Q',42,7,38,20]),P(['M',50,45],['Q',58,7,62,20])]
  p.ripples=[P(['M',19,84],['Q',27,90,36,87]),P(['M',65,87],['Q',77,92,86,84])]
  if(v)p.drops=[E(20,71,1.5,3),E(80,71,1.5,3)]
  if(s===2)p.rim=[P(['M',19,93],['Q',50,104,81,93])]
 }else if(f==='well'){
  p.roof=[poly(11,32,47,9,89,32,84,36,47,15,16,36),L(47,9,56,5,98,28,89,32)]
  p.posts=[L(23,37,23,82),L(78,37,78,82)];p.axle=[L(23,48,82,48,82,55,88,55),E(51,48,6,3),L(51,51,51,76)]
  p.rim=[E(50,74,25,6),P(['M',25,74],['L',25,90],['Q',50,100,75,90],['L',75,74])]
  p.bricks=[P(['M',26,83],['Q',50,91,74,83]),L(38,80,38,86),L(60,87,60,94)]
  if(v)p.bucket=[P(['M',53,76],['L',55,84],['L',64,84],['L',66,76],['Z']),P(['M',54,76],['Q',59,65,65,76])]
  if(s===1)p.plant=[shrub(12,92,13)]
 }else if(f==='stadium'){
  p.rim=[E(50,48,43,v?24:20),E(50,48,34,v?17:14),P(['M',7,48],['L',7,71],['C',13,92,87,92,93,71],['L',93,48])]
  p.field=[poly(29,45,64,41,76,52,37,57),L(47,43,56,54),E(52,49,4,3)]
  p.seats=[P(['M',15,61],['Q',50,83,85,61]),L(21,67,21,79),L(37,74,37,85),L(63,74,63,85),L(79,67,79,79)]
  p.lights=[L(16,29,14,11,29,11,29,17,15,17),L(83,29,86,11,71,11,71,17,85,17)]
  if(s===2)p.entry=[arch(45,77,10,9)]
 }
 return {aspect:f==='turbine'?.94:1.15,parts:p}
}

export function atelierBuilding(d,s,v){
 const drawing=d.kind==='shop'?shop(d,s,v):d.kind==='home'?home(d,s,v):d.kind==='civic'?civic(d,s,v):d.kind==='tower'?tower(d,s,v):d.kind==='landmark'?landmark(d,s,v):structure(d,s,v)
 const p=drawing.parts
 if(s===2&&['tower','bridge','pagoda'].includes(d.kind)){
  if(d.kind==='bridge')p.abutment=[L(7,74,13,74),L(87,74,93,74)]
  else if(d.kind==='pagoda')p.structure=[L(29,81,29,86),L(71,81,71,86)]
  else p.plinth=[L(17,96,83,96),L(20,94,29,94)]
 }
 if(s===2&&['barn','glass','rows'].includes(d.feature))p.joins=[L(17,81,21,81),L(71,79,75,79)]
 if(v&&d.feature==='tree')p.ladder=[L(7,59,20,96),L(14,57,27,94),L(13,73,21,71),L(17,83,25,81)]
 if(v&&d.feature==='wheel')p.wheel=[E(76,73,15,15),E(76,73,3,3),L(65,62,87,84),L(65,84,87,62),L(61,73,91,73)]
 return {...drawing,parts:moveParts(drawing.parts,0,0,.01,.01)}
}
