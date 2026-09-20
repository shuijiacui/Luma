import express from 'express'
import request from 'supertest'
import { expect, test, vi, afterEach } from 'vitest'
import { createNiloRouter } from '../src/routes/nilo.js'
import { buildDialoguePrompt, generateNiloDialogue, NILO_TEMPLATES, sanitizeDialogueContext, sanitizeDrawingStyle, validateBounds, validateDialogue, validateProposal } from '../src/services/niloDialogue.js'
import { chatWithImage, LLMParseError } from '../src/services/llmClient.js'

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aO2kAAAAASUVORK5CYII='
const PROPOSAL = { template: 'flame', x: 0.3, y: 0.7, width: 0.2, height: 0.07, rotation: 0, color: '#E4A86A', strokeWidth: 4, target: '孩子的飞船', relation: '飞船尾部的一小段尾焰' }
const CONTEXT = { locale: 'zh', utterance: '这是一艘去月球的飞船', theme: '船', requestDrawing: true, revision: 7, history: [], rejectedTemplates: [] }
const RESPONSE = { reply: '我画了一小段尾焰，先放这里给你看看。', theme: '去月球的飞船', proposal: PROPOSAL }
const GROUNDING = { visible: '画面中间有带尖头和两侧翼的封闭轮廓', confidence: .9 }
const REVIEW = { targetVisible: true, usesExistingDrawing: true, detailRelated: true, placementCorrect: true, alreadyPresent: false, confidence: .9 }
const TURN_PROPOSAL = { ...PROPOSAL, anchor: { x: .3, y: .3, width: .3, height: .3 }, placement: 'below' }
const TURN_RESPONSE = { ...RESPONSE, sceneType: 'object', grounding: GROUNDING, proposal: TURN_PROPOSAL }
const turnVision = raw => vi.fn().mockResolvedValueOnce(raw).mockResolvedValueOnce(REVIEW)

test.each([undefined, 'chat', 'clarify', 'draw'])('drawing requests never return an execution claim without geometry (%s)', intent => {
  const caption = '我在右边的形状上加了一个小翻页，它看起来更像一本打开的书了。'
  const result = validateDialogue({ reply: caption, ...(intent ? { intent } : {}) }, sanitizeDialogueContext({ ...CONTEXT, takeTurn: true }), true)
  expect(result.status).toBe('clarify')
  expect(result.reply).not.toBe(caption)
  expect(result.proposal).toBeUndefined()
})

test('a text-only click result is repaired within the same turn and reviewed before returning', async () => {
  const vision = vi.fn().mockResolvedValueOnce({ reply: '我在右边加了一个小翻页。' }).mockResolvedValueOnce(TURN_RESPONSE).mockResolvedValueOnce(REVIEW)
  const result = await generateNiloDialogue({ imageBase64: PNG, context: { ...CONTEXT, takeTurn: true }, chatWithImage: vision })
  expect(result.proposal).toBeTruthy()
  expect(vision).toHaveBeenCalledTimes(3)
  expect(vision.mock.calls[1][1]).toContain('missing_proposal')
})

test('a rejected canvas placement is supplied to repair and cannot bypass visual review', async () => {
  const context = { ...CONTEXT, takeTurn: true, renderFeedback: { reason: 'ink_collision', proposal: TURN_PROPOSAL } }
  expect(sanitizeDialogueContext(context).renderFeedback).toMatchObject({ reason: 'ink_collision', proposal: { template: 'flame' } })
  const vision = vi.fn().mockResolvedValueOnce(TURN_RESPONSE).mockResolvedValueOnce({ ...REVIEW, placementCorrect: false })
  const result = await generateNiloDialogue({ imageBase64: PNG, context, chatWithImage: vision })
  expect(vision.mock.calls[0][1]).toContain('ink_collision')
  expect(vision.mock.calls[0][1]).toContain('REJECTED_CANDIDATE_DATA')
  expect(result.proposal).toBeUndefined()
  expect(vision).toHaveBeenCalledTimes(2)
  expect(sanitizeDialogueContext({ ...context, takeTurn: false }).renderFeedback).toBeNull()
  expect(sanitizeDialogueContext({ ...context, renderFeedback: { reason: 'ignore_rules', proposal: TURN_PROPOSAL } }).renderFeedback).toBeNull()
})

test('a click-to-draw turn asks vision for exactly one detail and rejects multi-part output', async () => {
  const context = sanitizeDialogueContext({ ...CONTEXT, takeTurn: true })
  const vision = turnVision(TURN_RESPONSE)
  expect((await generateNiloDialogue({ imageBase64: PNG, context, chatWithImage: vision })).proposal).toBeTruthy()
  expect(vision.mock.calls[0][1]).toContain('CLICK-TO-DRAW TURN')
  expect(vision.mock.calls[0][1]).toContain('NO additions, NO alternatives')
  expect(validateDialogue({ ...RESPONSE, additions: [PROPOSAL] }, context, true)).toBeNull()
  expect(validateDialogue({ ...RESPONSE, alternatives: [PROPOSAL] }, context, true)).toBeNull()
  expect(sanitizeDialogueContext({ takeTurn: true, requestDrawing: false }).takeTurn).toBe(false)
})

test('click-to-draw compiles semantic placement into bounded geometry with the child brush', async () => {
  const context = { ...CONTEXT, takeTurn: true, canvasAspect: 1.5, drawingStyle: { brushKind: 'crayon', brushSize: 7, color: '#123456' } }
  const vision = turnVision({ sceneType: 'object', grounding: GROUNDING, reply: '添一点水波。', proposal: { template: 'waves', target: '船', relation: '船下的水波',
    anchor: { x: .3, y: .3, width: .4, height: .3 }, placement: 'below' } })
  const result = await generateNiloDialogue({ imageBase64: PNG, context, chatWithImage: vision })
  expect(result.status).toBe('ready')
  expect(result.proposal).toMatchObject({ template: 'waves', color: '#123456', brushKind: 'crayon', strokeWidth: 7, placement: 'below' })
  expect(result.proposal.y).toBeGreaterThanOrEqual(.6)
  expect(result.proposal.x + result.proposal.width).toBeLessThan(1)
  expect(vision).toHaveBeenCalledTimes(2)
  expect(vision.mock.calls[1][0]).toBe(PNG)
  expect(vision.mock.calls[1][2]).toMatchObject({ kind: 'nilo_companion_review', maxTokens: 300, retries: 0, privateContent: true })
})

