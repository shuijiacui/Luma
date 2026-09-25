import { P,E,L,R,poly,roundBox,limb,registerStudio } from './forms.mjs'
import { atelierPerson } from './people-atelier.mjs'

// Roles are distinguished by equipment, clothing and gesture, not by gender.
const definitions=[
 ['shorthairedchild','短发孩子','portrait','short'],['longhairedchild','长发孩子','portrait','long'],
 ['curlyhairedchild','卷发孩子','portrait','curly'],['braidedchild','辫子女孩','portrait','braid'],
 ['glasseschild','戴眼镜的孩子','portrait','glasses'],['capchild','戴帽子的孩子','portrait','cap'],
 ['grandmother','奶奶','portrait','bun'],['grandfather','爷爷','portrait','bald'],
 ['adultwoman','妈妈','portrait','bob'],['adultman','爸爸','portrait','parted'],
 ['baby','小宝宝','portrait','baby'],['toddler','幼儿','portrait','tuft'],
 ['teacher','老师','book','short'],['doctor','医生','stethoscope','parted'],['nurse','护士','medicalbag','bob'],
 ['firefighter','消防员','hose','helmet'],['policeofficer','警察','badge','cap'],['chef','厨师','spoon','chefhat'],
 ['baker','面包师','bread','chefhat'],['gardener','园丁','watering','hat'],['farmer','农民','rake','hat'],
 ['scientist','科学家','flask','glasses'],['engineer','工程师','blueprint','helmet'],['constructionworker','建筑工人','hammer','helmet'],
 ['artist','画家','palette','beret'],['photographer','摄影师','camera','short'],['guitarist','吉他手','guitar','curly'],
 ['violinist','小提琴手','violin','long'],['pianist','钢琴家','piano','parted'],['singer','歌手','microphone','bob'],
 ['dancer','舞者','ribbon','long'],['ballerina','芭蕾舞者','tutu','bun'],['pilot','飞行员','plane','cap'],
 ['sailor','水手','anchor','sailorhat'],['mailcarrier','邮递员','letter','cap'],['librarian','图书管理员','books','glasses'],
 ['readingchild','读书的孩子','reading','short'],['paintingchild','画画的孩子','easel','braid'],
 ['runningchild','跑步的孩子','running','tuft'],['soccerplayer','足球运动员','football','short'],
 ['basketballplayer','篮球运动员','basketball','curly'],['skater','滑冰者','skates','bun'],
 ['cyclingchild','骑车的孩子','bicycle','helmet'],['hiker','登山者','hiking','hat'],
 ['campingchild','露营的孩子','lantern','cap'],['kiteflyer','放风筝的孩子','kite','tuft'],
 ['umbrellauser','撑伞的人','umbrella','bob'],['wheelchairuser','坐轮椅的人','wheelchair','short'],
]
const aliases={shorthairedchild:['小男孩','男孩','boy'],longhairedchild:['小女孩','女孩','girl'],grandmother:['外婆','姥姥','grandma'],grandfather:['爷爷','外公','姥爷','grandpa'],adultwoman:['母亲','mother','mom'],adultman:['父亲','father','dad'],baby:['婴儿'],policeofficer:['police officer'],constructionworker:['工人','construction worker'],readingchild:['读书的小孩','reading child'],paintingchild:['画画的小孩'],soccerplayer:['踢足球的人','soccer player'],basketballplayer:['打篮球的人','basketball player'],cyclingchild:['骑自行车的人'],umbrellauser:['打伞的人'],wheelchairuser:['wheelchair user']}

