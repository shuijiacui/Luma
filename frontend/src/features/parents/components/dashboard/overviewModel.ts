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
      '画面中有小船、波浪和远处的小岛。小船位于中间，周围留有空白；这个故事由孩子自己来讲。',
  },
  statuses: [
    { id: 'emotion', emoji: '☀️', label: '画面观察', value: 0, statusText: '看看画了什么', tone: 'grass' },
    { id: 'express', emoji: '💬', label: '孩子讲述', value: 0, statusText: '由孩子决定', tone: 'gold' },
    { id: 'imagine', emoji: '✨', label: '共创记录', value: 0, statusText: '保留创作过程', tone: 'clay' },
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
      title: '画面里出现的小船与道路',
      desc: '这些元素可以成为开放问题的起点；具体故事由孩子自己讲述。',
    },
    {
      id: 'together',
      emoji: '🤝',
      title: '画面里的人物与动物',
      desc: '可以问问孩子这些角色叫什么、正在做什么，不替他们定义关系。',
    },
  ],
  suggestions: [
    {
      id: 'talk',
      emoji: '💬',
      title: '从画面出发聊聊',
      desc: '“这艘小船要开去哪里？”孩子愿意说时，听听他自己的版本。',
    },
    {
      id: 'curiosity',
      emoji: '🔭',
      title: '支持 ta 的好奇心',
      desc: '如果孩子对小船的故事感兴趣，可以一起看看地图或继续画下一段旅程。',
    },
    {
      id: 'together',
      emoji: '🎨',
      title: '创造共同创作的时刻',
      desc: '陪 ta 补画一朵云、一只新朋友，让创作成为你们之间共同的默契语言。',
    },
  ],
  hint: '演示作品中有小船与伙伴；画面的含义以孩子自己的讲述为准。',
}

export const ELEMENT_ZH: Record<string, string> = {
  person: '人物', house: '房子', tree: '树', cloud: '云', rain: '雨', sun: '太阳', moon: '月亮',
  star: '星星', flower: '花', grass: '草', animal: '小动物', mountain: '山', river: '小河', water: '溪流', bird: '小鸟',
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
