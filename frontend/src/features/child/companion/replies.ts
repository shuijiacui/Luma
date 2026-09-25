type Locale = 'zh' | 'en'

// These are interaction acknowledgements, not assessments of the child's art.
// Keep every alternative truthful even when no authored strokes exist yet.
const replies = {
  illustrationGuide: {
    zh: ['参考图准备好啦，可以沿着轮廓描，也可以画出你的版本。', '底图在这里啦，点“看原图”可以仔细看看，画法由你决定。'],
    en: ['Your reference is ready. Trace the outlines or make your own version.', 'Here is your guide. View the original to look more closely, then draw it your way.'],
  },
  guide: {
    zh: ['灰色虚线准备好啦，可以照着描，也可以画出你的版本。', '底图在这里啦，颜色和画法都由你来决定。', '试试这张虚线底图吧，慢慢画，我陪着你。', '小主意变成虚线啦，挑你喜欢的部分来画就好。'],
    en: ['The dashed guide is ready. Trace it or make your own version.', 'Here is your guide. You choose the colors and how to draw it.', 'Try this dashed guide at your own pace. I’m here with you.', 'Here is a little idea in dashed lines. Draw whichever parts you like.'],
  },
  guideHint: {
    zh: ['可以沿着虚线试试，也可以画出你的版本。', '想怎么描、用什么颜色，都由你决定。', '慢慢描就好，画完可以清除底图。', '挑你喜欢的部分来画吧，不用一模一样。'],
    en: ['Try the dashed lines, or make your own version.', 'You choose how to trace it and which colors to use.', 'Take your time tracing. Clear the guide when you’re done.', 'Draw the parts you like; it doesn’t have to match.'],
  },
  guideAdjusted: {
    zh: ['底图调整好啦，可以接着描了。', '底图按你的想法调整啦，画法还是由你决定。', '调好底图啦，慢慢试，我陪着你。'],
    en: ['The guide is adjusted. You can keep tracing.', 'The guide follows your change. How you draw it is up to you.', 'The guide is adjusted. Take your time; I’m here with you.'],
  },
  guideCleared: {
    zh: ['底图清除啦，你画的线条都在。', '底图收起来啦，你的画留着，接下来随你想象。', '底图收好啦，想继续画什么都可以。'],
    en: ['The guide is cleared. Your own lines are still here.', 'The guide is gone. Your drawing stays, ready for your next idea.', 'The guide is put away. Draw whatever you’d like next.'],
  },
  inkEdited: {
    zh: ['改好啦！保留了你的线条，不喜欢可以撤销。', '按你说的改好啦，不喜欢可以撤销，再试一个想法。', '调整好啦，你的线条还在。不喜欢的话，随时撤销。'],
    en: ['Changed! Your lines are kept. You can undo it if you like.', 'I made your change. You can undo it and try another idea.', 'All adjusted, with your lines kept. You can undo it whenever you like.'],
  },
} as const

export type CompanionReplyEvent = keyof typeof replies

/** Per-session rotation: no extra model request and no repeated adjacent acknowledgement. */
export function createReplyPicker() {
  const positions = new Map<CompanionReplyEvent, number>()
  return (event: CompanionReplyEvent, locale: Locale): string => {
    const variants = replies[event][locale]
    const index = positions.get(event) ?? 0
    positions.set(event, (index + 1) % variants.length)
    return variants[index]
  }
}

/** Preserve the model's idea, but don't announce an ink commit for a tracing guide. */
export function tracingReply(spoken: string, locale: Locale, pick: ReturnType<typeof createReplyPicker>, illustration = false) {
  const text = illustration ? spoken.trim().replace(/灰色虚线|虚线/g, '参考轮廓').replace(/dashed(?: lines?)?/gi, 'outlines') : spoken.trim()
  const completed = /(?:我|已经|已|帮你|给你).{0,12}(?:画|加|改|添)(?:好了|完了|上了|了)|\b(?:I(?:’ve|'ve| have)?|already)\s+(?:drew|drawn|added|changed|finished)\b/i.test(text)
  const completedGuide = /(?:画|加|添)(?:好了|完了|上了|了)[^，。！？]{0,18}(?:虚线底图|描摹底图|描画底图|虚线参考)|\b(?:drew|drawn|added)\s+(?:a |the )?(?:dashed |tracing )?guide\b/i.test(text)
  const wrongWorkflow = (completed && !completedGuide) || /(?:点击|按|点一下).{0,8}(?:留下|保留|确认|接受)|喜欢.{0,4}(?:留下|保留)|(?:要|想)[^，。！？]{0,5}(?:留下|保留)[^，。！？]{0,24}[?？]|\b(?:press|tap|click)\s+(?:keep|accept|confirm)\b|\bkeep it if\b|\bif you like it.{0,5}keep\b|\b(?:want|like) to keep it\b/i.test(text)
  if (!text || wrongWorkflow) return pick(illustration ? 'illustrationGuide' : 'guide', locale)
  if (/虚线|底图|描一描|\b(?:guide|trac(?:e|ing)|dashed)\b/i.test(text)) return text
  const punctuation = /[。！？.!?…]$/.test(text) ? '' : locale === 'en' ? '.' : '。'
  return `${text}${punctuation}${locale === 'en' ? ' ' : ''}${pick(illustration ? 'illustrationGuide' : 'guideHint', locale)}`
}
