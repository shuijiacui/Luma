import { createStrokePainter, type BrushKind, type Point } from './brushes'

export type CanvasProvenance = 'child' | 'co-created' | 'unknown'
export type CanvasOperation = {
  owner: 'child' | 'nilo'
  type: 'stroke'
  groupId: string
  points: Point[]
  color: string
  size: number
  brushKind: BrushKind
  eraser: boolean
  /** Coordinates and brush size are replayed in their original drawing space. */
  referenceWidth: number
  referenceHeight: number
} | { owner: 'child'; type: 'clear'; groupId: string }

export interface CanvasDocument {
  version: 1
  baseImage?: string
  baseSource: 'child' | 'unknown'
  /** Accepted collaboration can influence later child-only strokes, even after undo. */
  coCreated?: true
  operations: CanvasOperation[]
}

export function cloneCanvasDocument(document: CanvasDocument): CanvasDocument {
  return { ...document, operations: document.operations.map(op => op.type === 'stroke'
    ? { ...op, points: op.points.map(point => ({ ...point })) } : { ...op }) }
}

export function getCanvasProvenance(document: CanvasDocument): CanvasProvenance {
  const hasClear = document.operations.some(op => op.type === 'clear')
  if (document.baseImage && document.baseSource === 'unknown' && !hasClear) return 'unknown'
  return document.coCreated || document.operations.some(op => op.owner === 'nilo') ? 'co-created' : 'child'
}

export function paintCanvasOperation(context: CanvasRenderingContext2D, width: number, height: number, op: CanvasOperation) {
  if (op.type === 'clear') { context.clearRect(0, 0, width, height); return }
  if (!op.points.length) return
  context.save()
  try {
    context.scale(width / op.referenceWidth, height / op.referenceHeight)
    const points = op.points.map(point => ({ x: point.x * op.referenceWidth, y: point.y * op.referenceHeight }))
    const painter = createStrokePainter(context, { kind: op.brushKind, color: op.color, size: op.size, eraser: op.eraser }, points[0])
    for (const point of points.slice(1)) painter.moveTo(point)
  } finally { context.restore() }
}

export function undoCanvasOwner(document: CanvasDocument, owner: 'child' | 'nilo'): boolean {
  const last = [...document.operations].reverse().find(op => op.owner === owner)
  if (!last) return false
  if (document.operations.some(op => op.owner === 'nilo')) document.coCreated = true
  document.operations = document.operations.filter(op => op.owner !== owner || op.groupId !== last.groupId)
  return true
}

export function canvasUndoCounts(document: CanvasDocument) {
  return {
    child: new Set(document.operations.filter(op => op.owner === 'child').map(op => op.groupId)).size,
    nilo: new Set(document.operations.filter(op => op.owner === 'nilo').map(op => op.groupId)).size,
  }
}
