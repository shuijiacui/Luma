import { expect, test } from 'vitest'
import { creativeReply, niloReplyStyle } from '../src/services/niloReplyStyle.js'
import { canvasProvenance } from '../src/services/canvasDocument.js'

test('guide replies cannot claim committed artwork or instruct acceptance', () => {
  for (const reply of ['我已经画好了，喜欢就留下来。', 'Tap accept to keep it.']) {
    expect(creativeReply(reply, '小猫', { tracingGuide: true })).not.toBe(reply)
  }
  expect(niloReplyStyle({ tracingGuide: true })).toContain('no keep/accept step')
  expect(creativeReply(undefined, '学校', { locale: 'zh', tracingGuide: true, illustrationGuide: true })).toContain('参考图')
  expect(creativeReply(undefined, '学校', { locale: 'zh', tracingGuide: true, illustrationGuide: true })).not.toContain('虚线')
})

test('guided child drawings retain co-created provenance without assisted edits', () => {
  expect(canvasProvenance({ version: 1, baseSource: 'child', operations: [], guided: true })).toBe('co-created')
  expect(canvasProvenance({ version: 1, baseSource: 'child', operations: [] })).toBe('child')
})
