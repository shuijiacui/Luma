// Program-measured contact geometry. The wire format cannot enlarge its own
// collision allowance: brush width and the occupancy resolution define it.
import { sampleProposalGeometry } from './niloGeometry.mjs'

const factors = aspect => ({ x: Math.max(1, aspect), y: Math.max(1, 1 / aspect) })
const distance = (a, b, scale) => Math.hypot((a.x - b.x) * scale.x, (a.y - b.y) * scale.y)
const point = p => p && typeof p === 'object' && !Array.isArray(p)
  && Object.keys(p).every(key => key === 'x' || key === 'y')
  && Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1

export function validateContact(value, anchor, aspect = 1) {
  if (!Number.isFinite(aspect) || aspect <= 0 || !value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).some(key => !['kind', 'points'].includes(key))
    || !['points', 'contour'].includes(value.kind) || !Array.isArray(value.points)) return null
  const points = value.points
  if (points.length < 2 || points.length > (value.kind === 'points' ? 3 : 24) || points.some(p => !point(p))) return null
  if (anchor && points.some(p => p.x < anchor.x - 1e-7 || p.x > anchor.x + anchor.width + 1e-7
    || p.y < anchor.y - 1e-7 || p.y > anchor.y + anchor.height + 1e-7)) return null
  const scale = factors(aspect)
  let length = 0
  for (let i = 1; i < points.length; i++) {
    const segment = distance(points[i - 1], points[i], scale)
    if (segment < .0001 || (value.kind === 'contour' && segment > .08 + 1e-7)) return null
    length += segment
  }
  if (value.kind === 'contour' && length > .35 + 1e-7) return null
  if (points.some(a => points.some(b => distance(a, b, scale) > .35 + 1e-7))) return null
  return { kind: value.kind, points: points.map(({ x, y }) => ({ x, y })) }
}

/** Dense checkpoints, including endpoints, in units of the shorter canvas edge. */
export function contactSamples(contact, aspect = 1, step = .003) {
  if (!Number.isFinite(aspect) || aspect <= 0 || !Number.isFinite(step) || step <= 0 || step > .1) return []
  if (contact.kind === 'points') return contact.points.map(p => ({ ...p }))
  const scale = factors(aspect), samples = [{ ...contact.points[0] }]
  for (let i = 1; i < contact.points.length; i++) {
    const a = contact.points[i - 1], b = contact.points[i]
    const count = Math.min(1000, Math.max(1, Math.ceil(distance(a, b, scale) / step)))
    for (let j = 1; j <= count; j++) samples.push({ x: a.x + (b.x - a.x) * j / count, y: a.y + (b.y - a.y) * j / count })
  }
  return samples
}

function segmentDistance(p, a, b, margin) {
  const x = (p.x - a.x) / margin.x, y = (p.y - a.y) / margin.y
  const dx = (b.x - a.x) / margin.x, dy = (b.y - a.y) / margin.y
  const t = Math.max(0, Math.min(1, (x * dx + y * dy) / (dx * dx + dy * dy || 1)))
  return Math.hypot(x - t * dx, y - t * dy)
}
function nearContact(p, contact, margin) {
  if (contact.kind === 'points') return contact.points.some(a => Math.hypot((p.x - a.x) / margin.x, (p.y - a.y) / margin.y) <= 1)
  return contact.points.some((b, i) => i > 0 && segmentDistance(p, contact.points[i - 1], b, margin) <= 1)
}
function hasInk(p, occupancy, n, margin) {
  for (let y = Math.max(0, Math.floor((p.y - margin.y) * n)); y <= Math.min(n - 1, Math.floor((p.y + margin.y) * n)); y++) {
    for (let x = Math.max(0, Math.floor((p.x - margin.x) * n)); x <= Math.min(n - 1, Math.floor((p.x + margin.x) * n)); x++) {
      if (occupancy[y * n + x] > .025) return true
    }
  }
  return false
}

