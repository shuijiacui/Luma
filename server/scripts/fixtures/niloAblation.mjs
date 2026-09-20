// Newly authored synthetic fixtures, independent of the earlier holdout set.
// Gold labels are author-supplied controls, NOT measurements of model quality.
import { createHash } from 'node:crypto'

export const ablationVersion = 'nilo-ablation-v1'
const ellipse=(cx,cy,rx,ry,rotation=0)=>Array.from({length:81},(_,i)=>{
  const t=i*Math.PI/40,x=rx*Math.cos(t),y=ry*Math.sin(t)
  return [cx+x*Math.cos(rotation)-y*Math.sin(rotation),cy+x*Math.sin(rotation)+y*Math.cos(rotation)]
})
const arc=(cx,cy,rx,ry)=>Array.from({length:31},(_,i)=>[cx+rx*Math.cos(i*Math.PI/30),cy+ry*Math.sin(i*Math.PI/30)])
const paths=(...lines)=>lines.flatMap(line=>line.map(([x,y],i)=>({x,y,...(i===0?{move:true}:{})})))
const box=(x,y,width,height)=>({x,y,width,height})
const face=(rx=.23,ry=.25,rotation=0)=>paths(ellipse(.5,.5,rx,ry,rotation),ellipse(.42,.46,.014,.019),ellipse(.58,.46,.014,.019),arc(.5,.57,.07,.055))
const loop=[[['E',.5,.5,.35,.35]]]
const curve=[[['M',.08,.78],['Q',.4,.12,.92,.25]]]
const plan=(detail,at=[.5,.5],scale=.2,regionId='S1R1',geometry=loop,aspect=1)=>({
  intent:{subjectId:'S1',regionId,detail,relationship:`在已有的支撑区域内部添上${detail}，保持原画轮廓`},
  drawing:{aspect,paths:geometry,placement:{mode:'inside',at,scale,joinId:null}},
})
function fixture(id,group,subject,family,points,bounds,region,positive,parts){
  const observation={subjects:[{subject,family,id:null,confidence:1,evidence:parts.join('、'),bounds,existingParts:parts,
    regions:[{name:region.name,bounds:region.bounds,confidence:1}]}]}
  return {id,group,aspect:1,points,observation,
    controls:[{id:'positive',expected:'accept',plan:positive},
      {id:'invalid_reference',expected:'reject',expectedCodes:['intent_reference'],
        plan:{...structuredClone(positive),intent:{...positive.intent,subjectId:'S404'}}}],
    semanticRubric:{relatedToSubject:true,insideSupportingRegion:true,noOriginalInkOverwrite:true,noDuplicatedFeature:true,
      note:'Gold controls are fixture-author assertions. Live outputs require independent visual review.'}}
}
export const ablationCases=[
  fixture('round_face','person','圆脸人物','character',face(),box(.26,.24,.48,.52),{name:'脸部',bounds:box(.29,.27,.42,.46)},
    plan('脸颊上的小酒窝',[.23,.6],.11),['圆形头部','两只眼睛','微笑']),
  fixture('wide_face','person','宽脸人物','character',face(.32,.21),box(.17,.28,.66,.44),{name:'前额',bounds:box(.28,.31,.44,.11)},
    plan('弯弯的刘海',[.5,.5],.23,'S1R1',curve,2),['宽头部','两只眼睛','嘴巴']),
  fixture('tilted_face','person','歪头人物','character',face(.21,.29,.3),box(.27,.21,.46,.58),{name:'脸部',bounds:box(.32,.32,.36,.35)},
    plan('脸颊上的小圆点',[.18,.68],.1),['倾斜的椭圆头部','眼睛','嘴巴']),
  fixture('pointy_cat','animal','尖耳朵小猫','animal',paths(ellipse(.49,.54,.22,.19),[[.29,.45],[.27,.23],[.43,.36]],[[.56,.36],[.7,.23],[.68,.45]],ellipse(.42,.51,.012,.018),ellipse(.56,.51,.012,.018),[[.47,.56],[.49,.58],[.51,.56]]),
    box(.25,.21,.47,.53),{name:'猫脸',bounds:box(.28,.37,.42,.35)},plan('嘴边的一小段弯线',[.55,.69],.13,'S1R1',curve,1),['猫头','尖耳朵','两只眼睛','三角鼻子']),
  fixture('long_dog','animal','长身体小狗','animal',paths(ellipse(.46,.59,.25,.13),ellipse(.74,.43,.11,.14),[[.67,.33],[.61,.4],[.66,.5]],[[.29,.68],[.28,.82]],[[.6,.68],[.6,.82]],[[.21,.58],[.13,.45]],ellipse(.78,.4,.012,.016)),
    box(.12,.28,.75,.55),{name:'身体侧面',bounds:box(.25,.49,.42,.2)},plan('身上的小斑点',[.5,.5],.2),['长身体','头','耳朵','眼睛','两条腿','尾巴']),
  fixture('branch_tree','plant','分叉树','plant',paths([[.43,.86],[.43,.55],[.34,.45]],[[.57,.86],[.57,.53],[.65,.45]],ellipse(.49,.36,.28,.2),[[.43,.64],[.5,.56],[.57,.64]]),
    box(.2,.15,.58,.72),{name:'树干',bounds:box(.43,.65,.14,.19)},plan('树节',[.5,.48],.36),['树冠','树干','分叉枝条']),
  fixture('tall_planter','plant','花盆里的植物','plant',paths([[.33,.63],[.37,.86],[.63,.86],[.67,.63],[.33,.63]],[[.5,.63],[.5,.22]],[[.5,.41],[.36,.29],[.32,.38],[.5,.47]],[[.5,.5],[.63,.34],[.67,.44],[.5,.55]]),
    box(.31,.21,.37,.66),{name:'花盆表面',bounds:box(.38,.66,.24,.17)},plan('花盆上的小圆纹',[.5,.5],.22),['花盆','直茎','左右叶片']),
  fixture('dining_chair','object','靠背椅','object',paths([[.34,.27],[.66,.27],[.66,.62],[.34,.62],[.34,.27]],[[.32,.62],[.68,.62],[.68,.69],[.32,.69],[.32,.62]],[[.35,.69],[.32,.86]],[[.65,.69],[.68,.86]]),
    box(.31,.26,.38,.61),{name:'椅背内侧',bounds:box(.37,.3,.26,.28)},plan('椅背上的短横纹',[.5,.5],.34,'S1R1',[[['M',.05,.5],['L',.95,.5]]],3),['矩形椅背','坐面','两条椅腿']),
  fixture('small_bus','vehicle','小巴士','vehicle',paths([[.19,.36],[.75,.36],[.83,.46],[.83,.7],[.19,.7],[.19,.36]],ellipse(.32,.72,.065,.065),ellipse(.7,.72,.065,.065),[[.25,.41],[.4,.41],[.4,.53],[.25,.53],[.25,.41]]),
    box(.18,.35,.66,.45),{name:'车身右侧面',bounds:box(.45,.4,.3,.27)},plan('车门把手',[.66,.55],.16,'S1R1',[[['M',.1,.5],['L',.9,.5]]],2),['车厢','两个车轮','左边车窗']),
  fixture('sail_hull','vehicle','帆船','vehicle',paths([[.23,.62],[.8,.62],[.7,.78],[.34,.78],[.23,.62]],[[.51,.62],[.51,.2]],[[.49,.24],[.3,.56],[.49,.56],[.49,.24]],[[.55,.28],[.73,.56],[.55,.56],[.55,.28]]),
    box(.22,.19,.59,.6),{name:'船身侧面',bounds:box(.35,.64,.34,.11)},plan('船身的小圆舷窗',[.5,.5],.12),['船身','桅杆','两片帆']),
  fixture('invented_friend','imaginary','长耳朵的想象伙伴','character',paths(ellipse(.5,.58,.25,.2),[[.32,.43],[.28,.18],[.4,.39]],[[.6,.39],[.74,.16],[.69,.44]],ellipse(.42,.54,.015,.02),ellipse(.58,.54,.015,.02),arc(.5,.63,.055,.04)),
    box(.24,.15,.52,.64),{name:'身体下侧',bounds:box(.34,.68,.31,.07)},plan('下侧的小斑点',[.5,.5],.09),['椭圆身体','不对称长耳朵','眼睛','嘴巴']),
  fixture('linked_loops','abstract','相连的两个环','abstract',paths(ellipse(.36,.49,.19,.24),ellipse(.66,.54,.14,.17),[[.54,.54],[.57,.55]]),
    box(.16,.24,.65,.5),{name:'左侧环内部',bounds:box(.21,.29,.29,.4)},plan('环里面的小弯环',[.5,.5],.22),['一个大环','右侧小环','连接线']),
]

