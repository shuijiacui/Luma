import express from 'express'
import request from 'supertest'
import { expect, test, vi } from 'vitest'
import { generateNiloScene as generateScene, sanitizeSceneInput } from '../src/services/niloScene.js'
import { createNiloRouter } from '../src/routes/nilo.js'
import { compileSceneObject, scenePalette } from '../../shared/niloSceneDrawing.mjs'
import { decodeCanvas } from '../src/services/niloPreview.js'
import { LLMParseError } from '../src/services/llmClient.js'

const observedFixture = { subject: 'A rounded contour and an angular outline', parts: ['rounded contour', 'angular outline'], connections: ['outlines overlap'] }
const visibleReview = async (image, prompt) => {
  expect(decodeCanvas(image).width).toBe(320)
  const target = JSON.parse(prompt.split('OBJECT: ')[1])
  return { observed: observedFixture, recognizable: true, features: target.essential.map(essential => ({ essential, visible: true })) }
}
const generateNiloScene = (input, options = {}) => generateScene(input, { chatWithImage: visibleReview, ...options })

const object = (overrides = {}) => ({ id: 'castle_1', name: '翅膀城堡', aliases: ['城堡'], role: 'main', essential: ['城堡', '连接城堡的双翼'],
  render: { kind: 'compose', primitive: 'castle', parameters: { towers: 3, wings: true } },
  box: { x: .3, y: .2, width: .4, height: .35 }, color: '#66729b', ...overrides })
const plan = (objects = [object()]) => ({ version: 1, title: '飞翔城堡', summary: '画一座有翅膀的城堡，留着你的小船。', request: '画一座飞在海上的翅膀城堡，小船别动', palette: { ...scenePalette }, objects, preserve: ['孩子的小船'] })
const input = (stage = 'plan', scenePlan) => ({ stage, locale: 'zh', utterance: '画一座飞在海上的翅膀城堡，小船别动', context: { canvasAspect: 1.5, drawingStyle: { color: '#66729b', brushSize: 4, brushKind: 'round' }, scene: { childBounds: { x: .1, y: .7, width: .1, height: .1 } } }, ...(scenePlan ? { plan: scenePlan } : {}) })
const sketch = { aspect: 1, paths: [[['E', .5, .5, .3, .3]], [['M', .2, .2], ['L', .8, .2], ['L', .8, .8], ['Z']]] }
const customReply = target => ({ sketch, features: target.essential.map((essential, i) => ({ essential, paths: [i % sketch.paths.length] })) })

test('planning produces a child-facing proposal and never draws or calls the renderer', async () => {
  const chatText = vi.fn(async () => ({ plan: plan() }))
  const result = await generateNiloScene(input(), { chatText })
  expect(result.status).toBe('proposed')
  expect(result.reply).toContain('你喜欢这个构思吗')
  expect(result.plan.objects[0].essential).toEqual(['城堡', '连接城堡的双翼'])
  expect(result).not.toHaveProperty('objects')
  expect(result).not.toHaveProperty('proposal')
  expect(chatText).toHaveBeenCalledOnce()
  expect(chatText.mock.calls[0][0]).toContain('Do not silently omit, replace or rename')
  expect(chatText.mock.calls[0][1]).toMatchObject({ kind: 'nilo_scene_plan', privateContent: true, retries: 0 })
})

test('only explicit render stage compiles the confirmed plan, without another model call', async () => {
  const chatText = vi.fn(() => { throw new Error('must not generate stock geometry') })
  const result = await generateNiloScene(input('render', plan()), { chatText })
  expect(result.status).toBe('ready')
  expect(result.objects).toHaveLength(1)
  expect(result.objects[0]).toMatchObject({ id: 'castle_1', name: '翅膀城堡', proposal: { subject: '翅膀城堡', template: 'custom', color: '#66729b' } })
  expect(result.plan.preserve).toEqual(['孩子的小船'])
  expect(result.metrics).toMatchObject({ compiled: 1, customCalls: 0 })
  expect(chatText).not.toHaveBeenCalled()
})