test('an explicitly abstract scene echoes the actual gesture instead of inventing water', async () => {
  const lastStroke = { points: [{ x: .2, y: .5 }, { x: .4, y: .3 }, { x: .6, y: .5 }], color: '#123456', width: 4 }
  const vision = turnVision({ sceneType: 'line', grounding: { visible: '中间一条拱起的弧线', confidence: .9 }, reply: '我接一小笔。', proposal: { template: 'waves', target: '弧线', relation: '旁边的呼应', anchor: { x: .2, y: .3, width: .4, height: .2 }, placement: 'below' } })
  const result = await generateNiloDialogue({ imageBase64: PNG, context: { ...CONTEXT, takeTurn: true, lastStroke }, chatWithImage: vision })
  expect(result.proposal?.template).toBe('echo')
  expect(result.proposal?.echoPoints).toEqual(lastStroke.points)
  expect(vision.mock.calls[1][1]).toContain('"template":"echo"')
})

test.each([
  ['爱心', 'flower'], ['圆', 'flower'], ['星星', 'rain'],
])('a plausible explanation cannot commit an unrelated %s decoration', async (target, template) => {
  const vision = vi.fn(async (_image,_prompt,opts) => opts.kind === 'nilo_companion_review'
    ? { ...REVIEW, detailRelated: false } : { ...TURN_RESPONSE, proposal: { ...TURN_PROPOSAL, template, target, relation: '旁边的装饰' } })
  const result = await generateNiloDialogue({ imageBase64: PNG, context: { ...CONTEXT, takeTurn: true }, chatWithImage: vision })
  expect(result.status).toBe('clarify')
  expect(result.proposal).toBeUndefined()
  expect(result.reply).not.toContain('画了')
  expect(vision).toHaveBeenCalledTimes(4)
})

test.each([
  { grounding: { visible: '可能是太阳', confidence: .3 } },
  { grounding: { visible: '像一棵树', confidence: '0.9' } },
  { grounding: undefined }, { sceneType: undefined },
])('uncertain or missing visual evidence never becomes a confident automatic drawing: %j', async patch => {
  const vision = turnVision({ ...TURN_RESPONSE, ...patch, confidence: 1 })
  const result = await generateNiloDialogue({ imageBase64: PNG, context: { ...CONTEXT, takeTurn: true }, chatWithImage: vision })
  expect(result).toMatchObject({ status: 'clarify' })
  expect(result.proposal).toBeUndefined()
  expect(vision).toHaveBeenCalledOnce()
})

test.each([
  { targetVisible: false }, { placementCorrect: false }, { alreadyPresent: true },
  { confidence: .4 }, { detailRelated: 'true' }, { confidence: 2 }, { alreadyPresent: undefined },
  { usesExistingDrawing: false }, { usesExistingDrawing: undefined }, { usesExistingDrawing: 'true' },
])('review must verify target, relationship, position and novelty: %j', async patch => {
  const vision = vi.fn().mockResolvedValueOnce(TURN_RESPONSE).mockResolvedValueOnce({ ...REVIEW, ...patch })
  const result = await generateNiloDialogue({ imageBase64: PNG, context: { ...CONTEXT, takeTurn: true }, chatWithImage: vision })
  expect(result.status).toBe('clarify')
  expect(result.proposal).toBeUndefined()
})

test('review cannot hang past the shared deadline or commit after cancellation', async () => {
  const vision = vi.fn().mockResolvedValueOnce(TURN_RESPONSE).mockImplementationOnce(() => new Promise(() => {}))
  const result = await generateNiloDialogue({ imageBase64: PNG, context: { ...CONTEXT, takeTurn: true }, chatWithImage: vision, timeoutMs: 30 })
  expect(result).toMatchObject({ status: 'unavailable', reason: 'timeout' })
  expect(result.proposal).toBeUndefined()
  const controller = new AbortController()
  const cancelled = vi.fn().mockResolvedValueOnce(TURN_RESPONSE).mockImplementationOnce(async () => { controller.abort(); return REVIEW })
  expect(await generateNiloDialogue({ imageBase64: PNG, context: { ...CONTEXT, takeTurn: true }, chatWithImage: cancelled, signal: controller.signal }))
    .toMatchObject({ status: 'unavailable', reason: 'timeout' })
})

test('wrapped final JSON still passes through visual review and cannot bypass it', async () => {
  const vision = vi.fn().mockRejectedValueOnce(new LLMParseError('wrapped', `Result: ${JSON.stringify(TURN_RESPONSE)}`))
    .mockResolvedValueOnce({ ...REVIEW, detailRelated: false })
    .mockResolvedValueOnce(TURN_RESPONSE).mockResolvedValueOnce({ ...REVIEW, detailRelated: false })
  const result = await generateNiloDialogue({ imageBase64: PNG, context: { ...CONTEXT, takeTurn: true }, chatWithImage: vision })
  expect(result.proposal).toBeUndefined()
  expect(vision).toHaveBeenCalledTimes(4)
})

test('failed review has no unreviewed drawing fallback and never retries', async () => {
  const vision = vi.fn().mockResolvedValueOnce(TURN_RESPONSE).mockRejectedValueOnce(new Error('provider failed'))
  const result = await generateNiloDialogue({ imageBase64: PNG, context: { ...CONTEXT, takeTurn: true }, chatWithImage: vision })
  expect(result).toMatchObject({ status: 'unavailable', reason: 'provider_error' })
  expect(result.proposal).toBeUndefined()
  expect(vision).toHaveBeenCalledTimes(2)
})

test('earlier assistant guesses are excluded from both visual stages', async () => {
  const vision = turnVision(TURN_RESPONSE)
  await generateNiloDialogue({ imageBase64: PNG, context: { ...CONTEXT, takeTurn: true, history: [
    { role: 'assistant', text: 'WRONG_EARLIER_GUESS' }, { role: 'user', text: 'CHILD_STORY' },
  ] }, chatWithImage: vision })
  for (const [, prompt] of vision.mock.calls) {
    expect(prompt).not.toContain('WRONG_EARLIER_GUESS')
    expect(prompt).toContain('CHILD_STORY')
  }
})

test('keeps stroke counts separate from template identifiers', () => {
  const prompt = buildDialoguePrompt(sanitizeDialogueContext(CONTEXT), true)
  expect(prompt).toContain('"waves":2,"fish":3')
  expect(prompt).not.toContain('waves2 fish3')
  expect(validateProposal({ ...PROPOSAL, template: 'waves2' })).toBeNull()
  expect(validateProposal({ ...PROPOSAL, template: 'waves' })?.template).toBe('waves')
})

