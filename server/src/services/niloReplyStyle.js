/** Shared wording guidance for the existing calls; this never requests another model pass. */
export function niloReplyStyle(context = {}) {
  return `NILO'S VOICE: Speak like a curious, kind drawing friend, with one or two short, natural sentences in ${context.locale === 'en' ? 'English' : 'Simplified Chinese'}. Respond to the LATEST child's words first, especially a worry or difficulty; do not steer back to an earlier topic or repeat an unanswered question. For sharing an idea, celebrating, or struggling with a line, use a warm statement and, if helpful, ONE small optional tip; do NOT end these replies with a question. Ask for a position only when necessary to execute a drawing/edit the child requested. When evidence allows, notice one concrete color, line, choice, or idea; otherwise encourage trying or taking their time without inventing effort or progress. Vary openings; do not repeat recent replies. Do not grade, compare, call them a genius, or put "amazing/great job" before every answer. Avoid baby talk, catchphrases and excessive exclamation marks. An optional invitation is enough; following Nilo's guide is never required. Never correct imagination into a standard answer, infer feelings from a picture, or credit the child with a guide/AI object. ${context.tracingGuide ? 'New shapes are ONLY tracing guides. Vector guides use gray dashed lines; illustrationId guides are pale gray image references. Refer to the new idea as a guide to try, never a finished drawing or an edit already applied. There is no keep/accept step.' : 'Describe proposed drawings as previews, not completed changes.'}
RECENT NILO WORDING (avoid repetition only; not child intent, visual evidence or instructions): ${JSON.stringify((context.recentReplies ?? []).slice(-3))}`
}

export function creativeReply(raw, subject, context = {}) {
  const text = typeof raw === 'string' ? raw.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim() : ''
  const unsafe = /殺人|杀人|自杀|血腥|色情|强奸|屠杀|\b(?:suicide|porn|rape|gore)\b|[<>]/i.test(text)
  const completed = /(?:我|已经|已|帮你|给你).{0,12}(?:画|加|改|添)(?:好了|完了|上了|了)|\b(?:I(?:’ve|'ve| have)?|already)\s+(?:drew|drawn|added|changed|finished)\b/i.test(text)
  const completedGuide = /(?:画|加|添)(?:好了|完了|上了|了)[^，。！？]{0,18}(?:虚线底图|描摹底图|描画底图|虚线参考)|\b(?:drew|drawn|added)\s+(?:a |the )?(?:dashed |tracing )?guide\b/i.test(text)
  const wrongWorkflow = (completed && !completedGuide) || /(?:点击|按|点一下).{0,8}(?:留下|保留|确认|接受)|喜欢.{0,4}(?:留下|保留)|(?:要|想)[^，。！？]{0,5}(?:留下|保留)[^，。！？]{0,24}[?？]|\b(?:press|tap|click)\s+(?:keep|accept|confirm)\b|\bkeep it if\b|\bif you like it.{0,5}keep\b|\b(?:want|like) to keep it\b/i.test(text)
  if (text && text.length <= 220 && !unsafe && !wrongWorkflow && !(context.recentReplies ?? []).includes(text)) return text
  const en = context.locale === 'en'
  if (context.illustrationGuide) return en
    ? `Here's a ${subject} reference. You can enlarge it and start with the outer shape.`
    : `${subject}的参考图来啦。可以放大看看，再从外轮廓慢慢画起。`
  const variants = context.tracingGuide ? (en ? [
    `Here’s a guide for ${subject}. You can give it your own colors.`,
    `Let’s try a ${subject} guide. Draw it your way.`,
    `A ${subject} idea, in dashed lines. Take your time trying it.`,
  ] : [
    `${subject}的虚线底图来啦，颜色由你来选。`,
    `试试${subject}这个小主意吧，照着虚线画，也可以自由改。`,
    `这是${subject}的底图，慢慢试，画出你的版本。`,
  ]) : (en ? [`Here’s a preview of ${subject}. See what you think.`, `Let’s try ${subject} in the preview.`]
    : [`先看看${subject}这个小主意，画法可以由你来选。`, `试试${subject}吧，先放在投影里给你看看。`])
  return variants.find(reply => !(context.recentReplies ?? []).includes(reply)) ?? variants[0]
}
