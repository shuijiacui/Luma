import { expect, test, vi } from 'vitest'
import { parseExplicitSceneEdit, constrainExplicitSceneEdit, connectScenePaths } from '../src/services/niloSceneEdits.js'
import { compilePlannedScene } from '../src/services/niloSceneCompiler.js'
import { generateNiloScene } from '../src/services/niloScene.js'
import { sanitizeScenePlan } from '../../shared/niloSceneDrawing.mjs'
import { previousOpenScene } from '../scripts/fixtures/niloOpenScenes.mjs'

const previous = () => sanitizeScenePlan(previousOpenScene())
const context = { canvasAspect: 1.4, locale: 'zh' }

test.each([
  ['把月亮移到左上角，其他都保持原样', 'move', 'moon'],
  ['把月亮往左移一点，城堡和小路不要改', 'move', 'moon'],
  ['把城堡缩小一点，小路别动', 'resize', 'castle'],
  ['放大月亮一点', 'resize', 'moon'],
  ['把月亮换成太阳，城堡和小路不要改', 'replace', 'moon'],
  ['Move the moon to the top left corner, keep everything else unchanged', 'move', 'moon'],
  ['Make the moon bigger', 'resize', 'moon'],
  ['Replace the moon with a sun, leave the castle and path unchanged', 'replace', 'moon'],
])('consumes a complete unambiguous edit: %s', (utterance, type, targetId) => {
  const plan = previous()
  plan.objects.forEach(object => object.aliases.push(object.id))
  expect(parseExplicitSceneEdit(utterance, plan)).toMatchObject({ type, targetId })
})

test.each([
  '把月亮移到左上角，再画一个太阳', '把月亮换成太阳和星星', '把月亮放大一点然后向左移',
  '把月亮移到左上角会不会更好？', '不要移动月亮', '把不存在移到左上角', '把这个移到左上角',
  'Move the moon left and make it red', 'Replace the moon with a sun and a cloud',
  '把月亮改成红色', '把月亮改成另一个画法',
])('does not guess or partially execute an ambiguous/compound request: %s', utterance => {
  expect(parseExplicitSceneEdit(utterance, previous())).toBeNull()
})

test('moving an existing object cannot change material, outline, size or unrelated object properties', () => {
  const old = previous(), raw = structuredClone(old), before = structuredClone(old)
  raw.objects[0].essential = ['invented replacement building']; raw.objects[0].box.x = .1
  raw.objects[1].render.parameters.curve = 'right'
  raw.objects[2] = { ...raw.objects[2], essential: ['different crescent'], render: { kind: 'illustration', illustrationId: 'illustration-library-moon-beginner-01' }, box: { x: .1, y: .1, width: .4, height: .4 }, color: '#ff0000', rotation: 180 }
  raw.relations = [{ subjectId: 'path', relation: 'below', targetId: 'castle' }, { subjectId: 'moon', relation: 'left-of', targetId: 'castle' }]
  const rawBefore = structuredClone(raw)
  const result = compilePlannedScene(raw, { previousPlan: old, context: { ...context, utterance: '把月亮移到左上角，其他都保持原样' } })
  expect(result.issues).toEqual([])
  expect(sanitizeScenePlan(result.plan)).not.toBeNull()
  expect(result.plan.objects.slice(0, 2)).toEqual(old.objects.slice(0, 2))
  expect(result.plan.objects[2]).toEqual({ ...old.objects[2], box: { ...old.objects[2].box, x: .03, y: .03 } })
  expect(result.plan.summary).toContain('左上角')
  expect(result.plan).not.toHaveProperty('relations')
  expect(raw).toEqual(rawBefore); expect(old).toEqual(before)
})

test('resize keeps the original material, aspect and center, independent of the subject name', () => {
  const old = previous(), target = old.objects[2]
  target.id = 'flower'; target.name = '小花'; target.aliases = ['花']; target.render = { kind: 'recipe', recipeId: 'flower-0' }; target.essential = ['小花']
  const raw = structuredClone(old); raw.objects[2].render = { kind: 'generated' }
  const result = compilePlannedScene(raw, { previousPlan: old, context: { ...context, utterance: '把小花放大一点' } })
  expect(result.issues).toEqual([])
  const after = result.plan.objects[2]
  expect(after.render).toEqual(target.render); expect(after.essential).toEqual(target.essential)
  expect(after.box.width).toBeCloseTo(target.box.width * 1.15, 12)
  expect(after.box.height).toBeCloseTo(target.box.height * 1.15, 12)
  expect(after.box.x + after.box.width / 2).toBeCloseTo(target.box.x + target.box.width / 2, 12)
  expect(after.box.y + after.box.height / 2).toBeCloseTo(target.box.y + target.box.height / 2, 12)
  expect(result.plan.objects.slice(0, 2)).toEqual(old.objects.slice(0, 2))
})

