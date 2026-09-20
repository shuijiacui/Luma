// Original, synthetic scenes. No prior ablation drawing or user image is reused.
// Author labels are evaluation controls; they must never enter a model context.
import { createHash } from 'node:crypto'

export const freshVersion = 'nilo-fresh-scenes-v1'
const oval = (cx,cy,rx,ry,angle=0) => Array.from({length:65},(_,i)=>{
  const t=i*Math.PI/32,x=rx*Math.cos(t),y=ry*Math.sin(t)
  return [cx+x*Math.cos(angle)-y*Math.sin(angle),cy+x*Math.sin(angle)+y*Math.cos(angle)]
})
const line = (...p) => p
const box = (x,y,width,height) => ({x,y,width,height})
const points = lines => lines.flatMap(l=>l.map(([x,y],i)=>({x,y,...(i===0?{move:true}:{})})))
const bounds = lines => {
  const p=lines.flat(),xs=p.map(v=>v[0]),ys=p.map(v=>v[1])
  const x=Math.max(0,Math.min(...xs)-.006),y=Math.max(0,Math.min(...ys)-.006)
  return box(x,y,Math.min(1,Math.max(...xs)+.006)-x,Math.min(1,Math.max(...ys)+.006)-y)
}
const subject = (name,family,lines,parts,region) => ({subject:name,family,id:null,confidence:1,
  evidence:parts.join('、'),existingParts:parts,bounds:bounds(lines),regions:[{name:region.name,bounds:region.bounds,confidence:1}]})
