export const GENERATED_RASTER_LIMITS = Object.freeze({ bytes: 250000, side: 1536, pixels: 2359296, paths: 1500, points: 50000, pathCharacters: 250000 })
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

/** Portable structural boundary for self-contained PNG guides. The server also
 * decodes/re-encodes pixels before issuing one. Never accepts a URL or data URI.
 */
export function validateGeneratedRaster(raw) {
  if (!record(raw) || Object.keys(raw).some(key => !['version', 'pngBase64', 'width', 'height', 'projection', 'paths'].includes(key))
    || raw.version !== 1 || !['gray', 'dashed'].includes(raw.projection)
    || !Number.isInteger(raw.width) || !Number.isInteger(raw.height) || raw.width < 2 || raw.height < 2
    || raw.width > GENERATED_RASTER_LIMITS.side || raw.height > GENERATED_RASTER_LIMITS.side
    || raw.width * raw.height > GENERATED_RASTER_LIMITS.pixels || raw.width / raw.height < .2 || raw.width / raw.height > 5
    || typeof raw.pngBase64 !== 'string' || raw.pngBase64.length < 60 || raw.pngBase64.length > Math.ceil(GENERATED_RASTER_LIMITS.bytes / 3) * 4
    || raw.pngBase64.length % 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(raw.pngBase64)) return null
  const padding = raw.pngBase64.endsWith('==') ? 2 : raw.pngBase64.endsWith('=') ? 1 : 0
  if (raw.pngBase64.length / 4 * 3 - padding > GENERATED_RASTER_LIMITS.bytes
    || padding && alphabet.indexOf(raw.pngBase64.at(-padding - 1)) % (padding === 2 ? 16 : 4)) return null
  let header
  try { header = atob(raw.pngBase64.slice(0, 44)) } catch { return null }
  const byte = index => header.charCodeAt(index)
  const uint = index => byte(index) * 16777216 + byte(index + 1) * 65536 + byte(index + 2) * 256 + byte(index + 3)
  if (header.length < 33 || [137, 80, 78, 71, 13, 10, 26, 10].some((value, index) => byte(index) !== value)
    || uint(8) !== 13 || header.slice(12, 16) !== 'IHDR' || uint(16) !== raw.width || uint(20) !== raw.height
    || byte(24) !== 8 || ![0, 2, 4, 6].includes(byte(25)) || byte(26) !== 0 || byte(27) !== 0 || byte(28) > 1) return null
  let paths
  if (raw.paths !== undefined) {
    if (!Array.isArray(raw.paths) || !raw.paths.length || raw.paths.length > GENERATED_RASTER_LIMITS.paths) return null
    let count = 0
    for (const path of raw.paths) {
      if (!Array.isArray(path) || path.length < 2 || (count += path.length) > GENERATED_RASTER_LIMITS.points
        || path.some(point => !Array.isArray(point) || point.length !== 2 || point.some(value => typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1))) return null
    }
    if (JSON.stringify(raw.paths).length > GENERATED_RASTER_LIMITS.pathCharacters) return null
    paths = raw.paths.map(path => path.map(([x, y]) => [x, y]))
  }
  if (raw.projection === 'dashed' && !paths) return null
  return { version: 1, pngBase64: raw.pngBase64, width: raw.width, height: raw.height, projection: raw.projection, ...(paths ? { paths } : {}) }
}
