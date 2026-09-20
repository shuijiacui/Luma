import type { CanvasDocument } from '../canvasDocument'
import type { DrawingProposal } from './proposals'

/** Refine only a nearby, visually chosen join; never guess a new semantic location. */
export function refineAttachment(p: DrawingProposal, document: CanvasDocument, aspect: number): DrawingProposal {
  const join = p.attachment, anchor = p.anchor
  if (!join || !anchor || !Number.isFinite(aspect) || aspect <= 0) return p
  const inside = (point: {x:number;y:number}) => point.x >= anchor.x && point.x <= anchor.x + anchor.width
    && point.y >= anchor.y && point.y <= anchor.y + anchor.height
  const shortSide = Math.min(1, aspect)
  const radius = Math.min(.03 * shortSide, .2 * Math.max(anchor.width * aspect, anchor.height))
  const candidates: { point: { x: number; y: number }; distance: number }[] = []
  // Erasure cannot be reconstructed from source segments alone. Conservatively
  // use only ink added after the last clear/eraser; the raster collision check
  // still decides whether the final join meets visible ink.
  let start = 0
  document.operations.forEach((op, i) => { if (op.type === 'clear' || op.eraser) start = i + 1 })
  for (const op of document.operations.slice(start)) {
    if (op.type !== 'stroke' || op.eraser || op.brushKind === 'star') continue
    for (let i = 0; i < op.points.length; i++) {
      const a = op.points[i], b = op.points[i + 1] ?? a
      const dx = (b.x - a.x) * aspect, dy = b.y - a.y, length2 = dx*dx + dy*dy
      const t = length2 ? Math.max(0, Math.min(1, ((join.x-a.x)*aspect*dx + (join.y-a.y)*dy)/length2)) : 0
      const point = {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t}
      const d = Math.hypot((point.x-join.x)*aspect,point.y-join.y)
      if (d <= radius && inside(point)) candidates.push({ point, distance: d })
    }
  }
  candidates.sort((a, b) => a.distance - b.distance)
  const best = candidates[0]
  if (!best) return p
  // A small vision error can be repaired locally. A larger move must have one
  // clear nearby line, rather than arbitrarily choosing between two branches.
  if (best.distance > .012 * shortSide && candidates.some(other => other.distance <= best.distance + .004 * shortSide
    && Math.hypot((other.point.x - best.point.x) * aspect, other.point.y - best.point.y) > .018 * shortSide)) return p
  return {...p,attachment:best.point,x:p.x+best.point.x-join.x,y:p.y+best.point.y-join.y}
}