// Only resolve the square-cell/round-brush boundary ambiguity. The contact
// corridor, support checks and retrace limit stay unchanged. Evidence is a
// decoded original canvas owned by the caller, never a model-supplied mask.
function validPixels(pixels, aspect, minimum = 8) {
  const {width, height, data} = pixels ?? {}
  return Number.isInteger(width) && Number.isInteger(height) && width >= minimum && height >= minimum
    && width <= 4096 && height <= 4096 && width * height <= 4194304
    && ArrayBuffer.isView(data) && data.BYTES_PER_ELEMENT === 1 && data.length === width * height * 4
    && Math.abs(width / height / aspect - 1) <= .01
}
function renderedBrushMargin(p, pixels, surfaceSize) {
  const tipScale = {round:1, pencil:.4}[p.brushKind ?? 'round']
  const radius = p.strokeWidth * tipScale / 2
  return {x: radius / (surfaceSize?.width || pixels.width) + .5 / pixels.width,
    y: radius / (surfaceSize?.height || pixels.height) + .5 / pixels.height}
}
function coveredPixel(q, paths, margin) {
  return paths.some(path => path.some((b,i) => i > 0 && segmentDistance(q, path[i - 1], b, margin) <= 1))
}
function pixelContactSupported(p, contact, paths, pixels, aspect, surfaceSize, n) {
  const margin = renderedBrushMargin(p, pixels, surfaceSize)
  const {width, height, data} = pixels
  // Each joint needs an original-ink pixel actually covered by the new brush
  // nearby. Two separately nearby shapes can otherwise leave a visible gap.
  return contactSamples(contact, aspect, .5 / n).every(q => {
    const mx = 1.5 / n + .5 / width, my = 1.5 / n + .5 / height
    for (let y = Math.max(0, Math.floor((q.y - my) * height)); y <= Math.min(height - 1, Math.ceil((q.y + my) * height)); y++) {
      for (let x = Math.max(0, Math.floor((q.x - mx) * width)); x <= Math.min(width - 1, Math.ceil((q.x + mx) * width)); x++) {
        const at = (y * width + x) * 4
        if (data[at + 3] <= 8 || Math.min(data[at], data[at + 1], data[at + 2]) >= 242) continue
        const pixel = {x: (x + .5) / width, y: (y + .5) / height}
        if (Math.hypot((pixel.x - q.x) / mx, (pixel.y - q.y) / my) <= 1 && coveredPixel(pixel, paths, margin)) return true
      }
    }
    return false
  })
}
function pixelBoundaryFits(p, contact, paths, occupancy, cells, n, allowance, pixels, aspect, surfaceSize) {
  // Textured/rectangular stamps need their own exact envelope. Keep their
  // existing conservative rejection rather than pretending they are circles.
  if (!['round', 'pencil'].includes(p.brushKind ?? 'round')) return false
  if (!validPixels(pixels, aspect, n)) return false
  const {width, height, data} = pixels
  // Match the actual rendered brush plus half a source pixel for antialiasing.
  // Reusing the coarse +1 CSS pixel clearance here recreates the false overlap.
  const pixelMargin = renderedBrushMargin(p, pixels, surfaceSize)
  let checked = 0
  for (const cell of cells) {
    if (occupancy[cell] <= .025) continue
    const col = cell % n, row = Math.floor(cell / n)
    const left = Math.ceil(col * width / n), right = Math.min(width, Math.ceil((col + 1) * width / n))
    const top = Math.ceil(row * height / n), bottom = Math.min(height, Math.ceil((row + 1) * height / n))
    let supported = false
    for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) {
      const offset = (y * width + x) * 4
      if (data[offset + 3] <= 8 || Math.min(data[offset], data[offset + 1], data[offset + 2]) >= 242) continue
      supported = true
      const q = {x: (x + .5) / width, y: (y + .5) / height}
      if (coveredPixel(q, paths, pixelMargin)) {
        checked++
        if (!nearContact(q, contact, allowance)) return false
      }
    }
    // A blank or stale raster must not erase a collision reported by the grid.
    if (!supported) return false
  }
  return checked > 0
}

/** Strict extra allowance for a measured contact, never a blanket target mask. */
export function contactProjectionFits(p, occupancy, aspect, surfaceSize, cells, margin, pixels) {
  const n = Math.sqrt(occupancy.length)
  const contact = validateContact(p.contact, p.anchor, aspect)
  if (!contact || p.template !== 'custom' || !p.sketch || !p.anchor || p.attachment || p.rotation !== 0 || !Number.isInteger(n) || !cells?.size) return false
  const scale = factors(aspect)
  const allowance = { x: margin.x + 1.5 / n, y: margin.y + 1.5 / n }
  // A thick brush on a tiny screen must not open a large unprotected area.
  if (Math.max(allowance.x * scale.x, allowance.y * scale.y) > .035) return false
  const paths = sampleProposalGeometry(p, aspect).map(stroke => stroke.points)
  const supportMargin = { x: 1.5 / n, y: 1.5 / n }
  const checkpoints = contactSamples(contact, aspect, .5 / n)
  if (!checkpoints.length || checkpoints.some(q => !hasInk(q, occupancy, n, supportMargin)
    || !paths.some(path => path.some((b, i) => i > 0 && segmentDistance(q, path[i - 1], b, supportMargin) <= 1)))) return false
  if (pixels !== undefined && (!validPixels(pixels, aspect)
    || (['round','pencil'].includes(p.brushKind ?? 'round')
      && !pixelContactSupported(p, contact, paths, pixels, aspect, surfaceSize, n)))) return false
  const boundaryConflict = [...cells].some(cell => occupancy[cell] > .025
    && !nearContact({ x: (cell % n + .5) / n, y: (Math.floor(cell / n) + .5) / n }, contact, allowance))
  // Count physical path length, not vertices: dense control points cannot dilute
  // the overlap ratio. A contribution must add more ink than it retraces.
  let totalLength = 0, overlappingLength = 0
  for (const path of paths) for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i], length = distance(a, b, scale)
    const steps = Math.max(1, Math.ceil(length * n * 2))
    for (let j = 0; j < steps; j++) {
      const t = (j + .5) / steps, sample = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
      if (hasInk(sample, occupancy, n, margin)) overlappingLength += length / steps
    }
    totalLength += length
  }
  if (totalLength <= .005 || overlappingLength > totalLength * .5 + 1e-7) return false
  return !boundaryConflict || pixelBoundaryFits(p, contact, paths, occupancy, cells, n, allowance, pixels, aspect, surfaceSize)
}
