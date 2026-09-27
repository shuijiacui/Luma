import { afterEach, expect, test, vi } from 'vitest'
import { generateNiloScene as generateScene, sanitizeSceneInput } from '../src/services/niloScene.js'
import { sanitizeScenePlan } from '../../shared/niloSceneDrawing.mjs'
import { getMaterialCuration, setMaterialCuration } from '../../shared/niloCuration.mjs'
import * as curationStore from '../src/services/niloCurationStore.js'

const profile = { style: 'storybook', detail: 'simple' }
// These fixtures isolate material compilation/repair. The catalogue-free stage
// has its own end-to-end provider sequencing tests in niloSceneIntent.test.js.
const generateNiloScene = (input, options = {}) => generateScene(input, { ...options, chatText: (prompt, request) => request.kind === 'nilo_scene_understand'
  ? Promise.resolve({ brief: { version: 1, intent: input.utterance, reference: [], setting: '', mood: [], requiredSubjects: [], excludedSubjects: [], referenceOnlySubjects: [], motifs: [{ subject: '小兔子', role: 'focal', reason: '语义阶段测试替身，当前文件独立验证素材编译' }], relationships: [] } })
  : options.chatText?.(prompt, request) })
const initial = getMaterialCuration()
afterEach(() => { vi.restoreAllMocks(); setMaterialCuration(initial) })
const rabbit = { id: 'rabbit_1', name: '小兔子', aliases: ['兔子'], role: 'main', essential: ['清楚的小兔子轮廓'], render: { kind: 'illustration', illustrationId: 'illustration-library-rabbit-beginner-01' }, box: { x: .2, y: .2, width: .5, height: .5 }, color: '#997baf' }
const makePlan = (objects = [rabbit]) => ({ version: 1, title: '小兔的故事', summary: '小兔子在画面里散步。', request: '画一个梦幻场景', palette: { sky: '#e6edf9', ground: '#dceadf', ink: '#66729b', accent: '#bc8bba' }, objects, preserve: [] })
const input = (stage, plan) => ({ stage, utterance: '画一个梦幻场景', locale: 'zh', plan, context: { canvasAspect: 1.4, canvasSize: { width: 840, height: 600 } } })

test('material-first planning supplies one server-selected profile, real PNG choices and readable size guidance', async () => {
  const chatText = vi.fn(async () => ({ plan: makePlan() }))
  const result = await generateNiloScene(input('plan'), { chatText })
  expect(result).toMatchObject({ status: 'proposed', plan: { materialProfile: profile } })
  expect(chatText).toHaveBeenCalledOnce()
  const prompt = chatText.mock.calls[0][0]
  expect(prompt).toContain('MATERIAL-FIRST COMPOSITION')
  expect(prompt).toContain('ONE shared style AND detail level')
  expect(prompt).toContain('minPixels')
  expect(prompt).toContain('200..260 pixels')
  expect(prompt).toContain('SCENE scope may include')
  expect(prompt).toContain('shared ground or shoreline level')
  expect(prompt).toContain('visibleBounds')
  expect(prompt).toContain('monochrome dashed-line or pale-gray drawing reference')
  expect(prompt).toContain('does not create a reflection')
  expect(prompt).toContain('"width":840,"height":600')
  expect(prompt).not.toContain('"id":"castle_1"')
})

test('live watermill scene accepts real PNG names without unnecessary repair and renders all registered objects', async () => {
  const objects = [
    ['river_1', '河流', 'riverscene', 'support', [.05, .52, .9, .42]],
    ['watermill_1', '水车小屋', 'watermill', 'main', [.33, .24, .3, .3]],
    ['hiker_1', '小小登山者', 'hiker', 'main', [.08, .6, .14, .14]],
    ['bridge_1', '小石拱桥', 'archedbridge', 'support', [.66, .42, .22, .22]],
    ['bird_1', '小鸟', 'bird', 'support', [.55, .08, .1, .1]],
    ['flower_1', '扶桑花', 'hibiscus', 'support', [.87, .62, .1, .1]],
  ].map(([id, name, subject, role, [x, y, width, height]]) => ({ id, name, aliases: [name], role, essential: [name], render: { kind: 'illustration', illustrationId: `illustration-library-${subject}-beginner-01` }, box: { x, y, width, height }, color: '#66729b' }))
  const chatText = vi.fn(async () => ({ plan: makePlan(objects) })), chatWithImage = vi.fn()
  const planned = await generateNiloScene({ ...input('plan'), utterance: '画一个迪士尼那样梦幻的场景，换个新的主意' }, { chatText })
  expect(planned).toMatchObject({ status: 'proposed', metrics: { plans: 1, repairs: 0 } })
  expect(chatText).toHaveBeenCalledOnce()
  const rendered = await generateNiloScene(input('render', planned.plan), { chatText, chatWithImage })
  expect(rendered).toMatchObject({ status: 'ready', metrics: { compiled: 6 } })
  expect(rendered.objects).toHaveLength(6)
  expect(chatText).toHaveBeenCalledOnce()
  expect(chatWithImage).not.toHaveBeenCalled()
})