function hair(type,x,y,rx,ry){
 if(['helmet','cap','chefhat','hat','beret','sailorhat'].includes(type)){
  if(type==='chefhat')return [P(['M',x-rx,y-ry*.55],['L',x-rx,y-ry*1.35],['C',x-rx*1.5,y-ry*2,x-rx*.3,y-ry*2,x,y-ry*1.65],['C',x+rx*.4,y-ry*2,x+rx*1.5,y-ry*1.7,x+rx,y-ry*1.3],['L',x+rx,y-ry*.55],['Z'])]
  if(type==='hat')return [P(['M',x-rx*.7,y-ry*.7],['L',x-rx*.5,y-ry*1.6],['Q',x,y-ry*1.35,x+rx*.5,y-ry*1.6],['L',x+rx*.7,y-ry*.7]),E(x,y-ry*.7,rx*1.5,ry*.16)]
  if(type==='beret')return [P(['M',x-rx,y-ry*.55],['C',x-rx*1.5,y-ry*1.7,x+rx*1.7,y-ry*1.6,x+rx,y-ry*.55],['Z'])]
  return [P(['M',x-rx*1.1,y-ry*.6],['Q',x-rx,y-ry*1.5,x,y-ry*1.5],['Q',x+rx,y-ry*1.5,x+rx*1.1,y-ry*.6],['Z']),L(x-rx*1.2,y-ry*.55,x+rx*1.35,y-ry*.55)]
 }
 if(type==='bald')return [P(['M',x-rx,y],['Q',x-rx*.9,y-ry*.8,x-rx*.6,y-ry*.85]),P(['M',x+rx*.6,y-ry*.85],['Q',x+rx*.9,y-ry*.8,x+rx,y])]
 if(type==='baby'||type==='tuft')return [P(['M',x-rx*.2,y-ry*.9],['Q',x+rx*.5,y-ry*1.6,x+rx*.3,y-ry*.85])]
 if(type==='curly')return [P(['M',x-rx,y],['Q',x-rx*1.5,y-ry*.8,x-rx*.8,y-ry*.8],['Q',x-rx*.9,y-ry*1.6,x-rx*.2,y-ry*1.1],['Q',x+rx*.5,y-ry*1.7,x+rx*.65,y-ry],['Q',x+rx*1.5,y-ry*1.1,x+rx,y])]
 if(type==='long'||type==='braid'||type==='bob')return [P(['M',x-rx,y+ry*(type==='bob'?.4:.85)],['Q',x-rx*1.5,y-ry*1.4,x,y-ry*1.25],['Q',x+rx*1.5,y-ry*1.4,x+rx,y+ry*(type==='bob'?.4:.85)]),P(['M',x-rx,y-ry*.1],['Q',x-rx*.4,y-ry*.3,x-rx*.05,y-ry*.8],['Q',x+rx*.4,y-ry*.35,x+rx,y-ry*.1])]
 if(type==='bun')return [E(x,y-ry*1.2,rx*.45,ry*.38),P(['M',x-rx,y-ry*.1],['Q',x-rx,y-ry*1.2,x,y-ry*.9],['Q',x+rx,y-ry*1.2,x+rx,y-ry*.1])]
 if(type==='parted')return [P(['M',x-rx,y],['Q',x-rx*1.1,y-ry*1.2,x+rx*.35,y-ry*1.1],['Q',x+rx*1.1,y-ry*.9,x+rx,y]),P(['M',x+rx*.3,y-ry*.95],['Q',x-rx*.1,y-ry*.4,x-rx*.85,y-ry*.25])]
 return [P(['M',x-rx,y-ry*.05],['Q',x-rx*1.1,y-ry*1.4,x+rx*.15,y-ry*1.12],['Q',x+rx*1.1,y-ry*1.1,x+rx,y],['L',x+rx*.35,y-ry*.7],['Q',x-rx*.1,y-ry*.25,x-rx*.8,y-ry*.3])]
}

