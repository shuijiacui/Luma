import type { NiloStrokeSpec, NiloStrokePoint } from '@/lib/api/lumaApi'

/** 是否让 Nilo 陪伴作画：off=现在的样子，turn=一人一笔，ask=停笔后询问 */
export type CodrawMode = 'off' | 'turn' | 'ask'

/** Nilo 每一轮换一种"加笔意图"，避免每次都画一样的角落 */
export type CodrawIntent = 'companion' | 'detail' | 'echo'
const INTENTS: CodrawIntent[] = ['companion', 'detail', 'echo']
export function nextCodrawIntent(index: number): CodrawIntent {
  return INTENTS[Math.abs(index) % INTENTS.length]
}

const INTENT_SHAPES: Record<CodrawIntent, string[]> = {
  companion: ['sun', 'cloud', 'heart', 'leaf'],
  detail: ['dot', 'star', 'flower'],
  echo: ['wave', 'line', 'zigzag', 'spiral'],
}

const STORAGE_KEY = 'luma_nilo_codraw'
const VISIBLE_KEY = 'luma_nilo_visible'
const GENTLE_COLORS = ['#6fa8d8', '#8fbf7a', '#e4a86a', '#d98fa6', '#7a82d8', '#5fae9c']

export function readCodrawMode(): CodrawMode {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return value === 'turn' || value === 'ask' ? value : 'off'
  } catch {
    return 'off'
  }
}

export function saveCodrawMode(mode: CodrawMode) {
  try { localStorage.setItem(STORAGE_KEY, mode) } catch { /* 偏好可选 */ }
}

/** 本地兜底台词（都是已收录的词条，英文界面会自动翻译） */
const FALLBACK_LINES = [
  '我在这里加一条小波浪～',
  '送你一颗小星星！',
  '这里加一朵小花，会不会更漂亮？',
  '我画一个小太阳陪着你～',
  '添一片小叶子，让画面更热闹！',
  '我顺着你画的线再添一点点～',
  '在它旁边加一个小细节～',
  '这里加一个小伙伴陪它！',
] as const

type ShapeBuilder = (cx: number, cy: number, r: number) => NiloStrokePoint[]
const round = (value: number) => Math.round(Math.min(1, Math.max(0, value)) * 1000) / 1000

const shapes: Record<string, ShapeBuilder> = {
  dot: (cx, cy, r) => Array.from({ length: 8 }, (_, i) => {
    const angle = (i / 8) * Math.PI * 2
    return { x: round(cx + Math.cos(angle) * r * 0.6), y: round(cy + Math.sin(angle) * r * 0.6) }
  }).concat([{ x: round(cx + r * 0.6), y: round(cy) }]),
  wave: (cx, cy, r) => Array.from({ length: 9 }, (_, i) => ({
    x: round(cx - r + (i / 8) * r * 2),
    y: round(cy + Math.sin((i / 8) * Math.PI * 2) * r * 0.45),
  })),
  line: (cx, cy, r) => [
    { x: round(cx - r), y: round(cy + r * 0.5) },
    { x: round(cx), y: round(cy - r * 0.2) },
    { x: round(cx + r), y: round(cy + r * 0.35) },
  ],
  star: (cx, cy, r) => Array.from({ length: 11 }, (_, i) => {
    const angle = -Math.PI / 2 + (i / 10) * Math.PI * 4
    const radius = i % 2 === 0 ? r : r * 0.42
    return { x: round(cx + Math.cos(angle) * radius), y: round(cy + Math.sin(angle) * radius) }
  }),
  heart: (cx, cy, r) => Array.from({ length: 16 }, (_, i) => {
    const t = (i / 15) * Math.PI * 2
    const x = 16 * Math.sin(t) ** 3
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)
    return { x: round(cx + (x / 18) * r), y: round(cy - (y / 18) * r) }
  }),
  sun: (cx, cy, r) => Array.from({ length: 13 }, (_, i) => {
    const angle = (i / 12) * Math.PI * 2
    const radius = i % 2 === 0 ? r : r * 0.62
    return { x: round(cx + Math.cos(angle) * radius), y: round(cy + Math.sin(angle) * radius) }
  }),
  cloud: (cx, cy, r) => [
    { x: round(cx - r), y: round(cy + r * 0.25) },
    { x: round(cx - r * 0.55), y: round(cy - r * 0.25) },
    { x: round(cx - r * 0.1), y: round(cy - r * 0.5) },
    { x: round(cx + r * 0.4), y: round(cy - r * 0.2) },
    { x: round(cx + r), y: round(cy + r * 0.25) },
  ],
  flower: (cx, cy, r) => Array.from({ length: 12 }, (_, i) => {
    const angle = (i / 12) * Math.PI * 2
    const radius = i % 2 === 0 ? r : r * 0.45
    return { x: round(cx + Math.cos(angle) * radius), y: round(cy + Math.sin(angle) * radius) }
  }),
  leaf: (cx, cy, r) => Array.from({ length: 10 }, (_, i) => {
    const t = (i / 9) * Math.PI
    return { x: round(cx - r + (i / 9) * r * 2), y: round(cy + Math.sin(t) * r * 0.7 - r * 0.35) }
  }),
  zigzag: (cx, cy, r) => Array.from({ length: 7 }, (_, i) => ({
    x: round(cx - r + (i / 6) * r * 2),
    y: round(cy + (i % 2 === 0 ? r * 0.5 : -r * 0.5)),
  })),
  spiral: (cx, cy, r) => Array.from({ length: 16 }, (_, i) => {
    const t = (i / 15) * Math.PI * 3
    const radius = r * (0.2 + (i / 15) * 0.8)
    return { x: round(cx + Math.cos(t) * radius), y: round(cy + Math.sin(t) * radius) }
  }),
}