test('PNG registration is data-only: arbitrary URLs, unknown IDs and mixed render fields are rejected', () => {
  for (const render of [{ kind: 'illustration', illustrationId: 'https://example.com/drawing.png' }, { kind: 'illustration', illustrationId: 'missing-id' }, { ...rabbit.render, url: 'https://example.com/a.png' }, { ...rabbit.render, recipeId: 'rabbit-3' }]) {
    expect(sanitizeScenePlan(makePlan([{ ...rabbit, render }]))).toBeNull()
  }
  expect(sanitizeScenePlan(makePlan([{ ...rabbit, box: { x: .05, y: .05, width: .9, height: .9 } }]))).not.toBeNull()
  expect(sanitizeScenePlan({ ...makePlan(), materialProfile: { style: 'invented', detail: 'rich' } })).toBeNull()
})

test('same-profile authored SVG and PNG compile locally, preserve proportions and make no model/image calls', async () => {
  const cloud = { ...rabbit, id: 'cloud_1', name: '云朵', aliases: ['云'], role: 'support', essential: ['圆润云朵'], render: { kind: 'recipe', recipeId: 'cloud-3' }, box: { x: .65, y: .1, width: .3, height: .2 } }
  const plan = { ...makePlan([rabbit, cloud]), materialProfile: profile }, chatText = vi.fn(), chatWithImage = vi.fn()
  const result = await generateNiloScene(input('render', plan), { chatText, chatWithImage })
  expect(result.status).toBe('ready')
  expect(result.objects.map(item => item.proposal.template)).toEqual(['illustration', 'custom'])
  expect(result.objects[0].proposal).toMatchObject({ illustrationId: rabbit.render.illustrationId, subject: '小兔子' })
  expect(result.objects[0].proposal.width * 1.4 / result.objects[0].proposal.height).toBeCloseTo(1)
  expect(result.metrics.compiled).toBe(2)
  expect(chatText).not.toHaveBeenCalled(); expect(chatWithImage).not.toHaveBeenCalled()
})

test('mixed detail, crude primitive substitution and false material identity require correction in the same bounded plan repair', async () => {
  const rich = { ...rabbit, id: 'bookshop_1', name: '书店', render: { kind: 'illustration', illustrationId: 'illustration-bookshop' } }
  const chatText = vi.fn().mockResolvedValueOnce({ plan: makePlan([rabbit, rich]) }).mockResolvedValueOnce({ plan: makePlan() })
  expect(await generateNiloScene(input('plan'), { chatText })).toMatchObject({ status: 'proposed', metrics: { plans: 2, repairs: 1 } })
  expect(chatText.mock.calls[1][0]).toContain('shared profile is storybook/simple')
  const primitive = vi.fn(async () => ({ plan: makePlan([{ ...rabbit, render: { kind: 'compose', primitive: 'castle' }, box: { x: .3, y: .2, width: .4, height: .4 } }]) }))
  expect(await generateNiloScene(input('plan'), { chatText: primitive })).toMatchObject({ status: 'unavailable', reason: 'invalid_plan' })
  const renamed = vi.fn(async () => ({ plan: makePlan([{ ...rabbit, name: '城堡', render: { kind: 'illustration', illustrationId: 'illustration-library-treehouse-beginner-01' } }]) }))
  expect(await generateNiloScene(input('plan'), { chatText: renamed })).toMatchObject({ status: 'unavailable', reason: 'invalid_plan' })
})

