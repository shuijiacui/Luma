export interface SelectionPoint { x: number; y: number }
export interface SelectionBounds { x: number; y: number; width: number; height: number }
/** Ephemeral alpha coverage of an erased stroke, never persisted or sent to AI. */
export interface SelectionCoverage extends SelectionBounds { columns: number; rows: number; alpha: Uint8Array }
export interface SelectionCandidate {
  groupId: string; points: SelectionPoint[]; bounds: SelectionBounds
  brushRadius?: SelectionPoint
  coverage?: SelectionCoverage
  highlight?: SelectionBounds & { url: string }
}

const epsilon = 1e-10
function cross(a: SelectionPoint, b: SelectionPoint, c: SelectionPoint) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
}
function onSegment(p: SelectionPoint, a: SelectionPoint, b: SelectionPoint) {
  return Math.abs(cross(a, b, p)) < epsilon && p.x >= Math.min(a.x, b.x) - epsilon
    && p.x <= Math.max(a.x, b.x) + epsilon && p.y >= Math.min(a.y, b.y) - epsilon && p.y <= Math.max(a.y, b.y) + epsilon
}
function intersects(a: SelectionPoint, b: SelectionPoint, c: SelectionPoint, d: SelectionPoint) {
  const abC = cross(a, b, c), abD = cross(a, b, d), cdA = cross(c, d, a), cdB = cross(c, d, b)
  return (abC * abD < 0 && cdA * cdB < 0) || onSegment(a, c, d) || onSegment(b, c, d) || onSegment(c, a, b) || onSegment(d, a, b)
}
function inside(point: SelectionPoint, polygon: SelectionPoint[]) {
  let result = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[j], b = polygon[i]
    if (onSegment(point, a, b)) return true
    if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) result = !result
  }
  return result
}

/** Intersect actual stroke segments, including long segments that cross a lasso
 * with both endpoints outside. A bounding-box overlap alone never selects ink. */