const KINDS = Object.keys(shapes)
/** 挑画面相对空的位置（避开中心，孩子通常画在中间） */
const ZONES = [
  { x: 0.16, y: 0.2 }, { x: 0.82, y: 0.22 }, { x: 0.18, y: 0.78 }, { x: 0.82, y: 0.78 },
]

/** 有内容分布时：在孩子画得最多的格子"旁边"下笔，而不是丢在空角落 */
function zoneFromInk(inkGrid: number[] | null | undefined, index: number) {
  const cells = 4
  if (!inkGrid || inkGrid.length !== cells * cells) return ZONES[Math.abs(index) % ZONES.length]
  let densest = 0
  inkGrid.forEach((value, cell) => { if (value > inkGrid[densest]) densest = cell })
  if (!inkGrid[densest]) return ZONES[Math.abs(index) % ZONES.length]
  const col = densest % cells
  const row = Math.floor(densest / cells)
  const targetCol = col < cells / 2 ? Math.min(cells - 1, col + 1) : Math.max(0, col - 1)
  const targetRow = row < cells / 2 ? Math.min(cells - 1, row + 1) : Math.max(0, row - 1)
  return { x: (targetCol + 0.5) / cells, y: (targetRow + 0.5) / cells }
}

/**
 * 本地规则笔触：模型慢/失败时使用，保证孩子永远不用等。
 * 优先贴着孩子画过的内容下笔，并按"意图"轮换形状。
 */
export function createLocalNiloStroke(
  index = 0,
  options: { inkGrid?: number[] | null; intent?: CodrawIntent; avoidKinds?: string[] } = {},
): NiloStrokeSpec {
  const intent = options.intent ?? nextCodrawIntent(index)
  const pool = INTENT_SHAPES[intent] ?? KINDS
  const avoid = new Set(options.avoidKinds ?? [])
  // 尽量换着来：优先挑最近没画过的形状
  const preferred = pool.filter(kind => !avoid.has(kind))
  const candidates = preferred.length ? preferred : pool
  const kind = candidates[Math.abs(index) % candidates.length]
  const zone = zoneFromInk(options.inkGrid, index)
  const radius = (intent === 'detail' ? 0.05 : 0.075) + ((Math.abs(index) % 3) * 0.012)
  return {
    kind,
    points: shapes[kind](zone.x, zone.y, radius),
    color: GENTLE_COLORS[Math.abs(index) % GENTLE_COLORS.length],
    width: 5 + (Math.abs(index) % 3),
    say: FALLBACK_LINES[Math.abs(index) % FALLBACK_LINES.length],
  }
}

/** 右下角 Nilo 是否显示（隐藏=图标消失且不说话） */
export function readNiloVisible(): boolean {
  try {
    return localStorage.getItem(VISIBLE_KEY) !== '0'
  } catch {
    return true
  }
}

export function saveNiloVisible(visible: boolean) {
  try { localStorage.setItem(VISIBLE_KEY, visible ? '1' : '0') } catch { /* 偏好可选 */ }
}