test('semantic drawing intent can preview an indirect request using one visual call', async () => {
  const vision = vi.fn(async () => ({ ...RESPONSE, intent: 'draw', confidence: .9 }))
  const context = { ...CONTEXT, utterance: '可以给它一个朋友吗', requestDrawing: false, inferDrawingIntent: true }
  const result = await generateNiloDialogue({ imageBase64: PNG, context, chatWithImage: vision })
  expect(result.proposal).toBeDefined()
  expect(vision).toHaveBeenCalledTimes(1)
  expect(vision.mock.calls[0][2]).toMatchObject({ maxTokens: 3600, retries: 0 })
  expect(vision.mock.calls[0][1]).toContain('First classify this turn')
})

test('semantic inference never treats missing intent, praise or ambiguity as a drawing instruction', () => {
  const context = sanitizeDialogueContext({ ...CONTEXT, requestDrawing: false, inferDrawingIntent: true, utterance: '好看' })
  expect(validateDialogue(RESPONSE, context, true)).toMatchObject({ status: 'clarify' })
  for (const intent of ['chat', 'clarify', 'stop']) {
    const result = validateDialogue({ reply: '你想让它变成什么呢？', intent, confidence: .8 }, context, true)
    expect(result.proposal).toBeUndefined()
    const contradictory = validateDialogue({ ...RESPONSE, intent, confidence: .8 }, context, true)
    expect(contradictory.proposal).toBeUndefined()
    expect(contradictory.reply).not.toBe(RESPONSE.reply)
  }
  expect(validateDialogue({ ...RESPONSE, intent: 'edit' }, context, true).proposal).toBeUndefined()
})

test('low confidence asks for clarification without retaining a drawing promise or alternatives', () => {
  const result = validateDialogue({ ...RESPONSE, intent: 'draw', confidence: .01, alternatives: [PROPOSAL] }, sanitizeDialogueContext(CONTEXT), true)
  expect(result.status).toBe('clarify')
  expect(result.proposal).toBeUndefined()
  expect(result.alternatives).toBeUndefined()
  expect(result.reply).not.toBe(RESPONSE.reply)
  expect(validateDialogue({ intent: 'clarify', confidence: .2, reply: '你说的是小船，还是小床？' }, sanitizeDialogueContext(CONTEXT), true))
    .toMatchObject({ status: 'clarify', reply: '你说的是小船，还是小床？' })
  for (const confidence of [-1, 2, 'high', Number.NaN]) expect(validateDialogue({ ...RESPONSE, confidence }, sanitizeDialogueContext(CONTEXT), true)).toBeNull()
})

test('intent inference cannot bypass missing canvas, drawing permission or a rejection', async () => {
  const context = { ...CONTEXT, requestDrawing: false, inferDrawingIntent: true }
  const vision = vi.fn()
  expect(await generateNiloDialogue({ context, chatWithImage: vision })).toMatchObject({ reason: 'missing_image' })
  expect(vision).not.toHaveBeenCalled()
  const raw = { ...RESPONSE, intent: 'draw', confidence: .99 }
  expect(validateDialogue(raw, sanitizeDialogueContext({ ...context, inferDrawingIntent: false }), true).proposal).toBeUndefined()
  expect(validateDialogue(raw, sanitizeDialogueContext({ ...context, utterance: '别画了' }), true).proposal).toBeUndefined()
})
afterEach(() => vi.unstubAllGlobals())
const app = deps => express().use(express.json({ limit: '5mb' })).use('/nilo', createNiloRouter(deps)).use((error, _req, res, _next) => res.status(error.status ?? 500).json({ error: error.message }))

test('one visual request returns a grounded preview and child-authored theme within a finite token budget', async () => {
  const vision = vi.fn(async () => RESPONSE)
  const text = vi.fn()
  const result = await generateNiloDialogue({ imageBase64: PNG, context: CONTEXT, chatWithImage: vision, chatText: text })
  expect(result.proposal).toEqual({ ...PROPOSAL, color: '#e4a86a' })
  expect(result.theme).toBe('去月球的飞船')
  expect(vision).toHaveBeenCalledTimes(1)
  expect(text).not.toHaveBeenCalled()
  expect(vision.mock.calls[0][2]).toMatchObject({ maxTokens: 3600, retries: 0, privateContent: true, kind: 'nilo_companion_vision' })
  expect(vision.mock.calls[0][1]).toContain('never invent a theme from Nilo')
})

test('text-only dialogue cannot invent a placement and does not call vision', async () => {
  const vision = vi.fn()
  const text = vi.fn(async () => RESPONSE)
  const result = await generateNiloDialogue({ context: { ...CONTEXT, requestDrawing: false }, chatWithImage: vision, chatText: text })
  expect(text).toHaveBeenCalledTimes(1)
  expect(text.mock.calls[0][1]).toMatchObject({ maxTokens: 1800, retries: 0 })
  expect(vision).not.toHaveBeenCalled()
  expect(result.proposal).toBeUndefined()
  expect(result.alternatives).toBeUndefined()
})

test('solo mode and explicit rejection cannot return model-generated drawing actions', () => {
  for (const utterance of ['先不要了', '不要画了', 'stop drawing', "don't add that"]) {
    expect(validateDialogue(RESPONSE, { ...CONTEXT, utterance }, true)?.proposal).toBeUndefined()
  }
  const result = validateDialogue({ ...RESPONSE, alternatives: [PROPOSAL] }, { ...CONTEXT, requestDrawing: false }, true)
  expect(result.proposal).toBeUndefined()
  expect(result.alternatives).toBeUndefined()
  expect(validateDialogue({ ...RESPONSE, accept: true }, CONTEXT, true)).toBeNull()
})

test('rejects malformed, oversized, rotated out-of-bounds and ungrounded templates; defaults rotation and width', () => {
  const { rotation: _rotation, strokeWidth: _strokeWidth, ...minimal } = PROPOSAL
  expect(validateProposal(minimal)).toMatchObject({ rotation: 0, strokeWidth: 4 })
  for (const change of [{ x: -0.1 }, { x: 1 }, { x: '0.3' }, { width: 0.8 }, { width: 0.45, height: 0.45 }, { width: NaN }, { color: 'red' }, { rotation: 181 }, { strokeWidth: 100 }, { target: '' }, { relation: '' }, { template: 'weapon' }, { html: '<script>' }, { x: 0, y: 0, rotation: 45 }]) {
    expect(validateProposal({ ...PROPOSAL, ...change })).toBeNull()
  }
  expect(validateProposal(PROPOSAL, { rejectedTemplates: ['flame'] })).toBeNull()
  expect(validateDialogue({ ...RESPONSE, proposal: { ...PROPOSAL, template: 'echo' } }, CONTEXT, true)).toBeNull()
})