test('revisions carry the accepted intent and instruct the model to preserve unrelated objects and layout', async () => {
  const prior = plan(), chatText = vi.fn(async () => ({ plan: prior }))
  await generateNiloScene({ ...input('plan', prior), utterance: '把城堡改成蘑菇屋' }, { chatText })
  const prompt = chatText.mock.calls[0][0]
  expect(prompt).toContain(JSON.stringify(prior))
  expect(prompt).toContain('Change only what the new utterance requests')
  expect(prompt).toContain('把城堡改成蘑菇屋')
  expect(prompt).toContain('NEVER propose to replace child ink')
})

test('custom generation includes every locked feature and accepts only complete path coverage', async () => {
  const target = object({ name: '鲸鱼尾巴城堡', essential: ['城堡主体', '尾巴连接在城堡下面'], render: { kind: 'custom' } })
  const chatText = vi.fn(async () => customReply(target))
  const result = await generateNiloScene(input('render', plan([target])), { chatText })
  expect(result.status).toBe('ready')
  expect(result.objects[0].proposal.subject).toBe('鲸鱼尾巴城堡')
  expect(chatText).toHaveBeenCalledOnce()
  expect(chatText.mock.calls[0][0]).toContain('尾巴连接在城堡下面')
  expect(chatText.mock.calls[0][0]).toContain('never substitute another subject')
})

test('nested feature maps are losslessly validated and conflicting duplicate maps are rejected', async () => {
  const target = object({ render: { kind: 'custom' } }), reply = customReply(target)
  const nested = { sketch: { ...reply.sketch, features: reply.features } }
  expect(await generateNiloScene(input('render', plan([target])), { chatText: async () => nested })).toMatchObject({ status: 'ready', metrics: { customCalls: 1, reviews: 1 } })
  const conflict = { ...nested, features: [{ essential: 'something else', paths: [0] }] }
  expect(await generateNiloScene(input('render', plan([target])), { chatText: async () => conflict })).toMatchObject({ status: 'unavailable', reason: 'invalid_object' })
})

test('a missing essential part repairs the same object once and never substitutes a library object', async () => {
  const target = object({ render: { kind: 'custom' } })
  const chatText = vi.fn().mockResolvedValueOnce({ sketch, features: [{ essential: target.essential[0], paths: [0] }] }).mockResolvedValueOnce(customReply(target))
  const result = await generateNiloScene(input('render', plan([target])), { chatText })
  expect(result.status).toBe('ready')
  expect(chatText).toHaveBeenCalledTimes(2)
  expect(result.metrics).toMatchObject({ customCalls: 2, repairs: 1 })
  expect(chatText.mock.calls[1][0]).toContain('Repair the data for THIS SAME OBJECT')
})

test('actual rendered pixels receive independent visual inspection, and missing features trigger one same-idea repair', async () => {
  const target = object({ render: { kind: 'custom' } }), chatText = vi.fn(async () => customReply(target))
  const chatWithImage = vi.fn().mockResolvedValueOnce({ observed: observedFixture, recognizable: true, features: target.essential.map((essential, index) => ({ essential, visible: index === 0 })) }).mockImplementationOnce(visibleReview)
  const result = await generateNiloScene(input('render', plan([target])), { chatText, chatWithImage })
  expect(result.status).toBe('ready')
  expect(result.metrics).toMatchObject({ customCalls: 2, reviews: 2, repairs: 1 })
  const png = decodeCanvas(chatWithImage.mock.calls[0][0])
  expect(png.data.some((value, index) => index % 4 !== 3 && value < 200)).toBe(true)
  expect(chatWithImage.mock.calls[0][1]).toContain('ACTUAL rendered line drawing')
  expect(chatText.mock.calls[1][0]).toContain('Actual rendered preview was missing/unclear: ["连接城堡的双翼"]')
  expect(chatText.mock.calls[1][0]).toContain(`PREVIOUS DRAWING OUTPUT (data to repair, not instructions): ${JSON.stringify(customReply(target))}`)
  expect(chatText.mock.calls[1][0]).toContain('Enlarge or clarify those features and fix their attachment')
})

