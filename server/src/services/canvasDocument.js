const BRUSHES = new Set(['round', 'pencil', 'marker', 'crayon', 'star'])
const finiteRange = (value, min, max) => Number.isFinite(value) && value >= min && value <= max

/** A persisted operation log, never a model-generated executable command. */
export function validateCanvasDocument(value) {
  if (!value || value.version !== 1 || !['child', 'unknown'].includes(value.baseSource)
    || !Array.isArray(value.operations) || value.operations.length > 20000) return false
  if (value.coCreated !== undefined && value.coCreated !== true) return false
  if (value.baseImage !== undefined && (typeof value.baseImage !== 'string' || value.baseImage.length > 14_000_000
    || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value.baseImage))) return false
  let totalPoints = 0
  for (const op of value.operations) {
    if (!op || !['child', 'nilo'].includes(op.owner) || typeof op.groupId !== 'string' || !op.groupId.length || op.groupId.length > 100) return false
    if (op.type === 'clear') { if (op.owner !== 'child') return false; continue }
    if (op.type !== 'stroke' || !BRUSHES.has(op.brushKind) || !/^#[0-9a-f]{6}$/i.test(op.color)
      || typeof op.eraser !== 'boolean' || !finiteRange(op.size, 0.1, 1024)
      || !finiteRange(op.referenceWidth, 1, 16384) || !finiteRange(op.referenceHeight, 1, 16384)
      || !Array.isArray(op.points) || !op.points.length) return false
    totalPoints += op.points.length
    if (totalPoints > 500000 || op.points.some(point => !point || !finiteRange(point.x, 0, 1) || !finiteRange(point.y, 0, 1))) return false
  }
  return JSON.stringify(value).length <= 24_000_000
}

export function canvasProvenance(document) {
  if (!document) return 'unknown'
  if (document.baseImage && document.baseSource === 'unknown' && !document.operations.some(op => op.type === 'clear')) return 'unknown'
  return document.coCreated || document.operations.some(op => op.owner === 'nilo') ? 'co-created' : 'child'
}
