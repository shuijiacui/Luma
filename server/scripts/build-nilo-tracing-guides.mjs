import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve, sep } from 'node:path'
import { createHash } from 'node:crypto'
import { PNG } from 'pngjs'
import { illustrationCatalogue, getDrawingIllustration } from '../../shared/niloIllustrations.mjs'
import { rasterTracingPaths, tracingProjectionMode } from '../src/services/niloRasterTracing.js'

const publicRoot = fileURLToPath(new URL('../../frontend/public/', import.meta.url))
const output = resolve(publicRoot, 'nilo-tracing')
const id = process.argv.find(value => value.startsWith('--id='))?.slice(5)
const assets = id ? [getDrawingIllustration(id)].filter(Boolean) : illustrationCatalogue().map(item => getDrawingIllustration(item.id))
if (!assets.length) throw new Error('No registered illustration matches --id')
await mkdir(output, { recursive: true })
let points = 0, bytes = 0, updated = 0
for (const asset of assets) {
  if (!/^[a-z0-9-]+$/.test(asset.id) || !/^\/nilo-illustrations\/[a-z0-9-]+\.png$/.test(asset.src)) throw new Error('Invalid registered tracing source')
  const source = resolve(publicRoot, `.${asset.src}`)
  if (!source.startsWith(resolve(publicRoot) + sep)) throw new Error('Tracing source outside public directory')
  const buffer = await readFile(source), hash = createHash('sha256').update(buffer).digest('hex')
  const target = resolve(output, `${asset.id}.json`)
  let existing
  try { existing = JSON.parse(await readFile(target, 'utf8')) } catch {}
  const cached = existing?.sourceHash === hash && existing?.algorithm === 'centerline-v1'
  if (cached && existing.projectionPolicy === 'density-v1') continue
  const png = cached ? null : PNG.sync.read(buffer, { checkCRC: true })
  let traced = cached ? { version: 1, aspect: existing.aspect, paths: existing.paths } : null, lastError
  // Dense pencil textures are resampled coherently, never truncated by path
  // order. Each attempt retains the complete image and subject silhouette.
  for (const maxSide of [640, 512, 448, 384, 320, 256]) {
    if (traced) break
    try {
      const candidate = rasterTracingPaths(png, { maxSide })
      if (Buffer.byteLength(JSON.stringify(candidate)) > 249000) throw new Error('Tracing file budget')
      traced = candidate; break
    } catch (error) { lastError = error }
  }
  if (!traced) throw new Error(`Unable to trace ${asset.id}: ${lastError?.message}`)
  if (!traced.paths.length) throw new Error(`Empty tracing for ${asset.id}`)
  const data = JSON.stringify({ ...traced, projection: tracingProjectionMode(traced, asset), projectionPolicy: 'density-v1', sourceHash: hash, algorithm: 'centerline-v1' }) + '\n'
  if (Buffer.byteLength(data) > 250000) throw new Error(`Guide exceeds 250KB: ${asset.id}`)
  await writeFile(target, data)
  points += traced.paths.reduce((sum, path) => sum + path.length, 0); bytes += Buffer.byteLength(data); updated++
  if (id || updated % 40 === 0) console.log(JSON.stringify({ processed: updated, id: asset.id, paths: traced.paths.length }))
}
console.log(JSON.stringify({ registered: assets.length, updated, points, bytes, output }))
const bounds = {}
for (const entry of illustrationCatalogue()) {
  let guide
  try { guide = JSON.parse(await readFile(resolve(output, `${entry.id}.json`), 'utf8')) } catch { continue }
  const box = { left: 1, top: 1, right: 0, bottom: 0 }
  for (const path of guide.paths) for (const [x, y] of path) {
    box.left = Math.min(box.left, x); box.top = Math.min(box.top, y)
    box.right = Math.max(box.right, x); box.bottom = Math.max(box.bottom, y)
  }
  bounds[entry.id] = { aspect: guide.aspect, ...box }
}
await writeFile(new URL('../../shared/niloIllustrationTracing.json', import.meta.url), JSON.stringify(bounds, null, 2) + '\n')