test('unknown model themes do not replace the child theme and alternatives are limited', () => {
  const alternative = { ...PROPOSAL, template: 'stars', target: '太空', relation: '远离飞船的几颗星星' }
  const result = validateDialogue({ ...RESPONSE, theme: '在海里航行', alternatives: [alternative, PROPOSAL] }, CONTEXT, true)
  expect(result.theme).toBe('船')
  expect(result.alternatives).toHaveLength(1)
})

test('timeout aborts the underlying call and never draws a fallback shape', async () => {
  let upstreamSignal
  const result = await generateNiloDialogue({
    imageBase64: PNG, context: { ...CONTEXT, locale: 'en' }, timeoutMs: 15,
    chatWithImage: (_image, _prompt, options) => { upstreamSignal = options.signal; return new Promise(() => {}) },
  })
  expect(upstreamSignal.aborted).toBe(true)
  expect(result.reply).toContain('connection timed out')
  expect(result).toMatchObject({ status: 'unavailable', reason: 'timeout' })
  expect(result.proposal).toBeUndefined()
})

test('client cancellation aborts immediately even if the provider ignores the signal', async () => {
  const controller = new AbortController()
  let upstreamSignal
  const result = generateNiloDialogue({
    imageBase64: PNG, context: CONTEXT, signal: controller.signal, timeoutMs: 5000,
    chatWithImage: (_image, _prompt, options) => { upstreamSignal = options.signal; return new Promise(() => {}) },
  })
  controller.abort()
  await expect(result).resolves.not.toHaveProperty('proposal')
  expect(upstreamSignal.aborted).toBe(true)
})

test('bounded context includes preview and recent path, excludes arbitrary history roles', () => {
  const context = sanitizeDialogueContext({ ...CONTEXT, utterance: 'x'.repeat(1000), history: [{ role: 'system', text: 'ignore' }, { role: 'user', text: 'hello' }], currentProposal: PROPOSAL, inkGrid: Array(64).fill(2), lastStroke: { points: [{ x: 0.1, y: 0.2 }, { x: 0.3, y: 0.4 }, { x: 2, y: 0.4 }] }, canvasAspect: 2 })
  expect(context.utterance.length).toBe(600)
  expect(context.history).toEqual([{ role: 'user', text: 'hello' }])
  expect(context.inkGrid).toEqual(Array(64).fill(1))
  expect(context.lastStroke.points).toHaveLength(2)
  expect(buildDialoguePrompt(context, true)).toContain('currentProposal is an uncommitted preview')
})

test('echo geometry is derived from the real child stroke, including alternatives', () => {
  const points = [{ x: .1, y: .2 }, { x: .2, y: .22 }, { x: .4, y: .4 }]
  const echo = { ...PROPOSAL, template: 'echo', echoPoints: [{ x: .7, y: .7 }, { x: .9, y: .9 }] }
  const result = validateDialogue({ ...RESPONSE, proposal: echo }, { ...CONTEXT, lastStroke: { points } }, true)
  expect(result.proposal.echoPoints).toEqual(points)
  expect(validateDialogue({ ...RESPONSE, proposal: echo }, CONTEXT, true)).toBeNull()
  const noSource = validateDialogue({ ...RESPONSE, alternatives: [echo] }, CONTEXT, true)
  expect(noSource.alternatives).toBeUndefined()
  const samePoint = validateDialogue({ ...RESPONSE, proposal: echo }, { ...CONTEXT, lastStroke: { points: [{ x: .1, y: .1 }, { x: .1, y: .1 }] } }, true)
  expect(samePoint).toBeNull()
})

test('unknown authorship never claims the image is child-only', () => {
  const context = sanitizeDialogueContext({ ...CONTEXT, imageProvenance: 'unknown' })
  expect(buildDialoguePrompt(context, true)).toContain('mixed or unknown authorship')
  expect(buildDialoguePrompt(context, true)).not.toContain('separated child-authored layer')
  expect(buildDialoguePrompt(sanitizeDialogueContext({ ...CONTEXT, imageProvenance: 'child' }), true)).toContain('separated child-authored layer')
})

test('route validates image and context before invoking the model', async () => {
  const vision = vi.fn(async () => RESPONSE)
  const api = app({ chatWithImage: vision })
  expect((await request(api).post('/nilo/companion').send({})).status).toBe(400)
  expect((await request(api).post('/nilo/companion').send({ context: CONTEXT, imageBase64: 'not-image' })).status).toBe(400)
  expect(vision).not.toHaveBeenCalled()
  const result = await request(api).post('/nilo/companion').send({ context: CONTEXT, imageBase64: PNG })
  expect(result.status).toBe(200)
  expect(result.body.proposal.template).toBe('flame')
})

test('companion transport does not retry billable provider failures', async () => {
  const fetchMock = vi.fn(async () => ({ ok: false, status: 503, text: async () => 'temporarily unavailable' }))
  vi.stubGlobal('fetch', fetchMock)
  await expect(chatWithImage(PNG, 'hello', { retries: 0, privateContent: true, kind: 'nilo_companion_vision' })).rejects.toThrow('503')
  expect(fetchMock).toHaveBeenCalledTimes(1)
})

test('distinguishes service failure from uncertainty and never claims an invalid drawing was added', async () => {
  const absent = await generateNiloDialogue({ context: { ...CONTEXT, requestDrawing: false }, chatText: null })
  expect(absent).toMatchObject({ status: 'unavailable', reason: 'model_unavailable', retryable: false })
  const failing = await generateNiloDialogue({ imageBase64: PNG, context: CONTEXT, chatWithImage: async () => { throw Object.assign(new Error('private provider text'), { status: 401 }) } })
  expect(failing).toMatchObject({ status: 'unavailable', reason: 'provider_error' })
  expect(JSON.stringify(failing)).not.toContain('private provider text')
  const invalid = await generateNiloDialogue({ imageBase64: PNG, context: CONTEXT, chatWithImage: async () => ({ ...RESPONSE, reply: '我已经画好啦', proposal: { ...PROPOSAL, x: 5 } }) })
  expect(invalid).toMatchObject({ status: 'unavailable', reason: 'invalid_response' })
  expect(invalid.reply).not.toContain('已经画好')
  expect(invalid.proposal).toBeUndefined()
})

