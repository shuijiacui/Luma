import type { BrushKind } from '../brushes'
import { drawingPlanFits, summarizeStroke, validateProposal, type DrawingProposal } from './proposals'

type Point = { x: number; y: number }
interface Options {
  stroke: { points: Point[]; color: string; width: number } | null
  style: { color: string; brushSize: number; brushKind: BrushKind }
  occupancy: number[]
  aspect: number
  surfaceSize?: { width: number; height: number }
}

/** A small geometric response to the real gesture, with no guessed subject or
 * extra model call. Every candidate uses the same footprint checks as AI ink.
 */
export function planLocalTurn({ stroke, style, occupancy, aspect, surfaceSize }: Options): DrawingProposal | null {
  if (!Number.isFinite(aspect) || aspect <= 0) return null
  const n = Math.sqrt(occupancy.length)
  if (!Number.isInteger(n) || n < 8 || occupancy.some(value => !Number.isFinite(value) || value < 0)) return null
  const height = surfaceSize?.height ?? 600, width = surfaceSize?.width ?? height * aspect
  if (!(width > 0 && height > 0)) return null
  const unit = Math.min(width, height)
  const base = { rotation: 0, color: style.color, strokeWidth: style.brushSize, brushKind: style.brushKind,
    target: '已有笔迹', relation: '用已有线条的形状接一小笔' }
  const checked = (raw: DrawingProposal) => {
    const proposal = validateProposal(raw)
    return proposal && drawingPlanFits([proposal], occupancy, aspect, { width, height }) ? proposal : null
  }
  const points = stroke?.points.filter(p => Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1) ?? []
  const source = summarizeStroke(stroke)
  const bounds = points.reduce((b, p) => ({ left: Math.min(b.left, p.x), right: Math.max(b.right, p.x), top: Math.min(b.top, p.y), bottom: Math.max(b.bottom, p.y) }), { left: 1, right: 0, top: 1, bottom: 0 })
  const span = points.length ? Math.max((bounds.right - bounds.left) * width, (bounds.bottom - bounds.top) * height) : 0
  const center = points.length ? { x: (bounds.left + bounds.right) / 2, y: (bounds.top + bounds.bottom) / 2 } : { x: .5, y: .5 }

  // A closed gesture receives a smaller inset of its actual outline.
  if (source && points.length >= 6 && span >= 24
    && Math.hypot((points[0].x - points.at(-1)!.x) * width, (points[0].y - points.at(-1)!.y) * height) <= Math.max(6, span * .12)) {
    for (const factor of [.72, .56, .4]) {
      const w = (bounds.right - bounds.left) * factor, h = (bounds.bottom - bounds.top) * factor
      const candidate = checked({ ...base, template: 'echo', echoPoints: source.points,
        x: center.x - w / 2, y: center.y - h / 2, width: w, height: h })
      if (candidate) return candidate
    }
  }

  const visibleSource = source && span >= 6 && span / unit >= .005
  const size = Math.min(unit * .2, Math.max(32, Math.min(72, span * .55), style.brushSize * 4))
  const w = Math.max(.025, size / width), h = Math.max(.025, size / height)
  const shape: DrawingProposal = visibleSource
    ? { ...base, template: 'echo', echoPoints: source.points, x: 0, y: 0, width: w, height: h }
    : { ...base, template: 'custom', subject: '起笔线', target: points.length ? '已有的小点' : '画布留白', relation: '接一小段开放曲线，让孩子继续画',
      x: 0, y: 0, width: w, height: h, sketch: { aspect: 1, paths: [[['M', .12, .68], ['Q', .45, .12, .88, .55]]] } }

  // A dot gets a visible outline around it, rather than an invisible copied dot.
  if (points.length && span < 6) {
    const radius = Math.max(16, style.brushSize * 1.5 + 3)
    const rw = Math.max(.025, 2 * radius / width), rh = Math.max(.025, 2 * radius / height)
    const ring = checked({ ...base, template: 'custom', subject: '小点的轮廓', relation: '围着已有的小点添一个轮廓',
      x: center.x - rw / 2, y: center.y - rh / 2, width: rw, height: rh,
      sketch: { aspect: rw * aspect / rh, paths: [[['E', .5, .5, .44, .44]]] } })
    if (ring) return ring
  }

  const anyInk = occupancy.some(value => value > .025)
  if (!anyInk) {
    const candidate = checked({ ...shape, x: center.x - w / 2, y: center.y - h / 2 })
    if (candidate) return candidate
  }
  // Stay close to the most recent gesture; repeated clicks occupy distinct
  // nearby spaces. Never use a model's rejected location as an escape hatch.
  const origins = points.length ? [points.at(-1)!, center, points[0]] : [center]
  const offsets = [[1, 0], [-1, 0], [0, -1], [0, 1], [1, -1], [-1, -1], [1, 1], [-1, 1]]
  for (const distance of [size * .65 + style.brushSize * 2 + 8, size + 24, size + 48]) {
    for (const origin of origins) for (const [dx, dy] of offsets) {
      const candidate = checked({ ...shape, x: origin.x + dx * distance / width - w / 2, y: origin.y + dy * distance / height - h / 2 })
      if (candidate) return candidate
    }
  }
  return null // A saturated canvas cannot take more ink without covering the child's work.
}
