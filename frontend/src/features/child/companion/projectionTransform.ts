import type { DrawingProposal } from './proposals'

/** Uniform group transform in normalized canvas coordinates, independent of CSS size. */
export function projectionTransform(items: DrawingProposal[], change: { dx?: number; dy?: number; scale?: number }, aspect: number, size?: {width:number;height:number}): Partial<DrawingProposal> | null {
  if (!items.length || !(aspect > 0) || Object.values(change).some(n => !Number.isFinite(n))) return null
  const radius = Math.max(...items.map(p => p.strokeWidth * ({round:1,pencil:.4,marker:1.8,crayon:1,star:2.5}[p.brushKind ?? 'round']) / 2 + 1))
  const marginX = Math.max(.025, size?.width ? radius / size.width : 0)
  const marginY = Math.max(.025, size?.height ? radius / size.height : 0)
  const boxes = items.map(p => {
    const angle = p.rotation * Math.PI / 180
    const w = Math.abs(p.width * Math.cos(angle)) + Math.abs(p.height * Math.sin(angle)) / aspect
    const h = Math.abs(p.height * Math.cos(angle)) + Math.abs(p.width * Math.sin(angle)) * aspect
    return { x: p.x + (p.width - w) / 2, y: p.y + (p.height - h) / 2, width: w, height: h }
  })
  const left = Math.min(...boxes.map(p => p.x)), top = Math.min(...boxes.map(p => p.y))
  const right = Math.max(...boxes.map(p => p.x + p.width)), bottom = Math.max(...boxes.map(p => p.y + p.height))
  const minScale = Math.max(...items.flatMap(p => [.026 / p.width, .026 / p.height]))
  const maxScale = Math.min((1 - marginX * 2) / (right - left), (1 - marginY * 2) / (bottom - top),
    ...items.flatMap(p => [.449999 / p.width, .449999 / p.height, Math.sqrt(.159 / (p.width * p.height))]))
  if (minScale > maxScale) return null
  const scale = Math.max(minScale, Math.min(maxScale, change.scale ?? 1))
  const x = Math.max(marginX, Math.min(1 - marginX - (right - left) * scale, left + (change.dx ?? 0)))
  const y = Math.max(marginY, Math.min(1 - marginY - (bottom - top) * scale, top + (change.dy ?? 0)))
  const p = items[0]
  return { x: x + (p.x - left) * scale, y: y + (p.y - top) * scale, width: p.width * scale, height: p.height * scale }
}
