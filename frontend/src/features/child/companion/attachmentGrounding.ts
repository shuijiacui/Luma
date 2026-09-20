import type { CanvasDocument } from '../canvasDocument'
import type { DrawingProposal } from './proposals'

/** Refine only a nearby, visually chosen join; never guess a new semantic location. */
export function refineAttachment(p: DrawingProposal, document: CanvasDocument, aspect: number): DrawingProposal {
  const join = p.attachment, anchor = p.anchor
  if (!join || !anchor || !Number.isFinite(aspect) || aspect <= 0) return p
  const inside = (point: {x:number;y:number}) => point.x >= anchor.x && point.x <= anchor.x + anchor.width
    && point.y >= anchor.y && point.y <= anchor.y + anchor.height
  let distance = .012 * Math.min(1, aspect), best = join
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
      if (d < distance && inside(point)) { best = point; distance = d }
    }
  }
  return best === join ? p : {...p,attachment:best,x:p.x+best.x-join.x,y:p.y+best.y-join.y}
}
