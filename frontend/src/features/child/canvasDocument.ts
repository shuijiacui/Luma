import { createStrokePainter, type BrushKind, type Point } from './brushes'
import type { DrawingProposal } from './companion/proposals'
import { resolveDrawingOperations } from '../../../../shared/niloCanvasEdits.mjs'
import type { VoiceAction } from '../../../../shared/niloVoiceActions.mjs'

export type CanvasProvenance = 'child' | 'co-created' | 'unknown'
export interface NiloObjectData { name: string; proposals: DrawingProposal[]; aspect: number }
export type CanvasStroke = {
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
  object?: NiloObjectData
  /** Set only during an explicitly started tracing session, never by proximity. */
  guidance?: { guideId: string; name: string; subjects: string[] }
  /** Derived by replay, never persisted: holes travel with the ink they erased. */
  erasures?: CanvasStroke[]
}
export type CanvasEditAction = Extract<VoiceAction, { type: 'color' | 'move' | 'scale' | 'place' }>
export type CanvasOperation = CanvasStroke | { owner: 'child'; type: 'clear'; groupId: string }
  | { owner: 'nilo'; type: 'edit'; groupId: string; targetId: string; replacement: CanvasStroke[] }
  | { owner: 'nilo'; type: 'assist'; groupId: string; targetIds: string[]; actions: CanvasEditAction[] }
  | { owner: 'nilo'; type: 'assist-revert'; groupId: string; targetId: string }

export interface CanvasDocument {
  version: 1
  baseImage?: string
  baseSource: 'child' | 'unknown'
  /** Accepted collaboration can influence later child-only strokes, even after undo. */
  coCreated?: true
  /** A displayed guide can influence later strokes, even after it is dismissed. */
  guided?: true
  operations: CanvasOperation[]
}

export function cloneCanvasDocument(document: CanvasDocument): CanvasDocument {
  return structuredClone(document)
}

/** Replacements/assistance retain the original ink order. Clear closes an epoch. */
export function visibleOperations(document: CanvasDocument, options?: {maskErasers?: boolean}): (CanvasStroke | Extract<CanvasOperation,{type:'clear'}>)[] {
  return resolveDrawingOperations(document, options)
}

/** Historical original replay only, not a claim of an independent finished work.
 * After assistance, later strokes belong to a different scene; automatic analysis
 * must use the process metadata/snapshots rather than this recomposed bitmap. */
export function originalChildOperations(document: CanvasDocument): (CanvasStroke | Extract<CanvasOperation,{type:'clear'}>)[] {
  return document.operations.filter((op): op is CanvasStroke | Extract<CanvasOperation,{type:'clear'}> => op.owner === 'child' && (op.type === 'stroke' || op.type === 'clear'))
}

export function hasAssistedEdits(document: CanvasDocument): boolean {
  return document.coCreated === true || document.operations.some(op => op.type === 'assist')
}

export function getCanvasProvenance(document: CanvasDocument): CanvasProvenance {
  const hasClear = document.operations.some(op => op.type === 'clear')
  if (document.baseImage && document.baseSource === 'unknown' && !hasClear) return 'unknown'
  return document.coCreated || document.guided || document.operations.some(op => op.owner === 'nilo' || (op.type === 'stroke' && op.guidance)) ? 'co-created' : 'child'
}

const scratchLayers = new WeakMap<CanvasRenderingContext2D, HTMLCanvasElement>()

export function paintCanvasOperation(context: CanvasRenderingContext2D, width: number, height: number, op: CanvasOperation) {
  if (op.type === 'edit' || op.type === 'assist' || op.type === 'assist-revert') return
  if (op.type === 'clear') { context.clearRect(0, 0, width, height); return }
  if (!op.points.length) return
  if (op.erasures?.length && !op.eraser) {
    // A scratch layer is necessary: destination-out on the shared canvas would
    // cut holes in neighbouring strokes instead of only this selected stroke.
    const layer = scratchLayers.get(context) ?? document.createElement('canvas')
    scratchLayers.set(context, layer)
    if (layer.width !== width) layer.width = width
    if (layer.height !== height) layer.height = height
    const isolated = layer.getContext('2d')
    if (!isolated) throw new Error('Cannot isolate erased stroke')
    isolated.clearRect(0, 0, width, height)
    paintStroke(isolated, width, height, op)
    for (const erasure of op.erasures) paintStroke(isolated, width, height, erasure)
    context.save()
    try { context.globalCompositeOperation = 'source-over'; context.globalAlpha = 1; context.drawImage(layer, 0, 0) }
    finally { context.restore() }
    return
  }
  paintStroke(context, width, height, op)
}

function paintStroke(context: CanvasRenderingContext2D, width: number, height: number, op: CanvasStroke) {
  context.save()
  try {
    context.scale(width / op.referenceWidth, height / op.referenceHeight)
    const points = op.points.map(point => ({ x: point.x * op.referenceWidth, y: point.y * op.referenceHeight }))
    const painter = createStrokePainter(context, { kind: op.brushKind, color: op.color, size: op.size, eraser: op.eraser }, points[0])
    for (const point of points.slice(1)) painter.moveTo(point)
  } finally { context.restore() }
}

export function undoCanvasOwner(document: CanvasDocument, owner: 'child' | 'nilo'): boolean {
  const last = [...undoableOperations(document)].reverse().find(op => op.owner === owner)
  if (!last) return false
  if (document.operations.some(op => op.owner === 'nilo')) document.coCreated = true
  if (last.type === 'assist') {
    let suffix = document.operations.length
    while (document.operations.some(op => op.groupId === `assist-undo-${suffix}`)) suffix++
    document.operations.push({ owner: 'nilo', type: 'assist-revert', groupId: `assist-undo-${suffix}`, targetId: last.groupId })
    return true
  }
  document.operations = document.operations.filter(op => op.owner !== owner || op.groupId !== last.groupId)
  // Undoing a source stroke must not leave invalid transactions in persisted data.
  // Drop the complete dependent transaction, never replay it against a smaller set.
  if (last.type === 'stroke') {
    const affected = new Set([last.groupId]), removed = new Set<string>()
    for (const op of document.operations) {
      if (op.type === 'assist' && op.targetIds.some(id => affected.has(id))) {
        removed.add(op.groupId)
        for (const id of op.targetIds) affected.add(id)
      }
    }
    document.operations = document.operations.filter(op => !removed.has(op.groupId) && !(op.type === 'assist-revert' && removed.has(op.targetId)))
  }
  return true
}

function undoableOperations(document: CanvasDocument) {
  const reverted = new Set(document.operations.filter(op => op.type === 'assist-revert').map(op => op.targetId))
  return document.operations.filter(op => op.type !== 'assist-revert' && !(op.type === 'assist' && reverted.has(op.groupId)))
}

export function lastUndoOwner(document: CanvasDocument): 'child' | 'nilo' | null {
  return undoableOperations(document).at(-1)?.owner ?? null
}

export function undoLastCanvasOperation(document: CanvasDocument): boolean {
  const owner = lastUndoOwner(document)
  return owner ? undoCanvasOwner(document, owner) : false
}

export function canvasUndoCounts(document: CanvasDocument) {
  const operations = undoableOperations(document)
  return {
    child: new Set(operations.filter(op => op.owner === 'child').map(op => op.groupId)).size,
    nilo: new Set(operations.filter(op => op.owner === 'nilo').map(op => op.groupId)).size,
  }
}
