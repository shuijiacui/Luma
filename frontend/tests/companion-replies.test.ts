import { expect, test } from 'vitest'
import { createReplyPicker, tracingReply, type CompanionReplyEvent } from '@/features/child/companion/replies'

test.each(['zh', 'en'] as const)('local acknowledgements vary per event in %s without extra requests', locale => {
  const pick = createReplyPicker()
  for (const event of ['guide', 'guideHint', 'guideAdjusted', 'guideCleared', 'inkEdited'] satisfies CompanionReplyEvent[]) {
    const values = Array.from({ length: 9 }, () => pick(event, locale))
    expect(new Set(values).size).toBeGreaterThanOrEqual(3)
    expect(values.every((value, i) => !i || value !== values[i - 1])).toBe(true)
    if (locale === 'en') expect(values.every(value => !/[\u4e00-\u9fff]/.test(value))).toBe(true)
  }
})

test('guide replies retain the actual model idea and only add a short optional tracing hint', () => {
  const pick = createReplyPicker()
  const text = '让这只小鸟带着你的故事飞一会儿吧。'
  const first = tracingReply(text, 'zh', pick), second = tracingReply(text, 'zh', pick)
  expect(first).toContain(text)
  expect(first).toContain('虚线')
  expect(second).not.toBe(first)
  expect(tracingReply('Here is a bird guide. Make it your own.', 'en', pick)).toBe('Here is a bird guide. Make it your own.')
})

test.each(['我已经画好了太阳，点击留下吧。', '我帮你加上了帽子。', '我画了一朵花。', '我帮你加了一顶帽子。', 'I drew a flower.', 'I added a bird.', 'I have drawn a sun. Tap keep.'])('a guide never announces a committed drawing: %s', text => {
  const reply = tracingReply(text, /[\u4e00-\u9fff]/.test(text) ? 'zh' : 'en', createReplyPicker())
  expect(reply).not.toContain(text)
  expect(reply).toMatch(/虚线|guide/)
  expect(reply).not.toMatch(/画好了|加上了|drawn|Tap keep/)
})

test.each(['我画了一张虚线底图，你可以自由改。', 'I drew a tracing guide. You can make your own version.'])('a completed guide may truthfully be described: %s', text => {
  expect(tracingReply(text, /[\u4e00-\u9fff]/.test(text) ? 'zh' : 'en', createReplyPicker())).toBe(text)
})

test.each(['我给水面添两条波纹，喜欢再留下。', '要留下这个小主意吗？', 'Keep it if you like it.'])('guide wording never requires accepting model ink: %s', text => {
  const reply = tracingReply(text, /[\u4e00-\u9fff]/.test(text) ? 'zh' : 'en', createReplyPicker())
  expect(reply).not.toContain(text)
  expect(reply).toMatch(/虚线|guide/)
})
