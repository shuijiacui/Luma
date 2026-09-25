import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { normalizeMaterialCuration, setMaterialCuration } from '../../../shared/niloCuration.mjs'

// Resolve on the server filesystem; avoid Vite treating this JSON as a browser
// asset URL when integration tests import the service through the child app.
export const materialCurationPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../../knowledge/nilo/curation.json')

// Reading at request boundaries also notices saves made by the separate reviewer
// process. A malformed file must not silently re-enable rejected materials.
export function readMaterialCuration(path = materialCurationPath) {
  return normalizeMaterialCuration(JSON.parse(readFileSync(path, 'utf8')))
}

export function refreshMaterialCuration() { return setMaterialCuration(readMaterialCuration()) }

export function createMaterialCurationStore({ path = materialCurationPath, allowedIds } = {}) {
  const read = () => readMaterialCuration(path)
  const save = value => {
    const manifest = normalizeMaterialCuration(value, allowedIds)
    mkdirSync(dirname(path), { recursive: true })
    const temporary = `${path}.${process.pid}.tmp`
    writeFileSync(temporary, JSON.stringify(manifest, null, 2) + '\n', 'utf8')
    renameSync(temporary, path)
    setMaterialCuration(manifest)
    return manifest
  }
  return {
    read,
    save,
    merge(value) {
      const incoming = normalizeMaterialCuration(value, allowedIds)
      return save({ version: 1, decisions: { ...read().decisions, ...incoming.decisions } })
    },
    set(id, decision) {
      if (!allowedIds?.has(id)) throw new Error('素材不存在。')
      if (!['keep', 'reject', 'pending'].includes(decision)) throw new Error('审核状态不正确。')
      const next = read()
      if (decision === 'pending') delete next.decisions[id]
      else next.decisions[id] = decision
      return save(next)
    },
  }
}
