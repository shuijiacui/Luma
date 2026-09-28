import { createHash } from 'node:crypto'
import { scenePalette } from '../../../shared/niloSceneDrawing.mjs'

// Fixed synthetic requests. Reviewer checks are deliberately NOT sent to Nilo.
// A successful render is evidence of executable geometry, not semantic quality.
const cases = [
  ['magic_world', 'open_place', '我想画一个魔法世界', ['有清楚的奇妙空间关系，不只是给普通素材改名', '有一个可辨认的视觉中心']],
  ['candy_planet', 'open_place', '我想画一个糖果星球', ['糖果主题与星球/居住环境的关系可见', '不会退回无关城堡模板']],
  ['whale_town', 'relationship', '我想画一个住在鲸鱼背上的小镇', ['鲸鱼可辨认', '小镇确实在鲸鱼背上，不是并排摆放']],
  ['quiet_wonder', 'abstract_mood', '画一个安静而神奇的地方', ['留白和主体组织传达安静', '至少一种清楚的奇妙关系']],
  ['paper_realm', 'open_place', '我想画一个纸做的国度', ['形态/组合表达纸的特点', '不同元素属于同一个地方']],
  ['tiny_garden', 'relative_scale', '画一个小房子躲在巨大的花朵下面的花园', ['花明显大于房子', '房子位于花下而非盖住花']],
  ['upside_forest', 'open_place', '画一片倒着生长的森林', ['倒向是画面可见关系', '树木形态可辨认']],
  ['underwater_town', 'open_place', '画一个热闹的海底城市', ['海底与城市的关系可见', '主要建筑清晰，装饰不挤占主体']],
  ['cloud_railway', 'relationship', '画一列在云朵之间旅行的小火车', ['火车与云之间有旅行路线', '火车可辨认']],
  ['bottle_garden', 'relationship', '我想画一个长在玻璃瓶里的小花园', ['花园位于瓶子里面', '外轮廓与内部植物不混成一团']],
  ['moon_playground', 'open_place', '画一个月亮上的游乐园', ['月亮作为地点被表达', '游乐活动而非随机贴纸']],
  ['cosy_rain', 'abstract_mood', '画一个下雨天也很温暖的地方', ['遮蔽空间与雨有关系', '温暖不只写在标题里']],
  ['brave_journey', 'abstract_mood', '画一幅勇敢出发去冒险的画', ['画面有目的地或行进关系', '主要行动可辨认']],
  ['home_for_giants', 'relative_scale', '画一个巨人和小动物一起住的村庄', ['巨人与小动物大小关系明显', '住处与两种体型有关']],
  ['tree_library', 'relationship', '画一个树枝之间藏着图书馆的地方', ['树与图书馆在空间上相连', '不只生成一本故事书']],
  ['no_castle', 'negation', '我想画一个魔法世界，但是不要城堡，也不要星星', ['没有城堡和星星', '替代构思仍表达魔法感']],
  ['correction', 'negation', '画一个冰雪世界，不对，改成春天的花园', ['以最后的春天花园为准', '不会把冰雪作为必需主体']],
  ['reference_not_book', 'reference', '画一个像童话故事里面那样的森林，不要画书', ['森林是场景', '没有字面书本或封面']],
  ['preserve_child_boat', 'preservation', '在我的小船上方画一个漂浮的花园，小船别动', ['保留孩子的小船位置与形状', '花园在船上方，不遮住它']],
  ['move_moon', 'modification', '把月亮移到左上角，其他都保持原样', ['只移动月亮', '城堡与道路身份和布局保留']],
  ['replace_moon', 'modification', '把月亮换成太阳，城堡和小路不要改', ['月亮替换为太阳', '城堡和道路保持']],
  ['add_path', 'modification', '在原来的城堡旁加一棵树，其他别动', ['增加树，主体不重新构思', '新树不会挡住城堡入口']],
  ['english_whale', 'relationship', 'Draw a little town on the back of a whale.', ['Whale silhouette is recognizable', 'Buildings sit on its back, rather than beside it']],
  ['english_quiet', 'abstract_mood', 'Create a quiet but surprising world made of leaves.', ['Visible use of leaves as a setting', 'Quiet hierarchy and a coherent surprising relationship']],
]

export const openSceneVersion = 'open-scenes-v1'
export const openSceneCases = cases.map(([id, group, utterance, checklist]) => ({ id, group, utterance,
  locale: id.startsWith('english_') ? 'en' : 'zh', checklist, ...(group === 'modification' ? { previous: 'castle_path_moon' } : {}),
  ...(group === 'preservation' ? { childDrawing: 'boat' } : {}) }))
export const openSceneHash = createHash('sha256').update(JSON.stringify(openSceneCases)).digest('hex')

export function previousOpenScene() {
  return { version: 1, title: '城堡旁的小路', summary: '城堡下有一条弯弯的小路，右上方有月亮。',
    request: '画一座城堡、一条通往城堡的小路和右上角的月亮', palette: { ...scenePalette }, preserve: [], objects: [
      { id: 'castle', name: '城堡', aliases: ['城堡'], role: 'main', essential: ['城堡'], color: '#66729b',
        render: { kind: 'compose', primitive: 'castle', parameters: { towers: 2 } }, box: { x: .31, y: .2, width: .36, height: .38 } },
      { id: 'path', name: '小路', aliases: ['道路'], role: 'support', essential: ['小路'], color: '#66729b', connectTo: 'castle',
        render: { kind: 'compose', primitive: 'path', parameters: { curve: 'left' } }, box: { x: .31, y: .58, width: .36, height: .3 } },
      { id: 'moon', name: '月亮', aliases: ['月亮'], role: 'atmosphere', essential: ['月亮'], color: '#66729b',
        render: { kind: 'compose', primitive: 'moon', parameters: { phase: 'crescent' } }, box: { x: .77, y: .06, width: .11, height: .15 } },
    ] }
}

export function openSceneContext(fixture) {
  const childBounds = fixture.childDrawing ? { x: .32, y: .79, width: .23, height: .13 } : null
  return { canvasAspect: 1.4, canvasSize: { width: 840, height: 600 }, requestScope: 'scene', age: 8,
    drawingStyle: { color: '#66729b', brushSize: 4, brushKind: 'round' },
    scene: { childBounds, niloBounds: null, recentContributions: childBounds ? [{ owner: 'child', bounds: childBounds, brushKind: 'round', color: '#23433b', strokeCount: 4 }] : [] },
    history: fixture.childDrawing ? [{ role: 'user', text: '下方是我画的小船。' }] : [] }
}
