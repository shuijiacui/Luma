import { expect, test } from 'vitest'
import { creativeReply, niloReplyStyle } from '../src/services/niloReplyStyle.js'
import { buildDialoguePrompt, sanitizeDialogueContext } from '../src/services/niloDialogue.js'

test('wording memory is bounded and separate from child history', () => {
  const context = sanitizeDialogueContext({ recentReplies: ['old', 'x'.repeat(400), null, 'last'], history: [] })
  expect(context.recentReplies).toEqual(['x'.repeat(220), 'last'])
  expect(context.history).toEqual([])
  expect(buildDialoguePrompt(context, false)).toContain('RECENT NILO WORDING (avoid repetition only; not child intent')
})

test('conversation-only prompting leaves geometry out and prioritizes the latest difficulty', () => {
  const context = sanitizeDialogueContext({ utterance: '可是我画的线歪歪的。', requestDrawing: false,
    history: [{ role: 'user', text: '我把太阳画成紫色啦' }], imageProvenance: 'child' })
  const chat = buildDialoguePrompt(context, true)
  const drawing = buildDialoguePrompt({ ...context, requestDrawing: true }, true)
  expect(chat).toContain('CONVERSATION ONLY')
  expect(chat).toContain('The latest utterance sets the topic')
  expect(chat).toContain('可是我画的线歪歪的。')
  expect(chat).toContain('separated child-authored layer')
  expect(chat).not.toMatch(/PATH DATA|CONNECTED DETAIL|attachment:\{|rx\*sketch|drawing-skills/)
  expect(chat.length).toBeLessThan(drawing.length / 2)
  const inferred = buildDialoguePrompt({ ...context, inferDrawingIntent: true }, true)
  expect(inferred).toContain('CONNECTED DETAIL')
  expect(inferred).toContain('When intent is chat, all geometry, attachment and placement clarification rules above do NOT apply')
  expect(inferred.indexOf('NILO\'S VOICE:')).toBeGreaterThan(inferred.indexOf('CONNECTED DETAIL'))
})

test('model wording survives when brief and appropriate, without automatic applause', () => {
  const text = '给树旁的小鸟试试你喜欢的颜色吧。'
  expect(creativeReply(text, '小鸟', { tracingGuide: true })).toBe(text)
  expect(niloReplyStyle({ tracingGuide: true })).toContain('following Nilo\'s guide is never required')
})

test.each(['我画了一朵花。', '我帮你加了一顶帽子。', 'I drew a flower.', 'I added a bird.'])('completed artwork is not announced before projection: %s', text => {
  expect(creativeReply(text, '小鸟', { tracingGuide: true })).not.toBe(text)
})

test.each(['我画了一张虚线底图，你可以自由改。', 'I drew a tracing guide. You can make your own version.'])('completed guide wording is allowed: %s', text => {
  expect(creativeReply(text, '小鸟', { tracingGuide: true })).toBe(text)
})

test.each(['我给水面添两条波纹，喜欢再留下。', '要留下这个小主意吗？', 'Keep it if you like it.'])('creative guide wording never requests acceptance: %s', text => {
  expect(creativeReply(text, '小鸟', { tracingGuide: true })).not.toBe(text)
})

test.each(['zh', 'en'])('missing, repeated or false-completion replies use truthful varied %s guide wording', locale => {
  const context = { locale, tracingGuide: true, recentReplies: [] }
  const first = creativeReply(undefined, locale === 'en' ? 'bird' : '小鸟', context)
  const second = creativeReply(first, locale === 'en' ? 'bird' : '小鸟', { ...context, recentReplies: [first] })
  expect(second).not.toBe(first)
  expect(first).toMatch(/小鸟|bird/)
  expect(first).toMatch(/虚线|guide/)
  expect(creativeReply('我已经画好了小鸟。', '小鸟', context)).not.toContain('画好了')
  expect(creativeReply('<script>alert(1)</script>', '小鸟', context)).not.toContain('<script>')
})
