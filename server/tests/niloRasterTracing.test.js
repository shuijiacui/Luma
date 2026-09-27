import { expect, test } from 'vitest'
import { rasterTracingPaths, tracingProjectionMode } from '../src/services/niloRasterTracing.js'

function bitmap(draw, transparent = false) {
  const width = 64, height = 64, data = new Uint8Array(width * height * 4)
  data.fill(255)
  if (transparent) for (let i = 0; i < data.length; i += 4) { data[i] = data[i + 1] = data[i + 2] = data[i + 3] = 0 }
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (draw(x, y)) {
    const i = (y * width + x) * 4; data[i] = data[i + 1] = data[i + 2] = 0; data[i + 3] = 255
  }
  return { width, height, data }
}

test('thick outlines become a single closed centerline, not a doubled border', () => {
  const image = bitmap((x, y) => x >= 10 && x <= 53 && y >= 10 && y <= 53 && (x <= 13 || x >= 50 || y <= 13 || y >= 50))
  const { paths } = rasterTracingPaths(image)
  expect(paths).toHaveLength(1)
  expect(paths[0][0]).toEqual(paths[0].at(-1))
  expect(paths[0].length).toBeLessThan(16)
  const xs = paths[0].map(p => p[0])
  expect(Math.min(...xs)).toBeGreaterThan(10 / 64)
  expect(Math.max(...xs)).toBeLessThan(54 / 64)
})

test('disconnected parts stay separate and a branch remains joined', () => {
  const { paths } = rasterTracingPaths(bitmap((x, y) => (x >= 29 && x <= 32 && y >= 10 && y <= 53) || (y >= 29 && y <= 32 && x >= 10 && x <= 53) || (x >= 57 && x <= 59 && y >= 10 && y <= 25)))
  expect(paths.length).toBeGreaterThanOrEqual(5)
  expect(paths.some(path => path.every(([x]) => x > .85))).toBe(true)
  expect(paths.every(path => !path.some(([x]) => x < .85) || path.every(([x]) => x < .85))).toBe(true)
})

test('transparent background and opaque white paper produce the same guide', () => {
  const draw = (x, y) => x >= 20 && x <= 23 && y >= 8 && y <= 56
  expect(rasterTracingPaths(bitmap(draw, true))).toEqual(rasterTracingPaths(bitmap(draw)))
  expect(rasterTracingPaths(bitmap(() => false, true)).paths).toEqual([])
})

test('downsampling preserves normalized bounds and refuses malformed inputs', () => {
  const result = rasterTracingPaths(bitmap((x, y) => Math.abs(x - y) < 2), { maxSide: 32 })
  expect(result.paths.length).toBeGreaterThan(0)
  expect(result.paths.flat(2).every(value => Number.isFinite(value) && value >= 0 && value <= 1)).toBe(true)
  expect(() => rasterTracingPaths({ width: 64, height: 64, data: [] })).toThrow('invalid tracing image')
})

test('dense or fragmented outlines use gray images without removing their detail', () => {
  const fragments = Array.from({ length: 180 }, () => [[.1, .1], [.11, .11]])
  const dense = { aspect: 1, paths: fragments }
  expect(tracingProjectionMode(dense)).toBe('gray')
  expect(dense.paths).toBe(fragments)
  expect(dense.paths).toHaveLength(180)
  const simple = { aspect: 1, paths: [[[.1, .1], [.9, .1], [.9, .9]]] }
  expect(tracingProjectionMode(simple)).toBe('dashed')
  expect(tracingProjectionMode(simple, { detail: 'rich' })).toBe('gray')
})
