// Shared local-only raster preview. Uses production geometry and shipped tracing data.
import { readFileSync } from 'node:fs'
import { PNG } from 'pngjs'
import { sampleProposalGeometry } from '../../../shared/niloGeometry.mjs'
import { getDrawingIllustration } from '../../../shared/niloIllustrations.mjs'

export function guidePaths(proposal, aspect) {
  if (!['illustration', 'generated'].includes(proposal.template)) return sampleProposalGeometry(proposal, aspect).map(stroke => stroke.points)
  const asset = proposal.template === 'illustration' && getDrawingIllustration(proposal.illustrationId)
  if (proposal.template === 'illustration' && !asset) throw new Error('Unknown illustration in preview')
  // Generated rasters, like catalogue images, remain guides. Their tracing
  // paths must not use the authored-ink sampler, which intentionally returns [].
  const guide = proposal.template === 'generated'
    ? { aspect: proposal.raster.width / proposal.raster.height, projection: proposal.raster.projection, paths: proposal.raster.paths }
    : JSON.parse(readFileSync(new URL(`../../../frontend/public/nilo-tracing/${asset.id}.json`, import.meta.url)))
  if (guide.projection === 'gray') return []
  let width = proposal.width, height = proposal.height
  if (width * aspect / height > guide.aspect) width = height * guide.aspect / aspect
  else height = width * aspect / guide.aspect
  const angle = proposal.rotation * Math.PI / 180
  return guide.paths.map(path => path.map(([x, y]) => {
    const dx = (x - .5) * width, dy = (y - .5) * height
    return { x: proposal.x + proposal.width / 2 + Math.cos(angle) * dx - Math.sin(angle) * dy / aspect,
      y: proposal.y + proposal.height / 2 + Math.sin(angle) * dx * aspect + Math.cos(angle) * dy }
  }))
}
export function grayGuide(proposal, { width: canvasWidth = 840, height: canvasHeight = 600 } = {}) {
  if (proposal.template === 'generated') {
    if (proposal.raster.projection !== 'gray') return null
    const aspect = proposal.raster.width / proposal.raster.height
    const width = Math.min(proposal.width * canvasWidth, proposal.height * canvasHeight * aspect)
    return { source: Buffer.from(proposal.raster.pngBase64, 'base64'), width, height: width / aspect,
      cx: (proposal.x + proposal.width / 2) * canvasWidth, cy: (proposal.y + proposal.height / 2) * canvasHeight, rotation: proposal.rotation }
  }
  if (proposal.template !== 'illustration') return null
  const asset = getDrawingIllustration(proposal.illustrationId)
  const guide = JSON.parse(readFileSync(new URL(`../../../frontend/public/nilo-tracing/${asset.id}.json`, import.meta.url)))
  if (guide.projection !== 'gray') return null
  const source = readFileSync(new URL(`../../../frontend/public${asset.src}`, import.meta.url))
  const width = Math.min(proposal.width * canvasWidth, proposal.height * canvasHeight * guide.aspect)
  return { source, width, height: width / guide.aspect, cx: (proposal.x + proposal.width / 2) * canvasWidth, cy: (proposal.y + proposal.height / 2) * canvasHeight, rotation: proposal.rotation }
}
export function rasterGuide(proposals, { childProposals = [], width = 840, height = 600, inspection = false } = {}) {
  const png = new PNG({ width, height }); png.data.fill(255)
  const dot = (x, y, color = inspection ? [40, 40, 40] : [156, 163, 175], radius = 1.25) => {
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const px = Math.round(x) + dx, py = Math.round(y) + dy
      if (px < 0 || px >= width || py < 0 || py >= height) continue
      const alpha = Math.max(0, Math.min(1, radius - Math.hypot(px - x, py - y)))
      // Contrast may not introduce new geometry through antialias rounding.
      // Use the normal guide's coverage threshold in both preview modes.
      if (Math.round(255 * (1 - alpha) + 156 * alpha) === 255) continue
      for (let c = 0; c < 3; c++) { const i = (py * width + px) * 4 + c; png.data[i] = Math.min(png.data[i], Math.round(255 * (1 - alpha) + color[c] * alpha)) }
    }
  }
  for (const proposal of proposals) {
    const gray = grayGuide(proposal, { width, height })
    if (gray) {
      const source = PNG.sync.read(gray.source), angle = gray.rotation * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle)
      const samples = Math.min(8, Math.max(1, Math.ceil(source.width / gray.width)))
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const dx = x + .5 - gray.cx, dy = y + .5 - gray.cy
        const u = (dx * c + dy * s) / gray.width + .5, v = (-dx * s + dy * c) / gray.height + .5
        if (u < 0 || u >= 1 || v < 0 || v >= 1) continue
        let darkness = 0
        for (let sy = 0; sy < samples; sy++) for (let sx = 0; sx < samples; sx++) {
          const du = (sx + .5) / samples - .5, dv = (sy + .5) / samples - .5
          const ix = Math.floor((u + (du * c + dv * s) / gray.width) * source.width)
          const iy = Math.floor((v + (-du * s + dv * c) / gray.height) * source.height)
          if (ix < 0 || ix >= source.width || iy < 0 || iy >= source.height) continue
          const i = (iy * source.width + ix) * 4
          const luminance = .2126 * source.data[i] + .7152 * source.data[i + 1] + .0722 * source.data[i + 2]
          darkness += (1 - luminance / 255) * source.data[i + 3] / 255
        }
        const normalFactor = 1 - darkness / (samples * samples) * .38
        // Pure-white luminance can produce tiny floating-point residue. If the
        // normal raster would remain exactly white, contrast must not expose a
        // new pixel there merely because the factor rounds differently.
        if (inspection && 255 * normalFactor >= 255) continue
        const factor = inspection ? 1 - darkness / (samples * samples) : normalFactor
        for (let channel = 0; channel < 3; channel++) png.data[(y * width + x) * 4 + channel] *= factor
      }
      continue
    }
    for (const path of guidePaths(proposal, width / height)) {
    let offset = 0
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i], length = Math.hypot((b.x - a.x) * width, (b.y - a.y) * height), steps = Math.max(1, Math.ceil(length * 3))
      for (let j = 0; j <= steps; j++) if ((offset + length * j / steps) % 11 < 6) dot((a.x + (b.x - a.x) * j / steps) * width, (a.y + (b.y - a.y) * j / steps) * height)
      offset += length
    }
    }
  }
  // Existing child strokes stay solid and retain their original color. They are
  // shown above the temporary guide, like the production drawing surface.
  for (const child of childProposals) {
    const color = child.color.slice(1).match(/../g).map(value => parseInt(value, 16))
    for (const { points } of sampleProposalGeometry(child, width / height)) for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i], steps = Math.max(1, Math.ceil(Math.hypot((b.x - a.x) * width, (b.y - a.y) * height) * 3))
      for (let step = 0; step <= steps; step++) dot((a.x + (b.x - a.x) * step / steps) * width, (a.y + (b.y - a.y) * step / steps) * height, color, child.strokeWidth / 2 + .5)
    }
  }
  return PNG.sync.write(png)
}
