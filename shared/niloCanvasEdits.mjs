import { validateAssistedActions } from './niloVoiceActions.mjs'
export { validateAssistedActions } from './niloVoiceActions.mjs'

/** Brush footprints, not just centre lines, determine the editable object's bounds. */
export function strokeBounds(stroke) {
  const diameter = stroke.size * (stroke.eraser || stroke.brushKind === 'star' ? 2.5
    : stroke.brushKind === 'pencil' ? .4 : stroke.brushKind === 'marker' ? 1.8 : 1)
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const point of stroke.points) {
    minX = Math.min(minX, point.x); minY = Math.min(minY, point.y)
    maxX = Math.max(maxX, point.x); maxY = Math.max(maxY, point.y)
  }
  const padX = diameter / stroke.referenceWidth / 2, padY = diameter / stroke.referenceHeight / 2
  return { x: minX - padX, y: minY - padY, width: maxX - minX + padX * 2, height: maxY - minY + padY * 2 }
}

export function boundsOfStrokes(strokes) {
  if (!strokes.length) return null
  let x = Infinity, y = Infinity, right = -Infinity, bottom = -Infinity
  for (const stroke of strokes) {
    const b = strokeBounds(stroke)
    x = Math.min(x, b.x); y = Math.min(y, b.y)
    right = Math.max(right, b.x + b.width); bottom = Math.max(bottom, b.y + b.height)
  }
  return { x, y, width: right - x, height: bottom - y }
}

const intersects = (a, b) => a.x <= b.x + b.width && a.x + a.width >= b.x && a.y <= b.y + b.height && a.y + a.height >= b.y
const isInk = op => op.type === 'stroke' && !op.eraser
const sameTarget = (op, ids) => isInk(op) && ids.has(op.groupId)

function transformStroke(stroke, cx, cy, factor, dx, dy) {
  const next = { ...stroke, size: stroke.size * factor,
    points: stroke.points.map(p => ({ x: cx + (p.x - cx) * factor + dx, y: cy + (p.y - cy) * factor + dy })) }
  if (stroke.erasures?.length) next.erasures = stroke.erasures.map(mask => transformStroke(mask, cx, cy, factor, dx, dy))
  return next
}

/** Apply a complete transaction to resolved strokes. The caller's arrays are never changed. */
export function applyAssistedActions(operations, targetIds, input) {
  const actions = validateAssistedActions(input)
  if (!actions || !Array.isArray(targetIds) || !targetIds.length || targetIds.length > 2000
    || targetIds.some(id => typeof id !== 'string' || !id.length || id.length > 100) || new Set(targetIds).size !== targetIds.length) return null
  const ids = new Set(targetIds)
  const selected = operations.filter(op => sameTarget(op, ids))
  if (new Set(selected.map(op => op.groupId)).size !== ids.size) return null
  let edited = selected
  let geometryChanged = false
  for (const action of actions) {
    if (action.type === 'color') {
      edited = edited.map(op => ({ ...op, color: action.value }))
      continue
    }
    geometryChanged = true
    const b = boundsOfStrokes(edited)
    const cx = b.x + b.width / 2, cy = b.y + b.height / 2
    const factor = action.type === 'scale' ? action.factor : 1
    const dx = action.type === 'move' ? action.dx : action.type === 'place' ? action.x - cx : 0
    const dy = action.type === 'move' ? action.dy : action.type === 'place' ? action.y - cy : 0
    edited = edited.map(op => transformStroke(op, cx, cy, factor, dx, dy))
  }
  // Never apply only the valid prefix of a compound command. Colour alone may
  // modify an existing edge-clipped stroke without imposing new geometry rules.
  if (edited.some(op => !Number.isFinite(op.size) || op.size < .01 || op.size > 1024
    || op.points.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 0 || p.y < 0 || p.x > 1 || p.y > 1))) return null
  if (geometryChanged) {
    const b = boundsOfStrokes(edited)
    if (b.x < -1e-9 || b.y < -1e-9 || b.x + b.width > 1 + 1e-9 || b.y + b.height > 1 + 1e-9) return null
  }
  let index = 0
  return operations.map(op => sameTarget(op, ids) ? edited[index++] : op)
}

