type Locale = 'zh' | 'en'

const guideReplies = {
  illustrationGuide: { zh: '参考图准备好啦，可以沿着轮廓描，也可以画出你的版本。', en: 'Your reference is ready. Trace the outlines or make your own version.' },
  guide: { zh: '灰色虚线准备好啦，可以照着描，也可以画出你的版本。', en: 'The dashed guide is ready. Trace it or make your own version.' },
  guideHint: { zh: '可以沿着虚线试试，也可以画出你的版本。', en: 'Try the dashed lines, or make your own version.' },
  guideAdjusted: { zh: '底图调整好啦，可以接着描了。', en: 'The guide is adjusted. You can keep tracing.' },
  guideCleared: { zh: '底图清除啦，你画的线条都在。', en: 'The guide is cleared. Your own lines are still here.' },
} as const

export const guideReply = (event: keyof typeof guideReplies, locale: Locale) => guideReplies[event][locale]

/** Preserve the model's idea, but don't announce an ink commit for a tracing guide. */
export function tracingReply(spoken: string, locale: Locale, illustration = false) {
  const text = illustration ? spoken.trim().replace(/灰色虚线|虚线/g, '参考轮廓').replace(/dashed(?: lines?)?/gi, 'outlines') : spoken.trim()
  const completed = /(?:我|已经|已|帮你|给你).{0,12}(?:画|加|改|添)(?:好了|完了|上了|了)|\b(?:I(?:’ve|'ve| have)?|already)\s+(?:drew|drawn|added|changed|finished)\b/i.test(text)
  const completedGuide = /(?:画|加|添)(?:好了|完了|上了|了)[^，。！？]{0,18}(?:虚线底图|描摹底图|描画底图|虚线参考)|\b(?:drew|drawn|added)\s+(?:a |the )?(?:dashed |tracing )?guide\b/i.test(text)
  const wrongWorkflow = (completed && !completedGuide) || /(?:点击|按|点一下).{0,8}(?:留下|保留|确认|接受)|喜欢.{0,4}(?:留下|保留)|(?:要|想)[^，。！？]{0,5}(?:留下|保留)[^，。！？]{0,24}[?？]|\b(?:press|tap|click)\s+(?:keep|accept|confirm)\b|\bkeep it if\b|\bif you like it.{0,5}keep\b|\b(?:want|like) to keep it\b/i.test(text)
  if (!text || wrongWorkflow) return guideReply(illustration ? 'illustrationGuide' : 'guide', locale)
  if (/虚线|底图|描一描|\b(?:guide|trac(?:e|ing)|dashed)\b/i.test(text)) return text
  const punctuation = /[。！？.!?…]$/.test(text) ? '' : locale === 'en' ? '.' : '。'
  return `${text}${punctuation}${locale === 'en' ? ' ' : ''}${guideReply(illustration ? 'illustrationGuide' : 'guideHint', locale)}`
}
