import { expect, test, vi } from 'vitest'
import { needsSceneUnderstanding, sanitizeSceneUnderstanding, sceneUnderstandingPrompt } from '../src/services/niloSceneIntent.js'
import { generateNiloScene as generateScene } from '../src/services/niloScene.js'
import { sceneIntentIssues, sceneMaterialContext } from '../src/services/niloSceneMaterials.js'

// This file isolates interpretation and grounding; quality review has separate
// end-to-end sequencing and real-pixel tests in niloSceneQuality.test.js.
const generateNiloScene = (input, options) => generateScene(input, { retrieveMaterials: async () => null, reviewScene: async () => ({ accepted: true, issues: [] }), ...options })

const brief = overrides => ({ version: 1, intent: '一处能走进去探险的梦幻森林，参考故事里的奇妙氛围。', reference: [{ phrase: '故事书里的', meaning: '有远近层次和发现感的童话世界' }], setting: '森林', mood: ['奇妙', '有发现感'],
  requiredSubjects: ['森林'], excludedSubjects: [], referenceOnlySubjects: ['故事书'], motifs: [{ subject: '树', role: 'setting', reason: '前后围合出可以走进去的森林' }, { subject: '小兔子', role: 'focal', reason: '引导视线走向林间的发现' }], relationships: ['小兔子在树前，面向林间留出的空地'], ...overrides })
const imageObject = (subject, name, role = 'main') => ({ id: `${subject}_1`, name, aliases: [name], role, essential: [name],
  render: { kind: 'illustration', illustrationId: `illustration-library-${subject}-beginner-01` }, box: { x: .2, y: .2, width: .5, height: .5 }, color: '#66729b' })
const plan = objects => ({ version: 1, title: '林间的小发现', summary: '小兔子望向大树之间留出的空地，我们可以在那里继续画新的发现。', request: '画故事书里的森林', objects, preserve: [] })
const input = overrides => ({ stage: 'plan', utterance: '画童话故事书里的森林，不要画一本书', locale: 'zh', context: { canvasAspect: 1.4, requestScope: 'scene', history: [] }, ...overrides })

test('understanding distinguishes source references from physical subjects before seeing assets', () => {
  const parsed = sanitizeSceneUnderstanding(brief())
  expect(parsed).toMatchObject({ requiredSubjects: ['森林'], referenceOnlySubjects: ['故事书'] })
  const prompt = sceneUnderstandingPrompt(input())
  expect(prompt).toContain('BEFORE seeing any material catalogue')
  expect(prompt).not.toContain('illustration-library-')
  expect(prompt).not.toContain('recipeId')
  expect(prompt).toContain('不要画一本书')
  const book = sanitizeSceneUnderstanding(brief({ intent: '一本打开的童话故事书', requiredSubjects: ['故事书'], referenceOnlySubjects: [], setting: '', motifs: [] }))
  expect(book.requiredSubjects).toEqual(['故事书'])
})

test('semantic input is bounded data, while unfamiliar inventions are retained', () => {
  expect(sanitizeSceneUnderstanding(brief({ requiredSubjects: ['长着鲸鱼尾巴的城堡'] })).requiredSubjects).toEqual(['长着鲸鱼尾巴的城堡'])
  for (const bad of [brief({ intent: '' }), brief({ url: 'https://example.com' }), brief({ requiredSubjects: ['书'], excludedSubjects: ['书'] }), brief({ motifs: Array(7).fill(brief().motifs[0]) }), brief({ reference: [{ phrase: '书', meaning: 'x'.repeat(181) }] })]) {
    expect(sanitizeSceneUnderstanding(bad)).toBeNull()
  }
})

test('new understanding schema omits brainstorming while old object motifs remain compatible', () => {
  const prompt = sceneUnderstandingPrompt(input())
  const schema = JSON.parse(prompt.split('Return ONLY JSON ')[1].split('. At most 3 references.')[0])
  expect(schema.brief).not.toHaveProperty('motifs')
  const legacy = brief(), before = structuredClone(legacy)
  expect(sanitizeSceneUnderstanding(legacy).motifs).toEqual(legacy.motifs)
  const missing = brief(); delete missing.motifs
  expect(sanitizeSceneUnderstanding(missing)).toMatchObject({ motifs: [], requiredSubjects: missing.requiredSubjects, relationships: missing.relationships })
  expect(legacy).toEqual(before)
})