function portrait(d,s,v){
 const x=v?.47:.5, y=.4, rx=d.id==='baby'?.28:[.25,.22,.2][s], ry=d.id==='baby'?.23:[.235,.26,.28][s], type=d.hair
 const parts={head:[P(['M',x-rx,y-.02],['Q',x-rx*.95,y-ry,x,y-ry],['Q',x+rx*.95,y-ry,x+rx,y-.02],['Q',x+rx*.86,y+ry*.9,x,y+ry],['Q',x-rx*.86,y+ry*.9,x-rx,y-.02],['Z'])],
  hair:hair(type,x,y,rx,ry),neck:[L(x-.07,y+ry*.93,x-.08,.76),L(x+.07,y+ry*.93,x+.08,.76)],
  body:[P(['M',.42,.73],['Q',.17,.73,.13,.96],['L',.87,.96],['Q',.83,.73,.58,.73])],
  eyes:s===0?[E(x-.09,y,.025,.025),E(x+.09,y,.025,.025)]:[P(['M',x-.13,y],['Q',x-.09,y-.035,x-.05,y]),P(['M',x+.05,y],['Q',x+.09,y-.035,x+.13,y])],
  nose:[P(['M',x+(v?.025:0),y+.025],['L',x-.025,y+.1],['Q',x,y+.115,x+.03,y+.09])],
  mouth:[P(['M',x-.06,y+.16],['Q',x,y+(v?.17:.21),x+.06,y+.16])],
  collar:[L(.32,.77,.42,.86,.5,.78,.58,.86,.68,.77)],
 }
 if(type==='glasses')parts.glasses=[E(x-.09,y,.07,.055),E(x+.09,y,.07,.055),L(x-.02,y,x+.02,y)]
 if(type==='braid')parts.braids=[P(['M',x-rx,.54],['Q',x-rx-.09,.72,x-rx+.02,.81],['L',x-rx-.08,.87]),P(['M',x+rx,.54],['Q',x+rx+.09,.72,x+rx-.02,.81],['L',x+rx+.08,.87])]
 if(type==='baby')parts.collar=[P(['M',.37,.75],['Q',.5,.85,.63,.75],['L',.63,.92],['Q',.5,1,.37,.92],['Z'])]
 if(s>0){parts.brows=[L(x-.13,y-.065,x-.05,y-.07),L(x+.05,y-.07,x+.13,y-.065)];parts.fold=[P(['M',.25,.83],['Q',.3,.86,.28,.95]),P(['M',.72,.84],['Q',.68,.9,.72,.95])]}
 if(s===2)parts.ears=[P(['M',x-rx,.38],['Q',x-rx-.07,.43,x-rx*.85,.49]),P(['M',x+rx,.38],['Q',x+rx+.07,.43,x+rx*.85,.49])]
 if(s>0){parts.eyes=[P(['M',x-.13,y],['Q',x-.09,y-.035,x-.05,y],['Q',x-.09,y+.02,x-.13,y]),P(['M',x+.05,y],['Q',x+.09,y-.035,x+.13,y],['Q',x+.09,y+.02,x+.05,y])];parts.pupils=[E(x-.09,y,.012,.014),E(x+.09,y,.012,.014)]}
 if(type==='bun'||type==='bald')parts.expression=[P(['M',x-.12,y+.08],['Q',x-.09,y+.1,x-.06,y+.08]),P(['M',x+.06,y+.08],['Q',x+.09,y+.1,x+.12,y+.08])]
 if(v){
  parts.head=[P(['M',x-rx,y-.02],['Q',x-rx*.95,y-ry,x,y-ry],['Q',x+rx*.65,y-ry,x+rx*.66,y-ry*.12],['L',x+rx*.98,y+ry*.17],['L',x+rx*.64,y+ry*.25],['Q',x+rx*.59,y+ry*.9,x-.015,y+ry],['Q',x-rx*.9,y+ry*.65,x-rx,y-.02],['Z'])]
  parts.eyes=[s===0?E(x+.035,y,.026,.022):P(['M',x-.005,y],['Q',x+.035,y-.035,x+.075,y],['Q',x+.035,y+.02,x-.005,y])]
  parts.nose=[];parts.mouth=[P(['M',x+.04,y+.16],['Q',x+.08,y+.18,x+.12,y+.155])]
  parts.hair=hair(type,x-.025,y,rx*.9,ry)
  if(s>0){parts.pupils=[E(x+.04,y,.012,.014)];parts.brows=[L(x-.01,y-.065,x+.07,y-.065)]}
  if(type==='glasses')parts.glasses=[E(x+.035,y,.065,.055),L(x-.15,y-.015,x-.03,y)]
  if(s===2)parts.ears=[P(['M',x-rx*.65,.39],['Q',x-rx*.95,.35,x-rx*.85,.48],['Q',x-rx*.55,.52,x-rx*.58,.45])]
 }
 return {aspect:.9,parts}
}

