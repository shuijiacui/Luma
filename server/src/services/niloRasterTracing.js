// Offline derivation of tracing centerlines from our monochrome PNG library.
// Original artwork is never changed; dense drawings retain a gray image guide.
const offsets = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]]

/** Choose once at asset-build time, so resizing cannot switch the guide mid-drag.
 * At a typical 250px long edge, many sub-dash fragments or heavy hatching lose
 * readability. Keep the original image in those cases instead of discarding ink.
 */
export function tracingProjectionMode(trace, { detail } = {}) {
  if (detail === 'rich' || trace.paths.length >= 400) return 'gray'
  let shortPaths = 0, totalLength = 0
  const width = 250 * Math.min(1, trace.aspect), height = 250 / Math.max(1, trace.aspect)
  for (const path of trace.paths) {
    let length = 0
    for (let i = 1; i < path.length; i++) {
      length += Math.hypot((path[i][0] - path[i - 1][0]) * width, (path[i][1] - path[i - 1][1]) * height)
    }
    if (length < 6) shortPaths++
    totalLength += length
  }
  return trace.paths.length >= 150 && (shortPaths / trace.paths.length >= .5 || totalLength >= 4500) ? 'gray' : 'dashed'
}

function simplify(points, tolerance) {
  if (points.length < 3) return points
  const keep = new Uint8Array(points.length); keep[0] = keep[points.length - 1] = 1
  const stack = [[0, points.length - 1]], limit = tolerance * tolerance
  while (stack.length) {
    const [start, end] = stack.pop(), a = points[start], b = points[end]
    const dx = b[0] - a[0], dy = b[1] - a[1], length = dx * dx + dy * dy
    let farthest = limit, at = -1
    for (let i = start + 1; i < end; i++) {
      const p = points[i], t = length ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length)) : 0
      const distance = (p[0] - a[0] - t * dx) ** 2 + (p[1] - a[1] - t * dy) ** 2
      if (distance > farthest) { farthest = distance; at = i }
    }
    if (at >= 0) { keep[at] = 1; stack.push([start, at], [at, end]) }
  }
  return points.filter((_, i) => keep[i])
}

export function rasterTracingPaths({ width: sourceWidth, height: sourceHeight, data }, { maxSide = 640 } = {}) {
  if (!Number.isInteger(sourceWidth) || !Number.isInteger(sourceHeight) || sourceWidth < 2 || sourceHeight < 2
    || sourceWidth * sourceHeight > 16_777_216 || !data || data.length !== sourceWidth * sourceHeight * 4
    || !Number.isInteger(maxSide) || maxSide < 32 || maxSide > 1024) throw new Error('invalid tracing image')
  const scale = Math.min(1, maxSide / Math.max(sourceWidth, sourceHeight))
  const width = Math.max(2, Math.round(sourceWidth * scale)), height = Math.max(2, Math.round(sourceHeight * scale))
  const stride = width + 2, size = stride * (height + 2), pixels = new Uint8Array(size), candidates = []
  // Area averaging retains thin strokes during downsampling, with transparent
  // pixels composited over paper before thresholding (not treated as black).
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const x0 = x * sourceWidth / width, x1 = (x + 1) * sourceWidth / width
    const y0 = y * sourceHeight / height, y1 = (y + 1) * sourceHeight / height
    let darkness = 0
    for (let sy = Math.floor(y0); sy < Math.ceil(y1); sy++) for (let sx = Math.floor(x0); sx < Math.ceil(x1); sx++) {
      const weight = (Math.min(x1, sx + 1) - Math.max(x0, sx)) * (Math.min(y1, sy + 1) - Math.max(y0, sy))
      const i = (sy * sourceWidth + sx) * 4
      const luminance = .2126 * data[i] + .7152 * data[i + 1] + .0722 * data[i + 2]
      darkness += weight * (1 - luminance / 255) * data[i + 3] / 255
    }
    if (darkness / ((x1 - x0) * (y1 - y0)) >= .28) {
      const index = (y + 1) * stride + x + 1; pixels[index] = 1; candidates.push(index)
    }
  }
  const delta = offsets.map(([x, y]) => y * stride + x)
  // Zhang–Suen thinning removes opposite sides in separate passes, preserving
  // connected strokes and holes. This avoids tracing both edges of thick ink.
  for (let round = 0; round < maxSide; round++) {
    let removed = 0
    for (let pass = 0; pass < 2; pass++) {
      const pending = []
      for (const index of candidates) {
        if (!pixels[index]) continue
        const n = delta.map(d => pixels[index + d]), count = n.reduce((sum, p) => sum + p, 0)
        if (count < 2 || count > 6) continue
        let transitions = 0
        for (let i = 0; i < 8; i++) if (!n[i] && n[(i + 1) % 8]) transitions++
        if (transitions !== 1) continue
        if (pass === 0 ? n[0] * n[2] * n[4] || n[2] * n[4] * n[6] : n[0] * n[2] * n[6] || n[0] * n[4] * n[6]) continue
        pending.push(index)
      }
      for (const index of pending) pixels[index] = 0
      removed += pending.length
    }
    if (!removed) break
  }
  const neighbors = index => delta.flatMap((d, direction) => {
    if (!pixels[index + d]) return []
    // Diagonal shortcuts alongside orthogonal edges would create false branch
    // triangles; retain a diagonal only when it is the actual connection.
    if (direction % 2 && (pixels[index + delta[direction - 1]] || pixels[index + delta[(direction + 1) % 8]])) return []
    return [{ index: index + d, direction }]
  })
  const vertices = candidates.filter(index => pixels[index]), degree = new Uint8Array(size), visited = new Uint8Array(size)
  for (const index of vertices) degree[index] = neighbors(index).length
  const paths = []
  const point = index => [index % stride - .5, Math.floor(index / stride) - .5]
  function walk(start, edge) {
    const points = [point(start)]
    let current = start, next = edge, length = 0
    while (next && !(visited[current] & (1 << next.direction))) {
      const prior = current
      visited[prior] |= 1 << next.direction; visited[next.index] |= 1 << ((next.direction + 4) % 8)
      current = next.index; points.push(point(current))
      length += next.direction % 2 ? Math.SQRT2 : 1
      if (current === start || degree[current] !== 2) break
      next = neighbors(current).find(item => item.index !== prior)
    }
    if (length >= 3 && points.length > 1) paths.push(simplify(points, .65).map(([x, y]) => [Number((x / width).toFixed(5)), Number((y / height).toFixed(5))]))
  }
  for (const index of vertices.filter(index => degree[index] !== 2)) for (const edge of neighbors(index)) if (!(visited[index] & (1 << edge.direction))) walk(index, edge)
  for (const index of vertices) for (const edge of neighbors(index)) if (!(visited[index] & (1 << edge.direction))) walk(index, edge)
  if (paths.length > 1500 || paths.reduce((total, path) => total + path.length, 0) > 50000) throw new Error(`tracing detail exceeds bounded guide budget (${paths.length} paths)`)
  return { version: 1, aspect: sourceWidth / sourceHeight, paths }
}
