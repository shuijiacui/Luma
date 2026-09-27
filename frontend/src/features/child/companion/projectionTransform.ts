import type { DrawingProposal } from './proposals'
import { drawingProposalLimits } from '../../../../../shared/niloProposalLimits.mjs'

/** Uniform group transform in normalized canvas coordinates, independent of CSS size. */
export function projectionTransform(items: DrawingProposal[], change: { dx?: number; dy?: number; scale?: number }, aspect: number, size?: {width:number;height:number}): Partial<DrawingProposal> | null {
  if (!items.length || !Number.isFinite(aspect) || !(aspect > 0) || Object.values(change).some(n => !Number.isFinite(n))
    || items.some(p => ![p.x,p.y,p.width,p.height,p.rotation,p.strokeWidth].every(Number.isFinite) || p.width <= 0 || p.height <= 0)) return null
  const radius = Math.max(...items.map(p => p.strokeWidth * ({round:1,pencil:.4,marker:1.8,crayon:1,star:2.5}[p.brushKind ?? 'round']) / 2 + 1))
  const marginX = Math.max(.025, size?.width ? radius / size.width : 0)
  const marginY = Math.max(.025, size?.height ? radius / size.height : 0)
  const boxes = items.map(p => {
    const angle = p.rotation * Math.PI / 180
    const w = Math.abs(p.width * Math.cos(angle)) + Math.abs(p.height * Math.sin(angle)) / aspect
    const h = Math.abs(p.height * Math.cos(angle)) + Math.abs(p.width * Math.sin(angle)) * aspect
    // Validators require both the normalized frame and its rotated footprint
    // to stay on paper. A narrow 90-degree object can otherwise be visibly on
    // paper while its original frame has a negative x or y and gets rejected.
    const width = Math.max(p.width, w), height = Math.max(p.height, h)
    return { x: p.x + (p.width - width) / 2, y: p.y + (p.height - height) / 2, width, height }
  })
  const left = Math.min(...boxes.map(p => p.x)), top = Math.min(...boxes.map(p => p.y))
  const right = Math.max(...boxes.map(p => p.x + p.width)), bottom = Math.max(...boxes.map(p => p.y + p.height))
  const minScale = Math.max(...items.flatMap(p => [.025000001 / p.width, .025000001 / p.height]))
  const maxScale = Math.min((1 - marginX * 2) / (right - left), (1 - marginY * 2) / (bottom - top),
    ...items.flatMap(p => {
      const { maxSpan, maxArea } = drawingProposalLimits(p)
      return [(maxSpan - 1e-9) / p.width, (maxSpan - 1e-9) / p.height, Math.sqrt((maxArea - 1e-9) / (p.width * p.height))]
    }))
  if (minScale > maxScale) return null
  const scale = Math.max(minScale, Math.min(maxScale, change.scale ?? 1))
  const x = Math.max(marginX, Math.min(1 - marginX - (right - left) * scale, left + (change.dx ?? 0)))
  const y = Math.max(marginY, Math.min(1 - marginY - (bottom - top) * scale, top + (change.dy ?? 0)))
  const p = items[0]
  return { x: x + (p.x - left) * scale, y: y + (p.y - top) * scale, width: p.width * scale, height: p.height * scale }
}
