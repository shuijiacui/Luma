import {P,E,L,R,poly,leaf,flower,sprig,registerStudio} from './forms.mjs'
const plants=[
 ['daisy','雏菊','radial',10],['poppy','虞美人','cup',3],['lotus','荷花','lotus',5],['orchid','兰花','orchid',5],
 ['hydrangea','绣球花','cluster',4],['lavender','薰衣草','spike',7],['peony','牡丹','layered',7],['daffodil','水仙','trumpet',6],
 ['hibiscus','扶桑花','radial',5],['fern','蕨类','fern',7],['monstera','龟背竹','split',6],['ginkgoleaf','银杏叶','fan',5],
 ['mapleleaf','枫叶','maple',5],['oakbranch','橡树枝','oak',5],['pinecone','松果','cone',6],['wheat','麦穗','grain',6],
]
const scenes=[
 ['beachscene','海滩','beach'],['riverscene','河流','river'],['lakescene','湖泊','lake'],['waterfall','瀑布','falls'],
 ['volcano','火山','volcano'],['desert','沙漠','desert'],['oasis','绿洲','oasis'],['snowmountain','雪山','snow'],
 ['terracedfield','梯田','terraces'],['forestpath','林间小路','forest'],['island','海岛','island'],['cliff','海边悬崖','cliff'],
 ['cavescene','山洞','cave'],['waterlilypond','荷塘','pond'],['orchard','果园','orchard'],['countryroad','乡间道路','road'],
]
const aliases={daisy:['小雏菊'],ginkgoleaf:['银杏','ginkgo leaf'],mapleleaf:['红枫叶','maple leaf'],oakbranch:['橡树','oak branch'],pinecone:['松塔','pine cone'],beachscene:['沙滩','海边','beach'],riverscene:['小河','河水','river'],lakescene:['湖水','湖','lake'],snowmountain:['雪山风景','snow mountain'],terracedfield:['梯田风景','terraced field'],forestpath:['森林小路','forest path'],cavescene:['洞穴','cave'],waterlilypond:['莲花池','water lily pond'],countryroad:['乡村小路','country road']}

