import type { BrushKind } from './brushes'
import { visibleOperations, type CanvasDocument, type CanvasOperation } from './canvasDocument'

export interface CompanionSceneBox { x: number; y: number; width: number; height: number }
export interface CompanionSceneContribution {
  owner: 'child' | 'nilo'
  bounds: CompanionSceneBox
  /** The last brush/color in this confirmed contribution. */
  brushKind: BrushKind
  color: string
  strokeCount: number
}
export interface CompanionScene {
  childBounds: CompanionSceneBox | null
  niloBounds: CompanionSceneBox | null
  recentContributions: CompanionSceneContribution[]
}

const rounded = (value: number) => Math.round(value * 1_000_000) / 1_000_000
function box(left: number, top: number, right: number, bottom: number): CompanionSceneBox | null {
  const x = rounded(Math.max(0, Math.min(1, left)))
  const y = rounded(Math.max(0, Math.min(1, top)))
  const width = rounded(Math.max(0, Math.min(1, right)) - x)
  const height = rounded(Math.max(0, Math.min(1, bottom)) - y)
  return width > 0 && height > 0 ? { x, y, width, height } : null
}
function union(a: CompanionSceneBox | null, b: CompanionSceneBox): CompanionSceneBox {
  if (!a) return { ...b }
  return box(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.max(a.x + a.width, b.x + b.width), Math.max(a.y + a.height, b.y + b.height))!
}

function strokeBounds(op: Extract<CanvasOperation, { type: 'stroke' }>) {
  if (op.eraser || !op.points.length || !Number.isFinite(op.size) || op.size <= 0 || op.referenceWidth <= 0 || op.referenceHeight <= 0) return null
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity
  for (const point of op.points) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue
    left = Math.min(left, point.x); right = Math.max(right, point.x)
    top = Math.min(top, point.y); bottom = Math.max(bottom, point.y)
  }
  if (!Number.isFinite(left)) return null
  // Conservative brush extents, including the rotated marker and crayon grains.
  const radius = op.brushKind === 'star' ? op.size * 1.25
    : op.brushKind === 'pencil' ? op.size * .2
      : op.brushKind === 'marker' ? op.size * 1.8 * Math.hypot(.5, 1 / 6)
        : op.brushKind === 'crayon' ? op.size / 2 + Math.max(.6, op.size * .07) : op.size / 2
  const paddingX = (radius + 1) / op.referenceWidth
  const paddingY = (radius + 1) / op.referenceHeight
  return box(left - paddingX, top - paddingY, right + paddingX, bottom + paddingY)
}

/**
 * Position hints from confirmed operation groups, never DOM previews or raw point lists.
 * Bounds are conservative: local erasure/overpainting can leave extra space inside a
 * historical group's box. The current composite image remains the visual authority.
 */
export function getCompanionScene(document: CanvasDocument): CompanionScene {
  let childBounds: CompanionSceneBox | null = document.baseImage && document.baseSource === 'child'
    ? { x: 0, y: 0, width: 1, height: 1 } : null
  let niloBounds: CompanionSceneBox | null = null
  const groups = new Map<string, CompanionSceneContribution>()
  for (const op of visibleOperations(document)) {
    if (op.type === 'clear') { childBounds = null; niloBounds = null; groups.clear(); continue }
    const bounds = strokeBounds(op)
    if (!bounds) continue
    if (op.owner === 'child') childBounds = union(childBounds, bounds)
    else niloBounds = union(niloBounds, bounds)
    const key = `${op.owner}:${op.groupId}`
    const previous = groups.get(key)
    groups.delete(key)
    groups.set(key, { owner: op.owner, bounds: union(previous?.bounds ?? null, bounds), brushKind: op.brushKind,
      color: op.color, strokeCount: (previous?.strokeCount ?? 0) + 1 })
  }
  return { childBounds, niloBounds, recentContributions: [...groups.values()].slice(-12) }
}