test('replace changes only the named subject while preserving its frame and every unrelated object exactly', () => {
  const old = previous(), raw = structuredClone(old)
  raw.objects[0].essential = ['new castle detail']
  raw.objects[1].box.y += .05
  raw.objects[2] = { id: 'new_sun', name: '太阳', aliases: ['太阳'], role: 'main', essential: ['圆圆的太阳'],
    render: { kind: 'illustration', illustrationId: 'illustration-library-sun-beginner-01' }, color: '#ff0000' }
  raw.preserve = old.objects.slice(0, 2).map(object => ({ id: object.id, box: { ...object.box }, ...(object.connectTo ? { connectTo: object.connectTo } : {}) }))
  const before = structuredClone(raw)
  const result = compilePlannedScene(raw, { previousPlan: old, context: { ...context, utterance: '把月亮换成太阳，城堡和小路不要改' } })
  expect(result.issues).toEqual([])
  expect(sanitizeScenePlan(result.plan)).not.toBeNull()
  expect(result.plan.objects.slice(0, 2)).toEqual(old.objects.slice(0, 2))
  expect(result.plan.objects[2]).toMatchObject({ id: 'moon', name: '太阳', box: old.objects[2].box, role: old.objects[2].role, color: old.objects[2].color, render: raw.objects[2].render })
  expect(result.plan.preserve.every(item => typeof item === 'string')).toBe(true)
  expect(result.plan.summary).toContain('保持原来的大小')
  expect(raw).toEqual(before)
})

test.each([
  [{ id: 'unknown' }], [{ id: 'castle', box: { x: 0, y: 0, width: .1, height: .1 } }],
  [{ id: 'path', connectTo: 'moon' }], [{ id: 'castle', essential: ['invented'] }], [null], [''], 'castle',
])('invalid preserve metadata has a specific repair diagnostic and remains rejected: %j', preserve => {
  const raw = { ...previous(), preserve }, result = constrainExplicitSceneEdit(raw, { previousPlan: previous(), context })
  expect(result.issues.join(' ')).toContain('preserve')
  expect(result.issues.join(' ')).toContain('string')
  expect(sanitizeScenePlan(result.plan)).toBeNull()
})

test('a replacement cannot claim success with a wrong or missing new identity', () => {
  const result = compilePlannedScene(previous(), { previousPlan: previous(), context: { ...context, utterance: '把月亮换成太阳' } })
  expect(result.issues.join(' ')).toContain('exactly one matching replacement')
  expect(result.plan.objects[2].name).toBe('月亮')
})

test('impossible exact transforms report failure rather than silently clamping or shrinking the requested move', () => {
  const old = previous(); old.objects[2].box.x = .005
  const result = compilePlannedScene(old, { previousPlan: old, context: { ...context, utterance: '把月亮往左移一点' } })
  expect(result.issues.join(' ')).toContain('Do not clamp or substitute')
})

test('an exact requested move cannot bypass old-object collisions or child-ink preservation checks', () => {
  const old = previous()
  const onChild = compilePlannedScene(old, { previousPlan: old, context: { ...context, utterance: '把月亮移到左上角', scene: { childBounds: { x: 0, y: 0, width: .25, height: .25 } } } })
  expect(onChild.issues.join(' ')).toContain('cover existing child ink')
  const onBuilding = compilePlannedScene(old, { previousPlan: old, context: { ...context, utterance: '把月亮移到中间' } })
  expect(onBuilding.issues.join(' ')).toContain('overlapping visible silhouettes')
  expect(onChild.plan.objects[0]).toEqual(old.objects[0]); expect(onBuilding.plan.objects[0]).toEqual(old.objects[0])
})

