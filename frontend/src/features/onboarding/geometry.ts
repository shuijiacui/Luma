export interface Rect { top: number; left: number; width: number; height: number }
export type Viewport = Rect
export type Side = 'top' | 'bottom' | 'left' | 'right'
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(n, max))

export function findVisibleTarget(selector: string): HTMLElement | null {
  for (const element of document.querySelectorAll<HTMLElement>(selector)) {
    const rect = element.getBoundingClientRect()
    if (!rect.width || !rect.height || element.closest('[hidden], [inert]')) continue
    let visible = true
    for (let node: HTMLElement | null = element; node; node = node.parentElement) {
      const style = getComputedStyle(node)
      if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity || 1) === 0) { visible = false; break }
    }
    if (visible) return element
  }
  return null
}

export function intersect(a: Rect, b: Rect): Rect | null {
  const left = Math.max(a.left, b.left), top = Math.max(a.top, b.top)
  const right = Math.min(a.left + a.width, b.left + b.width)
  const bottom = Math.min(a.top + a.height, b.top + b.height)
  return right > left && bottom > top ? { left, top, width: right - left, height: bottom - top } : null
}

/** Clip highlights to scrolling containers as well as the visible viewport. */
export function visibleRect(element: HTMLElement, viewport: Viewport, area?: { x: number; y: number; width: number; height: number }): Rect | null {
  const bounds = element.getBoundingClientRect()
  let rect: Rect | null = area ? {
    left: bounds.left + area.x * bounds.width, top: bounds.top + area.y * bounds.height,
    width: bounds.width * area.width, height: bounds.height * area.height,
  } : { left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height }
  rect = intersect(rect, viewport)
  for (let parent = element.parentElement; parent && rect; parent = parent.parentElement) {
    const style = getComputedStyle(parent)
    const clipsX = /(auto|scroll|hidden|clip)/.test(style.overflowX)
    const clipsY = /(auto|scroll|hidden|clip)/.test(style.overflowY)
    if (clipsX || clipsY) {
      const r = parent.getBoundingClientRect()
      rect = intersect(rect, {
        left: clipsX ? r.left : viewport.left, top: clipsY ? r.top : viewport.top,
        width: clipsX ? r.width : viewport.width, height: clipsY ? r.height : viewport.height,
      })
    }
  }
  return rect
}

/** Choose a non-overlapping side, shrinking scrollable copy on short screens. */
export function placeCard(target: Rect, size: { width: number; height: number }, viewport: Viewport) {
  const edge = 16, gap = 18
  const bounds = { left: viewport.left + edge, top: viewport.top + edge, right: viewport.left + viewport.width - edge, bottom: viewport.top + viewport.height - edge }
  const width = Math.min(size.width, viewport.width - edge * 2)
  const spaces = {
    top: target.top - gap - bounds.top,
    bottom: bounds.bottom - target.top - target.height - gap,
    left: target.left - gap - bounds.left,
    right: bounds.right - target.left - target.width - gap,
  }
  const order: Side[] = viewport.width < 640 ? ['bottom', 'top', 'right', 'left'] : ['right', 'left', 'bottom', 'top']
  const fits = (side: Side) => side === 'left' || side === 'right'
    ? spaces[side] >= width && viewport.height - edge * 2 >= size.height
    : spaces[side] >= size.height
  const side = order.find(fits) ?? (spaces.top > spaces.bottom ? 'top' : 'bottom')
  const maxHeight = Math.max(0, side === 'top' || side === 'bottom' ? spaces[side] : viewport.height - edge * 2)
  const height = Math.min(size.height, maxHeight)
  const left = side === 'right' ? target.left + target.width + gap : side === 'left' ? target.left - gap - width
    : clamp(target.left + target.width / 2 - width / 2, bounds.left, bounds.right - width)
  const top = side === 'bottom' ? target.top + target.height + gap : side === 'top' ? target.top - gap - height
    : clamp(target.top + target.height / 2 - height / 2, bounds.top, bounds.bottom - height)
  return { left, top, width, maxHeight, side,
    arrow: side === 'top' || side === 'bottom'
      ? clamp(target.left + target.width / 2 - left, 22, width - 22)
      : clamp(target.top + target.height / 2 - top, 22, height - 22),
  }
}
