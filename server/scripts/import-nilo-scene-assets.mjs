// Offline rescue of synthetic scene-evaluation artwork. Never loads .env,
// contacts a provider, or imports child canvas pixels into the public library.
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve, relative, dirname, basename, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { PNG } from 'pngjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
const tmp = resolve(root, 'server/.tmp')
const cataloguePath = resolve(root, 'knowledge/nilo/illustrations/test-scenes.json')
const auditPath = resolve(root, 'knowledge/nilo/illustrations/test-scenes-provenance.json')
const curationPath = resolve(root, 'knowledge/nilo/curation.json')
const publicRoot = resolve(root, 'frontend/public/nilo-illustrations')
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const relativePath = path => relative(root, path).split(sep).join('/')
const slug = value => value.replace(/[^a-z0-9]+/gi, '-').toLowerCase().replace(/^-|-$/g, '')
async function json(path, fallback = null) { try { return JSON.parse(await readFile(path, 'utf8')) } catch (error) { if (error.code === 'ENOENT') return fallback; throw error } }
async function files(path) {
  let entries
  try { entries = await readdir(path, { withFileTypes: true }) } catch (error) { if (error.code === 'ENOENT') return []; throw error }
  const result = []
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.isSymbolicLink()) continue
    const child = resolve(path, entry.name)
    if (entry.isDirectory()) result.push(...await files(child))
    else if (entry.isFile()) result.push(child)
  }
  return result
}

const entries = new Map(), curation = await json(curationPath)
const previous = await json(cataloguePath, [])
const previousAudit = await json(auditPath, { assets: [] })
const audit = { version: 1, source: 'synthetic scene evaluations only', assets: [] }
const roots = ['nilo-open-scenes', 'nilo-cosy-probe', 'nilo-inversion-probe', 'nilo-targeted-budget']
const paths = (await Promise.all(roots.map(name => files(resolve(tmp, name))))).flat()

async function add(bytes, { caseId, name, summary, source, rotation = 0, approved = false, note = '', sourceKind }) {
  const png = PNG.sync.read(bytes, { checkCRC: true })
  if (png.width > 2048 || png.height > 2048) throw Error('Unexpected evaluation image dimensions')
  // Store exactly the displayed orientation; this is lossless pixel placement,
  // not another generation or a crop that could remove requested parts.
  if (rotation === 180) {
    const rotated = Buffer.alloc(png.data.length)
    for (let i = 0; i < png.data.length; i += 4) png.data.copy(rotated, png.data.length - i - 4, i, i + 4)
    png.data = rotated
  } else if (rotation !== 0) throw Error('Unsupported evaluation rotation')
  const pixelHash = hash(Buffer.concat([Buffer.from(`${png.width}x${png.height}:`), png.data]))
  let entry = entries.get(pixelHash)
  const provenance = { file: relativePath(source), kind: sourceKind, case: caseId, rotation, sourceHash: hash(bytes), approved, note }
  if (entry) {
    entry.provenance.push(provenance)
    if (approved) { entry.approved = true; entry.asset.name = name.slice(0, 60); entry.asset.label = summary; entry.asset.learning = summary }
    return
  }
  const id = `illustration-scene-${slug(caseId).slice(0, 35)}-${pixelHash.slice(0, 12)}`
  entry = { pixelHash, approved, provenance: [provenance], bytes: rotation === 0 ? bytes
    : PNG.sync.write(png, { colorType: 0, inputColorType: 6, bitDepth: 8, deflateLevel: 9 }), asset: {
    id, subject: `scene-${slug(caseId)}`, name: name.slice(0, 60), label: summary,
    style: 'storybook', category: 'landscape', detail: 'moderate', difficulty: 'medium',
    related: ['landscape'], aliases: [], aspect: png.width / png.height, minPixels: 280,
    ageBands: ['5-7', '8-9', '10-12'], learning: summary,
    collection: 'scene-tests-2026-09-28', completeScene: true,
    src: `/nilo-illustrations/${id}.png`,
  } }
  entries.set(pixelHash, entry)
}

const reviewCache = new Map()
async function reviewed(dir, row, recordBytes) {
  if (!reviewCache.has(dir)) {
    const reviews = []
    for (const path of paths.filter(path => dirname(path) === dir && /^independent-review-.*\.json$/.test(basename(path)))) {
      const data = await json(path)
      if (data?.reviewer?.independentOfGeneration) reviews.push(...(data.reviews ?? []))
    }
    reviewCache.set(dir, reviews)
  }
  return reviewCache.get(dir).some(review => review.case === row.case && review.verdict === 'pass'
    && review.imageInspected && (review.artifactFiles?.recordSha256 ?? review.recordHash ?? review.hashes?.recordFileSha256) === hash(recordBytes))
}

