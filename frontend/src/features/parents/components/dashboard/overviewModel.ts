import type { ArtworkKind } from './artworks'

export interface OverviewStatus {
  id: string
  emoji: string
  label: string
  value: number
  statusText: string
  tone: 'grass' | 'clay' | 'gold' | 'teal'
}

export interface ThemeTile {
  id: string
  title: string
  count: number
  kind?: ArtworkKind
  /** 受保护的图片路径，需带 Authorization 头取用（见 AuthedArtwork），不能直接当 src */
  imagePath?: string
}

export interface Finding {
  id: string
  emoji: string
  title: string
  desc: string
}

export interface Suggestion {
  id: string
  emoji: string
  title: string
  desc: string
}

export interface ArtworkInfo {
  id: string
  kind?: ArtworkKind
  /** 受保护的图片路径，需带 Authorization 头取用（见 AuthedArtwork），不能直接当 src */
  imagePath?: string
  title: string
  dateLabel?: string
  quote?: string
  tags: string[]
  observation: string
}

export interface OverviewModel {
  artwork: ArtworkInfo
  statuses: OverviewStatus[]
  themes: ThemeTile[]
  findings: Finding[]
  suggestions: Suggestion[]
  hint: string
  periodLabel: string
}

export const PERIOD_LABEL = '过去 4 周'

/** 游客演示（与设计稿一致的主界面内容） */
export const DEMO_OVERVIEW: OverviewModel = {
  periodLabel: PERIOD_LABEL,
  artwork: {
    id: 'demo-boat',
    kind: 'boat',
    title: '一艘去远方的小船',
    dateLabel: '9 月 5 日',
    quote: '“我的小船要去很远很远的地方，那里会不会有新朋友在等我？”',
    tags: ['探索', '自然', '伙伴', '想象'],
    observation:
      '小船、波浪和远方的小岛，构成一个关于“出发”的故事。孩子把船放在画面中央、朝向留白处驶去，像是在表达对未知世界的期待——既有想出去看看的愿望，也藏着对“有谁一起”的在意。',
  },
  statuses: [
    { id: 'emotion', emoji: '☀️', label: '情绪倾向', value: 76, statusText: '平稳积极', tone: 'grass' },
    { id: 'express', emoji: '💬', label: '表达意愿', value: 84, statusText: '较主动', tone: 'gold' },
    { id: 'imagine', emoji: '✨', label: '想象丰富度', value: 92, statusText: '丰富', tone: 'clay' },
  ],
  themes: [
    { id: 'animal', title: '动物', count: 8, kind: 'animal' },
    { id: 'travel', title: '探索与旅行', count: 6, kind: 'boat' },
    { id: 'family', title: '朋友与家人', count: 5, kind: 'family' },
    { id: 'nature', title: '自然与天气', count: 4, kind: 'nature' },
  ],
  findings: [
    {
      id: 'far',
      emoji: '🧭',
      title: '对“远方”的兴趣在增加',
      desc: '小船、道路与远处的地平线近期多次出现，孩子开始把目光投向画面之外。',
    },
    {
      id: 'together',
      emoji: '🤝',
      title: '更常画“和谁在一起”',
      desc: '画面中结伴出现的人物与小动物变多了，“关系”成为孩子表达里重要的一部分。',
    },
  ],
  suggestions: [
    {
      id: 'talk',
      emoji: '💬',
      title: '从画面出发聊聊',
      desc: '“这艘小船要开去哪里？你想和谁一起去？”让孩子做故事的主角，ta 会愿意讲给你听。',
    },
    {
      id: 'curiosity',
      emoji: '🔭',
      title: '支持 ta 的好奇心',
      desc: '当孩子反复画“远方”，可以一起看看地图、聊聊旅行，把想象轻轻接进生活里。',
    },
    {
      id: 'together',
      emoji: '🎨',
      title: '创造共同创作的时刻',
      desc: '陪 ta 补画一朵云、一只新朋友，让创作成为你们之间共同的默契语言。',
    },
  ],
  hint: 'ta 最近的作品中，常常出现探索与伙伴的主题，这可能与对外部世界的兴趣有关。',
}

export const ELEMENT_ZH: Record<string, string> = {
  person: '人物', house: '房子', tree: '树', cloud: '云', rain: '雨', sun: '太阳', moon: '月亮',
  star: '星星', flower: '花', grass: '草', animal: '小动物', mountain: '山', river: '小河', bird: '小鸟',
  cat: '小猫', dog: '小狗', car: '汽车', rainbow: '彩虹', butterfly: '蝴蝶', fish: '小鱼', boat: '小船',
  fence: '栅栏', road: '小路',
}

export function elementLabel(value: string) {
  return ELEMENT_ZH[value] ?? value.replaceAll('_', ' ')
}

const KIND_RULES: { kind: ArtworkKind; keys: string[] }[] = [
  { kind: 'animal', keys: ['animal', 'cat', 'dog', 'bird', 'fish', 'butterfly'] },
  { kind: 'nature', keys: ['tree', 'flower', 'rain', 'cloud', 'sun', 'moon', 'star', 'grass', 'mountain', 'rainbow'] },
  { kind: 'family', keys: ['person', 'house', 'fence'] },
  { kind: 'boat', keys: ['boat', 'river', 'road', 'car'] },
]

export function kindForElements(elements: string[]): ArtworkKind | undefined {
  for (const rule of KIND_RULES) {
    if (elements.some((el) => rule.keys.includes(el))) return rule.kind
  }
  return undefined
}