export function lassoGroups(candidates: SelectionCandidate[], polygon: SelectionPoint[]): string[] {
  if (polygon.length < 3 || polygon.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return []
  const selected = new Set<string>()
  for (const candidate of candidates) {
    if (selected.has(candidate.groupId) || !candidate.points.length) continue
    if (candidate.coverage) {
      if (coverageInLasso(candidate.coverage, polygon)) selected.add(candidate.groupId)
      continue
    }
    if (candidate.points.some(point => inside(point, polygon))) { selected.add(candidate.groupId); continue }
    outer: for (let i = 1; i < candidate.points.length; i++) {
      for (let j = 0; j < polygon.length; j++) {
        if (intersects(candidate.points[i - 1], candidate.points[i], polygon[j], polygon[(j + 1) % polygon.length])) {
          selected.add(candidate.groupId); break outer
        }
      }
    }
    // Include the visible edge of a wide brush, not only its centre line.
    const radius = candidate.brushRadius
    if (!selected.has(candidate.groupId) && radius && radius.x > 0 && radius.y > 0) {
      const scaled = (p: SelectionPoint) => ({ x: p.x / radius.x, y: p.y / radius.y })
      const path = candidate.points.map(scaled), outline = polygon.map(scaled)
      for (let i = 0; i < path.length && !selected.has(candidate.groupId); i++) {
        const a = path[i], b = path[Math.min(i + 1, path.length - 1)]
        for (let j = 0; j < outline.length; j++) {
          const c = outline[j], d = outline[(j + 1) % outline.length]
          if (Math.min(segmentDistance(a, c, d), segmentDistance(b, c, d), segmentDistance(c, a, b), segmentDistance(d, a, b)) <= 1) { selected.add(candidate.groupId); break }
        }
      }
    }
  }
  return [...selected]
}

function coverageInLasso(mask: SelectionCoverage, polygon: SelectionPoint[]) {
  const pixelX = mask.width / mask.columns, pixelY = mask.height / mask.rows
  const left = Math.max(0, Math.floor((Math.min(...polygon.map(p => p.x)) - mask.x) / pixelX))
  const right = Math.min(mask.columns - 1, Math.floor((Math.max(...polygon.map(p => p.x)) - mask.x) / pixelX))
  const top = Math.max(0, Math.floor((Math.min(...polygon.map(p => p.y)) - mask.y) / pixelY))
  const bottom = Math.min(mask.rows - 1, Math.floor((Math.max(...polygon.map(p => p.y)) - mask.y) / pixelY))
  if (left > right || top > bottom) return false
  // Scanline intervals avoid testing every visible pixel against every lasso edge.
  for (let row = top; row <= bottom; row++) {
    const y = mask.y + (row + .5) * pixelY, crossings: number[] = []
    for (let j = 0; j < polygon.length; j++) {
      const a = polygon[j], b = polygon[(j + 1) % polygon.length]
      if ((a.y > y) !== (b.y > y)) crossings.push(a.x + (y - a.y) * (b.x - a.x) / (b.y - a.y))
    }
    crossings.sort((a, b) => a - b)
    for (let j = 0; j + 1 < crossings.length; j += 2) {
      const from = Math.max(left, Math.ceil((crossings[j] - mask.x) / pixelX - .5))
      const to = Math.min(right, Math.floor((crossings[j + 1] - mask.x) / pixelX - .5))
      for (let column = from; column <= to; column++) if (mask.alpha[row * mask.columns + column]) return true
    }
  }
  // Very small lassos may lie within a pixel; include intersected boundary cells.
  for (let j = 0; j < polygon.length; j++) {
    const a = polygon[j], b = polygon[(j + 1) % polygon.length]
    const count = Math.max(1, Math.ceil(Math.max(Math.abs(b.x - a.x) / pixelX, Math.abs(b.y - a.y) / pixelY) * 2))
    // Clip the segment's sample interval to this small local mask.
    let low = 0, high = 1
    for (const [start, delta, min, max] of [[a.x, b.x - a.x, mask.x, mask.x + mask.width], [a.y, b.y - a.y, mask.y, mask.y + mask.height]]) {
      if (!delta) { if (start < min || start > max) { low = 1; high = 0 }; continue }
      const u = (min - start) / delta, v = (max - start) / delta
      low = Math.max(low, Math.min(u, v)); high = Math.min(high, Math.max(u, v))
    }
    for (let step = Math.max(0, Math.floor(low * count)); step <= Math.min(count, Math.ceil(high * count)); step++) {
      const u = step / count
      const column = Math.floor((a.x + (b.x - a.x) * u - mask.x) / pixelX), row = Math.floor((a.y + (b.y - a.y) * u - mask.y) / pixelY)
      if (column >= left && column <= right && row >= top && row <= bottom && mask.alpha[row * mask.columns + column]) return true
    }
  }
  return false
}

function coverageDistance(mask: SelectionCoverage, target: SelectionPoint, size: {width:number;height:number}, radius: number) {
  const cellWidth = mask.width * size.width / mask.columns, cellHeight = mask.height * size.height / mask.rows
  const originX = mask.x * size.width, originY = mask.y * size.height
  const left = Math.max(0, Math.floor((target.x - radius - originX) / cellWidth)), right = Math.min(mask.columns - 1, Math.floor((target.x + radius - originX) / cellWidth))
  const top = Math.max(0, Math.floor((target.y - radius - originY) / cellHeight)), bottom = Math.min(mask.rows - 1, Math.floor((target.y + radius - originY) / cellHeight))
  let nearest = Infinity
  for (let row = top; row <= bottom; row++) for (let column = left; column <= right; column++) {
    if (!mask.alpha[row * mask.columns + column]) continue
    const x = originX + column * cellWidth, y = originY + row * cellHeight
    const dx = Math.max(x - target.x, target.x - x - cellWidth, 0), dy = Math.max(y - target.y, target.y - y - cellHeight, 0)
    nearest = Math.min(nearest, Math.hypot(dx, dy))
  }
  return nearest
}

function segmentDistance(point: SelectionPoint, a: SelectionPoint, b: SelectionPoint) {
  const dx = b.x - a.x, dy = b.y - a.y, length = dx * dx + dy * dy
  const u = length ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length)) : 0
  return Math.hypot(point.x - a.x - u * dx, point.y - a.y - u * dy)
}

/** A screen-space hit radius works equally on wide desktops and narrow phones. */
export function pointGroup(candidates: SelectionCandidate[], point: SelectionPoint, size: { width: number; height: number }, radius = 16): string | null {
  if (size.width <= 0 || size.height <= 0) return null
  const pixels = (p: SelectionPoint) => ({ x: p.x * size.width, y: p.y * size.height })
  const target = pixels(point)
  let nearest = radius, match: string | null = null
  // Last-painted ink wins exact ties, consistent with what the child sees.
  for (const candidate of [...candidates].reverse()) {
    if (!candidate.points.length) continue
    if (candidate.coverage) {
      const distance = coverageDistance(candidate.coverage, target, size, radius)
      if (distance <= radius && (match === null || distance < nearest - epsilon)) { nearest = distance; match = candidate.groupId }
      continue
    }
    let previous = pixels(candidate.points[0]), distance = Math.hypot(target.x - previous.x, target.y - previous.y)
    for (const p of candidate.points.slice(1)) {
      const current = pixels(p)
      distance = Math.min(distance, segmentDistance(target, previous, current)); previous = current
    }
    if (candidate.brushRadius) distance = Math.max(0, distance - Math.max(candidate.brushRadius.x * size.width, candidate.brushRadius.y * size.height))
    if (distance <= radius && (match === null || distance < nearest - epsilon)) { nearest = distance; match = candidate.groupId }
  }
  return match
}