for (const path of paths.filter(path => path.endsWith('.json'))) {
  const recordBytes = await readFile(path), row = JSON.parse(recordBytes.toString('utf8'))
  if (!row || typeof row.case !== 'string' || !Array.isArray(row.calls) || typeof row.utterance !== 'string') continue
  // Only dedicated synthetic evaluation records, never application history.
  if (!['live_provider', 'synthetic_provider'].includes(row.mode) || !row.executed) continue
  const plan = row.result?.plan ?? row.plan?.plan
  const approved = row.ready && await reviewed(dirname(path), row, recordBytes)
  for (const item of row.result?.objects ?? []) {
    if (item.proposal?.template !== 'generated') continue
    const object = plan?.objects?.find(object => object.id === item.id)
    await add(Buffer.from(item.proposal.raster.pngBase64, 'base64'), { caseId: row.case,
      name: object?.name ?? row.case, summary: plan?.summary ?? row.utterance, source: path,
      rotation: item.proposal.rotation ?? 0, approved, sourceKind: 'generated-object',
      note: approved ? '已有绑定记录的独立看图通过；仅收录生成图，不含孩子原画。' : '已保存生成结果，入库后仍需复核。' })
  }
  for (const call of row.calls) {
    if (!call.candidatePng || !/^[a-zA-Z0-9_-]+\.png$/.test(call.candidatePng)) continue
    const imagePath = resolve(dirname(path), call.candidatePng)
    const object = plan?.objects?.find(object => object.id === call.image?.objectId)
    await add(await readFile(imagePath), { caseId: row.case, name: call.image?.name ?? object?.name ?? row.case,
      summary: plan?.summary ?? row.utterance, source: imagePath, rotation: object?.rotation ?? 0,
      sourceKind: 'candidate', note: '测试候选图；包含被拒绝或未完成的尝试，不等同于审核通过。' })
  }
}

// Small diagnostics did not run through the evaluation CLI. Their records
// explicitly identify synthetic/no-child-ink inputs. Retain them for review.
for (const path of await files(resolve(tmp, 'compact-scene-prompt-probe'))) {
  if (!path.endsWith('.json')) continue
  const data = await json(path)
  if (!data?.synthetic || data.childInk !== false || !data.case) continue
  await add(await readFile(path.replace(/\.json$/, '.png')), { caseId: data.case, name: data.case === 'magic_world' ? '魔法塔与蘑菇小路' : '糖果星球',
    summary: data.summary, source: path.replace(/\.json$/, '.png'), sourceKind: 'compact-prompt-probe', note: '简洁提示试验，待素材复核。' })
}
for (const path of paths.filter(path => basename(path) === 'bottle-prompt-check.json')) {
  const data = await json(path)
  if (!data?.synthetic || !data.success) continue
  await add(await readFile(path.replace(/\.json$/, '.png')), { caseId: data.case, name: '瓶中花园（多瓶候选）',
    summary: data.summary, source: path.replace(/\.json$/, '.png'), sourceKind: 'prompt-check', note: '中央主体正确，但周围多出重复瓶子；暂不自动使用。' })
}

await mkdir(publicRoot, { recursive: true })
const assets = []
for (const entry of entries.values()) {
  await writeFile(resolve(publicRoot, `${entry.asset.id}.png`), entry.bytes)
  assets.push(entry.asset)
  // Preserve any explicit decisions from later human reviews on repeat import.
  const prior = previousAudit.assets.find(asset => asset.id === entry.asset.id)
  if (!previous.some(asset => asset.id === entry.asset.id) || prior && curation.decisions[entry.asset.id] === prior.initialDecision) {
    curation.decisions[entry.asset.id] = entry.approved ? 'keep' : 'reject'
  }
  audit.assets.push({ id: entry.asset.id, pixelHash: entry.pixelHash, initialDecision: entry.approved ? 'keep' : 'reject', sources: entry.provenance })
}
assets.sort((a, b) => a.id.localeCompare(b.id))
// Do not remove earlier imports if a local diagnostics folder has been cleaned.
const merged = new Map(previous.map(asset => [asset.id, asset]))
for (const asset of assets) merged.set(asset.id, asset)
await writeFile(cataloguePath, JSON.stringify([...merged.values()].sort((a, b) => a.id.localeCompare(b.id)), null, 2) + '\n')
await writeFile(auditPath, JSON.stringify(audit, null, 2) + '\n')
await writeFile(curationPath, JSON.stringify(curation, null, 2) + '\n')
console.log(JSON.stringify({ imported: assets.length, approved: assets.filter(asset => curation.decisions[asset.id] === 'keep').length,
  heldForReview: assets.filter(asset => curation.decisions[asset.id] !== 'keep').length,
  sources: audit.assets.reduce((sum, asset) => sum + asset.sources.length, 0), apiCalls: 0 }))