test('bounded string motifs are discarded without losing or promoting explicit requirements and relationships', () => {
  const raw = brief({ intent: '小兔子在大树旁避雨，不要城堡', requiredSubjects: ['小兔子', '大树'], excludedSubjects: ['城堡'],
    relationships: ['小兔子在大树旁'], motifs: ['壁炉', '温暖的小路', '城堡'] })
  const before = structuredClone(raw), parsed = sanitizeSceneUnderstanding(raw)
  expect(parsed).toMatchObject({ intent: raw.intent, requiredSubjects: raw.requiredSubjects,
    excludedSubjects: raw.excludedSubjects, relationships: raw.relationships, motifs: [] })
  expect(raw).toEqual(before)
  const materials = sceneMaterialContext({ utterance: raw.intent, semanticBrief: parsed })
  expect(materials.requestedSubjects).toEqual(expect.arrayContaining(['rabbit', 'tree']))
  expect(materials.requestedSubjects).not.toEqual(expect.arrayContaining(['castle']))
  // Existing validators continue to enforce the actual required rabbit even
  // when the discarded optional field happened to name other things.
  expect(sceneIntentIssues(plan([imageObject('tree', '小树')]), parsed).join(' ')).toContain('rabbit is missing')
})

test('optional motif normalization never accepts oversized, mixed, unknown or invalid required data', () => {
  for (const motifs of [null, '壁炉', [''], ['x'.repeat(161)], ['屋檐\n小路'], Array(7).fill('小路'),
    [brief().motifs[0], '壁炉'], [{ ...brief().motifs[0], url: 'https://example.com' }],
    [{ ...brief().motifs[0], subject: 'x'.repeat(61) }], [{ ...brief().motifs[0], reason: 'x'.repeat(161) }]]) {
    expect(sanitizeSceneUnderstanding(brief({ motifs }))).toBeNull()
  }
  for (const patch of [{ surprise: 'not allowed' }, { requiredSubjects: '大树' }, { requiredSubjects: ['x'.repeat(61)] },
    { requiredSubjects: Array(9).fill('大树') }, { requiredSubjects: ['城堡'], excludedSubjects: ['城堡'] }]) {
    expect(sanitizeSceneUnderstanding(brief({ motifs: ['壁炉'], ...patch }))).toBeNull()
  }
})

test.each([undefined, ['屋檐', '壁炉', 'OPTIONAL_PRIVATE_DO_NOT_PROMOTE']])('cozy-rain understanding with omitted or string motifs needs no extra provider repair: %j', async motifs => {
  const request = input({ utterance: '画一个下雨天也很温暖的地方' })
  const semantic = brief({ intent: request.utterance, setting: '下雨天', mood: ['温暖'], reference: [],
    requiredSubjects: [], excludedSubjects: [], referenceOnlySubjects: [], relationships: [], motifs })
  const candidate = { ...plan([{ id: 'shelter', name: '避雨的小屋', aliases: ['小屋'], role: 'main', essential: ['屋檐下留有避雨空地', '屋外的雨线'],
    render: { kind: 'generated' }, box: { x: .1, y: .1, width: .8, height: .7 }, color: '#66729b' }]),
    title: '屋檐下的暖意', summary: '屋檐遮着门前的一小块空地，屋外有雨线。', request: request.utterance }
  const chatText = vi.fn(async (prompt, options) => {
    if (options.kind === 'nilo_scene_understand') return { brief: semantic }
    expect(options.kind).toBe('nilo_scene_plan')
    expect(prompt).toContain(request.utterance)
    expect(prompt).not.toContain('OPTIONAL_PRIVATE_DO_NOT_PROMOTE')
    return { plan: candidate }
  })
  const reviewScene = vi.fn(async assessment => {
    expect(assessment.utterance).toBe(request.utterance)
    expect(assessment.brief).toMatchObject({ intent: request.utterance, requiredSubjects: [], relationships: [], motifs: [] })
    return { accepted: true, issues: [] }
  })
  const result = await generateNiloScene(request, { chatText, generateImage: vi.fn(), reviewScene })
  expect(result).toMatchObject({ status: 'proposed', metrics: { understandings: 1, plans: 1, repairs: 0 }, plan: { request: request.utterance } })
  expect(chatText).toHaveBeenCalledTimes(2)
  expect(reviewScene).toHaveBeenCalledOnce()
})

test('discarding optional string motifs cannot bypass exact grounding of mandatory subjects', async () => {
  const chatText = vi.fn(async () => ({ brief: brief({ requiredSubjects: ['并非原话的物体'], motifs: ['壁炉'] }) }))
  expect(await generateNiloScene(input(), { chatText })).toMatchObject({ status: 'unavailable', reason: 'invalid_response', metrics: { understandings: 2, plans: 0, repairs: 1 } })
  expect(chatText).toHaveBeenCalledTimes(2)
})