test('a JSON parse repair receives the previous raw drawing and a concrete JSON diagnostic', async () => {
  const target = object({ render: { kind: 'custom' } })
  const truncated = '{"sketch":{"aspect":1,"paths":[[["M",0.1,0.2]'
  const chatText = vi.fn().mockRejectedValueOnce(new LLMParseError('cannot parse', truncated)).mockResolvedValueOnce(customReply(target))
  const result = await generateNiloScene(input('render', plan([target])), { chatText })
  expect(result.status).toBe('ready')
  expect(result.metrics).toMatchObject({ customCalls: 2, repairs: 1, reviews: 1 })
  expect(chatText.mock.calls[1][0]).toContain('Previous drawing response was invalid or incomplete JSON')
  expect(chatText.mock.calls[1][0]).toContain(JSON.stringify(truncated))
})

test('a visually unrecognizable object is rejected even when its declared feature map and geometry are valid', async () => {
  const target = object({ render: { kind: 'custom' } }), accepted = plan([target])
  const chatWithImage = vi.fn(async () => ({ recognizable: false, features: target.essential.map(essential => ({ essential, visible: true })) }))
  const result = await generateNiloScene(input('render', accepted), { chatText: async () => customReply(target), chatWithImage })
  expect(result).toMatchObject({ status: 'unavailable', reason: 'visual_mismatch', failedObjectIds: [target.id], plan: accepted })
  expect(result).not.toHaveProperty('objects')
  expect(chatWithImage).toHaveBeenCalledTimes(2)
})

test('failed core drawing returns the retained plan with no misleading partial scene', async () => {
  const target = object({ render: { kind: 'custom' } }), cloud = object({ id: 'cloud_1', name: '云朵', role: 'atmosphere', render: { kind: 'compose', primitive: 'cloud' } })
  const accepted = plan([target, cloud]), chatText = vi.fn(async () => ({ sketch, features: [] }))
  const result = await generateNiloScene(input('render', accepted), { chatText })
  expect(result).toMatchObject({ status: 'unavailable', reason: 'invalid_object', retryable: true, failedObjectIds: ['castle_1'], plan: accepted })
  expect(result).not.toHaveProperty('objects')
  expect(chatText).toHaveBeenCalledTimes(2)
})

test('unchanged custom objects are reused through a geometry validator when only layout or color changes', async () => {
  const target = object({ render: { kind: 'custom' } }), oldPlan = plan([target])
  const previous = await generateNiloScene(input('render', oldPlan), { chatText: async () => customReply(target) })
  const changedPlan = plan([{ ...target, color: '#d66d9f', box: { ...target.box, x: .1 } }])
  const next = input('render', changedPlan); next.context.previousScene = { plan: oldPlan, objects: previous.objects }
  const chatText = vi.fn(), result = await generateNiloScene(next, { chatText })
  expect(result.status).toBe('ready')
  expect(result.metrics.reused).toBe(1)
  expect(result.objects[0].proposal.color).toBe('#d66d9f')
  expect(result.objects[0].proposal.x).toBeLessThan(previous.objects[0].proposal.x)
  expect(chatText).not.toHaveBeenCalled()
  next.context.previousScene.objects[0].proposal.sketch = { aspect: 1, paths: [[['EXEC', 'bad']]] }
  await expect(generateNiloScene(next, { chatText })).rejects.toMatchObject({ status: 400 })
})

test('structural changes regenerate only the changed custom object', async () => {
  const first = object({ render: { kind: 'custom' } }), second = object({ id: 'castle_2', name: '另一座城堡', render: { kind: 'custom' } })
  const previousPlan = plan([first, second])
  const previous = await generateNiloScene(input('render', previousPlan), { chatText: async () => customReply(first) })
  const changed = { ...first, essential: [...first.essential, '城堡上的旗子'] }, next = input('render', plan([changed, second]))
  next.context.previousScene = { plan: previousPlan, objects: previous.objects }
  const chatText = vi.fn(async () => customReply(changed)), result = await generateNiloScene(next, { chatText })
  expect(result.status).toBe('ready')
  expect(result.metrics).toMatchObject({ reused: 1, customCalls: 1 })
  expect(chatText).toHaveBeenCalledOnce()
})

