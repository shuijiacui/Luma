import { applyAssistedActions, boundsOfStrokes, validateAssistedActions, type StrokeBounds } from '../../../../shared/niloCanvasEdits.mjs'
import { validateDrawingDocument } from '../../../../shared/niloDocument.mjs'
import { cloneCanvasDocument, visibleOperations, type CanvasDocument, type CanvasStroke } from './canvasDocument'

export type CanvasGroupBounds = StrokeBounds

export function boundsForGroups(document: CanvasDocument, targetIds: string[]): CanvasGroupBounds | null {
  const ids = new Set(targetIds)
  return boundsOfStrokes(visibleOperations(document).filter((op): op is CanvasStroke => op.type === 'stroke' && !op.eraser && ids.has(op.groupId)))
}

/** Raw stroke groups. A tracing guide may link several groups, but never changes authorship. */
export function editableStrokeGroups(document: CanvasDocument) {
  const groups = new Map<string, { id: string; owner: 'child' | 'nilo'; strokes: CanvasStroke[] }>()
  for (const op of visibleOperations(document)) {
    if (op.type !== 'stroke' || op.eraser) continue
    const group = groups.get(op.groupId) ?? { id: op.groupId, owner: op.owner, strokes: [] }
    group.strokes.push(op); groups.set(op.groupId, group)
  }
  return [...groups.values()].map(group => ({ ...group, bounds: boundsOfStrokes(group.strokes)!,
    guidance: group.strokes.find(stroke => stroke.guidance)?.guidance,
    name: group.strokes.find(stroke => stroke.guidance)?.guidance?.name ?? group.strokes.find(stroke => stroke.object)?.object?.name,
  }))
}

/** Returns an entirely new append-only document, or rejects the whole transaction. */
export function prepareAssistedEdit(document: CanvasDocument, targetIds: string[], input: unknown, transactionId: string): CanvasDocument | null {
  const actions = validateAssistedActions(input)
  if (!actions || !transactionId || transactionId.length > 100 || document.operations.some(op => op.groupId === transactionId)) return null
  if (!applyAssistedActions(visibleOperations(document), targetIds, actions)) return null
  const next = cloneCanvasDocument(document)
  next.coCreated = true
  next.operations.push({ type: 'assist', owner: 'nilo', groupId: transactionId, targetIds: [...targetIds], actions })
  return validateDrawingDocument(next) ? next : null
}
