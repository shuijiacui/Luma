import { PNG } from 'pngjs'

// Experimental, offline-only path. No production route imports this module.
// A successful result proves bounded pixel addition, never semantic quality.
export const imageAdditionPolicy = Object.freeze({
  maxPixels: 1024 * 1024,
  maxBytes: 2 * 1024 * 1024,
  maxRoiArea: .35,
  maxAllowedArea: .40,
  maxContactRadius: .025,
  maxContactLength: .35,
  deltaTolerance: 3,
  minInkContrast: 12,
  maxCanvasAdditionRatio: .035,
  maxAllowedAdditionRatio: .35,
})

function readPng(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 33 || bytes.length > imageAdditionPolicy.maxBytes
    || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a'
    || bytes.toString('ascii', 12, 16) !== 'IHDR') throw new Error('invalid_png')
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20)
  if (!width || !height || width > 1024 || height > 1024 || width * height > imageAdditionPolicy.maxPixels) {
    throw new Error('image_too_large')
  }
  return PNG.sync.read(bytes, { checkCRC: true })
}

const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key))
const unit = value => Number.isFinite(value) && value >= 0 && value <= 1
const distanceToSegment = (x, y, a, b) => {
  const dx = b.x - a.x, dy = b.y - a.y, length = dx * dx + dy * dy
  const t = length ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / length)) : 0
  return Math.hypot(x - a.x - t * dx, y - a.y - t * dy)
}

function regionMasks(original, roi, contact) {
  const { width, height, data } = original, short = Math.min(width, height)
  if (!exactKeys(roi, ['x', 'y', 'width', 'height']) || !Object.values(roi).every(unit)
    || roi.width <= 0 || roi.height <= 0 || roi.x + roi.width > 1 || roi.y + roi.height > 1
    || roi.width * roi.height > imageAdditionPolicy.maxRoiArea) throw new Error('invalid_roi')
  const bounds = { left: roi.x * width, top: roi.y * height,
    right: (roi.x + roi.width) * width, bottom: (roi.y + roi.height) * height }
  let points = [], radius = 0
  if (contact !== undefined) {
    if (!exactKeys(contact, ['points', 'radius']) || !Array.isArray(contact.points)
      || contact.points.length < 1 || contact.points.length > 24
      || !Number.isFinite(contact.radius) || contact.radius <= 0
      || contact.radius > imageAdditionPolicy.maxContactRadius
      || contact.points.some(p => !exactKeys(p, ['x', 'y']) || !unit(p.x) || !unit(p.y))) {
      throw new Error('invalid_contact')
    }
    radius = contact.radius * short
    points = contact.points.map(p => ({ x: p.x * width, y: p.y * height }))
    let length = 0
    for (let i = 0; i < points.length; i++) {
      const p = points[i]
      if (p.x < bounds.left - radius || p.x > bounds.right + radius
        || p.y < bounds.top - radius || p.y > bounds.bottom + radius) throw new Error('contact_outside_roi')
      if (i) length += Math.hypot(p.x - points[i - 1].x, p.y - points[i - 1].y)
      let touchesInk = false
      for (let y = Math.max(0, Math.floor(p.y - radius)); y < Math.min(height, Math.ceil(p.y + radius)); y++) {
        for (let x = Math.max(0, Math.floor(p.x - radius)); x < Math.min(width, Math.ceil(p.x + radius)); x++) {
          const offset = (y * width + x) * 4
          if (Math.hypot(x + .5 - p.x, y + .5 - p.y) <= radius
            && Math.min(data[offset], data[offset + 1], data[offset + 2]) < 255) touchesInk = true
        }
      }
      if (!touchesInk) throw new Error('contact_without_original_ink')
    }
    if (length > short * imageAdditionPolicy.maxContactLength) throw new Error('contact_too_long')
  }
  const allowed = new Uint8Array(width * height), contactMask = new Uint8Array(width * height)
  let allowedPixels = 0
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const px = x + .5, py = y + .5, at = y * width + x
    const inRoi = px >= bounds.left && px < bounds.right && py >= bounds.top && py < bounds.bottom
    const inContact = points.some((p, i) => distanceToSegment(px, py, p, points[i + 1] || p) <= radius)
    if (inContact) contactMask[at] = 1
    if (inRoi || inContact) { allowed[at] = 1; allowedPixels++ }
  }
  if (!allowedPixels || allowedPixels > width * height * imageAdditionPolicy.maxAllowedArea) {
    throw new Error('allowed_region_too_large')
  }
  return { allowed, contactMask, allowedPixels }
}