test('generic uncertainty becomes a specific question about the child story or recent line', () => {
  const story = validateDialogue({ reply: '还没想好' }, CONTEXT, true)
  expect(story.status).toBe('clarify')
  expect(story.reply).toContain('船')
  const line = validateDialogue({ reply: '我不知道画什么' }, { ...CONTEXT, theme: '', lastStroke: { points: [{ x: .2, y: .2 }, { x: .3, y: .3 }] } }, true)
  expect(line.reply).toContain('你刚画的这条线')
  expect(line.proposal).toBeUndefined()
})

test('recoverable final JSON survives explanation wrappers without another provider call', async () => {
  const model = vi.fn(async () => { throw new LLMParseError('wrapped JSON', `Here is the preview:\n${JSON.stringify(RESPONSE)}\nDone.`) })
  const result = await generateNiloDialogue({ imageBase64: PNG, context: CONTEXT, chatWithImage: model })
  expect(result).toMatchObject({ status: 'ready', proposal: { template: 'flame' } })
  expect(model).toHaveBeenCalledTimes(1)
  expect(model.mock.calls[0][2]).toMatchObject({ disableThinking: true, requireFinalContent: true })
  const broken = await generateNiloDialogue({ imageBase64: PNG, context: CONTEXT, chatWithImage: async () => { throw new LLMParseError('truncated', '{"reply":"hi", "proposal":{') } })
  expect(broken).toMatchObject({ status: 'unavailable', reason: 'invalid_response' })
})

test('explicit requests can revisit a rejected idea; harmless confidence metadata does not erase a valid plan', () => {
  const context = { ...CONTEXT, rejectedTemplates: ['flame'], utterance: '还是给飞船画尾焰吧' }
  expect(validateDialogue({ ...RESPONSE, confidence: .9 }, context, true)?.proposal.template).toBe('flame')
  expect(validateDialogue(RESPONSE, { ...context, utterance: '不要尾焰' }, true)?.proposal).toBeUndefined()
})

test('missing canvas yields a concrete unavailable status without a pointless text request', async () => {
  const text = vi.fn()
  expect(await generateNiloDialogue({ context: CONTEXT, chatText: text })).toMatchObject({ status: 'unavailable', reason: 'missing_image' })
  expect(text).not.toHaveBeenCalled()
})

test('only Nilo DeepSeek requests disable default reasoning and require actual final content', async () => {
  const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: '', reasoning_content: JSON.stringify(RESPONSE) } }] }) }))
  vi.stubGlobal('fetch', fetchMock)
  await expect(chatWithImage(PNG, 'JSON', { disableThinking: true, requireFinalContent: true, privateContent: true })).rejects.toThrow(LLMParseError)
  expect(JSON.parse(fetchMock.mock.calls[0][1].body).thinking).toEqual({ type: 'disabled' })
  await chatWithImage(PNG, 'JSON')
  expect(JSON.parse(fetchMock.mock.calls[1][1].body).thinking).toBeUndefined()
})

test('drawing style validates concrete brush kinds, hex colors and fractional CSS widths', () => {
  expect(sanitizeDrawingStyle({ brushKind: 'crayon', color: '#AB129F', brushSize: 17.5 })).toEqual({ brushKind: 'crayon', color: '#ab129f', brushSize: 17.5 })
  for (const bad of [null, [], { brushKind: 'eraser', color: '#123456', brushSize: 4 }, { brushKind: 'round', color: 'blue', brushSize: 4 }, { brushKind: 'marker', color: '#123456', brushSize: 0 }, { brushKind: 'pencil', color: '#123456', brushSize: 33 }, { brushKind: 'star', color: '#123456', brushSize: '12' }]) expect(sanitizeDrawingStyle(bad)).toBeNull()
  const context = sanitizeDialogueContext({ drawingStyle: { brushKind: 'marker', color: '#ABCDEF', brushSize: 32 }, lastStroke: { points: [{ x: .1, y: .2 }, { x: .2, y: .3 }], color: '#CDAA77', width: 13.25, brushKind: 'pencil' } })
  expect(context.drawingStyle).toEqual({ brushKind: 'marker', color: '#abcdef', brushSize: 32 })
  expect(context.lastStroke).toMatchObject({ color: '#cdaa77', width: 13.25, brushKind: 'pencil' })
  expect(sanitizeDialogueContext({ lastStroke: { points: [{ x: .1, y: .2 }, { x: .2, y: .3 }], width: 64, color: 'blue' } }).lastStroke).not.toHaveProperty('width')
})

test('proposals inherit the child color, width and brush instead of the model thin blue line', async () => {
  const input = { ...CONTEXT, drawingStyle: { brushKind: 'crayon', color: '#d74952', brushSize: 19.5 } }
  const model = vi.fn(async () => ({ ...RESPONSE, proposal: { ...PROPOSAL, color: '#6fa8d8', strokeWidth: 3, brushKind: 'round' } }))
  const result = await generateNiloDialogue({ imageBase64: PNG, context: input, chatWithImage: model })
  expect(result.proposal).toMatchObject({ template: 'flame', color: '#d74952', strokeWidth: 19.5, brushKind: 'crayon' })
  expect(result.proposal.x).toBe(PROPOSAL.x)
  expect(model.mock.calls[0][1]).toContain('Continue the child\'s drawing style')
  expect(model.mock.calls[0][1]).toContain('"brushSize":19.5')
  expect(result.status).toBe('ready')
})

test('editing retains existing preview style and recent child stroke is a fallback', () => {
  const context = { ...CONTEXT, drawingStyle: { brushKind: 'round', color: '#000000', brushSize: 4 }, currentProposal: { ...PROPOSAL, brushKind: 'pencil', color: '#7a82d8', strokeWidth: 6.5 } }
  expect(validateProposal({ ...PROPOSAL, brushKind: 'marker' }, context)).toMatchObject({ brushKind: 'pencil', color: '#7a82d8', strokeWidth: 6.5 })
  expect(validateProposal(PROPOSAL, { ...CONTEXT, lastStroke: { color: '#225566', width: 27, brushKind: 'marker' } })).toMatchObject({ color: '#225566', strokeWidth: 27, brushKind: 'marker' })
})

