// This is a vocabulary for the planning model, not another theme classifier.
// Descriptions come from registered materials: "forest" is an association,
// whereas only the actual pose/name may establish a visible tree hollow.
import { getMaterialGeometry } from './niloMaterialGeometry.js'

const columns = ['kind', 'id', 'subject', 'name', 'pose', 'roles', 'tags', 'geometry', 'support', 'tier', 'contents']
const backgroundSubjects = new Set(['sun', 'moon', 'cloud', 'sleepycloud', 'grass', 'leaf'])
const connectors = new Set(['archedbridge', 'door', 'window'])
const genericTags = new Set(['animal', 'plant', 'nature', 'landscape', 'object', 'stilllife', 'people', 'person', 'character', 'architecture', 'building', 'town', 'transport', 'vehicle', 'botanical'])

export function sceneMaterialGeometry(material) {
  // Landscape plates contain their own environment; a forest-path picture is
  // not an isolated road segment that can be joined to arbitrary buildings.
  if (material.completeScene || material.category === 'landscape' && !backgroundSubjects.has(material.subject)) return 'complete-scene'
  if (material.family === 'architecture' && /树杈|树干|树上|tree/i.test(material.pose ?? '')) return 'object-with-support'
  return 'complete-object'
}

export const sceneMaterialTier = material => sceneMaterialGeometry(material) === 'complete-scene' ? 'scene'
  : sceneMaterialGeometry(material) === 'object-with-support' ? 'combination' : 'component'

const segmenter = new Intl.Segmenter('zh', { granularity: 'word' })
const stopWords = new Set(['一个', '画一个', '一幅', '我想', '想画', '帮我', '画面', '场景', '地方', 'the', 'draw', 'make', 'scene', 'place', 'with'])
/** Literal catalogue search, not a theme-to-object template. The planning model
 * still decides whether the real pose fulfils the complete original request. */
export function sceneMaterialLexicalScore(material, query) {
  const source = typeof query === 'string' ? query.toLowerCase().slice(0, 1600) : ''
  const words = [...new Set([...segmenter.segment(source)].filter(item => item.isWordLike && item.segment.length >= 2
    && !stopWords.has(item.segment)).map(item => item.segment))]
  const name = `${material.name ?? ''} ${material.subject ?? ''}`.toLowerCase()
  const pose = `${material.pose ?? material.label ?? ''}`.toLowerCase()
  return words.reduce((score, word) => score + (name.includes(word) ? 4 : pose.includes(word) ? 2 : 0), 0)
}

function rolesFor(material) {
  if (sceneMaterialGeometry(material) === 'complete-scene') return 'focal|setting'
  if (connectors.has(material.subject)) return 'focal|connection'
  if (backgroundSubjects.has(material.subject) || material.category === 'landscape') return 'focal|setting'
  if (material.family === 'architecture') return 'focal|destination'
  if (['animal', 'people', 'transport'].includes(material.family)) return 'focal|companion'
  if (material.family === 'nature') return 'focal|setting|accent'
  return 'focal|prop'
}

export function rankMaterialVariants(items, retainedIds = new Set(), recentIds = new Set()) {
  return [...items].sort((a, b) => Number(retainedIds.has(b.id)) - Number(retainedIds.has(a.id))
    || Number(recentIds.has(a.id)) - Number(recentIds.has(b.id))
    || Number(b.kind === 'illustration') - Number(a.kind === 'illustration'))
}

/** One truthful representative per subject, including subjects missed by tags.
 * Tuples avoid repeated keys, profiles, variants, bounds and drawing commands.
 * Geometry is resolved from the registered ID by the layout/rendering code.
 */
export function sceneSemanticIndex(groups, { retainedIds, recentIds, query = '' } = {}) {
  return {
    columns,
    // Tags and roles are possible uses, never promises of visible features.
    meaning: 'Rows share the stated profile/reference line family. Missing trailing tier/contents means component/own subject. component is an independent whole object; combination is one inseparable object with its existing support; scene is a complete setting. contents are registered-caption identities, not movable parts. Name/pose describe actual content; tags are associations only. A complete-scene cannot be cut apart or used as an isolated connector. support=no forbids resting objects on it; [left,right,y] is an audited support span, empty is unreviewed. Never rename stock to add unseen parts.',
    rows: [...groups.values()].sort((a, b) => a.subject.localeCompare(b.subject)).map(group => {
      const item = rankMaterialVariants(group.items, retainedIds, recentIds).sort((a, b) => Number(retainedIds?.has(b.id)) - Number(retainedIds?.has(a.id))
        || sceneMaterialLexicalScore(b, query) - sceneMaterialLexicalScore(a, query))[0]
      const tags = [...new Set(item.related ?? [])].filter(tag => !genericTags.has(tag) && tag !== item.subject && tag !== item.name && !item.pose?.includes(tag)).slice(0, 3)
      const geometry = getMaterialGeometry(item.id), surface = geometry?.supportSurface
      const support = item.completeScene ? 'no: entire scene; internal parts are not independent support surfaces'
        : geometry?.supportsOn === false ? `no: ${geometry.supportReason}` : surface ? [surface.left, surface.right, surface.y] : ''
      const row = [item.kind, item.id, item.subject, item.name, item.pose ?? '', rolesFor(item), tags.join('|'), sceneMaterialGeometry(item), support]
      return sceneMaterialTier(item) === 'component' ? row : [...row, sceneMaterialTier(item), (item.visibleSubjects ?? [item.subject]).join('|')]
    }),
  }
}
