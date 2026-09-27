import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { expect, test } from 'vitest'
import { illustrationCatalogue, getDrawingIllustration } from '../../shared/niloIllustrations.mjs'
import bounds from '../../shared/niloIllustrationTracing.json' with { type: 'json' }
import { tracingProjectionMode } from '../src/services/niloRasterTracing.js'

test('every selectable PNG ships a current density-aware guide and measured bounds', () => {
  for (const entry of illustrationCatalogue()) {
    const asset = getDrawingIllustration(entry.id)
    const source = readFileSync(new URL(`../../frontend/public${asset.src}`, import.meta.url))
    const raw = readFileSync(new URL(`../../frontend/public/nilo-tracing/${asset.id}.json`, import.meta.url), 'utf8')
    const guide = JSON.parse(raw)
    expect(Buffer.byteLength(raw), asset.id).toBeLessThan(250000)
    expect(guide.sourceHash, asset.id).toBe(createHash('sha256').update(source).digest('hex'))
    expect(guide.version).toBe(1)
    expect(guide.projection, asset.id).toBe(tracingProjectionMode(guide, asset))
    expect(guide.projectionPolicy).toBe('density-v1')
    expect(guide.aspect).toBeCloseTo(source.readUInt32BE(16) / source.readUInt32BE(20), 6)
    expect(guide.paths.length).toBeGreaterThan(0)
    expect(guide.paths.length).toBeLessThanOrEqual(1500)
    expect(guide.paths.reduce((sum, path) => sum + path.length, 0)).toBeLessThanOrEqual(50000)
    const box = { left: 1, top: 1, right: 0, bottom: 0 }
    let valid = true
    for (const path of guide.paths) {
      if (path.length < 2) valid = false
      for (const [x, y] of path) {
        if (![x, y].every(value => Number.isFinite(value) && value >= 0 && value <= 1)) valid = false
        box.left = Math.min(box.left, x); box.right = Math.max(box.right, x)
        box.top = Math.min(box.top, y); box.bottom = Math.max(box.bottom, y)
      }
    }
    expect(valid, asset.id).toBe(true)
    expect(bounds[asset.id], asset.id).toEqual({ aspect: guide.aspect, ...box })
  }
})
