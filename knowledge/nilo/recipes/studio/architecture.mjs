import {P,E,L,R,poly,arch,roundBox,leaf,registerStudio} from './forms.mjs'
import {atelierBuilding} from './architecture-atelier.mjs'

const buildings=[
 ['school','学校','civic','bell'],['kindergarten','幼儿园','civic','flower'],['library','图书馆','civic','book'],['museum','博物馆','civic','columns'],
 ['hospital','医院','civic','cross'],['firestation','消防站','civic','garage'],['policestation','警察局','civic','shield'],['postoffice','邮局','civic','envelope'],
 ['bakery','面包店','shop','bread'],['cafe','咖啡馆','shop','cup'],['bookshop','书店','shop','books'],['florist','花店','shop','plant'],
 ['market','集市','shop','fruit'],['restaurant','餐厅','shop','plate'],['apartment','公寓楼','tower','balcony'],['skyscraper','摩天大楼','tower','spire'],
 ['townhouse','联排住宅','home','rows'],['cottage','乡间小屋','home','chimney'],['logcabin','木屋','home','logs'],['treehouse','树屋','home','tree'],
 ['farmhouse','农舍','home','fence'],['barn','谷仓','home','barn'],['greenhouse','温室','home','glass'],['pagoda','宝塔','pagoda','tiers'],
 ['pavilion','中式亭子','pavilion','curved'],['temple','寺庙','pavilion','temple'],['archedbridge','拱桥','bridge','arch'],['suspensionbridge','悬索桥','bridge','cables'],
 ['stonegate','石牌坊','gate','stone'],['citywall','城墙','gate','battlement'],['clocktower','钟楼','tower','clock'],['watertower','水塔','tower','tank'],
 ['observatory','天文台','dome','telescope'],['planetarium','天文馆','dome','planet'],['railwaystation','火车站','civic','station'],['airport','机场','civic','terminal'],
 ['boathouse','船屋','home','water'],['watermill','水车屋','home','wheel'],['igloo','冰屋','dome','ice'],['yurt','蒙古包','dome','felt'],
 ['windturbine','风力发电机','landmark','turbine'],['stadium','体育场','landmark','stadium'],['theater','剧院','civic','curtain'],['ferriswheel','摩天轮','landmark','wheel'],
 ['carousel','旋转木马','landmark','carousel'],['fountain','喷泉','landmark','fountain'],['well','水井','landmark','well'],['gazebo','花园凉亭','pavilion','garden'],
]
const aliases={school:['schoolhouse'],cafe:['咖啡店','coffee shop'],florist:['flower shop'],apartment:['公寓','apartment building'],skyscraper:['高楼','大厦'],logcabin:['小木屋','log cabin'],treehouse:['树上的房子','tree house'],archedbridge:['石拱桥','arch bridge'],suspensionbridge:['吊桥','suspension bridge'],stonegate:['牌坊'],citywall:['长城','city wall'],clocktower:['钟塔','clock tower'],watertower:['water tower'],railwaystation:['车站','火车站台','railway station','train station'],watermill:['水车房','water mill'],windturbine:['wind turbine'],ferriswheel:['ferris wheel'],pavilion:['亭子'],planetarium:['天象馆'],boathouse:['boat house']}
const cross=(x,y,r)=>[L(x-r,y,x+r,y),L(x,y-r,x,y+r)]