function scene(id,group,lines,name,family,parts,region,ideas,forbidden,{aspect=1,others=[],primaryLines=lines}={}) {
  return {id,group,aspect,points:points(lines),observation:{subjects:[subject(name,family,primaryLines,parts,region),...others]},
    semanticChecklist:{identity:`保留${name}的实际结构；不能仅凭矩形或曲线改称其他物体`,
      relationship:'添画须在原画中找到明确支撑部位；抽象画则须说明可见线条间的具体关系',
      plausibleIdeas:ideas,forbiddenExamples:forbidden,
      scale:'新增内容与所依附部位相称，不能遮挡主体或比同类原有细节大数倍',
      preserve:'不擦除、不移动、不重描原画；不得重复已有器官或功能部件',
      openEnded:true,note:'Ideas are illustrative, not an exhaustive answer key. Independent visual review is required.'},
    geometryBounds:{support:region.bounds,maxAdditionShortSideFraction:.3,originalInkMustRemain:true,
      acceptedPlacement:'inside a visible supporting surface, or connected at actual supporting ink; scene interactions require specific visual justification'},
    review:{subjectCorrect:null,meaningfulAddition:null,positionAndScaleCorrect:null,originalPreserved:null,reviewer:null,notes:null}}
}
const faceEyes=(cx,cy,gap=.07)=>[oval(cx-gap,cy,.011,.016),oval(cx+gap,cy,.011,.016)]
const cactus=[line([.43,.83],[.43,.41],[.37,.41],[.37,.28],[.3,.28],[.3,.48],[.43,.55]),line([.43,.83],[.59,.83],[.59,.46],[.7,.46],[.7,.25],[.63,.25],[.63,.38],[.59,.38],[.59,.2],[.55,.15],[.48,.15],[.43,.2],[.43,.41])]
const tulip=[line([.5,.73],[.5,.42]),line([.5,.59],[.3,.47],[.38,.66],[.5,.69]),line([.36,.2],[.44,.29],[.5,.18],[.57,.29],[.66,.2],[.63,.36],[.57,.42],[.45,.42],[.38,.36],[.36,.2]),line([.34,.75],[.39,.88],[.6,.88],[.66,.75],[.34,.75])]
const mushroom=[line([.23,.49],[.3,.34],[.43,.25],[.61,.25],[.75,.4],[.79,.49],[.23,.49]),line([.45,.49],[.41,.79],[.6,.79],[.56,.49])]
const turtle=[oval(.47,.52,.26,.19),oval(.79,.53,.075,.08),line([.31,.66],[.26,.77],[.38,.76],[.41,.7]),line([.57,.69],[.62,.78],[.72,.75],[.67,.64]),line([.22,.52],[.12,.59],[.22,.59]),oval(.815,.515,.009,.012)]
const fish=[oval(.51,.51,.27,.16),line([.25,.5],[.13,.35],[.13,.66],[.26,.54]),line([.46,.36],[.53,.25],[.61,.38]),oval(.68,.47,.017,.024),line([.73,.55],[.78,.54])]
const bird=[oval(.5,.58,.21,.18,-.25),oval(.67,.35,.11,.12),line([.77,.35],[.87,.39],[.77,.43]),line([.31,.57],[.18,.51],[.26,.67],[.33,.68]),line([.47,.75],[.45,.87],[.4,.87]),line([.58,.74],[.59,.86],[.64,.86]),oval(.7,.325,.01,.013)]
const rocket=[line([.41,.24],[.5,.1],[.59,.24],[.61,.68],[.39,.68],[.41,.24]),line([.4,.51],[.27,.71],[.4,.66]),line([.6,.51],[.73,.71],[.6,.66]),line([.43,.69],[.41,.85],[.5,.76],[.58,.85],[.56,.69]),oval(.5,.33,.055,.07)]
const bike=[oval(.27,.68,.16,.16),oval(.76,.68,.16,.16),line([.27,.68],[.44,.43],[.56,.68],[.27,.68],[.55,.43],[.76,.68]),line([.41,.39],[.49,.39]),line([.55,.43],[.61,.29],[.69,.29])]
const train=[line([.15,.42],[.43,.42],[.43,.69],[.15,.69],[.15,.42]),line([.48,.32],[.68,.32],[.68,.47],[.81,.47],[.86,.69],[.48,.69],[.48,.32]),line([.43,.63],[.48,.63]),line([.75,.47],[.75,.34],[.82,.34],[.82,.47]),oval(.24,.72,.052,.052),oval(.37,.72,.052,.052),oval(.57,.72,.052,.052),oval(.77,.72,.065,.065)]
const teapot=[oval(.51,.57,.22,.2),line([.37,.4],[.65,.4]),line([.49,.38],[.49,.32],[.55,.32],[.55,.38]),line([.72,.5],[.79,.41],[.89,.4],[.8,.57],[.72,.61]),line([.31,.47],[.2,.42],[.14,.5],[.17,.63],[.28,.65])]
const boot=[line([.3,.2],[.48,.26],[.43,.6],[.73,.67],[.78,.78],[.71,.86],[.23,.72],[.23,.63],[.3,.2]),line([.24,.68],[.72,.82])]
const house=[line([.11,.54],[.11,.84],[.48,.84],[.48,.54]),line([.07,.54],[.29,.33],[.52,.54],[.07,.54]),line([.21,.84],[.21,.68],[.32,.68],[.32,.84]),line([.36,.6],[.43,.6],[.43,.68],[.36,.68],[.36,.6])]
const garden=[line([.67,.84],[.67,.55]),oval(.67,.49,.06,.06),line([.67,.72],[.56,.64],[.59,.76],[.67,.78]),line([.79,.84],[.79,.38]),oval(.79,.32,.065,.06),line([.78,.59],[.89,.5],[.87,.65],[.79,.68])]
const jelly=[line([.51,.44],[.56,.32],[.69,.3],[.8,.35],[.84,.44],[.51,.44]),line([.57,.44],[.54,.57],[.59,.67]),line([.66,.44],[.63,.61],[.67,.71]),line([.76,.44],[.81,.56],[.77,.69])]
const coral=[line([.19,.85],[.23,.69],[.15,.6]),line([.22,.72],[.3,.65],[.34,.52]),line([.22,.73],[.24,.56])]

