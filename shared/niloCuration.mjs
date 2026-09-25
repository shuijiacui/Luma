import initialCuration from '../knowledge/nilo/curation.json' with { type: 'json' }
import retirement from '../knowledge/nilo/retired-materials.json' with { type: 'json' }

export const retiredMaterialIdentities = [...retirement.deleted, ...retirement.archived]
export const deletedMaterialIds = retirement.deleted.map(item => item.id)
const deletedIds = new Set(deletedMaterialIds), archivedIds = new Set(retirement.archived.map(item => item.id))
const identities = new Map(retiredMaterialIdentities.map(item => [item.id, item]))
export function materialAvailability(id) { return deletedIds.has(id) ? 'deleted' : archivedIds.has(id) ? 'archived' : 'active' }
export function getRetiredMaterialIdentity(id) { return identities.get(id) }

let currentCuration = initialCuration

// Shared by the child app, drawing service and reviewer. Unreviewed originals stay
// available; rejecting a material removes it from selection, never from source.
export function normalizeMaterialCuration(value, allowedIds) {
  if (!value || value.version !== 1 || typeof value.decisions !== 'object' || !value.decisions || Array.isArray(value.decisions)) {
    throw new Error('审核文件格式不正确，需要 version: 1 和 decisions。')
  }
  const decisions = Object.create(null)
  for (const [id, decision] of Object.entries(value.decisions)) {
    if (!/^[a-z][a-z0-9-]{0,100}$/.test(id) || !['keep', 'reject'].includes(decision)) {
      throw new Error('审核文件包含无效的素材编号或状态。')
    }
    if (allowedIds && !allowedIds.has(id)) throw new Error(`素材不存在：${id}`)
    decisions[id] = decision
  }
  return { version: 1, decisions }
}

export function setMaterialCuration(value) {
  currentCuration = normalizeMaterialCuration(value)
  return currentCuration
}

export function getMaterialCuration() { return currentCuration }
export function materialDecision(id, manifest = currentCuration) { return manifest.decisions[id] ?? 'pending' }
export function isMaterialEnabled(id, manifest = currentCuration) { return materialAvailability(id) === 'active' && materialDecision(id, manifest) !== 'reject' }
export function filterApprovedMaterials(items, manifest = currentCuration) { return items.filter(item => isMaterialEnabled(item.id, manifest)) }
