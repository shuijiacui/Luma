import { expect, test, vi } from 'vitest'
import { parseSimpleDrawingRequest } from '../src/services/simpleDrawing.js'
import { generateNiloDialogue } from '../src/services/niloDialogue.js'

const context = { locale: 'zh', inferDrawingIntent: true, inkGrid: Array(64).fill(0), canvasAspect: 1.5,
  lastStroke: { points: [{ x: .3, y: .4 }, { x: .5, y: .6 }], color: '#d74952', width: 7, brushKind: 'crayon' } }
const run = (utterance, extra = {}, opts = {}) => generateNiloDialogue({ imageBase64: 'synthetic', context: { ...context, utterance, ...extra }, ...opts })

test.each(['你帮我再换一个星星吧', '帮我画一颗星星', '请画一个星星好吗？', '再来个星星', '换成星星', 'can you draw a star please?'])('previews exactly one requested star for %s without a model call', async utterance => {
  const vision = vi.fn(), text = vi.fn()
  const result = await run(utterance, {}, { chatWithImage: vision, chatText: text })
  expect(result.status).toBe('ready')
  expect(result.proposal).toMatchObject({ template: 'custom', subject: '星星', brushKind: 'crayon', color: '#d74952', strokeWidth: 7 })
  expect(result.proposal.sketch.paths).toHaveLength(1)
  expect(result.proposal.sketch.paths[0]).toHaveLength(11)
  expect(result.reply).toContain('留下来')
  expect(vision).not.toHaveBeenCalled(); expect(text).not.toHaveBeenCalled()
})

test('explicit color changes preserve the child brush, while replacement needs no existing preview', async () => {
  const result = await run('你帮我换一个蓝色的太阳吧')
  expect(result.proposal).toMatchObject({ template: 'sun', color: '#4aa5d8', strokeWidth: 7, brushKind: 'crayon' })
  expect(result.proposal.width * context.canvasAspect / result.proposal.height).toBeCloseTo(1)
})

test('an explicit new request can bring back a previously dismissed subject', async () => {
  expect((await run('再来个星星', { rejectedSubjects: ['星星'] })).proposal?.subject).toBe('星星')
  expect((await run('再来个太阳', { rejectedTemplates: ['sun'] })).proposal?.template).toBe('sun')
})

test('replacing an uncommitted preview keeps its center and style', async () => {
  const previous = { template: 'fish', x: .2, y: .3, width: .22, height: .18, color: '#123456', strokeWidth: 3, brushKind: 'pencil', target: '小鱼', relation: '空白处' }
  const result = await run('换一个星星吧', { currentProposal: previous })
  expect(result.proposal.color).toBe('#123456')
  expect(result.proposal.strokeWidth).toBe(3)
  expect(result.proposal.x + result.proposal.width / 2).toBeCloseTo(previous.x + previous.width / 2)
  expect(result.proposal.y + result.proposal.height / 2).toBeCloseTo(previous.y + previous.height / 2)
})

test.each(['不要画星星', '你会画星星吗', '我画了星星', '星星真好看', '画个星星再画个月亮', '画两颗星星', '画一个机器人', '画一颗星星在小船左边', '画一个星星怪兽', '别换星星', '留下来', '换一个', '可以给它一个朋友吗'])('does not shortcut ambiguous, negative or complex speech: %s', utterance => {
  expect(parseSimpleDrawingRequest(utterance)).toBeNull()
})

test('uses open space and asks about the requested subject when the canvas is full', async () => {
  const grid = Array(64).fill(0); grid.fill(1, 0, 32)
  expect((await run('画太阳', { inkGrid: grid })).proposal.y).toBeGreaterThan(.5)
  const full = await run('画星星', { inkGrid: Array(64).fill(1) })
  expect(full.status).toBe('clarify'); expect(full.proposal).toBeUndefined()
  expect(full.reply).toContain('星星想放在哪里')
})

test('shortcut respects solo mode, a missing image, cancellation and multi-element edits', async () => {
  const model = vi.fn(async () => ({ intent: 'chat', reply: '我在这里陪你。' }))
  expect((await run('画星星', { inferDrawingIntent: false }, { chatWithImage: model })).proposal).toBeUndefined()
  expect(model).toHaveBeenCalledOnce()
  expect(await generateNiloDialogue({ context: { ...context, utterance: '画星星' } })).toMatchObject({ reason: 'missing_image' })
  expect(await run('画星星', {}, { signal: AbortSignal.abort() })).toMatchObject({ reason: 'timeout' })
  const previous = { template: 'fish', x: .2, y: .3, width: .2, height: .1, color: '#123456', target: '鱼', relation: '在水里' }
  await run('换成星星', { currentProposal: previous, currentAdditions: [{ ...previous, x: .6 }] }, { chatWithImage: model })
  expect(model).toHaveBeenCalledTimes(2)
})