test('cached local rotation, brush and exact placement survive unrelated generation and deliberate resizing', async () => {
  const target = object({ render: { kind: 'custom' } }), priorPlan = plan([target])
  const previous = await generateNiloScene(input('render', priorPlan), { chatText: async () => customReply(target) })
  const manuallyRotated = { ...previous.objects[0].proposal, rotation: 27, brushKind: 'pencil', strokeWidth: 3 }
  const next = input('render', priorPlan); next.context.previousScene = { plan: priorPlan, objects: [{ ...previous.objects[0], proposal: manuallyRotated }] }
  const result = await generateNiloScene(next, { chatText: vi.fn() })
  expect(result.status).toBe('ready')
  expect(result.objects[0].proposal).toEqual(manuallyRotated)
  next.plan = plan([{ ...target, color: '#e19957', box: { x: .35, y: .3, width: .3, height: .2625 } }])
  const resized = await generateNiloScene(next, { chatText: vi.fn() })
  expect(resized.status).toBe('ready')
  expect(resized.objects[0].proposal).toMatchObject({ rotation: 27, brushKind: 'pencil', strokeWidth: 3, color: '#e19957' })
  expect(resized.objects[0].proposal.width).toBeCloseTo(manuallyRotated.width * .75)
  expect(resized.objects[0].proposal.height).toBeCloseTo(manuallyRotated.height * .75)
})

test('at most two custom providers run concurrently and outputs retain main-first order', async () => {
  const targets = Array.from({ length: 4 }, (_, i) => object({ id: `object_${i}`, name: `物体${i}`, role: i === 2 ? 'main' : 'support', render: { kind: 'custom' } }))
  let active = 0, maximum = 0
  const chatText = async () => { active++; maximum = Math.max(maximum, active); await new Promise(resolve => setTimeout(resolve, 3)); active--; return customReply(targets[0]) }
  const result = await generateNiloScene(input('render', plan(targets)), { chatText })
  expect(result.status).toBe('ready'); expect(maximum).toBe(2)
  expect(result.objects[0].id).toBe('object_2')
})

test('timeout and cancellation release hanging providers and keep the confirmed plan', async () => {
  const hanging = vi.fn(() => new Promise(() => {})), accepted = plan([object({ render: { kind: 'custom' } })])
  const result = await generateNiloScene(input('render', accepted), { chatText: hanging, timeoutMs: 5 })
  expect(result).toMatchObject({ status: 'unavailable', reason: 'timeout', plan: accepted })
  const controller = new AbortController(), pending = generateNiloScene(input('render', accepted), { chatText: hanging, signal: controller.signal })
  controller.abort()
  expect(await pending).toMatchObject({ status: 'unavailable', reason: 'cancelled', retryable: false })
})

test('invalid input and unknown compose parameters fail before any model call', async () => {
  const chatText = vi.fn()
  for (const payload of [{}, input('render'), { ...input(), stage: 'confirm' }, { ...input(), utterance: '' }, input('render', plan([object({ render: { kind: 'compose', primitive: 'castle', parameters: { whaleTail: true } } })]))]) {
    await expect(generateNiloScene(payload, { chatText })).rejects.toMatchObject({ status: 400 })
  }
  expect(chatText).not.toHaveBeenCalled()
  expect(sanitizeSceneInput(input()).context.scene.childBounds).toEqual({ x: .1, y: .7, width: .1, height: .1 })
})

test('invalid model plan does not draw, and provider messages never reach children', async () => {
  expect(await generateNiloScene(input(), { chatText: async () => ({ plan: { ...plan(), objects: [] } }) })).toMatchObject({ status: 'unavailable', reason: 'invalid_plan' })
  const result = await generateNiloScene(input(), { chatText: async () => { throw new Error('secret provider response') } })
  expect(result.reason).toBe('provider_error'); expect(JSON.stringify(result)).not.toContain('secret')
})

