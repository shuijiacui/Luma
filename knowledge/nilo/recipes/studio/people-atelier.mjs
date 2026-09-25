import {P,E,L,poly,moveParts} from './forms.mjs'

// Original contour drawings. Hair ends at the face contour; clothing, hands
// and props have intentional joins rather than overlapping closed symbols.
const path=(...commands)=>commands
const line=(...xy)=>L(...xy)
const oval=(x,y,a,b)=>E(x,y,a,b)
function coiffure(type,side=false){
 const outline={
  short:path(['M',26,43],['C',17,20,29,10,48,12],['C',64,6,82,21,76,43],['Q',72,28,62,23],['Q',48,39,27,35]),
  parted:path(['M',26,43],['C',18,19,37,9,52,12],['C',71,11,81,22,75,43],['Q',71,30,63,22],['Q',45,33,27,33]),
  long:path(['M',27,44],['Q',14,65,23,73],['C',8,29,23,9,48,11],['C',76,7,88,34,79,74],['Q',86,55,74,40],['Q',65,32,59,23],['Q',49,39,28,36]),
  bob:path(['M',26,44],['Q',18,53,22,63],['L',29,65],['C',5,46,17,8,48,11],['C',77,8,91,43,75,65],['L',69,61],['Q',78,48,73,36],['Q',64,31,60,22],['Q',48,37,27,35]),
  braid:path(['M',26,43],['C',17,19,29,9,49,11],['C',74,8,81,28,75,43],['Q',68,34,61,23],['Q',47,36,27,36]),
  curly:path(['M',25,45],['C',11,42,12,26,22,25],['C',16,12,33,7,41,14],['C',49,1,66,8,66,16],['C',82,11,88,29,77,35],['Q',84,43,74,48]),
  bun:path(['M',26,43],['C',14,25,26,12,47,13],['C',72,8,83,28,74,43],['Q',69,29,62,22],['Q',47,38,27,35]),
  bald:path(['M',26,42],['C',18,9,75,0,76,41]),
  baby:path(['M',26,40],['C',20,12,74,6,76,40]),
  tuft:path(['M',26,42],['C',19,21,35,15,45,15],['Q',56,2,58,14],['C',73,15,78,26,75,42]),
 }
 let hair=outline[type]??outline.short
 const extra=[]
 if(type==='bun')extra.push(oval(57,10,10,7))
 if(type==='braid')extra.push(path(['M',24,46],['Q',11,53,21,59],['Q',10,66,23,72],['L',18,79]),path(['M',77,46],['Q',90,54,79,60],['Q',90,67,76,75],['L',82,81]))
 if(type==='baby')extra.push(path(['M',43,21],['C',57,9,62,27,49,23]))
 if(['helmet','cap','chefhat','hat','beret','sailorhat'].includes(type)){
  if(type==='chefhat')hair=path(['M',25,36],['L',25,22],['C',11,15,18,-3,33,2],['C',38,-14,62,-10,67,2],['C',88,-6,95,20,76,23],['L',76,36],['Z'])
  else if(type==='hat')hair=path(['M',12,34],['Q',26,29,28,27],['L',31,15],['Q',32,7,43,9],['L',61,11],['Q',68,12,71,28],['Q',89,28,92,35],['C',79,45,27,46,12,34],['Z'])
  else if(type==='beret')hair=path(['M',23,35],['C',7,23,30,2,59,10],['C',77,9,89,30,74,35],['Z'])
  else hair=path(['M',21,36],['C',20,4,77,4,78,36],['Q',58,39,21,36],['L',13,39],['Q',44,46,70,40])
 }
 if(side)hair=hair.map(([op,...n])=>[op,...n.map((a,i)=>i%2?a:a*.94+1)])
 return {hair:[hair,...extra]}
}