test('live ocean connector mislabeling uses the existing single repair and cannot reach rendering as bubbles', async () => {
  const main = [
    { ...rabbit, id: 'fish_1', name: '小鱼', aliases: ['鱼'], essential: ['扇尾金鱼外形'], render: { kind: 'illustration', illustrationId: 'illustration-library-fish-medium-01' } },
    { ...rabbit, id: 'jellyfish_1', name: '小水母', aliases: ['水母'], essential: ['伞状身体', '细长触手'], render: { kind: 'illustration', illustrationId: 'illustration-library-jellyfish-medium-01' } },
  ]
  const water = { ...rabbit, id: 'waterline_1', name: '水纹线', aliases: ['水纹', '曲线'], role: 'support', essential: ['三条弯曲的水流线'], render: { kind: 'compose', primitive: 'path', parameters: { curve: 'right' } }, box: { x: .1, y: .74, width: .4, height: .18 } }
  const bubble = { ...water, id: 'bubble_1', name: '小气泡', aliases: ['气泡', '泡泡'], essential: ['几颗上升的小圆泡'], render: { kind: 'compose', primitive: 'path', parameters: { curve: 'left' } }, box: { x: .52, y: .08, width: .36, height: .16 } }
  const malformed = makePlan([...main, water, bubble]), fixed = { ...makePlan([...main, { ...water, render: { kind: 'compose', primitive: 'water', parameters: { rows: 3 } } }]), summary: '小鱼和水母之间有几条水纹。' }
  const request = { ...input('plan'), utterance: '画一个精美的海底世界场景，有小鱼和水母' }
  const chatText = vi.fn().mockResolvedValueOnce({ plan: malformed }).mockResolvedValueOnce({ plan: fixed })
  const result = await generateNiloScene(request, { chatText })
  expect(result).toMatchObject({ status: 'proposed', metrics: { plans: 2, repairs: 1 } })
  expect(result.plan.objects.map(object => object.id)).toEqual(['fish_1', 'jellyfish_1', 'waterline_1'])
  expect(chatText.mock.calls[1][0]).toContain('Object waterline_1: compose/path cannot depict')
  expect(chatText.mock.calls[1][0]).toContain('Object bubble_1: compose/path cannot depict')
  expect(chatText.mock.calls[1][0]).toContain('an explicitly requested feature must remain')
  const rendered = await generateNiloScene(input('render', result.plan))
  expect(rendered).toMatchObject({ status: 'ready', metrics: { compiled: 3, customCalls: 0 } })
  expect(await generateNiloScene(input('render', { ...malformed, materialProfile: result.plan.materialProfile }))).toMatchObject({ status: 'unavailable', reason: 'invalid_plan' })
})

test('curation forbids newly selecting a rejected PNG while the saved reference remains restorable and reusable', async () => {
  const plan = { ...makePlan(), materialProfile: profile }
  const before = await generateNiloScene(input('render', plan))
  expect(before.status).toBe('ready')
  setMaterialCuration({ ...initial, decisions: { ...initial.decisions, [rabbit.render.illustrationId]: 'reject' } })
  vi.spyOn(curationStore, 'refreshMaterialCuration').mockImplementation(() => getMaterialCuration())
  expect(sanitizeScenePlan(plan)).not.toBeNull()
  expect(await generateNiloScene(input('render', plan))).toMatchObject({ status: 'unavailable', reason: 'invalid_plan' })
  const restore = input('render', plan); restore.context.previousScene = { plan, objects: before.objects }
  expect(await generateNiloScene(restore)).toMatchObject({ status: 'ready', metrics: { reused: 1, compiled: 0 } })
  restore.context.previousScene.objects[0].proposal.illustrationId = 'illustration-library-rabbit-medium-01'
  expect(() => sanitizeSceneInput(restore)).toThrow('previous scene material')
})