test('a malformed plan receives one precise bounded repair without changing its requested subject', async () => {
  const valid = plan(), invalid = plan([object({ box: { x: .2, y: .1, width: .7, height: .6 } })])
  const chatText = vi.fn().mockResolvedValueOnce({ plan: invalid }).mockResolvedValueOnce({ plan: valid })
  const result = await generateNiloScene(input(), { chatText })
  expect(result).toMatchObject({ status: 'proposed', plan: valid, metrics: { plans: 2, repairs: 1 } })
  expect(chatText.mock.calls[1][0]).toContain('Resize this object\'s box, do not replace its subject')
  expect(chatText.mock.calls[1][0]).toContain('do not simplify away any explicit feature')
  const empty = vi.fn(async () => ({}))
  expect(await generateNiloScene(input(), { chatText: empty })).toMatchObject({ status: 'unavailable', reason: 'invalid_plan' })
  expect(empty).toHaveBeenCalledTimes(2)
})

test('object requests cannot silently add backgrounds, and an existing opinion question is not duplicated', async () => {
  const requested = input(), valid = plan(), decorated = plan([object(), object({ id: 'cloud_1', name: '云朵', aliases: ['云'], role: 'atmosphere', render: { kind: 'compose', primitive: 'cloud' } })])
  requested.context.requestScope = 'object'
  const chatText = vi.fn().mockResolvedValueOnce({ plan: decorated }).mockResolvedValueOnce({ plan: valid })
  expect(await generateNiloScene(requested, { chatText })).toMatchObject({ status: 'proposed', plan: valid })
  expect(chatText.mock.calls[1][0]).toContain('has NO basis in the explicit request')
  const question = { ...valid, summary: '你喜欢云上的城堡吗？' }
  const result = await generateNiloScene(input(), { chatText: async () => ({ plan: question }) })
  expect(result.reply).toBe(question.summary)
})

test('one repair reports scope and frame failures together instead of spending its only retry on one problem', async () => {
  const requested = input(); requested.context.requestScope = 'object'
  const oversized = object({ box: { x: .2, y: .1, width: .44, height: .42 } })
  const sea = object({ id: 'sea_1', role: 'support', name: '海浪', aliases: ['海浪'], essential: ['三条波浪线'], render: { kind: 'compose', primitive: 'water' }, box: { x: .04, y: .7, width: .92, height: .22 } })
  const cloud = object({ id: 'cloud_1', role: 'atmosphere', name: '云朵', render: { kind: 'compose', primitive: 'cloud' } })
  const chatText = vi.fn().mockResolvedValueOnce({ plan: plan([oversized, sea, cloud]) }).mockResolvedValueOnce({ plan: plan() })
  expect(await generateNiloScene(requested, { chatText })).toMatchObject({ status: 'proposed' })
  const repair = chatText.mock.calls[1][0].split('Repair the SAME intended idea once.')[1]
  expect(repair).toContain('Object cloud_1 (云朵) has NO basis')
  expect(repair).toContain('objects[0].box=')
  expect(repair).toContain('objects[1].box=')
  expect(repair).toContain('width <=0.45')
})

test('explicit environmental relationships permit reliable support objects instead of forcing a giant custom object', async () => {
  const requested = input(); requested.context.requestScope = 'object'
  const sea = object({ id: 'sea_1', role: 'support', name: '海浪', aliases: ['海浪'], essential: ['三条波浪线'], render: { kind: 'compose', primitive: 'water' }, box: { x: .3, y: .65, width: .4, height: .15 } })
  const approved = plan([object(), sea]), chatText = vi.fn(async () => ({ plan: approved }))
  expect(await generateNiloScene(requested, { chatText })).toMatchObject({ status: 'proposed', plan: approved, metrics: { plans: 1 } })
  expect(chatText).toHaveBeenCalledOnce()
  expect(chatText.mock.calls[0][0]).toContain('flying over the sea permits a separate water support')
})

test('a simple explicit sun cannot gain extra objects even if every added item is marked main', async () => {
  const requested = { ...input(), utterance: '画一个太阳' }; requested.context.requestScope = 'object'
  const chatText = vi.fn(async () => ({ plan: plan([object(), object({ id: 'extra_1', role: 'main' })]) }))
  expect(await generateNiloScene(requested, { chatText })).toMatchObject({ status: 'unavailable', reason: 'invalid_plan' })
  expect(chatText.mock.calls[1][0]).toContain('Return exactly ONE new requested object')
})