function equipment(kind,v,s){
 const x=v?.66:.72,y=v?.48:.56
 switch(kind){
 case 'book':case 'reading':case 'books':return {book:[P(['M',.31,.48],['Q',.42,.45,.5,.5],['Q',.58,.45,.69,.48],['L',.67,.65],['Q',.56,.63,.5,.67],['Q',.44,.63,.33,.65],['Z']),L(.5,.5,.5,.67)],pages:s?[L(.36,.53,.45,.55),L(.55,.55,.64,.53)]:[]}
 case 'stethoscope':return {stethoscope:[P(['M',.43,.36],['L',.42,.49],['Q',.48,.58,.53,.49],['L',.54,.36]),L(.49,.53,.56,.6),E(.59,.6,.028,.025)]}
 case 'medicalbag':return {bag:[R(x-.07,y,.18,.16),P(['M',x-.025,y],['Q',x+.02,y-.1,x+.065,y])],mark:[L(x+.02,y+.035,x+.02,y+.12),L(x-.025,y+.08,x+.065,y+.08)]}
 case 'hose':return {hose:[P(['M',.7,.5],['C',.97,.5,.91,.85,.7,.84],['Q',.6,.83,.67,.74]),poly(.63,.46,.73,.44,.76,.49,.65,.52)]}
 case 'badge':return {badge:[poly(.47,.42,.55,.42,.55,.49,.51,.52,.47,.49)],belt:[L(.38,.62,.62,.62)],radio:[R(.68,.47,.085,.13),L(.72,.47,.72,.4)]}
 case 'spoon':return {spoon:[E(x,y-.15,.045,.07),L(x,y-.08,x,y+.18)],apron:[L(.43,.43,.39,.67,.61,.67,.57,.43)]}
 case 'bread':return {tray:[L(.26,.63,.76,.63)],bread:[P(['M',.33,.61],['C',.25,.4,.68,.4,.66,.61],['Z'])],cuts:[L(.4,.49,.38,.56),L(.5,.47,.48,.55),L(.6,.5,.57,.56)]}
 case 'watering':return {can:[poly(.68,.56,.84,.56,.87,.72,.66,.72),L(.67,.64,.55,.59,.54,.63,.67,.71),P(['M',.84,.57],['C',.98,.49,.98,.71,.86,.68])]}
 case 'rake':return {tool:[L(x,.38,x,.9),L(x-.12,.38,x+.12,.38),L(x-.1,.31,x-.1,.38),L(x,.31,x,.38),L(x+.1,.31,x+.1,.38)]}
 case 'flask':return {flask:[P(['M',x-.025,y-.11],['L',x+.025,y-.11],['L',x+.025,y-.015],['L',x+.09,y+.14],['Q',x,y+.18,x-.09,y+.14],['L',x-.025,y-.015],['Z']),L(x-.05,y+.07,x+.05,y+.07)]}
 case 'blueprint':return {plan:[poly(.29,.48,.7,.46,.74,.66,.3,.69),L(.37,.62,.37,.55,.46,.5,.55,.55,.55,.62),L(.6,.51,.66,.61)]}
 case 'hammer':return {hammer:[poly(x-.02,.5,x+.02,.5,x+.02,.74,x-.02,.74),poly(x-.1,.45,x+.1,.45,x+.1,.51,x-.1,.51)]}
 case 'palette':return {palette:[P(['M',.66,.54],['C',.6,.38,.91,.4,.86,.59],['Q',.81,.65,.75,.58],['Q',.7,.62,.66,.54],['Z']),E(.74,.47,.017,.02),E(.82,.5,.018,.02)],brush:[L(.28,.56,.23,.32,.21,.29)]}
 case 'camera':return {camera:[roundBox(.36,v?.34:.44,.28,.16,.025),E(.5,v?.42:.52,.06,.05),L(.4,v?.34:.44,.42,v?.3:.4,.52,v?.3:.4,.55,v?.34:.44)]}
 case 'guitar':return {guitar:[P(['M',.45,.51],['C',.28,.47,.29,.63,.36,.66],['C',.19,.79,.53,.85,.55,.72],['Q',.6,.64,.51,.59],['L',.76,.36],['L',.71,.32],['Z']),E(.44,.65,.045,.04),L(.42,.72,.74,.35)]}
 case 'violin':return {violin:[P(['M',.45,.39],['Q',.31,.33,.33,.44],['Q',.42,.45,.34,.53],['Q',.4,.64,.53,.51],['Q',.45,.49,.55,.43],['L',.7,.32],['L',.67,.29],['Z']),L(.33,.39,.74,.58)]}
 case 'piano':return {piano:[poly(.13,.62,.82,.62,.9,.72,.2,.72),L(.2,.72,.2,.91),L(.83,.72,.83,.91)],keys:[L(.3,.63,.32,.71),L(.42,.63,.44,.71),L(.54,.63,.56,.71),L(.66,.63,.68,.71)]}
 case 'microphone':return {microphone:[E(x,y-.1,.035,.048),L(x,y-.052,x,.91),L(x-.1,.92,x+.1,.92)]}
 case 'ribbon':return {ribbon:[P(['M',.73,.48],['C',.95,.24,.99,.59,.83,.58],['C',.65,.63,.97,.81,.88,.92])]}
 case 'tutu':return {skirt:[P(['M',.38,.59],['Q',.28,.69,.22,.73],['Q',.5,.84,.78,.73],['Q',.72,.69,.62,.59]),L(.41,.62,.37,.75),L(.59,.62,.63,.75)]}
 case 'plane':return {wings:[poly(.42,.45,.49,.47,.57,.43,.53,.49,.46,.51)],tie:[poly(.49,.36,.52,.36,.53,.54,.5,.57,.48,.54)]}
 case 'anchor':return {anchor:[E(.51,.46,.025,.025),L(.51,.49,.51,.61),P(['M',.43,.54],['Q',.43,.67,.51,.61],['Q',.59,.67,.59,.54]),L(.44,.5,.58,.5)]}
 case 'letter':return {satchel:[roundBox(.6,.55,.22,.17,.025),L(.38,.36,.69,.56)],letter:[R(.21,.48,.16,.12),L(.21,.48,.29,.55,.37,.48)]}
 case 'easel':return {easel:[L(.7,.35,.61,.92),L(.7,.35,.89,.92),R(.59,.42,.28,.25),L(.57,.68,.9,.68)]}
 case 'football':return {ball:[E(v?.75:.27,.85,.09,.077),poly(v?.73:.25,.8,v?.78:.3,.84,v?.75:.27,.89,v?.7:.22,.85)]}
 case 'basketball':return {ball:[E(x,.49,.105,.089),P(['M',x-.09,.45],['Q',x,.55,x+.09,.45]),P(['M',x-.06,.56],['Q',x+.015,.48,x+.04,.41])]}
 case 'skates':return {blades:[L(.29,.95,.48,.95,.5,.92),L(.59,.95,.79,.95,.81,.92)]}
 case 'bicycle':return {wheels:[E(.22,.8,.155,.132),E(.79,.8,.155,.132)],frame:[L(.22,.8,.4,.6,.57,.8,.22,.8),L(.4,.6,.7,.6,.57,.8),L(.79,.8,.68,.52,.79,.5)]}
 case 'hiking':return {pack:[P(['M',.34,.39],['Q',.19,.36,.19,.58],['L',.34,.6])],pole:[L(.76,.45,.8,.93),L(.72,.47,.8,.45)]}
 case 'lantern':return {lantern:[roundBox(x-.06,.64,.14,.18,.02),P(['M',x-.03,.64],['Q',x+.01,.49,x+.05,.64]),L(x-.06,.69,x+.08,.69),L(x+.01,.7,x+.01,.79)]}
 case 'kite':return {kite:[poly(.83,.09,.96,.21,.84,.32,.71,.21),P(['M',.84,.32],['Q',.99,.55,.72,.49]),L(.83,.09,.84,.32)]}
 case 'umbrella':return {umbrella:[P(['M',.49,.24],['C',.48,.01,.98,.01,.97,.24],['Q',.89,.17,.81,.24],['Q',.73,.17,.65,.24],['Q',.57,.17,.49,.24]),P(['M',.73,.1],['L',.73,.58],['Q',.73,.67,.67,.61])]}
 case 'wheelchair':return {wheel:[E(.52,.78,.19,.162),E(.82,.91,.055,.047)],chair:[L(.32,.47,.34,.7,.74,.7,.81,.85),L(.29,.43,.33,.43,.33,.65),L(.57,.64,.73,.64)]}
 default:return {}
 }
}

