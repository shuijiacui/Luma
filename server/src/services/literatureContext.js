import context from '../../../knowledge/psychology/literature/curated-context.json' with { type: 'json' }

export function buildLiteratureContext(locale = 'zh') {
  const language = locale === 'en' ? 'en' : 'zh'
  return context.sources.filter(source => source.reviewStatus.endsWith('_checked')).map(source => ({
    sourceId: source.id,
    sourceFile: source.localFile ?? source.title,
    sourceUrl: source.url,
    text: source.text[language],
    limitation: source.limitation[language],
    role: 'reference_only',
  }))
}
