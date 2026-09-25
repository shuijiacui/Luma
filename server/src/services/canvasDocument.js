export { validateDrawingDocument as validateCanvasDocument } from '../../../shared/niloDocument.mjs'

export function canvasProvenance(document) {
  if (!document) return 'unknown'
  if (document.baseImage && document.baseSource === 'unknown' && !document.operations.some(op => op.type === 'clear')) return 'unknown'
  return document.coCreated || document.guided || document.operations.some(op => op.owner === 'nilo' || (op.type === 'stroke' && op.guidance)) ? 'co-created' : 'child'
}