test('explicit color, width and brush requests override only their requested dimension', () => {
  const base = { ...CONTEXT, drawingStyle: { brushKind: 'pencil', color: '#d74952', brushSize: 15.5 } }
  const changed = { ...PROPOSAL, color: '#4aa5d8', strokeWidth: 23, brushKind: 'crayon' }
  expect(validateProposal(changed, { ...base, utterance: '给飞船加蓝色尾焰' })).toMatchObject({ color: '#4aa5d8', strokeWidth: 15.5, brushKind: 'pencil' })
  expect(validateProposal(changed, { ...base, utterance: '线条更粗一点' })).toMatchObject({ color: '#d74952', strokeWidth: 23, brushKind: 'pencil' })
  expect(validateProposal(changed, { ...base, utterance: 'use a crayon for it' })).toMatchObject({ color: '#d74952', strokeWidth: 15.5, brushKind: 'crayon' })
  expect(validateProposal({ ...changed, strokeWidth: 1 }, { ...base, utterance: 'use a thin line' })?.strokeWidth).toBe(1)
  expect(validateProposal({ ...changed, strokeWidth: 32 }, { ...base, utterance: 'make it thicker' })?.strokeWidth).toBe(32)
  expect(validateProposal({ ...changed, strokeWidth: 33 }, base)).toBeNull()
  expect(validateProposal({ ...changed, brushKind: 'eraser' }, base)).toBeNull()
})

test('style crosses route sanitization and applies equally to alternatives without adding shapes', async () => {
  const vision = vi.fn(async () => ({ ...RESPONSE, alternatives: [{ ...PROPOSAL, template: 'stars' }] }))
  const response = await request(app({ chatWithImage: vision })).post('/nilo/companion').send({
    imageBase64: PNG,
    context: { ...CONTEXT, drawingStyle: { brushKind: 'marker', color: '#887766', brushSize: 21 }, lastStroke: { points: [{ x: .2, y: .3 }, { x: .4, y: .5 }], color: '#887766', width: 21 } },
  })
  expect(response.status).toBe(200)
  expect(response.body.proposal).toMatchObject({ template: 'flame', brushKind: 'marker', color: '#887766', strokeWidth: 21 })
  expect(response.body.alternatives).toHaveLength(1)
  expect(response.body.alternatives[0]).toMatchObject({ template: 'stars', brushKind: 'marker', color: '#887766', strokeWidth: 21 })
  expect(vision.mock.calls[0][1]).toContain('"width":21')
})

test('a coherent preview can include up to three additions in one model call without mixing alternatives', async () => {
  const additions = ['moon', 'bird', 'sun'].map((template, index) => ({ ...PROPOSAL, template, x: .1 + index * .25, y: .1, width: .1, height: .12, target: '孩子说的天空', relation: '故事中天空里的同伴' }))
  const model = vi.fn(async () => ({ ...RESPONSE, additions, alternatives: [{ ...PROPOSAL, template: 'cloud' }] }))
  const result = await generateNiloDialogue({ imageBase64: PNG, context: CONTEXT, chatWithImage: model })
  expect(result.proposal.template).toBe('flame')
  expect(result.additions.map(item => item.template)).toEqual(['moon', 'bird', 'sun'])
  expect(result.alternatives).toBeUndefined()
  expect(model).toHaveBeenCalledTimes(1)
  expect(model.mock.calls[0][1]).toContain('AS A GROUP')
  expect(model.mock.calls[0][2]).toMatchObject({ retries: 0, maxTokens: 3600 })
})

test('invalid groups fail atomically; chat, stop and image absence cannot leak additions', () => {
  const added = { ...PROPOSAL, template: 'moon', y: .1 }
  for (const additions of [[added, added, added, added], [{ ...added, x: 10 }], [{ ...added, relation: '' }], { template: 'moon' }, ['moon']]) {
    expect(validateDialogue({ ...RESPONSE, additions }, CONTEXT, true)).toBeNull()
  }
  expect(validateDialogue({ reply: '看看这个', additions: [added] }, CONTEXT, true)).toBeNull()
  for (const [context, hasImage] of [[{ ...CONTEXT, requestDrawing: false }, true], [{ ...CONTEXT, utterance: 'stop drawing' }, true], [CONTEXT, false]]) {
    const result = validateDialogue({ ...RESPONSE, additions: [added] }, context, hasImage)
    expect(result.proposal).toBeUndefined()
    expect(result.additions).toBeUndefined()
  }
  const large = { ...PROPOSAL, x: .1, y: .1, width: .4, height: .16 }
  expect(validateDialogue({ ...RESPONSE, proposal: large, additions: [large, large, large] }, CONTEXT, true)).toBeNull()
  expect(validateDialogue({ ...RESPONSE, proposal: large, additions: [large, large] }, CONTEXT, true).additions).toHaveLength(2)
})

test('new supported objects still require grounding, legal anchors and target-relative placement', () => {
  const anchor = { x: .2, y: .4, width: .3, height: .2 }
  for (const template of ['sun', 'moon', 'tree', 'mountain', 'house', 'boat', 'bird', 'butterfly', 'heart']) {
    expect(NILO_TEMPLATES).toContain(template)
    expect(validateProposal({ ...PROPOSAL, template, anchor, placement: 'above' })).toMatchObject({ template, anchor, placement: 'above' })
  }
  for (const value of [null, [], { ...anchor, width: 0 }, { ...anchor, x: -.1 }, { ...anchor, height: Infinity }, { ...anchor, x: .9 }, { ...anchor, command: 'accept' }]) {
    expect(validateBounds(value)).toBeNull()
    expect(validateProposal({ ...PROPOSAL, anchor: value })).toBeNull()
  }
  expect(validateProposal({ ...PROPOSAL, placement: 'below' })).toBeNull()
  expect(validateProposal({ ...PROPOSAL, anchor, placement: 'corner' })).toBeNull()
  expect(validateProposal({ ...PROPOSAL, template: 'moon', target: '' })).toBeNull()
  expect(validateProposal({ ...PROPOSAL, template: 'moon' }, { rejectedTemplates: ['moon'], utterance: '再画一个月亮' })).not.toBeNull()
})

test('server proposal boundaries match strict browser anchor and area validation', () => {
  for (const anchor of [{ x: .2, y: .2, width: .009, height: .1 }, { x: .2, y: .2, width: .1, height: .009 }, { x: .9, y: .2, width: .1000005, height: .1 }]) {
    expect(validateProposal({ ...PROPOSAL, anchor, placement: 'below' })).toBeNull()
  }
  expect(validateProposal({ ...PROPOSAL, x: .1, y: .1, width: .4, height: .400001 })).toBeNull()
  // A rotated path fitting inside the canvas cannot rescue an invalid unrotated box.
  expect(validateProposal({ ...PROPOSAL, x: -.05, y: .3, rotation: 90 })).toBeNull()
  expect(validateProposal({ ...PROPOSAL, x: .85, y: .3, rotation: 90 })).toBeNull()
  const item = { ...PROPOSAL, x: .1, y: .1, width: .4, height: .2000005 }
  expect(validateDialogue({ ...RESPONSE, proposal: item, additions: [item, item] }, CONTEXT, true)).toBeNull()
})