test('service planning and cached rendering move only the target while keeping old path floating-point values exact', async () => {
  const old = previous(), fail = vi.fn(async () => { throw new Error('Unexpected model or generation call') })
  const before = await generateNiloScene({ stage: 'render', plan: old, context }, { chatText: fail, chatWithImage: fail })
  expect(before.status).toBe('ready')
  const raw = structuredClone(old)
  raw.objects[2].render = { kind: 'illustration', illustrationId: 'illustration-library-moon-beginner-01' }
  raw.objects[2].essential = ['different crescent']; delete raw.objects[2].box
  raw.relations = [{ subjectId: 'path', relation: 'below', targetId: 'castle' }]
  const chatText = vi.fn(async () => ({ plan: raw }))
  const planned = await generateNiloScene({ stage: 'plan', plan: old, utterance: '把月亮移到左上角，其他都保持原样', context: { ...context, previousScene: before } }, { chatText, chatWithImage: fail })
  expect(planned.status).toBe('proposed')
  const after = await generateNiloScene({ stage: 'render', plan: planned.plan, context: { ...context, previousScene: before } }, { chatText: fail, chatWithImage: fail })
  expect(after).toMatchObject({ status: 'ready', metrics: { reused: 3, customCalls: 0 } })
  for (const id of ['castle', 'path']) expect(after.objects.find(object => object.id === id)).toEqual(before.objects.find(object => object.id === id))
  const moved = after.objects.find(object => object.id === 'moon').proposal, original = before.objects.find(object => object.id === 'moon').proposal
  expect(moved.sketch).toEqual(original.sketch)
  expect(moved.width).toBe(original.width); expect(moved.height).toBe(original.height)
  expect(moved.x).toBeLessThan(.1); expect(moved.y).toBeLessThan(.1)
  expect(chatText).toHaveBeenCalledOnce(); expect(fail).not.toHaveBeenCalled()
  const reopened = await generateNiloScene({ stage: 'render', plan: after.plan, context: { ...context, previousScene: after } }, { chatText: fail, chatWithImage: fail })
  expect(reopened.objects).toEqual(after.objects)
})

test('a new generated variation with the same plan is not overwritten by old cached pixels', () => {
  const plan = { objects: [{ id: 'world', name: '世界', render: { kind: 'generated' }, box: { x: .1, y: .1, width: .8, height: .8 } }] }
  const previousScene = { plan, objects: [{ id: 'world', name: '世界', proposal: { template: 'generated', raster: { pngBase64: 'old' } } }] }
  const rendered = [{ id: 'world', name: '世界', proposal: { template: 'generated', raster: { pngBase64: 'new' } } }]
  expect(connectScenePaths(plan, rendered, 1.4, previousScene)).toEqual(rendered)
})

test('service replaces only one object and repairs verified preserve-object metadata without a second planning call', async () => {
  const old = previous(), fail = vi.fn(async () => { throw new Error('Unexpected extra provider call') })
  const before = await generateNiloScene({ stage: 'render', plan: old, context }, { chatText: fail, chatWithImage: fail })
  const raw = structuredClone(old)
  raw.objects[0].essential = ['unrequested changes']; raw.objects[1].box.y += .03
  raw.objects[2] = { id: 'sun', name: '太阳', aliases: ['太阳'], role: 'atmosphere', essential: ['太阳'], color: '#66729b', render: { kind: 'illustration', illustrationId: 'illustration-library-sun-beginner-01' } }
  raw.preserve = [{ id: 'castle', box: old.objects[0].box }, { id: 'path', box: old.objects[1].box, connectTo: 'castle' }]
  const chatText = vi.fn(async () => ({ plan: raw }))
  const planned = await generateNiloScene({ stage: 'plan', plan: old, utterance: '把月亮换成太阳，城堡和小路不要改', context: { ...context, previousScene: before } }, { chatText, chatWithImage: fail })
  expect(planned).toMatchObject({ status: 'proposed', metrics: { plans: 1, repairs: 0 } })
  const after = await generateNiloScene({ stage: 'render', plan: planned.plan, context: { ...context, previousScene: before } }, { chatText: fail, chatWithImage: fail })
  expect(after).toMatchObject({ status: 'ready', metrics: { reused: 2 } })
  for (const id of ['castle', 'path']) expect(after.objects.find(object => object.id === id)).toEqual(before.objects.find(object => object.id === id))
  expect(after.plan.objects[2].box).toEqual(old.objects[2].box)
  expect(after.objects.find(object => object.id === 'moon').proposal).toMatchObject({ subject: '太阳', template: 'illustration', illustrationId: 'illustration-library-sun-beginner-01' })
  expect(chatText).toHaveBeenCalledOnce(); expect(fail).not.toHaveBeenCalled()
})