function sign(kind,x,y){
 switch(kind){
 case 'bell':return [P(['M',x-.04,y+.04],['Q',x-.05,y-.05,x,y-.055],['Q',x+.05,y-.05,x+.04,y+.04],['Z']),L(x-.02,y+.055,x+.02,y+.055)]
 case 'cross':return cross(x,y,.045)
 case 'book':case 'books':return [P(['M',x-.075,y-.04],['Q',x-.02,y-.06,x,y-.01],['Q',x+.02,y-.06,x+.075,y-.04],['L',x+.075,y+.05],['Q',x+.035,y+.02,x,y+.06],['Q',x-.035,y+.02,x-.075,y+.05],['Z']),L(x,y-.01,x,y+.06)]
 case 'envelope':return [R(x-.08,y-.04,.16,.09),L(x-.08,y-.04,x,y+.015,x+.08,y-.04)]
 case 'shield':return [P(['M',x-.055,y-.055],['L',x+.055,y-.055],['L',x+.05,y+.035],['L',x,y+.07],['L',x-.05,y+.035],['Z'])]
 case 'bread':return [P(['M',x-.075,y+.035],['C',x-.12,y-.06,x+.12,y-.06,x+.075,y+.035],['Z']),L(x-.025,y-.025,x-.04,y+.01),L(x+.025,y-.025,x+.01,y+.01)]
 case 'cup':return [P(['M',x-.05,y-.045],['L',x+.035,y-.045],['L',x+.025,y+.045],['Q',x-.01,y+.065,x-.04,y+.045],['Z']),P(['M',x+.035,y-.025],['C',x+.11,y-.055,x+.11,y+.04,x+.03,y+.025])]
 case 'plant':case 'flower':return [leaf(x,y-.07,.045,.085),L(x,y+.015,x,y+.065),P(['M',x-.04,y+.01],['Q',x-.04,y+.05,x,y+.05])]
 case 'fruit':return [E(x-.04,y,.04,.04),E(x+.04,y,.04,.04),L(x,y+.05,x,y+.075)]
 case 'plate':return [E(x,y,.055,.05),L(x-.085,y-.05,x-.085,y+.06),L(x+.085,y-.05,x+.085,y+.06)]
 case 'clock':case 'station':return [E(x,y,.055,.055),L(x,y-.035,x,y,x+.027,y+.015)]
 case 'terminal':return [poly(x,y-.05,x+.015,y-.005,x+.08,y+.015,x+.08,y+.035,x+.01,y+.015,x+.01,y+.06,x-.01,y+.06,x-.01,y+.015,x-.08,y+.035,x-.08,y+.015,x-.015,y-.005)]
 default:return []
 }
}