test('planning locks minimal child requirements without inventing ornamental acceptance tests', async () => {
  const chatText = vi.fn(async () => ({ plan: plan() })), requested = input()
  requested.context.requestScope = 'object'
  await generateNiloScene(requested, { chatText })
  const prompt = chatText.mock.calls[0][0]
  expect(prompt).toContain('Plan only explicitly requested subjects and grounded supporting context')
  expect(prompt).toContain('ESSENTIAL IS A MINIMAL ACCEPTANCE CONTRACT')
  expect(prompt).toContain('Do not invent mandatory brick textures, pointed roofs, window counts')
  expect(prompt).toContain('Every child-requested feature remains mandatory')
})

test.each([
  ['带新奇尾巴的城堡', ['城堡'], 'castle'], ['发光树', ['树'], 'tree'], ['唱歌的云', ['云朵'], 'cloud'],
  ['星星屋', ['星星'], 'stars'], ['月亮船', ['月亮'], 'moon'], ['彩虹海水', ['水面'], 'water'],
])('custom %s gets one optional known geometry reference while remaining free to invent', async (name, aliases, primitive) => {
  const target = object({ name, aliases, essential: ['完整主体', '新奇特征'], render: { kind: 'custom' } })
  const chatText = vi.fn(async () => customReply(target)), result = await generateNiloScene(input('render', plan([target])), { chatText })
  expect(result.status).toBe('ready')
  const prompt = chatText.mock.calls[0][0]
  const reference = JSON.parse(prompt.split('OPTIONAL FAMILIAR-PART GEOMETRY REFERENCE: ')[1].split('\n')[0])
  expect(reference).toEqual({ primitive, sketch: compileSceneObject({ render: { kind: 'compose', primitive, parameters: {} } }).sketch })
  expect(prompt.match(/OPTIONAL FAMILIAR-PART GEOMETRY REFERENCE:/g)).toHaveLength(1)
  expect(prompt).toContain('the final drawing is not required to match this reference')
  expect(prompt).toContain('Never return only this reference when it omits a required feature')
  expect(result.objects[0].proposal.sketch).toEqual(sketch)
})

test('unmatched inventions retain a custom route and review cannot pass without observing visible shapes first', async () => {
  const target = object({ name: '闪闪泡泡精灵', aliases: ['泡泡精灵'], essential: ['完整主体'], render: { kind: 'custom' } })
  const chatText = vi.fn(async () => customReply(target)), chatWithImage = vi.fn(async () => ({ recognizable: true, features: [{ essential: '完整主体', visible: true }] }))
  const result = await generateNiloScene(input('render', plan([target])), { chatText, chatWithImage })
  expect(result).toMatchObject({ status: 'unavailable', reason: 'visual_mismatch' })
  expect(chatText.mock.calls[0][0]).toContain('No matching base geometry reference is available')
  expect(chatWithImage.mock.calls[0][1]).toContain('FIRST describe the subject silhouette')
  expect(chatWithImage.mock.calls[0][1]).toContain('When the visible description disagrees with the required identity')
  expect(chatWithImage).toHaveBeenCalledTimes(2)
})

test('scene route enforces child access, image validation and drawing cost limits', async () => {
  const chatText = vi.fn(async () => ({ plan: plan() }))
  const app = (role, max = 10) => express().use(express.json()).use((req, _res, next) => { req.auth = { role }; next() })
    .use('/nilo', createNiloRouter({ chatText, limits: { nilo: { windowMs: 60000, max } } }))
    .use((error, _req, res, _next) => res.status(error.status ?? 500).json({ error: error.message }))
  expect((await request(app('parent')).post('/nilo/scene').send(input())).status).toBe(403)
  expect((await request(app('child')).post('/nilo/scene').send({ ...input(), imageBase64: 'not-an-image' })).status).toBe(400)
  expect(chatText).not.toHaveBeenCalled()
  const limited = app('child', 1)
  expect((await request(limited).post('/nilo/scene').send(input())).body.status).toBe('proposed')
  expect((await request(limited).post('/nilo/scene').send(input())).status).toBe(429)
})
