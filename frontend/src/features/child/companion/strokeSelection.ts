import { paintCanvasOperation, type CanvasStroke } from '../canvasDocument'
import { strokeBounds } from '../../../../../shared/niloCanvasEdits.mjs'
import type { SelectionBounds, SelectionCandidate } from './selectionGeometry'

export interface SelectableStroke { stroke: CanvasStroke; candidate: SelectionCandidate }
const clip = (bounds: SelectionBounds): SelectionBounds | null => {
  const x = Math.max(0, bounds.x), y = Math.max(0, bounds.y)
  const right = Math.min(1, bounds.x + bounds.width), bottom = Math.min(1, bounds.y + bounds.height)
  return right > x && bottom > y ? { x, y, width: right - x, height: bottom - y } : null
}

function brushRadius(stroke: CanvasStroke) {
  const radius = stroke.brushKind === 'star' ? stroke.size * 1.25
    : stroke.brushKind === 'pencil' ? stroke.size * .2
      : stroke.brushKind === 'marker' ? stroke.size * 1.8 * Math.hypot(.5, 1 / 6)
        : stroke.brushKind === 'crayon' ? stroke.size / 2 + Math.max(.6, stroke.size * .07) : stroke.size / 2
  return { x: radius / stroke.referenceWidth, y: radius / stroke.referenceHeight }
}

/** A revision-scoped, UI-only view. Unaffected ink stays vector; affected ink is
 * rasterized in a small local rectangle so erasure holes and brush textures are
 * authoritative. Approx. 2M alpha bytes total; <=64K pixels and 512px per side
 * per erased stroke. Call lazily, never from the drawing pointer-move path. */
export function buildStrokeSelection(strokes: CanvasStroke[], width: number, height: number): SelectableStroke[] {
  if (width <= 0 || height <= 0) return []
  const plans = strokes.map(stroke => {
    const b = strokeBounds(stroke), radius = brushRadius(stroke)
    // Include the outer crayon grains / rotated marker corners and antialiasing.
    const extraX = Math.max(2 / width, radius.x - stroke.size / stroke.referenceWidth / 2)
    const extraY = Math.max(2 / height, radius.y - stroke.size / stroke.referenceHeight / 2)
    const bounds = clip(stroke.erasures?.length ? { x: b.x - extraX, y: b.y - extraY, width: b.width + extraX * 2, height: b.height + extraY * 2 } : b)
    return { stroke, bounds, radius }
  })
  const area = plans.reduce((total, p) => total + (p.bounds && p.stroke.erasures?.length ? p.bounds.width * width * p.bounds.height * height : 0), 0)
  const budgetScale = Math.min(1, Math.sqrt(2_000_000 / Math.max(1, area)))
  const result: SelectableStroke[] = []
  for (const { stroke, bounds, radius } of plans) {
    if (!bounds) continue
    const candidate: SelectionCandidate = { groupId: stroke.groupId, points: stroke.points, bounds, brushRadius: radius }
    if (!stroke.erasures?.length) { result.push({ stroke, candidate }); continue }
    const physicalWidth = bounds.width * width, physicalHeight = bounds.height * height
    const ratio = Math.min(budgetScale, 512 / Math.max(physicalWidth, physicalHeight), Math.sqrt(65_536 / Math.max(1, physicalWidth * physicalHeight)))
    const columns = Math.max(1, Math.ceil(physicalWidth * ratio)), rows = Math.max(1, Math.ceil(physicalHeight * ratio))
    const layer = document.createElement('canvas'); layer.width = columns; layer.height = rows
    const context = layer.getContext('2d', { willReadFrequently: true })
    if (!context) continue
    try {
      // Paint directly into the cropped isolated canvas. Calling the composite
      // painter with masks here would unnecessarily allocate a full-size layer.
      const replayWidth = columns / bounds.width, replayHeight = rows / bounds.height
      context.translate(-bounds.x * replayWidth, -bounds.y * replayHeight)
      paintCanvasOperation(context, replayWidth, replayHeight, { ...stroke, erasures: undefined })
      for (const eraser of stroke.erasures) paintCanvasOperation(context, replayWidth, replayHeight, eraser)
      const pixels = context.getImageData(0, 0, columns, rows).data
      const alpha = new Uint8Array(columns * rows)
      let left = columns, top = rows, right = -1, bottom = -1
      for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
        const index = row * columns + column, value = pixels[index * 4 + 3]
        if (!value) continue
        alpha[index] = value
        left = Math.min(left, column); top = Math.min(top, row); right = Math.max(right, column); bottom = Math.max(bottom, row)
      }
      if (right < left) continue // Fully erased ink is not a selectable object.
      candidate.coverage = { ...bounds, columns, rows, alpha }
      candidate.bounds = { x: bounds.x + left / columns * bounds.width, y: bounds.y + top / rows * bounds.height,
        width: (right - left + 1) / columns * bounds.width, height: (bottom - top + 1) / rows * bounds.height }
      // Highlight the surviving paint, not its original (now partly erased) path.
      context.setTransform(1, 0, 0, 1, 0, 0)
      context.globalCompositeOperation = 'source-in'; context.fillStyle = '#318cbb'; context.fillRect(0, 0, columns, rows)
      candidate.highlight = { ...bounds, url: layer.toDataURL('image/png') }
      result.push({ stroke, candidate })
    } catch {
      // An unreadable mask is not evidence that erased ink still exists. Do not
      // guess a selectable object from its historical centre line.
    }
  }
  return result
}
