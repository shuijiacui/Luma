import type { CanvasDocument } from './canvasDocument'

/** One picture keeps one coordinate-frame ratio across toolbar and viewport changes. */
export function fitDrawingSurface(width: number, height: number, aspect: number) {
  if (![width, height, aspect].every(value => Number.isFinite(value) && value > 0)) return { width: 0, height: 0 }
  const fittedWidth = Math.min(width, height * aspect)
  return { width: fittedWidth, height: Math.min(height, fittedWidth / aspect) }
}

export function documentAspect(document?: CanvasDocument): number | null {
  const stroke = document?.operations.find(operation => operation.type === 'stroke')
  if (stroke?.type === 'stroke' && stroke.referenceWidth > 0 && stroke.referenceHeight > 0) return stroke.referenceWidth / stroke.referenceHeight
  if (document?.baseImage?.startsWith('data:image/png;base64,')) {
    try {
      const prefix = 'data:image/png;base64,'.length
      const bytes = Uint8Array.from(atob(document.baseImage.slice(prefix, prefix + 44)), char => char.charCodeAt(0))
      const view = new DataView(bytes.buffer)
      if (bytes.length >= 24 && view.getUint32(0) === 0x89504e47) {
        const width = view.getUint32(16), height = view.getUint32(20)
        if (width > 0 && height > 0) return width / height
      }
    } catch { /* Missing metadata falls back to the first visible frame. */ }
  }
  return null
}
