const list = value => Array.isArray(value) ? value : []
const text = value => typeof value === 'string' ? value.trim() : ''
const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const noun = value => text(value).replace(/^(?:我(?:已经)?画(?:好)?的|我的|原来的|已有的|现有的|(?:my|the|existing|already drawn)\s+)+/i, '').trim()
const term = value => /[a-z]/i.test(value) ? `\\b${escape(value)}\\b` : escape(value)
const bounds = value => value && ['x', 'y', 'width', 'height'].every(key => Number.isFinite(value[key]))
  && value.width > 0 && value.height > 0 && value.x >= 0 && value.y >= 0
  && value.x + value.width <= 1.000001 && value.y + value.height <= 1.000001

export function hasChildContentEvidence(context) {
  return !!(bounds(context?.scene?.childBounds)
    || list(context?.scene?.recentContributions).some(item => item?.owner === 'child' && item.strokeCount > 0 && bounds(item.bounds))
    || context?.selectedDrawing?.source === 'child' && bounds(context.selectedDrawing.bounds))
}

function existingReference(utterance, subject) {
  for (const hit of utterance.matchAll(new RegExp(term(subject), 'gi'))) {
    const before = utterance.slice(Math.max(0, hit.index - 50), hit.index), after = utterance.slice(hit.index + hit[0].length)
    if (/(?:不要|别|无需)(?:保留|留下|留着)(?:我的|我画的)?\s*$/.test(before)
      || /\b(?:do not|don't|never)\s+(?:keep|preserve|leave)\s+(?:(?:my|the|existing)\s+)*$/i.test(before)) continue
    if (/(?:(?:保留|留下|留着)(?:我的|我画的)?|我(?:已经)?画(?:好)?的|原来的|已有的|现有的)\s*$/.test(before)
      || /我的\s*$/.test(before) && /^的?(?:上方|下方|上面|下面|旁边|左边|右边|前面|后面|周围)/.test(after)
      || /^(?:的位置|的形状|的位置和形状)?\s*(?:别动|不要动|别改|不要改|保持原样|保持不变|不变|不动)/.test(after)
      || /\b(?:keep|preserve|leave)\s+(?:(?:my|the|existing|already drawn)\s+)*$/i.test(before)
      || /\b(?:existing|already drawn)\s+$/i.test(before)
      || /\b(?:above|below|beside|near|over|under)\s+my\s+$/i.test(before)) return true
  }
  return false
}

// These are grammar rules for ownership/keep instructions, not a list of
// drawable themes. Unknown child-created creatures can be anchors too.
function literalAnchors(utterance) {
  const found = []
  for (const clause of utterance.split(/[，。！？,.;!?]/)) {
    const value = clause.trim()
    const suffix = value.match(/^(?:请)?(.{1,60}?)(?:的位置|的形状|的位置和形状)?(?:别动|不要动|别改|不要改|保持原样|保持不变|不变|不动)(?:就好|哦|吧|呀)?$/)
    const prefix = value.match(/^(?:请)?(?:保留|留下|留着)(.{1,60}?)(?:原来的样子|原样|不变)?$/)
    const english = value.match(/\b(?:keep|preserve|leave)\s+(.{1,60}?)(?=\s+(?:unchanged|as is|where it is|alone|intact|and|but)\b|$)/i)
    if (suffix || prefix || english) found.push(noun((suffix ?? prefix ?? english)[1]))
  }
  for (const hit of utterance.matchAll(/(?:我(?:已经)?画(?:好)?的|我的|原来的|已有的)([^，。！？,.;!?]{1,40}?)(?=的?(?:上方|下方|旁边|左边|右边|前面|后面|周围))/g)) found.push(noun(hit[1]))
  return found
}

/** Exact request phrases + evidence of child ink, never a model-only claim. */
export function preservedChildSubjects(input = {}) {
  if (!hasChildContentEvidence(input.context)) return []
  const utterance = text(input.utterance), candidates = [...list(input.semanticBrief?.preservedSubjects), ...literalAnchors(utterance)]
  return [...new Set(candidates.map(noun).filter(value => value && value.length <= 60
    && !/[\u0000-\u001f\u007f]/.test(value) && utterance.includes(value) && existingReference(utterance, value)))].slice(0, 8)
}

/** Keeping an old instance must not forbid an explicitly requested new one. */
export function requestsAdditionalInstance(utterance, subject) {
  const pattern = new RegExp(`(?:再(?:画|加|添|来)|另(?:外)?(?:画|加|添)|另一|另外一)[^，。！？,.;!?上下左右旁在]{0,16}${term(subject)}|\\b(?:another|additional|second)\\s+(?:(?!(?:above|below|beside|near|under|over|with|and|but)\\b)[a-z-]+\\s+){0,3}${term(subject)}`, 'gi')
  for (const hit of text(utterance).matchAll(pattern)) {
    const before = utterance.slice(Math.max(0, hit.index - 18), hit.index)
    if (!/(?:不要|别|不必|不想|无需)\s*$|\b(?:not|don't|do not|never|without)\s*$/i.test(before)) return true
  }
  return false
}

export function preservedOnlySubjects(input) {
  return preservedChildSubjects(input).filter(subject => !requestsAdditionalInstance(input.utterance, subject))
}

export function isPreservedSubjectPhrase(value, subjects) {
  return subjects.some(subject => noun(value).toLowerCase() === noun(subject).toLowerCase())
}

/** Leave the full original request and child-facing spatial description intact;
 * only the generated object's drawable feature contract loses anchor nouns. */
export function additionFeatureText(value, input) {
  let result = text(value)
  for (const subject of preservedOnlySubjects(input).sort((a, b) => b.length - a.length)) {
    const anchor = term(subject)
    result = result.replace(new RegExp(`(?:孩子画的|我的|我画的|原来的|已有的)?${anchor}(?=的?(?:正)?(?:上方|下方|上面|下面|旁边|左边|右边|前面|后面|周围))`, 'gi'), '已有画面（不重画）')
      .replace(new RegExp(`(?<=\\b(?:above|below|beside|near|over|under)\\s)(?:(?:my|the|existing)\\s+)*${anchor}`, 'gi'), 'the existing child drawing (do not redraw)')
    // Never drop an entire clause: it may also contain a required new feature.
    // Rebind explicit ownership/keep references to the external child layer.
    result = result.split(/([，。！？,.;!?])/).map(clause => existingReference(clause, subject)
      ? clause.replace(new RegExp(anchor, 'gi'), input.locale === 'en' ? 'existing child drawing (do not redraw)' : '已有画面（不重画）') : clause).join('')
  }
  return result.trim()
}

export function bindPreservedChildContent(plan, input) {
  if (!plan || typeof plan !== 'object') return plan
  const preserved = preservedChildSubjects(input)
  // A new plan cannot claim imaginary preserved subjects to satisfy missing
  // requirements. Previously approved preservation contracts remain stable.
  return { ...plan, preserve: [...new Set([...list(input.plan?.preserve), ...preserved])] }
}
