export { drawingIllustrations } from '../knowledge/nilo/illustrations/index.mjs'
import { drawingIllustrations } from '../knowledge/nilo/illustrations/index.mjs'
import { isMaterialEnabled } from './niloCuration.mjs'
import { recipeSubjectAliases } from '../knowledge/nilo/recipes/names.mjs'

// Raw lookup also restores existing drafts after a reference has been retired.
export const getDrawingIllustration = id => drawingIllustrations.find(item => item.id === id)
export const illustrationCatalogue = () => drawingIllustrations.filter(item => isMaterialEnabled(item.id))
  .map(({ id, subject, name, style, category, aspect, ageBands, difficulty, detail, learning, tracing }) => ({ id, subject, name, style, category, aspect, ageBands, difficulty, detail, learning, tracing }))

const normalize = value => typeof value === 'string' ? value.trim().toLowerCase().replace(/\s+/g, ' ') : ''
export function matchingIllustrationSubjects(text, exact = false) {
  const input = normalize(text)
  if (!input) return []
  const hits = new Map()
  for (const item of drawingIllustrations) {
    for (const word of [item.subject, item.name, ...recipeSubjectAliases(item.subject), ...(item.aliases ?? [])]) {
      const term = normalize(word)
      // Latin words need word boundaries; "school" must not match "schoolbag".
      const at = input.indexOf(term)
      const found = exact ? input === term : at >= 0 && (!/^[a-z ]+$/.test(term)
        || (!/[a-z]/.test(input[at - 1] ?? '') && !/[a-z]/.test(input[at + term.length] ?? '')))
      if (found) hits.set(item.subject, Math.max(hits.get(item.subject) ?? 0, term.length))
    }
  }
  return [...hits].sort((a, b) => b[1] - a[1]).map(([subject]) => subject)
}
export function preferredIllustrationDetail(utterance) {
  const text = normalize(utterance)
  if (/简单|容易|太难|难了|少.*细节|细节.*少|少.*线|轮廓|simpler|easier|less detail|too hard/.test(text)) return 'simple'
  if (/更多细节|细节多|多.*细节|像真的|写实|精细|精美|精致|realistic|detailed|more detail/.test(text)) return 'rich'
}

// Pick only levels that actually exist for each subject. Empty-canvas/simple
// requests prefer beginner PNGs, while a subject without one keeps its medium
// reference. A detailed-only subject must not masquerade as a simple picture.
export function illustrationsForDetail(items, detail) {
  if (!detail) return [...items]
  const priorities = detail === 'rich' ? ['rich', 'moderate', 'simple']
    : detail === 'moderate' ? ['moderate', 'simple'] : ['simple', 'moderate']
  const chosen = new Map()
  for (const item of items) {
    const rank = priorities.indexOf(item.detail)
    if (rank >= 0 && (!chosen.has(item.subject) || rank < chosen.get(item.subject))) chosen.set(item.subject, rank)
  }
  return items.filter(item => priorities.indexOf(item.detail) >= 0 && priorities.indexOf(item.detail) === chosen.get(item.subject))
}