function building(d,s,v){
 if(s>0)return atelierBuilding(d,s,v)
 const kind=d.kind,feature=d.feature,decor=s===1,real=s===2
 if(['bridge','gate','pagoda','pavilion','dome','landmark'].includes(kind))return specialty(d,s,v)
 // Front plane and a receding side share exact corners; windows stay in their plane.
 const left=v?.1:.14,right=v?.7:.86,top=kind==='tower'?.18:.39,bottom=.89
 const roofTop=kind==='tower'?.1:kind==='home'?.19:.26,side=v?[.17,-.09]:null
 const parts={walls:[L(left,top,left,bottom,right,bottom,right,top)],roof:[],door:[],windows:[],details:[]}
 if(kind==='home'){
  const peak=(left+right)/2
  parts.roof=[s===0?P(['M',left-.04,top],['Q',peak,.04,right+.04,top],['Z']):poly(left-.04,top,peak,roofTop,right+.04,top)]
  parts.door=[arch(peak-.065,.65,.13,.24)]
  if(feature==='barn'){parts.door=[R(peak-.15,.56,.3,.33),L(peak-.15,.56,peak+.15,.89),L(peak+.15,.56,peak-.15,.89)];parts.windows=[E(peak,.39,.055,.055)]}
  else parts.windows=[R(left+.07,.5,.13,.12),R(right-.2,.5,.13,.12)]
  if(feature==='chimney')parts.details.push(L(right-.16,.26,right-.16,.1,right-.08,.1,right-.08,.32))
  if(feature==='logs')parts.details.push(...[.47,.58,.7,.8].map(y=>L(left,y,right,y)))
  if(feature==='glass')parts.details.push(L(peak,roofTop,peak,bottom),L(left+.18,.31,left+.18,bottom),L(right-.18,.31,right-.18,bottom),L(left,.69,right,.69))
  if(feature==='fence')parts.details.push(L(.03,.82,left,.82),L(.04,.76,.04,.94),L(.1,.76,.1,.94),L(right,.82,.97,.82))
  if(feature==='tree'){parts.trunk=[L(.39,.89,.37,.99,.53,.99,.55,.89)];parts.branches=[P(['M',.1,.44],['C',.005,.29,.04,.1,.2,.12]),P(['M',.77,.33],['C',.99,.3,.99,.07,.72,.08])];parts.ladder=[L(.63,.89,.62,.98),L(.73,.89,.72,.98),L(.63,.94,.72,.94)]}
  if(feature==='water')parts.water=[P(['M',.08,.96],['Q',.26,.9,.43,.96],['Q',.61,.9,.8,.96])]
  if(feature==='wheel'){parts.wheel=[E(right,.72,.13,.13),L(right-.12,.72,right+.12,.72),L(right,.59,right,.85),L(right-.09,.63,right+.09,.81)]}
  if(feature==='rows')parts.extension=[poly(.04,.88,.04,.45,.1,.36,left,.45),L(.06,.57,.12,.57),L(.06,.7,.12,.7)]
 }else if(kind==='tower'){
  parts.roof=[L(left-.015,top,right+.015,top),feature==='spire'?poly(.4,top,.43,.04,.47,top):R(left,roofTop,right-left,.08)]
  parts.door=[R((left+right)/2-.055,.73,.11,.16)]
  if(feature==='tank'){
   parts.walls=[E((left+right)/2,.22,(right-left)/2,.075),L(left,.22,left,.56),L(right,.22,right,.56),P(['M',left,.56],['Q',.5,.69,right,.56])];parts.roof=[];parts.windows=[];parts.door=[]
   parts.supports=[L(left+.08,.6,left+.02,.93),L(right-.08,.6,right-.02,.93),L(left+.08,.64,right-.04,.86),L(right-.08,.64,left+.04,.86)]
  }else{
   if(feature==='clock')parts.clock=sign('clock',(left+right)/2,.31)
   const rows=feature==='clock'?2:3,cols=feature==='balcony'?2:3
   for(let row=0;row<rows;row++)for(let col=0;col<cols;col++)parts.windows.push(R(left+.065+col*(right-left-.12)/cols,(feature==='clock'?.46:.3)+row*.13,.075,.07))
  }
 }else{
  parts.roof=[kind==='shop'?s===0?P(['M',left-.02,.44],['Q',(left+right)/2,.25,right+.02,.44],['L',right,.53],['L',left,.53],['Z']):poly(left-.02,.44,left+.06,.34,right-.06,.34,right+.02,.44,right,.53,left,.53):poly(left-.03,top,(left+right)/2,roofTop,right+.03,top)]
  parts.door=[R((left+right)/2-.06,.64,.12,.25)]
  parts.windows=feature==='garage'?[R(left+.045,.56,.2,.33),R(right-.245,.56,.2,.33)]:[R(left+.055,.59,.14,.17),R(right-.195,.59,.14,.17)]
  if(kind==='shop')parts.awning=[L(left+.12,.4,left+.11,.51),L(left+.27,.37,left+.27,.52),L(right-.12,.4,right-.11,.51)]
  if(feature==='columns')parts.columns=[L(left+.025,.44,left+.025,.86),L(left+.22,.44,left+.22,.86),L(right-.22,.44,right-.22,.86),L(right-.025,.44,right-.025,.86)]
  if(feature==='curtain')parts.curtain=[P(['M',left+.05,.58],['Q',left+.13,.75,left+.18,.85]),P(['M',right-.05,.58],['Q',right-.13,.75,right-.18,.85])]
  parts.sign=sign(feature,(left+right)/2,kind==='shop'?.23:.43)
  if(feature==='bell'){
   parts.roof=[poly(left-.03,.34,(left+right)/2,.17,right+.03,.34)];parts.walls=[L(left,.34,left,bottom,right,bottom,right,.34)]
   parts.upperWindows=[R(left+.06,.4,.12,.095),R(right-.18,.4,.12,.095)];parts.sign=sign('bell',(left+right)/2,.24)
  }
  if(feature==='flower'){
   parts.roof=[P(['M',left-.04,.39],['Q',left+.08,.08,left+.24,.32],['Q',left+.4,.13,right+.04,.39],['Z'])];parts.windows=[E(left+.13,.66,.07,.085),E(right-.13,.66,.07,.085)];parts.sign=[]
  }
  if(feature==='cross'){
   parts.roof=[R(left-.02,.19,right-left+.04,.07)];parts.walls=[L(left,.26,left,bottom,right,bottom,right,.26)];parts.sign=cross((left+right)/2,.39,.07)
   parts.upperWindows=[R(left+.06,.34,.11,.11),R(right-.17,.34,.11,.11)];parts.door=[R((left+right)/2-.08,.65,.16,.24),L((left+right)/2,.65,(left+right)/2,.89)]
  }
  if(feature==='garage'){parts.roof=[R(left-.02,.32,right-left+.04,.06)];parts.garageLines=[L(left+.05,.65,left+.24,.65),L(right-.24,.65,right-.05,.65)];parts.watchtower=[R(left+.02,.1,.13,.22),R(left+.045,.15,.08,.08)]}
  if(feature==='shield'){parts.roof=[R(left-.02,.28,right-left+.04,.09)];parts.entry=[P(['M',.39,.64],['Q',.5,.47,.61,.64])];parts.sign=sign('shield',(left+right)/2,.43)}
  if(feature==='envelope'){parts.roof=[poly(left-.04,.35,left+.06,.19,right-.06,.19,right+.04,.35)];parts.mailbox=[roundBox(.04,.63,.08,.16,.02),L(.055,.68,.105,.68),L(.08,.79,.08,.91)]}
  if(feature==='station'){parts.roof=[P(['M',left-.04,.39],['C',left+.03,.07,right-.03,.07,right+.04,.39],['Z'])];parts.sign=sign('clock',(left+right)/2,.27);parts.canopy=[poly(left-.03,.56,right+.03,.56,right+.065,.63,left-.065,.63)]}
  if(feature==='terminal'){parts.roof=[P(['M',left-.04,.35],['Q',left+.1,.24,(left+right)/2,.33],['Q',right-.1,.24,right+.04,.35])];parts.windows=[R(left+.035,.53,right-left-.07,.19),L(left+.18,.53,left+.18,.72),L(right-.18,.53,right-.18,.72)];parts.sign=sign('terminal',(left+right)/2,.22)}
  if(kind==='shop'&&feature==='books')parts.display=[L(left+.08,.63,left+.08,.73),L(left+.12,.62,left+.12,.73),L(left+.16,.65,left+.16,.73)]
  if(kind==='shop'&&feature==='plant')parts.display=[leaf(left+.12,.57,.035,.13),leaf(right-.12,.58,.04,.13)]
  if(kind==='shop'&&feature==='cup')parts.table=[E(.83,.8,.1,.025),L(.83,.82,.83,.96)]
 }
 if(side&&feature!=='tree'&&feature!=='tank'){
  const [dx,dy]=side
  parts.side=[L(right,top,right+dx,top+dy,right+dx,bottom+dy,right,bottom)]
  if(kind==='home')parts.sideRoof=[L((left+right)/2,roofTop,(left+right)/2+dx,roofTop+dy,right+dx,top+dy)]
  if(s>0)parts.sideWindow=[poly(right+.04,.53,right+.12,.49,right+.12,.67,right+.04,.71)]
 }
 if(decor){parts.trim=[L(left-.015,.93,right+.015,.93),L(left+.035,top+.025,right-.035,top+.025)];if(kind!=='tower')parts.planter=[poly(left+.05,.79,left+.18,.79,left+.16,.85,left+.07,.85),leaf(left+.11,.71,.03,.08)];parts.keystone=[poly((left+right)/2-.03,.56,(left+right)/2+.03,.56,(left+right)/2+.025,.62,(left+right)/2-.025,.62)]}
 if(real){parts.structure=[L(left-.02,.91,right+.03,.91),L(left+.025,top+.025,right-.025,top+.025)];if(parts.windows.length&&feature!=='glass')parts.mullion=[L(left+.12,.6,left+.12,.72),L(right-.13,.6,right-.13,.72)];parts.masonry=[L(left+.02,.81,left+.085,.81),L(right-.08,.83,right-.02,.83),L(left+.03,.76,left+.03,.81)]}
 return {aspect:kind==='tower'?.85:1.25,parts}
}