// Attachment and contact controls are additional authored variants; the full
// and gold-scene model turns are still run only once per scene.
ablationCases[3].controls.push({id:'attached_whisker',expected:'accept',plan:{
  intent:{subjectId:'S1',regionId:'S1R0',detail:'外侧胡须',relationship:'从猫脸右侧向外伸出一根胡须'},
  drawing:{aspect:3,paths:[[['M',0,.5],['Q',.5,.35,1,.2]]],placement:{mode:'attached',joinId:'S1_right',scale:.2}},
}})
for(const id of ['round_face','wide_face','tilted_face']){
  const item=ablationCases.find(c=>c.id===id)
  for(const kind of ['points','contour'])item.controls.push({id:`contact_hat_${kind}`,expected:'accept',requires:'contact',plan:{
    intent:{subjectId:'S1',regionId:'S1R0',detail:'头顶的小帽子',relationship:'帽子底沿贴住已有头顶轮廓，上半部分朝画外生长'},
    drawing:{aspect:1.7,paths:[[['M',0,1],['L',.2,.12],['L',.8,.12],['L',1,1],...(kind==='contour'?[['L',0,1]]:[])]],
      placement:{mode:'contact',contactId:'S1R0_top',contactKind:kind,scale:.3}},
  }})
}
// A geometrically valid but semantically wrong control MUST NOT be counted as
// a drawing success. It demonstrates why collision checks cannot judge meaning.
ablationCases[0].controls.push({id:'wrong_semantics',expected:'human_reject',plan:{
  ...structuredClone(ablationCases[0].controls[0].plan),
  intent:{subjectId:'S1',regionId:'S1R1',detail:'汽车方向盘',relationship:'把汽车方向盘画在人物脸颊中'},
}})

export const fixtureHash=createHash('sha256').update(JSON.stringify(ablationCases)).digest('hex')
export const fixtureManifest={version:ablationVersion,sha256:fixtureHash,source:'new synthetic paths authored for layered evaluation',
  privacy:'No child images, prompts, accounts or stored conversations.',
  freezePolicy:'Freeze before the first live run; any geometry/label change requires a new version and hash. Reruns are regression, not fresh holdout.',
  goldLabelStatus:'author_supplied_control_not_independent_human_review',
  cases:ablationCases.map(({id,group,controls})=>({id,group,controls:controls.map(({id,expected,expectedCodes,requires})=>({id,expected,expectedCodes,requires}))}))}
