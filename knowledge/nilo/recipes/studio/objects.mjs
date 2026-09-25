import {P,E,L,R,poly,roundBox,leaf,flower,registerStudio} from './forms.mjs'
const objects=[
 ['backpack','双肩包'],['sneaker','运动鞋'],['rainboot','雨靴'],['strawhat','草帽'],['mittens','连指手套'],['scarf','围巾'],['lantern','提灯'],['desk','书桌'],
 ['lamp','台灯'],['armchair','扶手椅'],['sofa','沙发'],['bed','床'],['wardrobe','衣柜'],['bookshelf','书架'],['window','窗户'],['door','门'],
 ['violin','小提琴'],['piano','钢琴'],['trumpet','小号'],['flute','长笛'],['camera','相机'],['telescope','望远镜'],['microscope','显微镜'],['sewingmachine','缝纫机'],
 ['teacupset','茶具'],['fruitbasket','水果篮'],['vase','花瓶'],['bottle','玻璃瓶'],['breadbasket','面包篮'],['birthdaytable','生日餐桌'],['scooter','滑板车'],['hotairballoon','热气球'],
]
const aliases={backpack:['书包','背包'],sneaker:['球鞋','鞋子'],rainboot:['雨鞋','rain boot'],strawhat:['遮阳帽','straw hat'],mittens:['手套','mitten'],armchair:['单人沙发','arm chair'],wardrobe:['橱柜'],bookshelf:['书柜','bookcase'],violin:['提琴'],piano:['钢琴乐器'],camera:['照相机'],sewingmachine:['sewing machine'],teacupset:['茶壶茶杯组合','tea set'],fruitbasket:['果篮','fruit basket'],breadbasket:['bread basket'],birthdaytable:['生日聚餐','birthday table'],hotairballoon:['hot air balloon']}