test('ordinary object requests and local position edits do not add an understanding call', () => {
  expect(needsSceneUnderstanding(input({ utterance: '画一个太阳', context: { requestScope: 'object' } }))).toBe(false)
  expect(needsSceneUnderstanding(input({ utterance: '把树移到左边' }))).toBe(false)
  expect(needsSceneUnderstanding(input({ utterance: '我想画迪士尼那样的梦幻场景' }))).toBe(true)
  expect(needsSceneUnderstanding(input({ utterance: 'make a scene that feels like an underwater adventure' }))).toBe(true)
})

test('image-capable new scene scope always gets interpretation, without adding calls to objects or local edits', () => {
  const scene = input({ utterance: '画一辆穿过云端的火车', rasterGeneration: true })
  expect(needsSceneUnderstanding(scene)).toBe(true)
  expect(needsSceneUnderstanding({ ...scene, context: { requestScope: 'object' } })).toBe(false)
  expect(needsSceneUnderstanding({ ...scene, utterance: '把它移到左边', plan: plan([]) })).toBe(false)
})

test('a catalogue-free text interpretation precedes visual planning, under the same cancellation signal', async () => {
  const calls = [], tree = imageObject('tree', '小树'), rabbit = imageObject('rabbit', '小兔子', 'support')
  const chatText = vi.fn(async (prompt, options) => { calls.push(options); return { brief: brief() } })
  const chatWithImage = vi.fn(async (_image, prompt, options) => {
    calls.push(options)
    expect(prompt).toContain('SEMANTIC BRIEF')
    expect(prompt).toContain('一处能走进去探险的梦幻森林')
    expect(prompt).toContain('MATERIAL CONTEXT')
    return { plan: plan([tree, rabbit]) }
  })
  const result = await generateNiloScene(input({ imageBase64: 'synthetic-snapshot' }), { chatText, chatWithImage })
  expect(result).toMatchObject({ status: 'proposed', metrics: { understandings: 1, plans: 1, repairs: 0 } })
  expect(calls.map(call => call.kind)).toEqual(['nilo_scene_understand', 'nilo_scene_plan'])
  expect(calls[0].signal).toBe(calls[1].signal)
  expect(chatText.mock.calls[0][0]).not.toContain('illustration-library-')
})

test('a storybook substitution is repaired as a semantic mismatch, not approved as a valid asset', async () => {
  const literalBook = plan([imageObject('book', '故事书')]), correct = plan([imageObject('tree', '小树')])
  const chatText = vi.fn().mockResolvedValueOnce({ brief: brief() }).mockResolvedValueOnce({ plan: literalBook }).mockResolvedValueOnce({ plan: correct })
  const result = await generateNiloScene(input(), { chatText })
  expect(result).toMatchObject({ status: 'proposed', metrics: { understandings: 1, plans: 2, repairs: 1 } })
  expect(result.plan.objects.map(object => object.name)).toEqual(['小树'])
  expect(chatText.mock.calls[2][0]).toMatch(/reference|excluded/i)
  expect(chatText).toHaveBeenCalledTimes(3)
})

test('literal books remain drawable when the child actually requests one', async () => {
  const explicit = brief({ intent: '森林中的一本故事书', requiredSubjects: ['森林', '故事书'], reference: [], referenceOnlySubjects: [], motifs: [], relationships: ['书放在树旁'] })
  const chatText = vi.fn().mockResolvedValueOnce({ brief: explicit }).mockResolvedValueOnce({ plan: plan([imageObject('book', '图画书'), imageObject('tree', '小树')]) })
  expect(await generateNiloScene(input({ utterance: '画森林里的一本故事书' }), { chatText })).toMatchObject({ status: 'proposed' })
})

test('invalid understanding gets one bounded repair and never silently draws a random idea', async () => {
  const chatText = vi.fn(async () => ({ brief: { intent: 'bad' } }))
  expect(await generateNiloScene(input(), { chatText })).toMatchObject({ status: 'unavailable', reason: 'invalid_response', metrics: { understandings: 2, plans: 0, repairs: 1 } })
  expect(chatText).toHaveBeenCalledTimes(2)
})

test('an incomplete brief can recover once before planning without changing the child request', async () => {
  const chatText = vi.fn().mockResolvedValueOnce({ brief: { intent: '森林' } })
    .mockResolvedValueOnce({ brief: brief() }).mockResolvedValueOnce({ plan: plan([imageObject('tree', '小树'), imageObject('rabbit', '小兔子')]) })
  expect(await generateNiloScene(input(), { chatText })).toMatchObject({ status: 'proposed', metrics: { understandings: 2, plans: 1, repairs: 1 } })
  expect(chatText.mock.calls[1][0]).toContain('include version, intent, setting')
})