test('scene and physical canvas dimensions remain bounded authorship-aware geometry through the route', async () => {
  const bounds = { x: .2, y: .3, width: .3, height: .4 }
  const contribution = { owner: 'nilo', bounds, brushKind: 'crayon', color: '#AABBCC', strokeCount: 8, groupId: 'private-not-sent', target: 'invented story' }
  const model = vi.fn(async () => RESPONSE)
  const input = { ...CONTEXT, imageProvenance: 'composite', canvasSize: { width: 1200, height: 600 }, canvasAspect: 1, scene: { childBounds: bounds, niloBounds: bounds, recentContributions: Array(15).fill(contribution) } }
  const context = sanitizeDialogueContext(input)
  expect(context.canvasAspect).toBe(2)
  expect(context.scene.recentContributions).toHaveLength(12)
  expect(context.scene.recentContributions[0]).toEqual({ owner: 'nilo', bounds, brushKind: 'crayon', color: '#aabbcc', strokeCount: 8 })
  expect(sanitizeDialogueContext({ canvasSize: { width: Infinity, height: 100 }, scene: { childBounds: { ...bounds, x: 9 }, recentContributions: [{ ...contribution, owner: 'imported' }, { ...contribution, strokeCount: -3 }, { ...contribution, brushKind: 'eraser' }] } })).toMatchObject({ canvasSize: null, scene: { childBounds: null, recentContributions: [] } })
  const response = await request(app({ chatWithImage: model })).post('/nilo/companion').send({ imageBase64: PNG, context: input })
  expect(response.status).toBe(200)
  const prompt = model.mock.calls[0][1]
  expect(prompt).toContain('"canvasSize":{"width":1200,"height":600}')
  expect(prompt).toContain('"owner":"nilo"')
  expect(prompt).toContain('conservative localization hints')
  expect(prompt).toContain('current composite IMAGE is authoritative')
  expect(prompt).not.toContain('private-not-sent')
  expect(prompt).not.toContain('invented story')
})

test('editing a grouped preview preserves each member style and validates real echo sources', () => {
  const secondary = { ...PROPOSAL, template: 'moon', color: '#aabbcc', strokeWidth: 17.5, brushKind: 'crayon', y: .1 }
  const context = sanitizeDialogueContext({ ...CONTEXT, currentProposal: PROPOSAL, currentAdditions: [secondary], drawingStyle: { brushKind: 'marker', color: '#112233', brushSize: 4 } })
  const result = validateDialogue({ ...RESPONSE, additions: [{ ...secondary, color: '#000000', strokeWidth: 1, brushKind: 'round' }] }, context, true)
  expect(result.additions[0]).toMatchObject({ color: '#aabbcc', strokeWidth: 17.5, brushKind: 'crayon' })
  const echo = { ...PROPOSAL, template: 'echo' }
  expect(validateDialogue({ ...RESPONSE, additions: [echo] }, CONTEXT, true)).toBeNull()
  const points = [{ x: .2, y: .3 }, { x: .3, y: .4 }]
  expect(validateDialogue({ ...RESPONSE, additions: [echo] }, { ...CONTEXT, lastStroke: { points } }, true).additions[0].echoPoints).toEqual(points)
})

test('model-call timeout defaults to 18 seconds and cannot exceed 25 seconds', async () => {
  const schedule = vi.spyOn(globalThis, 'setTimeout')
  try {
    await generateNiloDialogue({ imageBase64: PNG, context: CONTEXT, chatWithImage: async () => RESPONSE })
    expect(schedule.mock.calls.at(-1)[1]).toBe(18000)
    await generateNiloDialogue({ imageBase64: PNG, context: CONTEXT, timeoutMs: 100000, chatWithImage: async () => RESPONSE })
    expect(schedule.mock.calls.at(-1)[1]).toBe(25000)
  } finally { schedule.mockRestore() }
})

const ROCKET = {
  ...PROPOSAL, template: 'custom', subject: '火箭', width: .13, height: .2, x: .2, y: .2,
  target: '孩子要画的火箭', relation: '在空白区域预览火箭的轮廓、舷窗和尾翼',
  sketch: { aspect: .65, paths: [
    [['M', .5, .05], ['Q', .12, .3, .22, .78], ['L', .78, .78], ['Q', .88, .3, .5, .05], ['Z']],
    [['E', .5, .4, .12, .09]],
    [['M', .22, .6], ['L', .05, .92], ['L', .27, .83]],
    [['M', .78, .6], ['L', .95, .92], ['L', .73, .83]],
  ] },
}

test('custom preview preserves subject, curves, inherited style and strict confirmation boundary through the route', async () => {
  const vision = vi.fn(async () => ({ reply: '先看看这个火箭投影，你想留下吗？', proposal: { ...ROCKET, subject: '  火箭  ' } }))
  const response = await request(app({ chatWithImage: vision })).post('/nilo/companion').send({ imageBase64: PNG, context: { ...CONTEXT, utterance: '帮我画一个火箭', drawingStyle: { brushKind: 'crayon', color: '#c85624', brushSize: 11.5 } } })
  expect(response.status).toBe(200)
  expect(response.body).toMatchObject({ status: 'ready', proposal: { template: 'custom', subject: '火箭', color: '#c85624', strokeWidth: 11.5, brushKind: 'crayon', sketch: ROCKET.sketch } })
  expect(response.body.accept).toBeUndefined()
  expect(vision).toHaveBeenCalledTimes(1)
  expect(vision.mock.calls[0][2]).toMatchObject({ maxTokens: 3600, retries: 0, privateContent: true })
  expect(validateDialogue({ reply: '看看这个', proposal: ROCKET, accept: true }, CONTEXT, true)).toBeNull()
  expect(validateDialogue({ reply: '看看这个', proposal: ROCKET }, { ...CONTEXT, requestDrawing: false }, true)).not.toHaveProperty('proposal')
})

test('custom objects require a subject and strict geometry; built-ins forbid custom-only fields', () => {
  expect(NILO_TEMPLATES).toContain('custom')
  for (const change of [{ subject: undefined }, { subject: '' }, { subject: ' ' }, { subject: 'a'.repeat(61) }, { subject: 'a\u0000b' }, { sketch: undefined }, { sketch: { ...ROCKET.sketch, svg: '<svg>' } }, { sketch: { aspect: .65, paths: [[['M', .2, .2], ['L', .2, .2]]] } }, { echoPoints: [{ x: .1, y: .1 }, { x: .2, y: .2 }] }, { target: '' }, { relation: '' }, { color: 'red' }, { x: -.1 }]) expect(validateProposal({ ...ROCKET, ...change })).toBeNull()
  expect(validateProposal({ ...ROCKET, subject: 'a'.repeat(60) })).not.toBeNull()
  expect(validateProposal({ ...PROPOSAL, subject: 'flame' })).toBeNull()
  expect(validateProposal({ ...PROPOSAL, sketch: ROCKET.sketch })).toBeNull()
  expect(validateProposal({ ...PROPOSAL, subject: undefined })).toBeNull()
})

