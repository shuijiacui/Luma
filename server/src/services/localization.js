import messages from '../../../shared/locales/en.json' with { type: 'json' }

export const localeOf = value => value === 'en' ? 'en' : 'zh'
export const unsafeEnglish = value => /\b(?:diagnos(?:is|es|tic|e|ed)|depression|adhd|autism|autistic|bipolar|schizophrenia|anxiety disorder|probability|risk level|psychological test)\b/i.test(value)
export const translate = (value, locale) => locale === 'en' && typeof value === 'string'
  ? messages[value.replace(/\s+/g, ' ').trim()] ?? value : value

// Presentation only: never translate enum values, identifiers, scores or source names.
export function localizeReport(report, locale) {
  if (locale !== 'en') return report
  return {
    ...report,
    language: 'en',
    parentAdvice: report.parentAdvice.map(value => translate(value, locale)),
    evidence: report.evidence.map(item => ({ ...item,
      summary: translate(item.summary, locale),
      ...(item.clusterLabel && { clusterLabel: translate(item.clusterLabel, locale) }),
    })),
  }
}

export function englishFeedback(features) {
  const parts = []
  const elements = (features?.elements ?? []).map(e => e.replaceAll('_', ' '))
  if (elements.length) parts.push(`you drew ${new Intl.ListFormat('en', { style: 'long', type: 'conjunction' }).format(elements)}`)
  const colors = features?.colors
  if (colors?.darkRatio >= .6) parts.push('used lots of dark colors')
  else if (typeof colors?.darkRatio === 'number' && colors.darkRatio <= .25) parts.push('used bright colors')
  if (colors?.dominant?.length) parts.push(`chose ${new Intl.ListFormat('en', { style: 'long', type: 'conjunction' }).format(colors.dominant.slice(0, 3))}`)
  const position = features?.composition?.position
  if (position === 'corner') parts.push('drew in a corner')
  if (position === 'edge') parts.push('drew near the edge')
  if (features?.source !== 'digital_canvas') {
    if (features?.composition?.pressure === 'light') parts.push('made gentle strokes')
    if (features?.composition?.pressure === 'heavy') parts.push('made strong strokes')
  }
  return parts.length ? `Wow, Nilo sees that you ${parts.join(', ').replace(/^you /, '')}.` : 'Wow, Nilo sees your drawing!'
}

export const ENGLISH_FOLLOW_UP = 'Would you like to draw something else?'
export const ENGLISH_PROMPT = '\nWrite all human-readable output in English. Keep the required JSON keys, evidence IDs and source filenames unchanged. Do not add a judgment or any clinical claim. Do not use disease names, diagnoses, probabilities or psychological test labels. The result is only a reference for one picture and must be considered alongside everyday observations.'