/**
 * Extract only new ink from a full-frame image-edit candidate.
 * - ROI/contact are caller-authorized original-image coordinates, not model output.
 * - Original image is an opaque white drawing canvas; every non-white original
 *   pixel, including its faint anti-alias fringe, stays bit-for-bit identical.
 * - No resizing, alignment, erasure, background replacement or off-region edits.
 * - The layer contains candidate RGB at opaque changed pixels, transparent elsewhere.
 *   True brush opacity cannot be recovered from a flattened before/after pair.
 * - Passing these checks says nothing about what the addition depicts. It still
 *   requires visual review and explicit child acceptance before any production use.
 */
export function extractImageAddition({ originalPng, candidatePng, roi, contact } = {}) {
  const fail = (reason, metrics = {}) => ({ ok: false, reason, semanticVerified: false, metrics })
  let original, candidate, masks
  try {
    original = readPng(originalPng); candidate = readPng(candidatePng)
    if (original.width !== candidate.width || original.height !== candidate.height) return fail('dimensions_changed')
    for (let i = 3; i < original.data.length; i += 4) {
      if (original.data[i] !== 255 || candidate.data[i] !== 255) return fail('opaque_canvas_required')
    }
    masks = regionMasks(original, roi, contact)
  } catch (error) {
    const reasons = new Set(['invalid_png', 'image_too_large', 'invalid_roi', 'invalid_contact',
      'contact_outside_roi', 'contact_without_original_ink', 'contact_too_long', 'allowed_region_too_large'])
    return fail(reasons.has(error.message) ? error.message : 'invalid_png')
  }
  const { width, height } = original, total = width * height
  const layer = new PNG({ width, height }), composite = new PNG({ width, height })
  layer.data.fill(0); original.data.copy(composite.data)
  const metrics = { width, height, allowedPixels: masks.allowedPixels, originalInkPixels: 0,
    addedPixels: 0, protectedInkChanges: 0, outsideChanges: 0, ignoredNoisePixels: 0, contactAdditionPixels: 0 }
  for (let at = 0; at < total; at++) {
    const i = at * 4, old = original.data, next = candidate.data
    const ink = old[i] !== 255 || old[i + 1] !== 255 || old[i + 2] !== 255
    if (ink) metrics.originalInkPixels++
    const delta = Math.max(Math.abs(next[i] - old[i]), Math.abs(next[i + 1] - old[i + 1]), Math.abs(next[i + 2] - old[i + 2]))
    if (delta <= imageAdditionPolicy.deltaTolerance) { if (delta) metrics.ignoredNoisePixels++; continue }
    if (!masks.allowed[at]) { metrics.outsideChanges++; continue }
    if (ink) { metrics.protectedInkChanges++; continue }
    if (255 - Math.min(next[i], next[i + 1], next[i + 2]) < imageAdditionPolicy.minInkContrast) {
      metrics.ignoredNoisePixels++; continue
    }
    for (let channel = 0; channel < 4; channel++) layer.data[i + channel] = composite.data[i + channel] = next[i + channel]
    metrics.addedPixels++
    if (masks.contactMask[at]) metrics.contactAdditionPixels++
  }
  // Reject the whole candidate; never silently crop a bad edit into apparent success.
  if (metrics.outsideChanges) return fail('outside_authorized_region', metrics)
  if (metrics.protectedInkChanges) return fail('original_ink_changed', metrics)
  if (metrics.addedPixels < Math.max(4, Math.ceil(total * .00004))) return fail('no_visible_addition', metrics)
  if (metrics.addedPixels > total * imageAdditionPolicy.maxCanvasAdditionRatio
    || metrics.addedPixels > masks.allowedPixels * imageAdditionPolicy.maxAllowedAdditionRatio) {
    return fail('addition_too_large', metrics)
  }
  if (contact && !metrics.contactAdditionPixels) return fail('missing_contact_addition', metrics)
  return { ok: true, semanticVerified: false, metrics,
    alphaPolicy: 'opaque-difference-pixels; original brush opacity is unknown',
    layerPng: PNG.sync.write(layer), compositePng: PNG.sync.write(composite) }
}
