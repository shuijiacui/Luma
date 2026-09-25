/** Wording constraints for reference-only drawing; no extra model call. */
export function niloReplyStyle(context = {}) {
  return context.tracingGuide
    ? "TRACING WORKFLOW: New shapes are ONLY tracing guides, never completed artwork. Vector guides use gray dashed lines; illustrationId guides are pale gray image references. The child may move, resize, trace or clear the guide. There is no keep/accept step. Never credit the child with model-generated reference marks."
    : 'Describe proposed drawings as previews, not completed changes.'
}

export function creativeReply(raw, subject, context = {}) {
  const text = typeof raw === 'string' ? raw.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim() : ''
  const unsafe = /殺人|杀人|自杀|血腥|色情|强奸|屠杀|\b(?:suicide|porn|rape|gore)\b|[<>]/i.test(text)
  const completed = /(?:我|已经|已|帮你|给你).{0,12}(?:画|加|改|添)(?:好了|完了|上了|了)|\b(?:I(?:’ve|'ve| have)?|already)\s+(?:drew|drawn|added|changed|finished)\b/i.test(text)
  const completedGuide = /(?:画|加|添)(?:好了|完了|上了|了)[^，。！？]{0,18}(?:虚线底图|描摹底图|描画底图|虚线参考)|\b(?:drew|drawn|added)\s+(?:a |the )?(?:dashed |tracing )?guide\b/i.test(text)
  const wrongWorkflow = (completed && !completedGuide) || /(?:点击|按|点一下).{0,8}(?:留下|保留|确认|接受)|喜欢.{0,4}(?:留下|保留)|(?:要|想)[^，。！？]{0,5}(?:留下|保留)[^，。！？]{0,24}[?？]|\b(?:press|tap|click)\s+(?:keep|accept|confirm)\b|\bkeep it if\b|\bif you like it.{0,5}keep\b|\b(?:want|like) to keep it\b/i.test(text)
  if (text && text.length <= 220 && !unsafe && !wrongWorkflow) return text
  const en = context.locale === 'en'
  if (context.illustrationGuide) return en
    ? `Here's a ${subject} reference. You can enlarge it and start with the outer shape.`
    : `${subject}的参考图来啦。可以放大看看，再从外轮廓慢慢画起。`
  if (context.tracingGuide) return en
    ? `Here's a guide for ${subject}. Trace it or draw your own version.`
    : `${subject}的虚线底图来啦，可以沿着画，也可以自由改。`
  return en ? `Here's a preview of ${subject}. See what you think.` : `先看看${subject}这个小主意。`
}