function figure(d,s,v){
 if(s>0)return atelierPerson(d,s,v,equipment)
 if(d.kind==='portrait')return portrait(d,s,v)
 const active=['running','football','basketball','skates','ribbon','tutu','hiking'].includes(d.kind)
 const seated=['piano','bicycle','wheelchair'].includes(d.kind)||(d.kind==='reading'&&!v)
 const holding=['book','reading','books','bread','blueprint','camera'].includes(d.kind)
 const cx=v&&active?.46:.5,ry=[.125,.105,.085][s],rx=ry*1.03,hy=.2,neckY=hy+ry+.025,shoulder=neckY+.04,waist=holding?.69:.62
 const leftHand=d.kind==='reading'||d.kind==='camera'?[.36,.55]:v?[.22,.41]:[.28,.57]
 const rightHand=['book','reading','camera','bread','blueprint'].includes(d.kind)?[.65,.55]:v?[.7,.5]:[.73,.6]
 const knees=seated?[[.37,.72],[.65,.71]]:v&&(active||holding)?[[.3,.75],[.68,.75]]:[[.42,.77],[.59,.77]]
 const feet=seated?[[.39,.9],[.77,.88]]:v&&(active||holding)?[[.19,.91],[.76,.87]]:[[.39,.92],[.62,.92]]
 const parts={
  head:[P(['M',cx-rx,hy],['C',cx-rx,hy-ry*1.3,cx+rx,hy-ry*1.3,cx+rx,hy],['Q',cx+rx*.8,hy+ry,cx,hy+ry],['Q',cx-rx*.8,hy+ry,cx-rx,hy],['Z'])],
  hair:hair(d.hair,cx,hy,rx,ry),eyes:s===0?[E(cx-.047,hy,.012,.014),E(cx+.047,hy,.012,.014)]:[P(['M',cx-.065,hy],['Q',cx-.045,hy-.014,cx-.025,hy]),P(['M',cx+.025,hy],['Q',cx+.045,hy-.014,cx+.065,hy])],
  mouth:[P(['M',cx-.028,hy+ry*.58],['Q',cx,hy+ry*.8,cx+.028,hy+ry*.58])],
  neck:[L(cx-.035,hy+ry,cx-.035,neckY),L(cx+.035,hy+ry,cx+.035,neckY)],
  body:[P(['M',cx-.035,neckY],['L',.37,shoulder],['Q',.39,.51,.37,waist],['L',.64,waist],['Q',.61,.49,.63,shoulder],['L',cx+.035,neckY])],
  arms:[limb([.37,shoulder],[.28,shoulder+.1],leftHand,[.04,.033,.027][s]),limb([.63,shoulder],[.73,shoulder+.08],rightHand,[.04,.033,.027][s])],
  legs:[limb([.43,waist],knees[0],feet[0],.04),limb([.58,waist],knees[1],feet[1],.04)],
  ...equipment(d.kind,v,s),
 }
 // Drawing furniture is in front of the seated figure; omit hidden lower limbs.
 if(d.kind==='piano')delete parts.legs
 if(holding){parts.body=[L(.37,.47,.37,shoulder,cx-.035,neckY),L(cx+.035,neckY,.63,shoulder,.63,.47)];parts.arms=[limb([.37,shoulder],[.27,.48],[.33,.55],.03),limb([.63,shoulder],[.73,.48],[.67,.55],.03)]}
 if(d.kind==='umbrella'){
  // The canopy is above the head, not crossing the face.
  parts.umbrella=[P(['M',.12,.08],['C',.17,-.1,.83,-.1,.88,.08],['Q',.77,.025,.65,.08],['Q',.53,.025,.42,.08],['Q',.27,.025,.12,.08]),P(['M',.7,.025],['L',.7,.57],['Q',.7,.65,.64,.6])]
 }
 if(d.kind==='tutu')parts.body=[P(['M',cx-.035,neckY],['L',.4,shoulder],['Q',.43,.5,.38,.59],['L',.62,.59],['Q',.57,.5,.6,shoulder],['L',cx+.035,neckY])]
 if(d.hair==='glasses')parts.glasses=[E(cx-.047,hy,.033,.026),E(cx+.047,hy,.033,.026),L(cx-.014,hy,cx+.014,hy)]
 if(s>0)parts.clothing=[L(.42,shoulder+.035,.5,shoulder+.065,.58,shoulder+.035),...(holding?[]:[L(.49,.56,.53,.59)])]
 if(s===1&&!holding)parts.cuffs=[L(.32,shoulder+.12,.37,shoulder+.14),L(.65,shoulder+.14,.7,shoulder+.12)]
 if(s===2&&!['piano','bicycle','wheelchair'].includes(d.kind))parts.shoes=[P(['M',feet[0][0]-.04,feet[0][1]],['Q',feet[0][0]-.1,feet[0][1]+.04,feet[0][0]+.035,feet[0][1]+.035],['L',feet[0][0]+.04,feet[0][1]]),P(['M',feet[1][0]-.04,feet[1][1]],['L',feet[1][0]-.035,feet[1][1]+.035],['Q',feet[1][0]+.1,feet[1][1]+.04,feet[1][0]+.04,feet[1][1]])]
 if(s===2)parts.nose=[L(cx,hy+.01,cx-.012,hy+.035,cx+.012,hy+.04)]
 if(d.id==='teacher')parts.tie=[poly(.49,neckY+.035,.52,neckY+.035,.54,.445,.51,.46,.48,.445)]
 return {aspect:.85,parts}
}
export function addPeopleRecipes(add){for(const [id,name,kind,hair] of definitions)registerStudio(add,{id,name,kind,hair,category:'people',related:['character','person','人物',kind==='portrait'?'family':'activity'],aliases:aliases[id]??[],poses:kind==='portrait'?['正面肖像','侧转肖像']:['静态姿势','动作姿势']},figure)}