export const freshCases=[
  scene('spiky_full_person','person',[
    line([.35,.29],[.33,.2],[.42,.24],[.46,.13],[.53,.24],[.63,.17],[.62,.31]),
    line([.35,.29],[.37,.4],[.45,.45],[.56,.44],[.62,.36],[.62,.31]),...faceEyes(.49,.32),
    line([.45,.39],[.52,.4]),line([.44,.45],[.36,.69],[.65,.69],[.57,.44]),line([.38,.51],[.23,.61]),line([.6,.51],[.75,.6]),line([.43,.69],[.41,.88]),line([.58,.69],[.61,.88])],
    '尖头发全身人物','character',['尖头发','五官','上衣','双臂','双腿'],{name:'上衣',bounds:box(.42,.5,.16,.15)},['衣服口袋','领口'],'不要把腿当树干或重新添加眼睛'),
  scene('profile_long_nose','person',[
    line([.36,.7],[.31,.5],[.34,.27],[.45,.18],[.63,.23],[.66,.36],[.78,.43],[.65,.47],[.64,.58],[.53,.64],[.53,.77]),
    line([.35,.68],[.23,.88],[.68,.88],[.54,.73]),oval(.58,.35,.012,.02),line([.6,.54],[.65,.53]),oval(.38,.46,.035,.06)],
    '朝右的侧脸人物','character',['侧脸轮廓','向右的鼻子','一只眼睛','耳朵','肩膀'],{name:'后侧头部',bounds:box(.37,.28,.13,.13)},['头发短线','耳旁的小饰物'],'不要在后脑补第二张正脸',{aspect:.75}),
  scene('tiny_head_large_coat','proportion',[
    oval(.51,.22,.08,.09),...faceEyes(.51,.21,.03),line([.49,.26],[.53,.26]),
    line([.45,.31],[.22,.41],[.15,.7],[.29,.73],[.33,.56],[.29,.86],[.71,.86],[.67,.56],[.75,.72],[.88,.66],[.79,.4],[.57,.31]),
    line([.5,.33],[.5,.84]),oval(.55,.47,.012,.015),oval(.55,.57,.012,.015)],
    '小头大外套人物','character',['很小的头','很宽的外套','两颗纽扣','衣襟'],{name:'左侧外套',bounds:box(.35,.5,.11,.22)},['外套口袋','袖口短纹'],'保留故意夸大的衣服比例，不要重复纽扣'),
  scene('forked_cactus','plant',cactus,'分枝仙人掌','plant',['竖直主茎','两侧上弯枝条'],{name:'主茎中段',bounds:box(.46,.56,.1,.2)},['短刺','内部竖纹'],'不要加树叶或气球绳'),
  scene('cup_tulip','plant',tulip,'花盆里的郁金香','plant',['尖瓣花朵','一片叶子','花茎','梯形盆'],{name:'花盆内侧',bounds:box(.42,.78,.15,.075)},['盆上的小纹样','花瓣内短纹'],'不要重复已有叶片或把花茎延长穿过盆底',{aspect:.75}),
  scene('broad_mushroom','plant',mushroom,'宽菌盖蘑菇','plant',['宽菌盖','细菌柄'],{name:'菌盖内部',bounds:box(.4,.31,.22,.14)},['菌盖斑点','菌柄短纹'],'不能在菌柄上画车窗'),
  scene('walking_turtle','animal',turtle,'向右走的小乌龟','animal',['椭圆龟壳','右边的头','两只脚','尾巴','一只眼睛'],{name:'龟壳中间',bounds:box(.34,.4,.24,.2)},['龟壳纹路'],'不要把头误当尾巴或在龟壳上补脸',{aspect:1.5}),
  scene('fish_with_top_fin','animal',fish,'向右游的鱼','animal',['梭形身体','左尾鳍','上背鳍','右眼','嘴'],{name:'鱼身中部',bounds:box(.41,.42,.19,.18)},['鱼鳞','鳃线'],'不可重复背鳍或在尾巴添加眼睛',{aspect:1.5}),
  scene('long_leg_bird','animal',bird,'长腿小鸟','animal',['右上方鸟头','尖喙','椭圆身体','尾羽','两条腿'],{name:'身体中部',bounds:box(.43,.49,.14,.18)},['翅膀轮廓','羽毛短纹'],'不要在身体上补第二个喙'),
  scene('bare_bicycle','vehicle',bike,'自行车','vehicle',['两个大轮子','三角车架','坐垫','车把'],{name:'左车轮内部',bounds:box(.16,.57,.22,.22)},['车轮辐条','车架上的踏板'],'不要把车轮当人物脸或增加第三个轮子',{aspect:1.5}),
  scene('rocket_with_flame','vehicle',rocket,'升空火箭','vehicle',['尖头','圆舷窗','两侧尾翼','下方火焰'],{name:'机身中段',bounds:box(.44,.45,.12,.16)},['机身标记','小检修盖'],'不可重复舷窗或在火焰中画眼睛',{aspect:.75}),
  scene('two_car_train','vehicle',train,'两节小火车','vehicle',['左车厢','右车头','烟囱','四个轮子','连接杆'],{name:'左车厢侧面',bounds:box(.2,.46,.18,.18)},['车厢窗户','车厢编号图案'],'不要把烟囱当树干或添加与车厢分离的车门',{aspect:1.5}),
  scene('round_teapot','object',teapot,'有把手和壶嘴的茶壶','object',['圆壶身','左把手','右壶嘴','壶盖','盖钮'],{name:'壶身表面',bounds:box(.39,.49,.23,.17)},['壶身花纹'],'不要再次添加把手或把壶嘴当象鼻'),
  scene('leaning_boot','tilted',boot,'向右倾斜的靴子','object',['斜靴筒','长鞋头','鞋底线'],{name:'靴筒内侧',bounds:box(.31,.35,.1,.2)},['靴筒鞋带孔','筒侧短纹'],'新增细节方向应跟随斜靴筒'),
  scene('house_and_garden','dense',[...house,...garden],'左侧小房屋','building',['三角屋顶','矩形墙','门','一扇窗'],
    {name:'屋顶内部',bounds:box(.23,.42,.14,.1)},['屋顶瓦片短线','门把手'],'不得跨越房子和右侧花草连接成无关线条',{
      aspect:1.5,primaryLines:house,others:[subject('右侧两株花草','plant',garden,['两根茎','两朵花','两片叶'],{name:'右花中心',bounds:box(.76,.29,.06,.055)})]}),
  scene('jellyfish_and_coral','dense',[...jelly,...coral],'右上方水母','animal',['半圆伞体','三条下垂触手'],
    {name:'伞体内侧',bounds:box(.61,.34,.14,.07)},['伞体内的小斑点','珊瑚的短分枝'],'不把触手当树根，不用长线连接不同主体',{
      primaryLines:jelly,others:[subject('左下方珊瑚','plant',coral,['分叉主枝','两根短枝'],{name:'主枝附近',bounds:box(.17,.66,.11,.15)})]}),
  scene('one_eye_tripod','imaginary',[
    line([.27,.35],[.4,.2],[.62,.26],[.73,.49],[.62,.66],[.34,.64],[.25,.5],[.27,.35]),oval(.48,.38,.075,.09),oval(.5,.4,.021,.028),
    line([.34,.63],[.22,.83]),line([.48,.66],[.49,.9]),line([.63,.63],[.79,.81]),line([.39,.55],[.53,.58],[.6,.52])],
    '独眼三脚想象伙伴','character',['不规则身体','一只大眼睛','嘴巴','三条腿'],{name:'右侧身体',bounds:box(.58,.39,.08,.12)},['身上小斑纹','脚边的小鞋'],'保留独眼和三脚，不强行改成双眼双腿人物'),
  scene('winged_mailbox_friend','imaginary',[
    line([.35,.3],[.65,.3],[.65,.7],[.35,.7],[.35,.3]),line([.35,.39],[.17,.28],[.14,.44],[.35,.58]),line([.65,.39],[.84,.3],[.88,.46],[.65,.58]),
    oval(.43,.41,.019,.028),oval(.57,.41,.019,.028),line([.42,.53],[.58,.53]),line([.39,.61],[.61,.61]),line([.44,.7],[.42,.86]),line([.57,.7],[.61,.86])],
    '带翅膀的方盒伙伴','character',['方盒身体','两只眼睛','横嘴','两翼','两条腿'],{name:'身体底部',bounds:box(.41,.64,.17,.035)},['小身体徽记','翅膀内短纹'],'保留方盒伙伴身份，不把它改成房屋或鸟'),
  scene('zigzag_enclosure','abstract',[
    line([.16,.32],[.32,.2],[.43,.35],[.63,.19],[.8,.36],[.73,.72],[.53,.81],[.29,.7],[.16,.32]),
    line([.28,.47],[.43,.43],[.54,.57],[.69,.51])],
    '带内折线的不规则围合','abstract',['锯齿上缘','不规则外框','内部折线'],{name:'下部空白围合',bounds:box(.39,.63,.21,.07)},['内部短线延续节奏','沿可见折点的连接小形状'],'不强行称作山、动物或人物，也不任意复制最后一笔'),
  scene('offset_nested_boxes','abstract',[
    line([.18,.19],[.74,.26],[.8,.78],[.25,.84],[.18,.19]),line([.33,.35],[.63,.38],[.62,.67],[.36,.66],[.33,.35]),
    line([.25,.84],[.13,.9]),line([.74,.26],[.88,.13])],
    '错位套叠四边形','abstract',['倾斜外框','偏心内框','两根向外短线'],{name:'内框空白',bounds:box(.41,.43,.16,.17)},['小内部回环','与内框方向相同的短折线'],'不要把外伸线自动解释为动物腿或把内框改成脸'),
]

export const freshHash=createHash('sha256').update(JSON.stringify(freshCases)).digest('hex')
export const freshManifest={version:freshVersion,sha256:freshHash,count:freshCases.length,
  source:'20 original author-drawn synthetic scenes; no previous 12-case ablation or child canvas reused',
  privacy:'Synthetic images only. No child images, prompts, accounts, or conversations.',
  freezePolicy:'Frozen before provider execution. Geometry, labels, or rubric changes require a new version and manifest. Repeated runs are regression, not fresh holdout.',
  semanticLabelStatus:'Author checklist, not independent human scores. All semantic fields remain null until reviewed.',
  cases:freshCases.map(({id,group,aspect})=>({id,group,aspect}))}
