// Parent-facing, non-clinical observation of a 5–12-year-old child's own marks.
// Legacy HTP scoring remains available for reading old reports but is not used here.
import catalog from '../../../knowledge/observation/catalog.json' with { type: 'json' }
import conversation from '../../../knowledge/child-development/conversation.json' with { type: 'json' }
const ELEMENTS = catalog.elements
const COLORS = catalog.colors

const named = (catalog, key, locale) => catalog[key]?.[locale === 'en' ? 1 : 0] ?? null
const item = (id, zh, en, locale) => ({ entryId: id, summary: locale === 'en' ? en : zh,
  clusterLabel: locale === 'en' ? 'Visible detail' : '可见细节' })

export function buildObservationReport(features, { locale = 'zh', childAge = null } = {}) {
  const evidence = []
  const highConfidence = key => (features.confidence?.[key] ?? 0) >= 0.5
  const visibleObjects = Array.isArray(features.objects)
    ? features.objects.filter(o => o.visibility === 'visible' && o.confidence >= 0.7 && named(ELEMENTS, o.label, locale))
    : []
  const names = [...new Set((visibleObjects.length ? visibleObjects.map(o => o.label) :
    highConfidence('elements') ? features.elements ?? [] : []).map(e => named(ELEMENTS, e, locale)).filter(Boolean))].slice(0, 5)
  if (names.length) evidence.push(item('OBS-elements',
    `画面中可以看到${names.join('、')}。`, `Visible in the picture: ${names.join(', ')}.`, locale))

  const colors = highConfidence('colors')
    ? [...new Set((features.colors?.dominant ?? []).map(c => named(COLORS, c.toLowerCase(), locale)).filter(Boolean))].slice(0, 3) : []
  if (colors.length) evidence.push(item('OBS-colors',
    `画面使用了${colors.join('、')}。`, `Visible colors include ${colors.join(', ')}.`, locale))

  // Approximate positions are presented only when the vision response includes
  // a validated bounding box. Never infer an absent part or a mental state.
  const placed = visibleObjects.find(o => o.bbox && o.confidence >= 0.8)
  if (placed) {
    const label = named(ELEMENTS, placed.label, locale)
    const cx = placed.bbox.x + placed.bbox.width / 2
    const side = cx < 0.38 ? ['左侧', 'left'] : cx > 0.62 ? ['右侧', 'right'] : ['中间', 'middle']
    evidence.push(item('OBS-position', `一处${label}大致位于画面${side[0]}。`,
      `A ${label} appears roughly in the ${side[1]} of the picture.`, locale))
  }

  const subject = names[0]
  const language = locale === 'en' ? 'en' : 'zh'
  const childAgeBand = childAge >= 5 && childAge <= 7 ? '5-7'
    : childAge >= 8 && childAge <= 9 ? '8-9'
      : childAge >= 10 && childAge <= 12 ? '10-12' : null
  const promptSet = childAgeBand ? conversation.ageBands[childAgeBand] : conversation
  const parentAdvice = [subject
    ? promptSet.withSubject[language].replace('{subject}', subject)
    : promptSet.withoutSubject[language], conversation.choice[language]]
  const insufficient = evidence.length === 0
  return {
    kind: 'observation-v1', emotion: '画面观察', confidence: 0,
    evidence, parentAdvice, language: locale,
    narrative: locale === 'en'
      ? insufficient ? 'There is not enough clear visual detail for a specific observation yet.' : 'These are visible details in one picture, not an interpretation of your child’s feelings. Ask your child for their own story if they would like to share it.'
      : insufficient ? '这次画面中可确认的细节较少，暂不做具体描述。' : '这里只记录单幅画里看得见的内容，不推断孩子的情绪。孩子愿意时，可以听听他自己讲的故事。',
    observationStatus: insufficient ? 'insufficient' : 'observed',
    childAgeBand,
    ageContext: childAgeBand ? promptSet.context[language] : null,
  }
}