function specialty(d,s,v){
 const f=d.feature,detail=s>0,parts={}
 if(d.kind==='bridge'){
  const y=v?.42:.5
  parts.deck=[L(.04,y,.96,y),L(.04,y+.08,.96,y+.08)]
  if(f==='cables'){
   parts.towers=[L(.26,.9,.26,.15,.3,.15,.3,.9),L(.7,.9,.7,.15,.74,.15,.74,.9)]
   parts.cables=[P(['M',.03,y],['Q',.15,y,.28,.19],['Q',.5,.65,.72,.19],['Q',.85,y,.97,y])]
   parts.hangers=[L(.4,.36,.4,y),...(v?[]:[L(.5,.42,.5,y)]),L(.6,.36,.6,y)]
  }else{
   parts.base=[L(.04,y+.08,.04,.84,.16,.84),L(.84,.84,.96,.84,.96,y+.08)]
   parts.arches=v?[arch(.16,y+.18,.25,.24),arch(.59,y+.18,.25,.24)]:[arch(.16,y+.13,.68,.21)]
  }
  if(detail)parts.rail=[L(.08,y-.12,.92,y-.12),...Array.from({length:5},(_,i)=>L(.12+i*.19,y-.12,.12+i*.19,y))]
  parts.water=[P(['M',.14,.94],['Q',.29,.87,.44,.94],['Q',.6,.87,.77,.94])]
 }else if(d.kind==='gate'){
  parts.piers=[R(.13,.35,.17,.57),R(.7,.35,.17,.57)];parts.lintel=[R(.07,.27,.86,.1)];parts.opening=[arch(.3,.43,.4,.49)]
  parts.roof=f==='battlement'?[L(.07,.27,.07,.16,.2,.16,.2,.23,.34,.23,.34,.16,.47,.16,.47,.23,.6,.23,.6,.16,.73,.16,.73,.23,.86,.23,.86,.16,.93,.16,.93,.27)]:[P(['M',.04,.27],['Q',.29,.22,.5,.09],['Q',.71,.22,.96,.27])]
  if(v)parts.wings=[L(.13,.64,.03,.67,.03,.92,.13,.92),L(.87,.64,.97,.67,.97,.92,.87,.92)]
  if(detail)parts.blocks=[L(.14,.55,.29,.55),L(.71,.55,.86,.55),L(.14,.75,.29,.75),L(.71,.75,.86,.75)]
 }else if(d.kind==='pagoda'){
  const levels=v?4:3
  parts.roofs=[];parts.walls=[];parts.windows=[]
  for(let i=0;i<levels;i++){
   const y=.25+i*(.6/levels),half=.15+i*.065
   parts.roofs.push(P(['M',.5-half-.045,y+.08],['Q',.5-half*.45,y+.04,.5,y-.075],['Q',.5+half*.45,y+.04,.5+half+.045,y+.08],['Z']))
   parts.walls.push(L(.5-half,y+.08,.5-half,y+.18,.5+half,y+.18,.5+half,y+.08))
   parts.windows.push(arch(.475,y+.1,.05,.08))
  }
  parts.finial=[L(.5,.09,.5,.15)]
  if(detail)parts.steps=[L(.19,.89,.81,.89),L(.15,.94,.85,.94)]
 }else if(d.kind==='pavilion'){
  const top=v?.27:.19
  parts.roof=f==='garden'?[poly(.08,.42,.5,top,.92,.42,.87,.48,.13,.48)]:[P(['M',.08,.42],['Q',.26,.4,.5,top],['Q',.74,.4,.92,.42],['L',.87,.48],['L',.13,.48],['Z'])]
  parts.posts=[L(.22,.48,.22,.87),L(.78,.48,.78,.87)];parts.steps=[L(.13,.87,.87,.87),L(.09,.94,.91,.94)]
  if(f==='temple'){parts.room=[R(.34,.54,.32,.33)];parts.door=[arch(.44,.65,.12,.22)]}
  else {parts.back=[L(.4,.49,.4,.76,.64,.76,.64,.49)];parts.rail=[L(.23,.71,.39,.71),L(.65,.71,.77,.71)]}
  if(detail)parts.tiles=[P(['M',.5,top+.05],['Q',.38,.39,.27,.41]),P(['M',.5,top+.05],['Q',.62,.39,.73,.41]),L(.3,.49,.3,.82),L(.7,.49,.7,.82)]
  if(s===1&&f==='garden')parts.vine=[P(['M',.21,.82],['Q',.07,.66,.21,.58],['Q',.32,.5,.2,.41])]
 }else if(d.kind==='dome'){
  const x=v?.43:.5
  parts.dome=[P(['M',.1,.66],['C',.09,.09,.91,.09,.9,.66],['Z'])]
  if(f==='ice'){parts.door=[P(['M',x-.12,.86],['L',x-.12,.61],['Q',x,.39,x+.12,.61],['L',x+.12,.86],['Z'])];parts.base=[L(.1,.66,.1,.86,x-.12,.86),L(x+.12,.86,.9,.86,.9,.66)]}
  else if(f==='felt'){parts.dome=[poly(.08,.42,.5,.16,.92,.42)];parts.base=[R(.12,.42,.76,.44)];parts.door=[R(x-.07,.63,.14,.23)]}
  else {parts.base=[R(.1,.66,.8,.22)];parts.door=[arch(x-.07,.7,.14,.18)];parts.windows=[R(.18,.71,.12,.1),R(.7,.71,.12,.1)]}
  if(f==='telescope')parts.telescope=[poly(.47,.34,.69,.2,.73,.25,.51,.39),L(.47,.34,.44,.51)]
  if(f==='planet')parts.planet=[E(.5,.44,.11,.1),P(['M',.39,.39],['C',.15,.43,.74,.65,.65,.43])]
  if(detail)parts.seams=f==='felt'?[L(.5,.16,.31,.4),L(.5,.16,.69,.4),L(.2,.47,.8,.47)]:[L(.19,.42,.81,.42),L(.12,.56,.88,.56),L(.38,.3,.36,.41),L(.63,.43,.66,.55)]
 }else if(f==='turbine'){
  const x=v?.43:.5,y=.38
  parts.tower=[poly(x-.025,y,x+.025,y,x+.065,.95,x-.065,.95)];parts.hub=[E(x,y,.04,.04)]
  parts.blades=[poly(x-.02,y-.03,x-.07,.06,x-.005,.07,x+.015,y-.035),poly(x+.03,y+.01,x+.38,y+.1,x+.34,y+.17,x+.01,y+.04),poly(x-.03,y+.025,x-.28,y+.29,x-.34,y+.24,x-.045,y-.005)]
  if(detail)parts.structure=[L(x-.025,.92,x-.01,.54),L(.24,.97,.75,.97)]
 }else if(f==='wheel'){
  const radius=v?.33:.3
  parts.wheel=[E(.5,.42,radius,radius),E(.5,.42,.045,.045)];parts.support=[L(.5,.45,.33,.94,.68,.94,.5,.45)];parts.spokes=[];parts.cabins=[]
  for(let i=0;i<6;i++){const a=i*Math.PI/3,x=.5+radius*Math.cos(a),y=.42+radius*Math.sin(a);parts.spokes.push(L(.5,.42,x,y));parts.cabins.push(R(x-.045,y,.09,.07))}
  if(detail)parts.base=[L(.26,.96,.74,.96)]
 }else if(f==='fountain'){
  parts.basin=[E(.5,.8,.39,.09),P(['M',.11,.8],['Q',.2,.98,.5,.95],['Q',.8,.98,.89,.8])];parts.pillar=[L(.46,.78,.46,.46,.54,.46,.54,.78)];parts.bowl=[P(['M',.28,.4],['Q',.5,.7,.72,.4],['Z'])]
  parts.water=[P(['M',.5,.42],['C',.49,.12,.21,.16,.2,.47]),P(['M',.5,.42],['C',.51,.12,.79,.16,.8,.47])]
  if(v)parts.jet=[P(['M',.5,.4],['Q',.35,.015,.31,.24]),P(['M',.5,.4],['Q',.65,.015,.69,.24])]
  if(detail)parts.ripples=[P(['M',.22,.81],['Q',.5,.91,.78,.81]),L(.49,.59,.49,.74)]
 }else if(f==='well'){
  parts.base=[E(.5,.69,.25,.08),L(.25,.69,.25,.9),L(.75,.69,.75,.9),P(['M',.25,.9],['Q',.5,1,.75,.9])];parts.posts=[L(.19,.82,.19,.3),L(.81,.82,.81,.3)];parts.roof=[poly(.08,.32,.5,v?.09:.14,.92,.32)];parts.rope=[L(.25,.46,.75,.46),L(.51,.46,.51,.74)]
  if(detail)parts.stones=[L(.27,.79,.72,.79),L(.38,.77,.38,.89),L(.63,.8,.63,.91)]
 }else if(f==='stadium'){
  parts.outer=[E(.5,.53,.43,v?.28:.22),P(['M',.07,.53],['L',.07,.72],['C',.16,.96,.84,.96,.93,.72],['L',.93,.53])];parts.field=[E(.5,.54,.3,.15),L(.5,.4,.5,.68),E(.5,.54,.06,.07)]
  parts.lights=[L(.14,.33,.12,.09,.24,.09),L(.84,.33,.87,.09,.75,.09)]
  if(detail)parts.seats=[P(['M',.14,.68],['Q',.5,.87,.86,.68]),L(.25,.77,.25,.85),L(.75,.77,.75,.85)]
 }else if(f==='carousel'){
  parts.roof=[P(['M',.09,.37],['Q',.28,.35,.5,v?.06:.12],['Q',.72,.35,.91,.37],['Z'])];parts.base=[E(.5,.85,.41,.08)];parts.poles=[L(.27,.39,.27,.83),L(.73,.39,.73,.83)]
  parts.horses=[P(['M',.15,.6],['L',.19,.49],['L',.25,.48],['L',.31,.54],['L',.4,.55],['L',.39,.65],['L',.31,.65],['L',.29,.73],['L',.25,.73],['L',.24,.64],['L',.17,.63]),P(['M',.59,.6],['L',.63,.49],['L',.69,.48],['L',.75,.54],['L',.84,.55],['L',.83,.65],['L',.75,.65],['L',.73,.73],['L',.69,.73],['L',.68,.64],['L',.61,.63])]
  if(detail)parts.panels=[L(.5,.15,.27,.35),L(.5,.15,.73,.35),L(.12,.9,.88,.9)]
 }
 // Styles change construction: soft curves, ornamental trim, or structural contours.
 if(s===0)parts.baseLine=[P(['M',.14,.975],['Q',.5,.94,.86,.975])]
 if(s===1)parts.ornament=[P(['M',.04,.9],['Q',.02,.8,.08,.84]),P(['M',.92,.84],['Q',.98,.8,.96,.9])]
 if(s===2)parts.ground=[L(.06,.98,.94,.98),L(.09,.96,.23,.96)]
 return {aspect:d.kind==='pagoda'?.85:d.kind==='bridge'?1.5:1.15,parts}
}
export function addArchitectureRecipes(add){for(const [id,name,kind,feature] of buildings)registerStudio(add,{id,name,kind,feature,category:'architecture',related:['building','建筑','city',kind],aliases:aliases[id]??[],poses:['正面结构','转角或展开结构']},building)}
