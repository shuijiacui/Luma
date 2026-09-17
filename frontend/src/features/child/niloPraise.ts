import type { NiloStrokePoint } from '@/lib/api/lumaApi'

export interface NiloPraise {
  praise: string
  suggestion: string
}

export interface LastStrokeInfo {
  points: NiloStrokePoint[]
  color: string
  width: number
}

type Shape = 'dot' | 'loop' | 'wave' | 'straight' | 'zigzag' | 'unknown'

const SHAPE_PRAISE: Record<Shape, NiloPraise> = {
  dot: { praise: '这里多了几个小圆点，像小雨滴～', suggestion: '可以试着画一条小鱼。' },
  loop: { praise: '一圈一圈的，好像小蜗牛的家～', suggestion: '要不要在圈里画一只小蜗牛？' },
  wave: { praise: '这条线弯弯的，好像一条小路～', suggestion: '可以在小路旁边画一棵小树。' },
  straight: { praise: '这条线直直的，像一条小路！', suggestion: '可以在路边画一座小房子。' },
  zigzag: { praise: '这弯弯折折的线，像小山坡！', suggestion: '试试让一只小鸟飞过山坡吧。' },
  unknown: { praise: '我看到你在认真画啦～', suggestion: '可以再添一点点小细节。' },
}

const COLOR_PRAISE = [
  { praise: '这个颜色暖暖的，像晒过太阳～', suggestion: '给它旁边画一个小太阳吧。' },
  { praise: '这个颜色清清爽爽的，很好看～', suggestion: '可以试试在旁边画一朵云。' },
  { praise: '你选的颜色让画面亮起来了！', suggestion: '再添一点别的颜色试试看？' },
]

const MORE_SUGGESTIONS = [
  '可以试着画一条小鱼。',
  '要不要在旁边加一个小太阳？',
  '给它画一个好朋友吧。',
  '可以试试添一朵小花。',
  '再画一点小草，会不会更热闹？',
]

function warmColor(hex: string): boolean {
  const match = /^#([0-9a-f]{6})$/i.exec(hex ?? '')
  if (!match) return true
  const value = parseInt(match[1], 16)
  const r = (value >> 16) & 255
  const b = value & 255
  return r >= b
}

function signedAngle(a: NiloStrokePoint, b: NiloStrokePoint, c: NiloStrokePoint): number {
  const v1x = b.x - a.x, v1y = b.y - a.y
  const v2x = c.x - b.x, v2y = c.y - b.y
  return Math.atan2(v1x * v2y - v1y * v2x, v1x * v2x + v1y * v2y)
}

function detectShape(points: NiloStrokePoint[]): Shape {
  if (!points || points.length < 2) return 'unknown'
  const xs = points.map(point => point.x)
  const ys = points.map(point => point.y)
  const width = Math.max(...xs) - Math.min(...xs)
  const height = Math.max(...ys) - Math.min(...ys)
  const diagonal = Math.hypot(width, height)
  // 只占很小一块 = 像小圆点/小点簇；注意直线不能用"长度≈对角线"来判断
  if (Math.max(width, height) < 0.06) return 'dot'

  let length = 0
  for (let i = 1; i < points.length; i += 1) {
    length += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y)
  }

  let totalTurn = 0
  let sharpTurns = 0
  let softTurns = 0
  for (let i = 2; i < points.length; i += 1) {
    const angle = signedAngle(points[i - 2], points[i - 1], points[i])
    totalTurn += angle
    if (Math.abs(angle) > (Math.PI / 180) * 55) sharpTurns += 1
    else if (Math.abs(angle) > (Math.PI / 180) * 18) softTurns += 1
  }
  const closed = Math.hypot(points[0].x - points[points.length - 1].x, points[0].y - points[points.length - 1].y) < diagonal * 0.45
  if (Math.abs(totalTurn) > Math.PI * 1.4 && closed) return 'loop'
  if (sharpTurns >= 3) return 'zigzag'
  if (softTurns >= 2 || Math.abs(totalTurn) > Math.PI * 0.5) return 'wave'
  if (length < diagonal * 1.2) return 'straight'
  return 'wave'
}

/**
 * 本地即时夸奖 + 下一步建议：先看孩子最后一笔像什么（波浪/直/圆/折/点），
 * 再结合画面内容多少给一个孩子做得到的小建议。模型没回来时也能立刻说话。
 */
export function describeStrokeLocally(
  lastStroke: LastStrokeInfo | null,
  stats: { strokes?: number; inkGrid?: number[] | null } = {},
): NiloPraise {
  const shape = detectShape(lastStroke?.points ?? [])
  const base = SHAPE_PRAISE[shape]
  if (!lastStroke) {
    return { praise: base.praise, suggestion: MORE_SUGGESTIONS[0] }
  }

  const inkCells = stats.inkGrid?.filter(value => value > 0.05).length ?? 0
  const sparse = (stats.strokes ?? 0) <= 3 || inkCells <= 2
  const pick = Math.abs(stats.strokes ?? 0) % 2
  const colorIndex = Math.abs(stats.strokes ?? 0) % COLOR_PRAISE.length
  const colorLine = warmColor(lastStroke.color)
    ? COLOR_PRAISE[colorIndex]
    : COLOR_PRAISE[(colorIndex + 1) % COLOR_PRAISE.length]
  const suggestion = sparse
    ? MORE_SUGGESTIONS[Math.abs(stats.strokes ?? 0) % MORE_SUGGESTIONS.length]
    : base.suggestion

  // 一半时候夸"像什么"，一半时候夸颜色，避免重复
  return pick === 0
    ? { praise: base.praise, suggestion }
    : { praise: colorLine.praise, suggestion: sparse ? colorLine.suggestion : suggestion }
}

/** 模型给的夸奖也走同一套长度/内容兜底 */
export function normalizePraise(praise: string | null | undefined, suggestion: string | null | undefined): NiloPraise | null {
  const cleanPraise = typeof praise === 'string' ? praise.replace(/\s+/g, ' ').trim().slice(0, 30) : ''
  const cleanSuggestion = typeof suggestion === 'string' ? suggestion.replace(/\s+/g, ' ').trim().slice(0, 30) : ''
  if (!cleanPraise) return null
  return { praise: cleanPraise, suggestion: cleanSuggestion }
}