function face(type,s,v){
 const baby=type==='baby'||type==='tuft'
 const parts={
  face:[v?path(['M',28,36],['C',20,31,22,48,31,49],['Q',32,65,48,70],['Q',60,72,66,62],['Q',68,59,67,56],['L',70,53],['L',67,51],['Q',77,51,76,47],['Q',70,39,72,33]):path(['M',27,36],['C',16,30,20,50,29,50],['C',31,65,43,72,51,72],['C',62,71,71,63,73,49],['C',82,49,83,30,75,36])],
  ...coiffure(type,!!v),
  eyes:v?[path(['M',57,41],['Q',62,38,66,41]),oval(63,42,1.35,1.6)]:[path(['M',34,41],['Q',39,38,43,41]),path(['M',57,41],['Q',62,38,66,41]),oval(40,42,1.3,1.65),oval(62,42,1.3,1.65)],
  nose:v?[]:[path(['M',51,43],['Q',48,48,49,51],['L',53,52])],
  mouth:[v?path(['M',60,58],['Q',64,60,67,56]):path(['M',44,60],['Q',51,65,58,59])],
 }
 if(s===1)parts.eyes=v?[oval(62,42,1.7,2.2)]:[oval(39,42,1.7,2.2),oval(62,42,1.7,2.2)]
 if(baby){parts.face=[path(['M',26,36],['C',12,36,23,70,48,72],['C',75,73,87,36,75,36])];parts.nose=[path(['M',48,51],['Q',51,54,54,51])];parts.eyes=v?[path(['M',34,43],['Q',40,37,46,43]),path(['M',58,43],['Q',63,37,68,43])]:[oval(40,43,2,2.4),oval(62,43,2,2.4)]}
 if(type==='glasses')parts.glasses=v?[oval(62,42,8,7),line(29,39,53,41)]:[oval(39,42,8,7),oval(62,42,8,7),path(['M',47,41],['Q',50,39,54,41])]
 if(type==='bun'||type==='bald')parts.expression=[path(['M',33,49],['Q',38,52,42,50]),path(['M',60,50],['Q',64,52,69,48])]
 return parts
}

function portrait(d,s,v){
 let parts=face(d.hair,s,v)
 const child=!['grandmother','grandfather','adultwoman','adultman'].includes(d.id)
 const baby=d.id==='baby'||d.id==='toddler'
 // The turned shoulder and off-centre neck produce a pose, not a mirrored face.
 parts.neck=[v?path(['M',38,61],['L',37,75],['Q',30,78,24,80]):path(['M',40,68],['L',40,77],['Q',31,79,24,82]),v?path(['M',56,70],['L',57,75],['Q',67,75,74,79]):path(['M',61,67],['L',61,77],['Q',70,78,78,83])]
 if(baby)parts.neck=[line(40,71,40,78,24,82),line(61,71,61,78,76,82)]
 parts.shoulders=[path(['M',24,80],['C',13,84,11,91,9,99],['L',91,99],['C',89,88,84,81,74,79])]
 if(['adultman','grandfather'].includes(d.id))parts.collar=[line(38,75,32,81,41,90,50,82,60,90,69,80,60,75),line(50,83,50,99)]
 else if(baby)parts.collar=[path(['M',35,77],['C',30,102,71,101,68,77],['Q',49,90,35,77])]
 else parts.collar=[path(['M',32,78],['Q',48,99,68,78])]
 if(s===1&&!baby){parts.trim=[path(['M',31,84],['Q',34,92,42,91]),path(['M',63,90],['Q',70,88,71,83])];if(d.hair==='braid')delete parts.trim}
 if(s===2&&!baby)parts.fold=[path(['M',22,88],['Q',24,95,23,99]),path(['M',79,86],['Q',76,92,78,99])]
 if(child&&s===1)parts=moveParts(parts,.025,.02,.94,.96)
 return {aspect:.84,parts:moveParts(parts,0,0,.01,.01)}
}