test('a fresh scene request keeps the old composition only as recency, while a local edit retains the locked plan', async () => {
  const previous = makePlan(), fresh = { ...input('plan', previous), utterance: '换个新的梦幻场景' }
  const clean = sanitizeSceneInput(fresh)
  expect(clean.plan).toBeUndefined()
  expect(clean.context.history.at(-1).text).toContain(previous.summary)
  expect(clean.context.recentRecipeIds).toContain(rabbit.render.illustrationId)
  const local = sanitizeSceneInput({ ...fresh, utterance: '把小兔子换成树屋' })
  expect(local.plan.objects[0].id).toBe('rabbit_1')
  expect(local.plan.objects[0].render.illustrationId).toBe(rabbit.render.illustrationId)
})

test('live small-cloud label survives rendering, frontend save/restore and subsequent scene reuse unchanged', async () => {
  const cloud = { ...rabbit, id: 'cloud_2', name: '小云朵', aliases: ['云朵'], role: 'support', essential: ['圆润云朵'], render: { kind: 'illustration', illustrationId: 'illustration-library-cloud-beginner-01' }, box: { x: .62, y: .06, width: .24, height: .18 } }
  const plan = { ...makePlan([rabbit, cloud]), summary: '小兔子旁边飘着一朵小云朵。', materialProfile: profile }
  const chatText = vi.fn(async () => ({ plan })), chatWithImage = vi.fn()
  const planned = await generateNiloScene(input('plan'), { chatText })
  expect(planned).toMatchObject({ status: 'proposed', metrics: { repairs: 0 } })
  const rendered = await generateNiloScene(input('render', planned.plan), { chatText, chatWithImage })
  expect(rendered).toMatchObject({ status: 'ready', metrics: { compiled: 2 } })
  expect(rendered.objects[1]).toMatchObject({ id: cloud.id, name: cloud.name, proposal: { illustrationId: cloud.render.illustrationId, subject: cloud.name } })
  expect(rendered.objects[1].proposal.width * 1.4 / rendered.objects[1].proposal.height).toBeCloseTo(1)
  expect(chatText).toHaveBeenCalledOnce()
  expect(chatWithImage).not.toHaveBeenCalled()

  const { sceneRenderResult } = await import('../../frontend/src/features/child/companion/sceneWorkflow.ts')
  const { validateTracingGuide } = await import('../../frontend/src/features/child/companion/tracingGuide.ts')
  const decoded = sceneRenderResult(rendered)
  expect(decoded).not.toBeNull()
  const saved = JSON.parse(JSON.stringify({ proposal: decoded.proposals[0], additions: decoded.proposals.slice(1), aspect: 1.4, scene: { plan: decoded.plan, objectIds: decoded.ids, view: 'outline' } }))
  expect(validateTracingGuide(saved)?.additions[0].subject).toBe(cloud.name)

  const movedPlan = structuredClone(rendered.plan)
  movedPlan.objects[1].box.x = .55
  const request = input('render', movedPlan)
  request.context.previousScene = { plan: rendered.plan, objects: rendered.objects }
  const edited = await generateNiloScene(request, { chatText, chatWithImage })
  expect(edited).toMatchObject({ status: 'ready', metrics: { reused: 2, compiled: 0 } })
  expect(edited.objects[1].proposal.subject).toBe(cloud.name)
  expect(edited.objects[1].proposal.x).toBeCloseTo(rendered.objects[1].proposal.x - .07)
})

test.each(['小城堡', '云朵城堡', '小云朵城堡'])('small-cloud synonym never legitimizes a different or compound subject: %s', async name => {
  const cloud = { ...rabbit, id: 'cloud_2', name, render: { kind: 'illustration', illustrationId: 'illustration-library-cloud-beginner-01' }, box: { x: .62, y: .06, width: .24, height: .18 } }
  // Without a profile this reaches the strict illustration proposal identity check.
  expect(await generateNiloScene(input('render', makePlan([cloud])))).toMatchObject({ status: 'unavailable', reason: 'invalid_object', failedObjectIds: ['cloud_2'] })
})

test('small-cloud synonym preserves genuine scene bounds rejection', async () => {
  const cloud = { ...rabbit, id: 'cloud_2', name: '小云朵', render: { kind: 'illustration', illustrationId: 'illustration-library-cloud-beginner-01' }, box: { x: .9, y: .06, width: .24, height: .18 } }
  await expect(generateNiloScene(input('render', makePlan([cloud])))).rejects.toThrow('valid scene plan required')
})
