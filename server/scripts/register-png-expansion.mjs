import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { PNG } from 'pngjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
const folder = path.join(root, 'knowledge/nilo/illustrations')
const plan = JSON.parse(fs.readFileSync(path.join(folder, 'expansion-plan.json'), 'utf8'))
const assets = []
const missing = []
const hashes = new Map()
for (const job of plan.jobs) {
  const recordPath = path.join(folder, 'expansion-results', `${job.id}.json`)
  if (!fs.existsSync(recordPath)) { missing.push(job.id); continue }
  const record = JSON.parse(fs.readFileSync(recordPath, 'utf8'))
  if (record.inspected !== true) { missing.push(job.id); continue }
  if (record.id !== job.id || record.subject !== job.subject || record.difficulty !== job.difficulty) throw Error(`Wrong job identity: ${job.id}`)
  const src = `/nilo-illustrations/${job.id}.png`
  const file = path.join(root, 'frontend/public', src)
  if (!fs.existsSync(file)) throw Error(`Missing PNG: ${job.id}`)
  const bytes = fs.readFileSync(file)
  const png = PNG.sync.read(bytes)
  if (png.width < 768 || png.height < 768 || png.width !== png.height) throw Error(`Invalid PNG dimensions: ${job.id}`)
  const hash = createHash('sha256').update(bytes).digest('hex')
  if (hashes.has(hash)) throw Error(`Duplicate images: ${hashes.get(hash)} and ${job.id}`)
  hashes.set(hash, job.id)
  const { prompt, sourcePath, generationMode, inspected, ...material } = record
  assets.push({ ...material, src })
}
if (process.argv.includes('--complete') && missing.length) throw Error(`Still missing ${missing.length} inspected PNGs: ${missing.join(', ')}`)
fs.writeFileSync(path.join(folder, 'library-expansion.json'), JSON.stringify(assets, null, 2) + '\n')
const pairs = plan.jobs.filter(job => job.difficulty === 'beginner').filter(job => assets.some(a => a.subject === job.subject && a.difficulty === 'beginner') && assets.some(a => a.subject === job.subject && a.difficulty === 'medium')).length
const status = { registered: assets.length, expected: plan.jobs.length, completeSubjects: pairs, expectedSubjects: plan.targetSubjects, missingCount: missing.length, missing }
fs.writeFileSync(path.join(folder, 'expansion-status.json'), JSON.stringify(status, null, 2) + '\n')
console.log(JSON.stringify({ ...status, missing: process.argv.includes('--details') ? missing : undefined }, null, 2))