function botanical(d,s,v){
 const k=d.kind,cx=v?.46:.5,cy=v?.32:.35,parts={},real=s===2
 const r=s===0?.2:.18
 if(k==='fern'||k==='grain'||k==='spike'){
  parts.stem=[P(['M',.49,.88],['Q',v?.62:.42,.53,.51,.12])];parts.leaves=[]
  const n=k==='spike'?6:5
  for(let i=0;i<n;i++){
   const y=.18+i*.1,w=(i+1)*.015+.02
   if(k==='spike')parts.leaves.push(E(.49-w/2,y,w,.022),E(.53+w/2,y+.025,w,.022))
   else if(k==='grain')parts.leaves.push(P(['M',.51,y+.085],['Q',.4,y+.035,.43,y],['Q',.52,y+.015,.51,y+.085]),P(['M',.51,y+.095],['Q',.62,y+.045,.59,y+.01],['Q',.5,y+.025,.51,y+.095]))
   else parts.leaves.push(P(['M',.5,y+.09],['Q',.5-w*2,y+.09,.5-w*2,y-.01],['Q',.5-w,y,.5,y+.09]),P(['M',.52,y+.09],['Q',.52+w*2,y+.09,.52+w*2,y-.01],['Q',.52+w,y,.52,y+.09]))
  }
  if(real)parts.tip=[L(.51,.12,.54,.05),L(.47,.21,.42,.12)]
 }else if(k==='fan'){
  parts.blade=[P(['M',cx,.68],['L',cx-.31,.3],['Q',cx-.18,.04,cx,.19],['Q',cx+.18,.04,cx+.31,.3],['Z'])];parts.stem=[L(cx,.68,cx+(v?.09:0),.9)]
  parts.veins=[L(cx,.68,cx-.18,.26),L(cx,.68,cx,.22),L(cx,.68,cx+.18,.26)]
 }else if(k==='maple'){
  parts.blade=[poly(.5,.73,.17,.62,.26,.5,.1,.35,.32,.37,.29,.2,.43,.31,.5,.06,.57,.31,.71,.2,.68,.37,.9,.35,.74,.5,.83,.62)]
  parts.stem=[L(.5,.9,.5,.23)];parts.veins=[L(.5,.61,.25,.43),L(.5,.61,.75,.43)]
 }else if(k==='split'){
  parts.blade=[P(['M',.51,.24],['C',.19,.04,.08,.58,.31,.71],['Q',.43,.85,.51,.91],['Q',.66,.84,.81,.57],['C',.97,.18,.63,.05,.51,.24],['Z'])]
  parts.veins=[P(['M',.51,.86],['Q',.45,.52,.51,.24])];parts.cuts=[P(['M',.22,.32],['L',.36,.46],['L',.2,.42]),P(['M',.78,.3],['L',.62,.45],['L',.83,.4]),P(['M',.24,.57],['L',.39,.64],['L',.29,.67]),P(['M',.78,.56],['L',.62,.66],['L',.7,.72])]
 }else if(k==='oak'){
  parts.stem=[P(['M',.3,.91],['Q',.54,.59,.63,.15])];parts.leaves=[]
  for(const [x,y,w,h] of [[.34,.48,.14,.27],[.62,.35,.15,.28],[.4,.18,.12,.25]])parts.leaves.push(P(['M',x,y+h],['Q',x-w,y+h*.9,x-w*.5,y+h*.65],['Q',x-w*1.4,y+h*.35,x-w*.55,y+h*.3],['Q',x-w*.4,y-.04,x,y],['Q',x+w*.9,y,x+w*.55,y+h*.35],['Q',x+w*1.3,y+h*.6,x+w*.45,y+h*.7],['Q',x+w*.8,y+h*.95,x,y+h],['Z']))
  parts.acorn=[E(.66,.7,.06,.08),P(['M',.59,.67],['Q',.66,.56,.73,.67])]
 }else if(k==='cone'){
  parts.body=[P(['M',.5,.12],['C',.14,.31,.14,.8,.5,.91],['C',.86,.8,.86,.31,.5,.12],['Z'])];parts.scales=[]
  for(let row=0;row<5;row++){const y=.27+row*.12,w=.09+Math.sin(row/4*Math.PI)*.08;parts.scales.push(P(['M',.5-w,y],['Q',.5,y+.15,.5+w,y]))}
  parts.stem=[L(.5,.12,.53,.06)]
 }else{
  parts.stem=[P(['M',cx,cy+r*.6],['Q',cx+(v?.14:-.05),.62,.5,.86])];parts.leaves=[leaf(.36,.54,.09,.2),leaf(.62,.64,.1,.17)];parts.branches=[L(.36,.74,.49,.75),L(.62,.81,.5,.82)]
  parts.petals=[]
  if(k==='cup')parts.petals=[P(['M',cx-r,cy-r*.5],['Q',cx-r*.4,cy-r,cx,cy-r*.6],['Q',cx+r*.8,cy-r,cx+r,cy-r*.5],['Q',cx+r,cy+r,cx,cy+r],['Q',cx-r,cy+r,cx-r,cy-r*.5],['Z']),P(['M',cx-r,cy-r*.5],['Q',cx,cy+.02,cx+r,cy-r*.5]),E(cx,cy-r*.1,.045,.025)]
  else if(k==='lotus'){
   parts.petals=[leaf(cx,cy-r,.065,r*1.7),P(['M',cx,cy+r],['C',cx-r*1.4,cy+r,cx-r*1.4,cy-r*.6,cx,cy+r],['C',cx+r*1.4,cy+r,cx+r*1.4,cy-r*.6,cx,cy+r]),P(['M',cx-r*1.6,cy],['Q',cx-r,cy+r*1.7,cx,cy+r],['Q',cx+r,cy+r*1.7,cx+r*1.6,cy])]
   parts.leaves=[P(['M',.49,.75],['C',.16,.51,.08,.86,.43,.87],['C',.89,.91,.89,.65,.58,.7],['Z'])]
  }else if(k==='cluster')for(const [dx,dy] of [[-.1,-.07],[.02,-.1],[.12,0],[-.1,.07],[.03,.09],[0,0]])parts.petals.push(flower(cx+dx,cy+dy,s===0?.07:.065,4))
  else{
   const n=d.count
   for(let i=0;i<n;i++){
    const a=i*2*Math.PI/n,dx=Math.cos(a),dy=Math.sin(a),tip=real?r*(i%2?1.1:1.4):r,pw=['layered','orchid','radial'].includes(k)&&n<8?(s===0?.11:.15):.09
    parts.petals.push(P(['M',cx+dx*.035,cy+dy*.035],['C',cx+dx*tip-dy*pw,cy+dy*tip+dx*pw,cx+dx*tip+dy*pw,cy+dy*tip-dx*pw,cx+dx*.035,cy+dy*.035]))
   }
   parts.centre=[k==='trumpet'?P(['M',cx-.065,cy-.06],['Q',cx,cy+.02,cx+.065,cy-.06],['L',cx+.04,cy+.07],['Q',cx,cy+.1,cx-.04,cy+.07],['Z']):E(cx,cy,.035,.035)]
   if(k==='layered')parts.inner=[flower(cx,cy,.085,7)]
   if(k==='orchid')parts.lip=[P(['M',cx-.05,cy+.03],['Q',cx-.08,cy+.14,cx,cy+.12],['Q',cx+.08,cy+.14,cx+.05,cy+.03])]
  }
 }
 if(v&& !['fan','maple','split','cone','oak'].includes(k))parts.pot=[poly(.32,.82,.68,.82,.63,.97,.37,.97),L(.33,.86,.67,.86)]
 if(v&&['fan','maple','split','cone','oak'].includes(k))parts.companion=[P(['M',.1,.9],['Q',.18,.68,.27,.79],['Q',.37,.91,.1,.9]),L(.1,.9,.23,.82)]
 if(s===1)parts.ornament=['fern','grain','spike'].includes(k)?[P(['M',.48,.88],['Q',.2,.8,.18,.91],['Q',.27,.99,.49,.88],['Q',.75,.78,.78,.9],['Q',.67,.99,.48,.88])]:['fan','maple','split','cone','oak'].includes(k)?[P(['M',.11,.94],['Q',.37,.82,.44,.95])]:[L(.36,.69,.35,.6),L(.61,.76,.63,.69)]
 if(s===2)parts.texture=['fan','maple','split'].includes(k)?[L(.5,.59,.35,.39),L(.53,.6,.67,.39)]:[L(.39,.66,.35,.59),L(.57,.75,.64,.69)]
 return {aspect:.9,parts}
}