/** Compact inverse metadata is derived from the historical transaction. It is
 * not persisted and contains no copied paths. Later erasure masks are reversed
 * with their ink, preserving holes made after the original assistance. */
export function assistedReversal(before, after, targetIds) {
  const ids = new Set(targetIds), old = before.filter(op => sameTarget(op, ids)), next = after.filter(op => sameTarget(op, ids))
  const indices = new Map()
  return old.map((stroke, i) => {
    const index = indices.get(stroke.groupId) ?? 0
    indices.set(stroke.groupId, index + 1)
    const factor = next[i].size / stroke.size
    return { groupId: stroke.groupId, index, factor, dx: next[i].points[0].x - stroke.points[0].x * factor,
      dy: next[i].points[0].y - stroke.points[0].y * factor, color: stroke.color, points: stroke.points, size: stroke.size }
  })
}

export function applyAssistedReversal(operations, reversal) {
  const byGroup = new Map(), indices = new Map()
  for (const entry of reversal) {
    const group = byGroup.get(entry.groupId) ?? []
    group[entry.index] = entry; byGroup.set(entry.groupId, group)
  }
  return operations.map(op => {
    if (!isInk(op) || !byGroup.has(op.groupId)) return op
    const index = indices.get(op.groupId) ?? 0
    indices.set(op.groupId, index + 1)
    const inverse = byGroup.get(op.groupId)[index]
    if (!inverse) return op
    return { ...transformStroke(op, 0, 0, 1 / inverse.factor, -inverse.dx / inverse.factor, -inverse.dy / inverse.factor),
      points: inverse.points, size: inverse.size, color: inverse.color }
  })
}

/** Resolve the append-only log. Erasure masks are derived, never persisted.
 * Each mask attaches to the ink visible when the child erased it, and follows
 * that ink through subsequent transformations. Ink retains its original order.
 * On assisted documents the original erasers run first against the raster base;
 * isolated per-stroke masks then prevent them erasing unrelated moved content. */
export function resolveDrawingOperations(document, options = {}) {
  const maskErasers = options.maskErasers === true || document.operations.some(op => op.type === 'assist')
  let result = []
  const reversals = new Map()
  for (const op of document.operations) {
    if (op.type === 'clear') { result = [op]; continue }
    if (op.type === 'stroke') {
      if (maskErasers && op.eraser) {
        const bounds = strokeBounds(op)
        result = result.map(prior => isInk(prior) && intersects(strokeBounds(prior), bounds)
          ? { ...prior, erasures: [...(prior.erasures ?? []), op] } : prior)
      }
      result.push(op)
      continue
    }
    if (op.type === 'assist') {
      const next = applyAssistedActions(result, op.targetIds, op.actions)
      if (next) { reversals.set(op.groupId, assistedReversal(result, next, op.targetIds)); result = next }
      continue
    }
    if (op.type === 'assist-revert') {
      const reversal = reversals.get(op.targetId)
      if (reversal) { result = applyAssistedReversal(result, reversal); reversals.delete(op.targetId) }
      continue
    }
    if (op.type !== 'edit') continue
    const first = result.findIndex(item => item.owner === 'nilo' && item.groupId === op.targetId)
    if (first < 0) continue
    const old = result.filter(item => item.owner === 'nilo' && item.groupId === op.targetId)
    const masks = [...new Set(old.flatMap(item => item.erasures ?? []))]
    result = result.filter(item => item.owner !== 'nilo' || item.groupId !== op.targetId)
    result.splice(first, 0, ...op.replacement.map(item => masks.length ? { ...item, erasures: masks } : item))
  }
  if (!maskErasers) return result
  return [...result.filter(op => op.type === 'clear' || op.eraser), ...result.filter(isInk)]
}