function object(d,s,v){
 const k=d.id,soft=s===0,detail=s>0,parts={}
 const box=soft?roundBox:R
 switch(k){
 case 'backpack':
  parts.body=[P(['M',.23,.38],['C',.17,.03,.83,.03,.77,.38],['L',.8,.88],['Q',.5,1,.2,.88],['Z'])];parts.pocket=[box(.3,.6,.4,.25,.04)];parts.top=[P(['M',.39,.16],['Q',.5,.01,.61,.16])];parts.straps=v?[L(.2,.36,.1,.34,.08,.83,.2,.85),L(.8,.36,.9,.34,.92,.83,.8,.85)]:[L(.23,.48,.15,.55,.15,.75,.21,.75)]
  if(detail)parts.seams=[P(['M',.28,.38],['Q',.5,.3,.72,.38]),L(.34,.66,.66,.66),E(.66,.69,.014,.025)]
  break
 case 'sneaker':
  parts.body=[P(['M',.13,.5],['L',.17,.25],['Q',.29,.47,.47,.3],['Q',.54,.57,.83,.61],['Q',.98,.65,.93,.83],['L',.12,.83],['Z'])];parts.sole=[L(.12,.76,.94,.76)];parts.laces=[L(.4,.41,.53,.43),L(.45,.49,.59,.5),L(.51,.57,.67,.59)]
  parts.patch=v?[poly(.19,.58,.39,.58,.34,.69,.19,.69)]:[P(['M',.19,.52],['Q',.35,.74,.49,.62])]
  if(detail)parts.seams=[P(['M',.63,.62],['Q',.73,.66,.76,.75]),L(.17,.8,.9,.8)]
  break
 case 'rainboot':
  parts.body=[P(['M',.29,.11],['L',.64,.11],['L',.62,.59],['Q',.69,.65,.83,.66],['C',1,.67,.98,.85,.85,.87],['L',.27,.87],['Z'])];parts.cuff=[L(.3,.2,.63,.2)];parts.sole=[L(.28,.81,.92,.81)];parts.pattern=v?[flower(.46,.42,.09,5)]:[E(.46,.43,.09,.11)]
  if(detail)parts.seam=[P(['M',.35,.24],['Q',.32,.58,.36,.76]),L(.65,.68,.75,.69)]
  break
 case 'strawhat':
  parts.brim=[E(.5,v?.65:.7,.44,v?.18:.13)];parts.crown=[P(['M',.26,.63],['Q',.28,.12,.5,.2],['Q',.74,.12,.75,.63],['Q',.5,.76,.26,.63],['Z'])];parts.band=[P(['M',.28,.52],['Q',.5,.66,.72,.52])]
  if(detail)parts.weave=[P(['M',.35,.27],['Q',.3,.43,.33,.54]),P(['M',.65,.27],['Q',.7,.43,.67,.54]),P(['M',.11,.69],['Q',.5,.9,.88,.7])]
  break
 case 'mittens':
  parts.body=[P(['M',.26,.78],['L',.2,.47],['C',.1,.1,.54,.07,.56,.32],['L',.58,.47],['C',.73,.21,.85,.48,.68,.62],['L',.63,.79],['Z'])];parts.cuff=[box(.26,.78,.38,.12,.02)];parts.pattern=v?[flower(.4,.47,.09,6)]:[L(.3,.5,.43,.4,.54,.5)]
  if(detail)parts.knit=[L(.32,.8,.33,.88),L(.42,.8,.43,.88),L(.52,.8,.53,.88),P(['M',.29,.3],['Q',.27,.41,.32,.62])]
  break
 case 'scarf':
  parts.body=v?[P(['M',.25,.17],['Q',.75,.01,.73,.35],['L',.7,.86],['L',.5,.84],['L',.54,.39],['L',.4,.86],['L',.2,.8],['L',.34,.34],['Q',.08,.4,.25,.17],['Z'])]:[P(['M',.18,.22],['Q',.5,.01,.8,.25],['L',.72,.46],['L',.57,.4],['L',.72,.86],['L',.5,.91],['L',.34,.41],['L',.2,.49],['Z'])]
  parts.ends=[L(.51,.85,.53,.97),L(.61,.84,.63,.96)];if(detail)parts.folds=[P(['M',.3,.27],['Q',.5,.18,.69,.3]),L(.47,.5,.62,.48),L(.5,.65,.67,.62)]
  break
 case 'lantern':
  parts.body=[poly(.25,.35,.75,.35,.81,.82,.19,.82),E(.5,.84,.32,.075)];parts.roof=[poly(.2,.35,.38,.18,.62,.18,.8,.35)];parts.handle=[P(['M',.35,.2],['C',.24,.02,.76,.02,.65,.2])];parts.flame=[P(['M',.5,.7],['C',.3,.62,.54,.49,.5,.42],['C',.74,.62,.61,.75,.5,.7])];parts.panes=[L(.3,.4,.27,.77),L(.7,.4,.73,.77)]
  if(v)parts.base=[R(.3,.91,.4,.055)];if(detail)parts.trim=[L(.28,.42,.72,.42),L(.24,.76,.76,.76)]
  break
 case 'desk':case 'birthdaytable':
  parts.top=[poly(.12,.38,.83,.38,.94,.51,.05,.51)];parts.legs=[L(.12,.51,.12,.92,.18,.92,.18,.51),L(.82,.51,.82,.92,.88,.92,.88,.51)]
  if(k==='desk'){parts.drawer=[R(.27,.53,.45,.19),L(.45,.62,.55,.62)];parts.book=v?[poly(.24,.37,.3,.21,.52,.21,.48,.37),L(.4,.22,.35,.36)]:[R(.22,.31,.3,.055)]}
  else{parts.cake=[R(.33,.23,.35,.14),E(.505,.23,.175,.035),L(.44,.2,.44,.11),L(.57,.2,.57,.11)];parts.candles=[E(.44,.08,.015,.03),E(.57,.08,.015,.03)];if(v)parts.plates=[E(.19,.44,.07,.025),E(.8,.44,.07,.025)]}
  if(detail)parts.edges=[L(.1,.48,.89,.48),L(.2,.88,.8,.88)]
  break
 case 'lamp':
  parts.shade=[soft?P(['M',.18,.49],['Q',.28,.1,.5,.12],['Q',.72,.1,.82,.49],['Z']):poly(.18,.49,.35,.13,.65,.13,.82,.49)];parts.stand=v?[L(.5,.5,.34,.7,.5,.89),E(.34,.7,.035,.035)]:[L(.48,.5,.48,.87),L(.52,.5,.52,.87)];parts.base=[E(.5,.9,.24,.055)]
  if(detail)parts.seams=[L(.42,.17,.34,.46),L(.58,.17,.66,.46)];break
 case 'armchair':case 'sofa':
  parts.back=[box(.2,.18,.6,.48,.07)];parts.seat=[box(.2,.58,.6,.2,.04)];parts.arms=[box(.08,.45,.15,.35,.05),box(.77,.45,.15,.35,.05)];parts.feet=[L(.18,.81,.17,.93),L(.82,.81,.83,.93)]
  if(k==='sofa')parts.cushions=v?[L(.4,.25,.4,.58),L(.65,.25,.65,.58),L(.4,.61,.4,.75),L(.65,.61,.65,.75)]:[L(.5,.25,.5,.58),L(.5,.61,.5,.75)]
  else parts.cushions=[v?poly(.3,.42,.43,.28,.58,.42,.44,.56):roundBox(.3,.29,.35,.25,.035)]
  if(detail)parts.seams=[P(['M',.27,.23],['Q',.5,.2,.73,.23]),L(.27,.73,.73,.73)]
  break
 case 'bed':
  parts.head=[box(.18,.14,.63,.29,.04)];parts.mattress=[poly(.18,.4,.81,.4,.94,.8,.06,.8),L(.06,.8,.06,.9,.94,.9,.94,.8)];parts.pillow=[v?roundBox(.3,.31,.36,.15,.04):roundBox(.27,.31,.45,.15,.04)];parts.blanket=[L(.15,.51,.85,.51),L(.12,.63,.89,.63)]
  if(detail)parts.quilt=[L(.31,.52,.27,.77),L(.5,.52,.5,.77),L(.69,.52,.73,.77)];break
 case 'wardrobe':case 'bookshelf':
  parts.frame=[box(.17,.1,.65,.81,.02)];parts.feet=[L(.22,.91,.22,.97),L(.77,.91,.77,.97)]
  if(k==='wardrobe'){parts.doors=[L(v?.56:.5,.14,v?.56:.5,.87)];parts.handles=[E(.45,.54,.016,.025),E(.56,.54,.016,.025)];if(v)parts.mirror=[roundBox(.22,.2,.24,.5,.03)]}
  else{parts.shelves=[L(.2,.37,.79,.37),L(.2,.63,.79,.63)];parts.books=[R(.24,.2,.07,.17),R(.33,.17,.08,.2),poly(.51,.36,.45,.2,.52,.18,.59,.36),R(.26,.45,.22,.045),R(.26,.505,.18,.045),R(.61,.43,.11,.2)];if(v)parts.plant=[poly(.35,.91,.55,.91,.59,.75,.31,.75),leaf(.44,.65,.065,.1)]}
  if(detail)parts.trim=[R(.2,.13,.59,.75)];break
 case 'window':case 'door':
  parts.frame=[s===1?P(['M',.2,.92],['L',.2,.25],['Q',.5,.03,.8,.25],['L',.8,.92],['Z']):R(.2,.13,.6,.79)]
  if(k==='window'){parts.glass=[R(.25,.25,.5,.6),L(.5,.25,.5,.85),L(.25,.53,.75,.53)];parts.sill=[R(.14,.91,.72,.05)];if(v)parts.curtains=[P(['M',.23,.25],['Q',.44,.58,.24,.82]),P(['M',.77,.25],['Q',.56,.58,.76,.82])]}
  else{parts.panels=[R(.27,.26,.45,.22),R(.27,.57,.45,.24)];parts.handle=[E(.68,.53,.018,.025)];if(v)parts.step=[poly(.2,.92,.8,.92,.9,.98,.1,.98)]}
  if(detail)parts.moulding=[L(.23,.88,.23,.21,.77,.21,.77,.88)];break
 case 'violin':
  parts.body=[P(['M',.43,.4],['C',.2,.34,.19,.56,.33,.61],['C',.14,.8,.38,.98,.5,.89],['C',.62,.98,.86,.8,.67,.61],['C',.81,.56,.8,.34,.57,.4],['Z'])];parts.neck=[R(.455,.15,.09,.47),E(.5,.1,.065,.07)];parts.strings=[L(.49,.17,.49,.79),L(.52,.17,.52,.79)];parts.bridge=[L(.41,.74,.59,.74)];parts.bow=[L(v?.83:.77,.1,v?.75:.86,.92)]
  if(detail)parts.holes=[P(['M',.36,.55],['Q',.29,.57,.36,.65],['Q',.4,.71,.34,.73]),P(['M',.64,.55],['Q',.71,.57,.64,.65],['Q',.6,.71,.66,.73])];break
 case 'piano':
  parts.body=v?[P(['M',.14,.59],['L',.18,.2],['C',.8,.02,.94,.39,.81,.62],['Z'])]:[box(.13,.17,.75,.48,.025)];parts.keyboard=[poly(.13,.59,.87,.59,.94,.75,.06,.75)];parts.legs=[L(.14,.75,.14,.94),L(.86,.75,.86,.94)];parts.keys=Array.from({length:7},(_,i)=>L(.19+i*.1,.62,.16+i*.11,.72));if(detail)parts.trim=[L(.17,.55,.82,.55)];break
 case 'trumpet':
  parts.bell=[P(['M',.68,.44],['Q',.83,.38,.88,.2],['L',.88,.76],['Q',.8,.59,.68,.58],['Z'])];parts.tube=[P(['M',.68,.46],['L',.24,.46],['C',.01,.45,.02,.75,.24,.75],['L',.62,.75],['L',.62,.56],['L',.22,.56])];parts.valves=[L(.34,.64,.34,.35),L(.46,.64,.46,.35),L(.58,.64,.58,.35)];parts.mouth=[L(.1,.46,.1,.36,.2,.36)]
  if(v)parts.bell.push(E(.88,.48,.04,.28));if(detail)parts.buttons=[L(.29,.34,.39,.34),L(.41,.34,.51,.34),L(.53,.34,.63,.34)];break
 case 'flute':
  parts.body=[poly(.08,.71,.9,.22,.94,.29,.12,.78)];parts.holes=Array.from({length:7},(_,i)=>E(.25+i*.085,.65-i*.051,.014,.018));parts.joints=[L(.17,.66,.21,.73),L(.7,.34,.74,.41)];if(v)parts.mouth=[E(.82,.305,.024,.018)];if(detail)parts.edges=[L(.14,.73,.9,.275)];break
 case 'camera':
  parts.body=[box(.1,.3,.8,.48,.045),poly(.24,.3,.28,.2,.5,.2,.55,.3)];parts.lens=[E(v?.56:.5,.55,.18,.18),E(v?.56:.5,.55,.13,.13)];parts.finder=[R(.7,.37,.12,.075)];if(v)parts.grip=[L(.23,.34,.23,.73)];if(detail)parts.controls=[E(.17,.4,.025,.025),L(.34,.22,.45,.22),P(['M',.45,.46],['Q',.52,.4,.58,.46])];break
 case 'telescope':
  parts.barrel=[poly(.2,.45,.71,.14,.81,.3,.3,.61),E(.76,.22,.07,.09)];parts.eyepiece=[poly(.2,.45,.1,.5,.17,.61,.27,.56)];parts.tripod=[L(.53,.48,.49,.64,.22,.96),L(.49,.64,.51,.97),L(.49,.64,.79,.96)];if(v)parts.finder=[poly(.45,.26,.58,.18,.61,.22,.48,.3)];if(detail)parts.bands=[L(.62,.21,.71,.37),L(.33,.37,.42,.54)];break
 case 'microscope':
  parts.base=[P(['M',.18,.89],['Q',.5,.79,.82,.89],['L',.86,.95],['L',.14,.95],['Z'])];parts.arm=[P(['M',.6,.87],['C',.96,.63,.87,.38,.65,.29],['L',.59,.38],['C',.77,.51,.73,.68,.49,.8])];parts.tube=[poly(.3,.18,.45,.13,.66,.48,.51,.54),poly(.27,.14,.41,.09,.45,.15,.31,.21)];parts.stage=[L(.23,.65,.63,.65,.68,.7,.19,.7,.23,.65)];parts.knob=[E(.68,.5,.065,.065)];if(v)parts.slide=[L(.27,.61,.51,.61)];if(detail)parts.detail=[L(.38,.24,.53,.49),E(.39,.78,.035,.035)];break
 case 'sewingmachine':
  parts.base=[roundBox(.1,.79,.8,.12,.03)];parts.body=[P(['M',.22,.79],['L',.22,.59],['L',.35,.59],['L',.35,.35],['L',.68,.35],['L',.68,.79],['L',.83,.79],['L',.83,.29],['Q',.8,.17,.66,.19],['L',.25,.19],['Q',.12,.19,.12,.31],['L',.12,.58])];parts.wheel=[E(.84,.4,.075,.14)];parts.needle=[L(.26,.6,.26,.75)];parts.spool=[R(.47,.07,.12,.1),L(.53,.17,.53,.2)];if(v)parts.fabric=[poly(.23,.77,.5,.76,.64,.92,.31,.91)];if(detail)parts.dial=[E(.66,.48,.045,.05)];break
 case 'teacupset':
  parts.pot=[P(['M',.4,.39],['C',.2,.4,.17,.79,.45,.8],['C',.73,.8,.7,.4,.5,.39],['Z']),P(['M',.6,.47],['C',.86,.35,.84,.76,.63,.66]),L(.27,.58,.13,.4,.09,.45,.25,.72)];parts.lid=[P(['M',.33,.4],['Q',.45,.25,.57,.4],['Z']),E(.45,.29,.035,.035)];parts.cup=[P(['M',.73,.72],['L',.92,.72],['L',.89,.89],['Q',.82,.94,.76,.89],['Z']),P(['M',.92,.75],['Q',1,.82,.9,.84])];if(v)parts.tray=[E(.51,.93,.45,.05)];if(detail)parts.pattern=[P(['M',.34,.61],['Q',.45,.52,.55,.61]),L(.38,.69,.51,.69)];break
 case 'fruitbasket':case 'breadbasket':
  parts.basket=[P(['M',.11,.54],['L',.89,.54],['L',.77,.89],['Q',.5,1,.23,.89],['Z']),P(['M',.17,.56],['C',.1,.07,.9,.07,.83,.56])];parts.food=k==='fruitbasket'?[E(.33,.45,.12,.12),E(.57,.43,.13,.14),leaf(.61,.21,.055,.09)]:[P(['M',.26,.54],['L',.35,.2],['Q',.43,.03,.5,.2],['L',.49,.54]),P(['M',.51,.54],['C',.4,.31,.84,.32,.79,.54],['Z']),L(.37,.28,.47,.31)]
  if(v)parts.cloth=[poly(.18,.56,.37,.56,.44,.75,.28,.7)];if(detail)parts.weave=[L(.18,.68,.83,.68),L(.23,.8,.79,.8),L(.38,.57,.41,.88),L(.61,.57,.58,.88)];break
 case 'vase':case 'bottle':
  parts.body=[k==='vase'?P(['M',.39,.22],['Q',.45,.39,.28,.52],['C',.05,.88,.3,.95,.5,.95],['C',.7,.95,.95,.88,.72,.52],['Q',.55,.39,.61,.22],['Z']):P(['M',.42,.16],['L',.58,.16],['L',.58,.39],['Q',.73,.47,.73,.55],['L',.73,.91],['Q',.5,.98,.27,.91],['L',.27,.55],['Q',.27,.47,.42,.39],['Z'])];parts.rim=[E(.5,k==='vase'?.22:.16,k==='vase'?.11:.08,.035)];parts.decor=v?[E(.5,.68,.14,.15)]:[P(['M',.31,.65],['Q',.5,.75,.69,.65])];if(detail)parts.volume=[P(['M',.37,.51],['Q',.25,.74,.36,.85]),P(['M',.65,.62],['Q',.71,.8,.62,.87])];break
 case 'scooter':
  parts.wheels=[E(.22,.86,.085,.085),E(.82,.86,.085,.085)];parts.deck=[poly(.24,.78,.73,.78,.76,.83,.23,.83)];parts.stem=[L(.8,.81,v?.69:.77,.21),L(v?.55:.61,.2,v?.86:.93,.2)];if(detail)parts.brake=[P(['M',.12,.81],['Q',.22,.68,.31,.81]),L(.32,.8,.61,.8)];break
 case 'hotairballoon':
  parts.envelope=[P(['M',.38,.67],['C',.03,.43,.1,.06,.5,.06],['C',.9,.06,.97,.43,.62,.67],['Z'])];parts.ropes=[L(.39,.67,.42,.81),L(.61,.67,.58,.81)];parts.basket=[poly(.37,.81,.63,.81,.59,.95,.41,.95)];parts.gores=[P(['M',.5,.06],['C',.23,.1,.25,.48,.43,.67]),P(['M',.5,.06],['C',.77,.1,.75,.48,.57,.67])];if(v)parts.pattern=[P(['M',.19,.37],['Q',.5,.58,.81,.37])];if(detail)parts.weave=[L(.42,.88,.59,.88),L(.48,.82,.48,.94),L(.54,.82,.54,.94)];break
 }
 // Decorative motifs belong to fabric, furniture or pottery. Observational
 // variants instead describe seams, material grain, rims and cast shadows.
 const motifs={backpack:[.5,.73,.065],rainboot:[.47,.61,.05],mittens:[.4,.64,.045],desk:[.5,.64,.038],armchair:[.46,.42,.065],sofa:[.37,.39,.06],bed:[.5,.7,.06],wardrobe:[.66,.3,.04],door:[.49,.68,.07],vase:[.5,.52,.08],bottle:[.5,.71,.09]}
 if(s===1&&motifs[k]){const [x,y,r]=motifs[k];parts.finish=[flower(x,y,r,6),E(x,y,r*.18,r*.18)]}
 else if(s===1&&k==='strawhat')parts.finish=[P(['M',.14,.68],['Q',.5,.84,.85,.68]),poly(.58,.55,.72,.5,.7,.62,.58,.55,.51,.63,.48,.51)]
 else if(s===1&&k==='scarf')parts.finish=[L(.42,.48,.62,.45),L(.48,.63,.67,.6),L(.54,.78,.72,.76)]
 else if(s===1&&['teacupset','fruitbasket','breadbasket'].includes(k))parts.finish=[P(['M',.3,.81],['Q',.4,.91,.5,.81],['Q',.6,.91,.7,.81])]
 else if(s===1&&['violin','piano','trumpet','flute'].includes(k))parts.finish=k==='violin'?[P(['M',.44,.8],['Q',.5,.86,.56,.8])]:k==='piano'?[P(['M',.3,.28],['Q',.5,.36,.7,.28]),L(.25,.78,.23,.89)]:k==='trumpet'?[P(['M',.78,.36],['Q',.75,.5,.8,.65])]:[E(.42,.545,.028,.025)]
 else if(s===1)parts.finish=[P(['M',.22,.93],['Q',.5,.96,.78,.93])]
 if(s===2){
  parts.shadow=[P(['M',.2,.965],['Q',.48,.98,.81,.95])]
  if(['backpack','rainboot','mittens'].includes(k))parts.stitch=[L(.32,.72,.32,.75),L(.32,.78,.32,.81)]
  else if(['desk','wardrobe','door','bookshelf','armchair'].includes(k))parts.grain=[P(['M',.73,.76],['Q',.69,.8,.73,.84])]
  else if(['vase','bottle','teacupset'].includes(k))parts.highlight=[P(['M',.58,.56],['Q',.64,.68,.6,.75])]
  else if(k==='strawhat')parts.fibres=[P(['M',.4,.25],['Q',.38,.39,.4,.51]),P(['M',.58,.25],['Q',.63,.42,.6,.52])]
  else if(k==='sneaker')parts.stitch=[L(.28,.69,.42,.69),L(.73,.79,.84,.79)]
 }
 const aspect=['flute','trumpet','sofa','desk','birthdaytable','teacupset','fruitbasket','breadbasket'].includes(k)?1.4:['violin','rainboot','backpack','bottle','hotairballoon'].includes(k)?.8:1
 return {aspect,parts}
}
export function addObjectStudioRecipes(add){for(const [id,name] of objects)registerStudio(add,{id,name,category:'stilllife',related:['object','生活物件',...(['violin','piano','trumpet','flute'].includes(id)?['music']:['home'])],aliases:aliases[id]??[],poses:['基础视角','结构变体']},object)}