const tree=(x,y,w,h,s)=>({trunk:[L(x,y+h*.54,x-.025,y+h,x+.025,y+h,x,y+h*.54)],crown:[s===0?E(x,y+h*.3,w*.5,h*.3):P(['M',x-w*.45,y+h*.53],['Q',x-w*.65,y+h*.16,x-w*.15,y+h*.14],['Q',x,y-h*.04,x+w*.24,y+h*.14],['Q',x+w*.65,y+h*.27,x+w*.42,y+h*.56],['Z'])]})
function landscape(d,s,v){
 const k=d.kind,detail=s>0,horizon=v?.4:.47
 const parts={land:[],foreground:[],details:[]}
 if(['beach','lake','river','road','forest','orchard','oasis','island','pond'].includes(k)){
  parts.land=[P(['M',.05,horizon],['Q',.27,horizon-.09,.5,horizon],['Q',.73,horizon-.1,.95,horizon])]
  if(k==='river'||k==='road'||k==='forest')parts.foreground=[P(['M',.52,horizon],['C',.2,.62,.75,.64,.23,.96]),P(['M',.57,horizon],['C',.4,.65,.95,.67,.83,.96])]
  else if(k==='beach')parts.foreground=[P(['M',.95,.53],['C',.15,.61,.82,.71,.08,.92]),P(['M',.05,.63],['Q',.27,.67,.45,.63])]
  else parts.foreground=[E(.5,k==='island'?.71:.73,k==='oasis'?.31:.41,k==='pond'?.18:.13)]
  if(['forest','orchard','oasis','island','beach'].includes(k)){
   const t=tree(v?.25:.2,.14,.24,.56,s);parts.trunks=t.trunk;parts.trees=t.crown
   if(k==='forest'||k==='orchard'){const t2=tree(.78,.21,.24,.49,s);parts.trunks.push(...t2.trunk);parts.trees.push(...t2.crown)}
   parts.land=[L(.05,horizon,.09,horizon),P(['M',.32,horizon],['Q',.49,horizon-.055,.64,horizon]),L(.9,horizon,.96,horizon)]
   if(k==='orchard')parts.fruit=[E(.16,.34,.025,.03),E(.24,.36,.025,.03),E(.75,.39,.025,.03),E(.82,.4,.025,.03)]
   if(k==='oasis'||k==='island'||k==='beach'){parts.trunks=[P(['M',.22,.69],['Q',.35,.44,.27,.27],['Q',.3,.45,.17,.69])];parts.trees=[P(['M',.27,.27],['Q',.07,.12,.03,.32],['Q',.16,.24,.27,.27],['Q',.22,.03,.43,.15],['Q',.31,.16,.27,.27],['Q',.52,.18,.51,.36],['Q',.39,.24,.27,.27])]}
  }
  if(k==='pond')parts.lilies=[P(['M',.31,.69],['C',.11,.57,.1,.85,.36,.76],['Z']),P(['M',.64,.75],['C',.45,.65,.49,.93,.72,.81],['Z']),flower(.58,.56,.075,5),L(.58,.61,.58,.75)]
  if(k==='lake')parts.mountain=[L(.08,horizon,.3,.14,.48,horizon,.7,.2,.92,horizon)]
  if(k==='road')parts.fence=[L(.08,.64,.4,.53),L(.13,.62,.13,.78),L(.26,.58,.26,.67),L(.36,.55,.36,.59)]
 }else if(k==='falls'){
  parts.land=[L(.07,.83,.1,.28,.37,.19,.6,.24,.87,.13,.95,.77)];parts.fall=[P(['M',.4,.24],['Q',.48,.48,.35,.79]),P(['M',.63,.24],['Q',.56,.49,.68,.79])];parts.pool=[P(['M',.35,.78],['C',.01,.77,.14,1,.58,.92],['C',.98,.91,.95,.76,.68,.78])]
  if(v)parts.rocks=[poly(.08,.83,.19,.66,.29,.83),poly(.77,.79,.88,.6,.95,.83)]
 }else if(['volcano','snow','cliff','cave'].includes(k)){
  if(k==='volcano'){parts.land=[L(.06,.9,.39,.27,.6,.27,.94,.9),E(.5,.27,.11,.04)];parts.smoke=[P(['M',.46,.22],['C',.21,.15,.68,.05,.52,.02])];if(v)parts.lava=[P(['M',.42,.3],['Q',.56,.43,.4,.57],['Q',.27,.69,.41,.87])]}
  if(k==='snow'){parts.land=[poly(.03,.92,.45,.13,.67,.57,.79,.35,.97,.92)];parts.snow=[L(.3,.42,.4,.38,.44,.47,.5,.37,.6,.42),L(.7,.56,.78,.54,.84,.59)]}
  if(k==='cliff'){parts.land=[L(.04,.92,.14,.24,.71,.19,.63,.53,.86,.65,.77,.93)];parts.ledge=[L(.14,.24,.46,.33,.71,.19),L(.46,.33,.4,.81)];parts.water=[P(['M',.83,.74],['Q',.9,.71,.97,.74])]}
  if(k==='cave'){parts.land=[P(['M',.03,.92],['L',.16,.39],['L',.38,.16],['L',.64,.19],['L',.87,.39],['L',.97,.92],['Z'])];parts.opening=[P(['M',.25,.91],['C',.14,.29,.86,.29,.75,.91])];parts.stones=[poly(.05,.9,.13,.81,.21,.92),poly(.77,.93,.86,.81,.95,.93)]}
  if(detail)parts.ridges=[L(.24,.73,.31,.61,.34,.64),L(.65,.67,.71,.76,.69,.86)]
 }else if(k==='desert'){
  parts.land=[P(['M',.04,.58],['Q',.27,.15,.54,.55],['Q',.81,.12,.97,.54]),P(['M',.03,.8],['Q',.59,.37,.97,.81])];parts.cactus=[P(['M',.26,.87],['L',.26,.62],['L',.19,.62],['L',.19,.46],['Q',.23,.39,.24,.46],['L',.24,.56],['L',.29,.56],['L',.29,.37],['Q',.33,.3,.35,.37],['L',.35,.68],['L',.39,.68],['L',.39,.54],['Q',.43,.49,.44,.55],['L',.44,.74],['L',.35,.74],['L',.35,.87])]
 }else if(k==='terraces'){
  parts.land=[L(.05,.82,.27,.22,.66,.11,.95,.73)]
  for(let i=0;i<5;i++){const y=.35+i*.115;parts.details.push(P(['M',.2-i*.025,y],['C',.36,y-.13,.53,y+.1,.85+i*.018,y-.06]))}
 }
 parts.sky=[E(v?.73:.79,.17,s===0?.073:.055,s===0?.088:.066)]
 if(s===1)parts.cloud=[P(['M',.13,.15],['Q',.11,.06,.2,.09],['Q',.23,.01,.3,.1],['Q',.4,.08,.4,.16],['Z'])]
 if(s===2)parts.texture=[P(['M',.1,.95],['Q',.23,.89,.32,.91]),L(.75,.86,.85,.87),L(.78,.9,.94,.9)]
 if(v)parts.foreground.push(P(['M',.59,.98],['Q',.62,.87,.68,.93],['Q',.74,.85,.77,.98]))
 return {aspect:1.35,parts}
}
export function addNatureStudioRecipes(add){
 for(const [id,name,kind,count] of plants)registerStudio(add,{id,name,kind,count,category:'botanical',related:['plant','garden','植物'],aliases:aliases[id]??[],poses:['单枝观察','盆栽或组合']},botanical)
 for(const [id,name,kind] of scenes)registerStudio(add,{id,name,kind,category:'landscape',related:['landscape','nature','风景'],aliases:aliases[id]??[],poses:['开阔构图','近景构图']},landscape)
}