test('invented mandatory subjects use the shared repair allowance before material planning', async () => {
  const request = input({ utterance: '画一个太空冒险电影那样的场景' })
  const base = brief({ intent: '太空中的冒险氛围', setting: '太空', reference: [], referenceOnlySubjects: [], requiredSubjects: [], motifs: [{ subject: '飞碟', role: 'focal', reason: '正在探索的载具' }] })
  const chatText = vi.fn().mockResolvedValueOnce({ brief: { ...base, requiredSubjects: ['宇航员'] } })
    .mockResolvedValueOnce({ brief: base }).mockResolvedValueOnce({ plan: { ...plan([imageObject('ufo', '飞碟')]), summary: '一艘小飞碟正在太空探索。' } })
  expect(await generateNiloScene(request, { chatText })).toMatchObject({ status: 'proposed', metrics: { understandings: 2, plans: 1, repairs: 1 } })
  expect(chatText).toHaveBeenCalledTimes(3)
  expect(chatText.mock.calls[1][0]).toContain('move inferred optional additions to motifs')
})

test('material pose contradictions are rejected before the child confirms', async () => {
  const book = { ...imageObject('book', '图画书'), essential: ['打开的书页'] }
  const chatText = vi.fn(async () => ({ plan: { ...plan([book]), summary: '一本打开的图画书。' } }))
  const result = await generateNiloScene(input({ utterance: '画一本打开的书', context: { requestScope: 'object' } }), { chatText })
  expect(result).toMatchObject({ status: 'unavailable', reason: 'invalid_plan' })
  expect(chatText.mock.calls[1][0]).toContain('contradicts the requested open/closed state')
})

test('an accidental path schema key is repaired as a path without conflicting custom advice', async () => {
  const request = input({ utterance: '画一个梦幻森林场景' })
  const semantic = brief({ requiredSubjects: [], reference: [], referenceOnlySubjects: [] })
  const path = { id: 'path_1', name: '小路', aliases: ['小径'], role: 'support', essential: ['两条弯弯的路边线'], color: '#66729b', box: { x: .3, y: .62, width: .42, height: .34 }, render: { kind: 'compose', primitive: 'path', parameters: { curve: 'left', rows: 2 } } }
  const valid = { ...path, render: { kind: 'compose', primitive: 'path', parameters: { curve: 'left' } } }
  const chatText = vi.fn().mockResolvedValueOnce({ brief: semantic })
    .mockResolvedValueOnce({ plan: { ...plan([imageObject('tree', '小树'), path]), summary: '一棵小树旁是一条小路。' } })
    .mockResolvedValueOnce({ plan: { ...plan([imageObject('tree', '小树'), valid]), summary: '一棵小树旁是一条小路。' } })
  expect(await generateNiloScene(request, { chatText })).toMatchObject({ status: 'proposed', metrics: { plans: 2, repairs: 1 } })
  expect(chatText.mock.calls[2][0]).toContain('Do not convert an ordinary supported path/water to custom')
})

test('semantic role labels and decorative names normalize without losing subject or features', async () => {
  const semantic = brief({ requiredSubjects: [], referenceOnlySubjects: [] })
  const tree = { ...imageObject('tree', '围拢的小树'), role: 'setting', essential: ['圆圆的树冠'] }
  const mushroom = { ...imageObject('mushroom', '圆帽大蘑菇'), role: 'focal', essential: ['圆圆的蘑菇帽'] }
  const chatText = vi.fn().mockResolvedValueOnce({ brief: semantic }).mockResolvedValueOnce({ plan: { ...plan([tree, mushroom]), summary: '小树围在大蘑菇旁。' } })
  const result = await generateNiloScene(input(), { chatText })
  expect(result).toMatchObject({ status: 'proposed', metrics: { plans: 1, repairs: 0 } })
  expect(result.plan.objects).toMatchObject([{ role: 'support', name: '小树', essential: tree.essential }, { role: 'main', name: '蘑菇', essential: mushroom.essential }])
  expect(result.plan.objects[1].aliases).toContain('圆帽大蘑菇')
  expect((await generateNiloScene({ ...input(), stage: 'render', plan: result.plan })).status).toBe('ready')
})

test('understanding shares the bounded timeout and cancellation budget with planning', async () => {
  const chatText = vi.fn(() => new Promise(() => {}))
  expect(await generateNiloScene(input(), { chatText, timeoutMs: 5 })).toMatchObject({ status: 'unavailable', reason: 'timeout' })
  const controller = new AbortController(), pending = generateNiloScene(input(), { chatText, signal: controller.signal })
  controller.abort()
  expect(await pending).toMatchObject({ status: 'unavailable', reason: 'cancelled' })
})
