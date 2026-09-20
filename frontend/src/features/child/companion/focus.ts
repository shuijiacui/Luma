import type { CompanionScene, CompanionSceneBox } from '../companionScene'

/** Expand the latest child mark to its nearby stroke cluster, never to all art.
 * Bounds are attention hints; only the current composite proves visible ink. */
export function companionFocusBounds(scene: CompanionScene, aspect: number): CompanionSceneBox | null {
  if (!Number.isFinite(aspect) || aspect <= 0) return null
  const children = scene.recentContributions.filter(item => item.owner === 'child')
  const latest = children.at(-1)?.bounds
  if (!latest) return null
  let b = { ...latest }
  for (let pass = 0; pass < 3; pass++) for (const { bounds: p } of children) {
    const gapX = .04 / Math.max(1, aspect), gapY = .04 * Math.min(1, aspect)
    if (p.x > b.x + b.width + gapX || b.x > p.x + p.width + gapX
      || p.y > b.y + b.height + gapY || b.y > p.y + p.height + gapY) continue
    const x = Math.min(b.x, p.x), y = Math.min(b.y, p.y)
    const width = Math.max(b.x + b.width, p.x + p.width) - x
    const height = Math.max(b.y + b.height, p.y + p.height) - y
    if (width * height <= .5) b = { x, y, width, height }
  }
  const width = Math.min(1, Math.max(.22 / Math.max(1, aspect), b.width * 1.6))
  const height = Math.min(1, Math.max(.22 * Math.min(1, aspect), b.height * 1.6))
  if (width * height > .8) return null // Full view already provides comparable detail.
  return { x: Math.max(0, Math.min(1 - width, b.x + b.width / 2 - width / 2)),
    y: Math.max(0, Math.min(1 - height, b.y + b.height / 2 - height / 2)), width, height }
}

export function exportCompanionFocus(source: HTMLCanvasElement, scene: CompanionScene) {
  const bounds = companionFocusBounds(scene, source.width / source.height)
  if (!bounds) return null
  const sw = source.width * bounds.width, sh = source.height * bounds.height
  const scale = Math.min(2, 768 / Math.max(sw, sh))
  const crop = document.createElement('canvas')
  crop.width = Math.max(1, Math.round(sw * scale)); crop.height = Math.max(1, Math.round(sh * scale))
  const context = crop.getContext('2d')
  if (!context) return null
  context.drawImage(source, bounds.x * source.width, bounds.y * source.height, sw, sh, 0, 0, crop.width, crop.height)
  const imageBase64 = crop.toDataURL('image/png').split(',')[1]
  return imageBase64?.length <= 1024 * 1024 ? { imageBase64, bounds } : null
}