function arm(a,b,c,r=3.7){
 // Open sleeve contour, tapered forearm and a small hand folded round the prop.
 const dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy),nx=-dy/len*r,ny=dx/len*r
 const ex=c[0]-b[0],ey=c[1]-b[1],el=Math.hypot(ex,ey),mx=-ey/el*r*.62,my=ex/el*r*.62
 return path(['M',a[0]+nx,a[1]+ny],['Q',b[0]+nx,b[1]+ny,c[0]+mx,c[1]+my],['Q',c[0]+ex*.1,c[1]+ey*.1,c[0]-mx,c[1]-my],['Q',b[0]-nx,b[1]-ny,a[0]-nx,a[1]-ny])
}

export function atelierPerson(d,s,v,equipment){
 if(d.kind==='portrait')return portrait(d,s,v)
 const active=['running','football','basketball','skates','ribbon','tutu','hiking','kite'].includes(d.kind)
 const held=['book','reading','books','bread','blueprint','camera','guitar','violin'].includes(d.kind)
 const seated=['wheelchair','bicycle','piano'].includes(d.kind)||(d.kind==='reading'&&!v)
 const child=d.id.endsWith('child')||['skater','kiteflyer','soccerplayer','basketballplayer'].includes(d.id)
 const headSize=s===1?33:child?29:27,cx=v&&active?45:49,headY=s===1?7:9
 const faceParts=face(d.hair,s,v?1:0)
 // On full figures the eyelid is enough at tracing size. No crowded tiny irises.
 if(s===2)faceParts.eyes=[path(['M',34,41],['Q',39,38,43,41]),path(['M',57,41],['Q',62,38,66,41])]
 if(v&&s===2)faceParts.eyes=[path(['M',57,41],['Q',62,38,66,41])]
 delete faceParts.expression
 let parts=moveParts(faceParts,cx-headSize/2,headY,headSize/100,headSize/100)
 const chin=headY+headSize*.72,shoulder=chin+4,waist=held?66:61
 parts.neck=[line(cx-2.4,chin-.7,cx-2.5,shoulder-1,37,shoulder+2),line(cx+2.5,chin-.7,cx+2.7,shoulder-1,62,shoulder+2)]
 const lh=held?[34,55]:v?[23,42]:[29,59],rh=held?[66,55]:v?[71,48]:[72,59]
 const grip={watering:v?[88,55]:[90,58],rake:[72,52],hammer:v?[67,58]:[73,60],flask:v?[66,49]:[72,57],medicalbag:v?[68,46]:[74,54],microphone:v?[66,45]:[72,53],lantern:v?[68,57]:[74,57],kite:[72,49],umbrella:[70,53],hiking:[76,49]}
 if(grip[d.kind]){rh[0]=grip[d.kind][0];rh[1]=grip[d.kind][1]}
 if(d.kind==='ribbon'||d.kind==='tutu'){lh[0]=22;lh[1]=v?24:42;rh[0]=74;rh[1]=v?25:43}
 if(d.kind==='running'){lh[0]=26;lh[1]=42;rh[0]=70;rh[1]=52}
 if(d.kind==='basketball'){rh[0]=v?67:72;rh[1]=49}
 parts.arms=[arm([37,shoulder+2],[v?27:25,shoulder+14],lh),arm([62,shoulder+2],[74,shoulder+14],rh)]
 const coat=['stethoscope','medicalbag','flask'].includes(d.kind)
 parts.body=held?[path(['M',37,shoulder+2],['Q',40,42,38,47]),path(['M',62,shoulder+2],['Q',59,41,63,47])]:[path(['M',37,shoulder+2],['Q',40,43,38,50],['Q',37,57,coat?34:36,waist],['Q',48,waist+2,coat?65:64,waist],['Q',60,54,61,47],['Q',59,40,62,shoulder+2])]
 const dress=['ribbon','tutu'].includes(d.kind)
 if(dress){parts.body=[path(['M',37,shoulder+2],['Q',46,42,41,52],['Q',32,65,29,68],['Q',48,76,69,68],['Q',63,63,57,52],['Q',53,42,62,shoulder+2])]}
 if(d.kind==='wheelchair'){
  parts.legs=[path(['M',37,63],['Q',42,72,66,71],['L',75,87],['L',81,86],['L',73,65],['L',57,62])]
 }else if(d.kind==='bicycle'){
  parts.legs=[path(['M',40,60],['L',61,66],['L',48,81],['L',53,84],['L',69,65],['Q',70,62,55,57]),path(['M',39,62],['L',35,74],['L',48,79])]
 }else if(seated){parts.legs=[path(['M',36,waist],['Q',45,72,65,71],['L',68,88],['L',75,88],['L',74,66],['Q',64,61,60,61]),path(['M',37,waist],['L',39,89],['L',46,89],['L',47,73])]}
 else if(v||active){parts.legs=[path(['M',dress?39:37,dress?71:waist],['Q',38,73,29,87],['L',35,90],['L',49,70],['Q',50,68,52,70],['L',66,88],['L',73,85],['Q',65,70,62,dress?71:waist])]}
 else parts.legs=[path(['M',38,waist],['Q',37,76,39,90],['L',46,90],['L',49,72],['Q',50,68,52,72],['L',55,90],['L',62,90],['Q',65,75,62,waist])]
 const feet=seated?[[39,89,46],[68,88,75]]:v||active?[[29,87,35],[66,88,73]]:[[39,90,46],[55,90,62]]
 parts.shoes=feet.map(([x,y,r],i)=>path(['M',x,y],['Q',x-(i?0:6),y+1,x-(i?0:5),y+4],['Q',r+3,y+5,r+4,y+2],['L',r,y]))
 const prop=moveParts(equipment(d.kind,v,s),0,0,100,100)
 if(d.kind==='tutu')delete prop.skirt
 if(d.kind==='piano'){delete parts.legs;delete parts.shoes}
 if(d.kind==='violin'){
  parts.body=[path(['M',37,54],['Q',37,60,36,66],['Q',49,68,64,66],['Q',62,59,62,54])]
  parts.arms=[arm([37,shoulder+2],[26,44],[36,45]),arm([62,shoulder+2],[73,48],[61,51])]
 }
 if(d.kind==='guitar'){
  parts.body=[line(37,shoulder+2,35,45),path(['M',62,shoulder+2],['L',63,53],['Q',61,59,59,63])]
  parts.legs=[path(['M',37,79],['Q',37,84,39,90],['L',46,90],['L',49,82]),path(['M',56,77],['L',55,90],['L',62,90],['Q',65,76,62,61])]
  parts.shoes=[path(['M',39,90],['Q',32,96,48,94],['L',46,90]),path(['M',55,90],['L',55,94],['Q',72,95,62,90])]
 }
 if(d.kind==='camera')parts.arms=[arm([37,shoulder+2],[27,46],[37,v?40:51]),arm([62,shoulder+2],[75,46],[63,v?40:51])]
 if(d.kind==='camera')parts.waist=[line(38,v?52:62,37,66,63,66,62,v?52:62)]
 if(d.kind==='piano')parts.arms=[arm([37,shoulder+2],[27,50],[34,63]),arm([62,shoulder+2],[74,49],[68,63])]
 if(d.kind==='bicycle'){
  parts.arms=[arm([37,shoulder+2],[50,44],[71,51]),arm([62,shoulder+2],[71,44],[77,51])]
  parts.shoes=[path(['M',48,81],['Q',45,86,57,85],['L',53,82]),path(['M',46,77],['Q',44,81,55,81],['L',50,78])]
 }
 if(d.kind==='umbrella')prop.umbrella=[path(['M',12,8],['C',17,-10,83,-10,88,8],['Q',77,2.5,65,8],['Q',53,2.5,42,8],['Q',27,2.5,12,8]),path(['M',70,2.5],['L',70,57],['Q',70,65,64,60])]
 parts={...parts,...prop}
 if(d.kind==='skates')parts.blades=feet.map(([x,y,r])=>path(['M',x-5,y+4],['L',r+5,y+4],['Q',r+7,y+3,r+6,y+1]))
 // One meaningful garment detail, chosen for the role; no arbitrary decoration.
 parts.collar=coat?[line(43,shoulder,47,shoulder+9,50,shoulder+3,54,shoulder+9,58,shoulder)]:[path(['M',43,shoulder],['Q',49,shoulder+6,56,shoulder])]
 if(d.id==='teacher')parts.collar=[line(43,shoulder,49,shoulder+5,55,shoulder),poly(48,shoulder+5,51,shoulder+5,52,44,49,46,47,44)]
 if(s===1&&!held&&!dress)parts.cuff=[line(28,shoulder+11,34,shoulder+14)]
 // Connect garment edges to the actual sleeve endpoints after pose changes.
 const end=stroke=>stroke.at(-1).slice(-2)
 const join=(command,xy)=>command.splice(command.length-2,2,...xy)
 join(parts.neck[0].at(-1),parts.arms[0][0].slice(-2))
 join(parts.neck[1].at(-1),end(parts.arms[1]))
 if(d.kind!=='violin'){
  join(parts.body[0][0],end(parts.arms[0]))
  if(parts.body.length===1)join(parts.body[0].at(-1),parts.arms[1][0].slice(-2))
  else join(parts.body[1][0],parts.arms[1][0].slice(-2))
 }
 if(d.kind==='reading'&&!v){
  // A seated reading vignette: the stool, lap and book have their own planes.
  parts={...moveParts(face(d.hair,s,1),17,1,.48,.48),
   neck:[line(35,33,35,38,27,41),line(43,35,45,38,55,41)],
   torso:[path(['M',27,41],['C',22,48,23,60,22,67],['Q',35,72,48,68]),path(['M',55,41],['Q',57,45,57,47])],
   book:[path(['M',32,47],['Q',46,45,53,52],['Q',63,44,78,45],['L',73,65],['Q',61,64,53,70],['Q',44,63,33,63],['Z']),line(53,52,53,70)],
   arms:[path(['M',27,42],['Q',16,48,20,58],['Q',26,61,35,57],['L',34,53],['Q',26,56,25,52],['L',30,45]),path(['M',56,42],['Q',67,42,73,50],['Q',78,53,74,57],['L',70,56])],
   knees:[path(['M',24,68],['Q',35,72,52,71],['Q',61,69,66,77],['L',75,88],['L',68,92],['L',56,78],['Q',39,81,28,77]),path(['M',33,78],['L',42,92],['L',49,91],['L',45,79])],
   shoes:[path(['M',42,92],['Q',40,99,56,96],['Q',59,92,49,91]),path(['M',68,92],['Q',75,96,84,94],['Q',84,90,75,88])],
   stool:[path(['M',21,69],['Q',10,69,13,75],['L',28,78]),line(17,77,10,96,15,96,22,78),line(28,79,27,96,32,96,34,83),line(14,87,28,90)],
  }
  if(s===1)parts.stitch=[line(26,62,26,66),line(40,52,47,54)]
  else parts.pages=[path(['M',60,53],['Q',65,50,72,50]),path(['M',58,59],['Q',64,56,70,56])]
 }
 if(d.kind==='wheelchair'){
  parts.shoes=[path(['M',75,87],['L',74,91],['Q',84,94,89,90],['L',81,86])]
  // Legs rest forward on a footplate; no standing foot inside the drive wheel.
  parts.footplate=[line(76,94,90,94,90,91)]
 }
 return {aspect:.78,parts:moveParts(parts,0,0,.01,.01)}
}