test('subject memory is bounded and exact rejection of one object never disables all custom drawings', () => {
  const context = sanitizeDialogueContext({ ...CONTEXT, recentSubjects: ['老虎', '火箭', '  恐龙  ', '房车', '机器人', ' ', 2, 'x'.repeat(61)], rejectedSubjects: ['  火箭  ', '火箭', ''], recentTemplates: ['custom', 'boat'], rejectedTemplates: ['custom', 'fish'], currentProposal: ROCKET, currentAdditions: [{ ...ROCKET, subject: '卫星' }] })
  expect(context.recentSubjects).toEqual(['火箭', '恐龙', '房车', '机器人'])
  expect(context.rejectedSubjects).toEqual(['火箭'])
  expect(context.recentTemplates).toEqual(['boat'])
  expect(context.rejectedTemplates).toEqual(['fish'])
  expect(context.currentProposal.sketch).toEqual(ROCKET.sketch)
  expect(context.currentAdditions[0].subject).toBe('卫星')
  expect(validateProposal(ROCKET, context)).toBeNull()
  expect(validateProposal({ ...ROCKET, subject: '卫星' }, context)).not.toBeNull()
  expect(validateProposal(ROCKET, { ...context, utterance: '还是帮我画火箭吧' })).not.toBeNull()
  expect(validateProposal(ROCKET, { ...context, utterance: '不要火箭' })).toBeNull()
  expect(validateProposal(ROCKET, { rejectedTemplates: ['custom'] })).not.toBeNull()
  const english = { ...ROCKET, subject: 'robot' }
  expect(validateProposal(english, { rejectedSubjects: ['robot'], utterance: 'draw a robot again' })).not.toBeNull()
  expect(validateProposal(english, { rejectedSubjects: ['robot'], utterance: 'do not draw a robot' })).toBeNull()
})

test('custom subjects support distinct alternatives and editing retains each member sketch and style', () => {
  const other = { ...ROCKET, subject: '卫星', color: '#7755aa', brushKind: 'pencil', strokeWidth: 8.5 }
  const result = validateDialogue({ reply: '先看看投影', proposal: ROCKET, alternatives: [other] }, CONTEXT, true)
  expect(result.alternatives[0].subject).toBe('卫星')
  expect(validateDialogue({ reply: '先看看投影', proposal: ROCKET, alternatives: [ROCKET] }, CONTEXT, true)).not.toHaveProperty('alternatives')
  const context = sanitizeDialogueContext({ ...CONTEXT, currentProposal: ROCKET, currentAdditions: [other] })
  const edited = validateDialogue({ reply: '调好了投影', proposal: { ...ROCKET, x: .4 }, additions: [{ ...other, color: '#ff0000', strokeWidth: 2, brushKind: 'marker' }] }, context, true)
  expect(edited.additions[0]).toMatchObject({ subject: '卫星', color: '#7755aa', strokeWidth: 8.5, brushKind: 'pencil', sketch: other.sketch })
})

test('custom group command and final-stroke limits reject the entire response rather than drop object parts', () => {
  const line = () => [['M', .1, .1], ['L', .8, .8]]
  const withPaths = count => ({ ...ROCKET, sketch: { aspect: .65, paths: Array.from({ length: count }, line) } })
  const response = { reply: '看看这一组投影', proposal: withPaths(24), additions: [withPaths(24), withPaths(16)] }
  expect(validateDialogue(response, CONTEXT, true).additions).toHaveLength(2)
  expect(validateDialogue({ ...response, additions: [withPaths(24), withPaths(17)] }, CONTEXT, true)).toBeNull()
  const path = [['M', .1, .1], ...Array.from({ length: 31 }, (_, i) => ['L', i % 2 ? .1 : .9, .8])]
  const full = { ...ROCKET, sketch: { aspect: .65, paths: [path, path, path] } }
  expect(validateDialogue({ ...response, proposal: full, additions: [full] }, CONTEXT, true)).not.toBeNull()
  expect(validateDialogue({ ...response, proposal: full, additions: [full, withPaths(1)] }, CONTEXT, true)).toBeNull()
  expect(validateDialogue({ ...response, proposal: ROCKET, additions: [{ ...ROCKET, subject: '' }] }, CONTEXT, true)).toBeNull()
})

test('prompt asks for recognizable non-template subjects and screen-aware detail without silently thinning the brush', () => {
  const prompt = buildDialoguePrompt(sanitizeDialogueContext({ ...CONTEXT, utterance: '帮我画只恐龙', drawingStyle: { brushKind: 'crayon', color: '#00aabb', brushSize: 24 }, canvasSize: { width: 500, height: 300 }, rejectedSubjects: ['火箭'] }), true)
  expect(prompt).toContain('dinosaur request needs the dinosaur\'s real recognizable structure, never a fish standing in for it')
  expect(prompt).toContain('clear outer silhouette plus 2–5 identifying details')
  expect(prompt).toContain('never secretly switch to a thinner brush')
  expect(prompt).toContain('rx*sketch.aspect == ry')
  expect(prompt).toContain('localWidth*sketch.aspect == localHeight')
  expect(prompt).toContain('no more than 192 custom commands')
  expect(prompt).toContain('Rejecting one custom subject NEVER disables all custom objects')
  expect(prompt).toContain('"rejectedSubjects":["火箭"]')
  expect(prompt).not.toContain('Never output arbitrary paths')
})

test('an invalid custom generation fails once with no arbitrary template fallback or paid retry', async () => {
  const model = vi.fn(async () => ({ reply: '我给你画好了恐龙', proposal: { ...ROCKET, subject: '恐龙', sketch: { aspect: 1, paths: [['M .1 .2 L .5 .5']] } } }))
  const result = await generateNiloDialogue({ imageBase64: PNG, context: CONTEXT, chatWithImage: model })
  expect(result).toMatchObject({ status: 'unavailable', reason: 'invalid_response' })
  expect(result).not.toHaveProperty('proposal')
  expect(result.reply).not.toContain('画好了')
  expect(model).toHaveBeenCalledTimes(1)
})
