import { expect, test, vi } from 'vitest'
import { generateNiloScene as generateScene } from '../src/services/niloScene.js'
import { getDrawingIllustration } from '../../shared/niloIllustrations.mjs'
import illustrationBounds from '../../shared/niloIllustrationTracing.json' with { type: 'json' }

// Inject only the independent quality verdict: these fixtures exercise the
// retrieval/layout/render contract and are not evidence of artistic quality.
const generateNiloScene = (input, options) => generateScene(input, { retrieveMaterials: async () => null, reviewScene: async () => ({ accepted: true, issues: [] }), ...options })

const briefFor = (setting, changes = {}) => ({ version: 1, intent: setting, setting, mood: ['好奇'], reference: [], requiredSubjects: [], excludedSubjects: [], referenceOnlySubjects: [],
  motifs: [{ subject: '特别的住处', role: 'focal', reason: '让这个地方值得探索' }], relationships: [], ...changes })
const stock = (subject, role = 'support') => {
  const id = `illustration-library-${subject}-beginner-01`, material = getDrawingIllustration(id)
  return { id: `${subject}_1`, name: material.name, aliases: [material.name], role, essential: [material.name], render: { kind: 'illustration', illustrationId: id } }
}
const planFor = (title, objects, relations = []) => ({ version: 1, title, request: `我想画${title}`, summary: title, objects, relations, preserve: [] })
const context = { requestScope: 'scene', canvasAspect: 1.4, canvasSize: { width: 840, height: 600 }, scene: { childBounds: { x: .03, y: .85, width: .12, height: .08 } } }
const modelFor = (brief, plan) => vi.fn(async (prompt, options) => {
  if (options.kind === 'nilo_scene_understand') return { brief }
  if (options.kind === 'nilo_scene_plan') return { plan }
  throw new Error('Registered materials must not need model-generated geometry')
})
const materialsFrom = prompt => JSON.parse(prompt.split('MATERIAL CONTEXT: ')[1].split('\nPREVIOUS PLAN: ')[0])
function visible(proposal) {
  const bounds = illustrationBounds[proposal.illustrationId]
  return { left: proposal.x + proposal.width * bounds.left, right: proposal.x + proposal.width * bounds.right,
    top: proposal.y + proposal.height * bounds.top, bottom: proposal.y + proposal.height * bounds.bottom }
}

test.each([
  { title: '糖果星球的世界', subjects: ['cake', 'icecream', 'cupcake'] },
  { title: '把时间藏起来的世界', subjects: ['clock', 'gift', 'door'] },
  { title: '声音会长出来的世界', subjects: ['guitar', 'flower', 'tree'] },
])('full indexed materials and relation geometry carry an unfamiliar idea through confirmation and rendering: $title', async ({ title, subjects }) => {
  const objects = subjects.map((subject, index) => stock(subject, index ? 'support' : 'main'))
  const relations = [{ subjectId: objects[1].id, relation: 'left-of', targetId: objects[0].id }, { subjectId: objects[2].id, relation: 'right-of', targetId: objects[0].id }]
  const chatText = modelFor(briefFor(title), planFor(title, objects, relations))
  const planned = await generateNiloScene({ stage: 'plan', utterance: `我想画${title}`, context }, { chatText })
  expect(planned).toMatchObject({ status: 'proposed', metrics: { understandings: 1, plans: 1, repairs: 0, customCalls: 0 } })
  expect(planned.plan.objects.map(object => object.render.illustrationId)).toEqual(objects.map(object => object.render.illustrationId))
  expect(planned).not.toHaveProperty('objects') // Confirmation precedes any reference being shown.
  const materials = materialsFrom(chatText.mock.calls.find(([, options]) => options.kind === 'nilo_scene_plan')[0])
  for (const object of objects) expect(materials.semanticIndex.rows.some(row => row[1] === object.render.illustrationId)).toBe(true)
  expect(materials.subjects.some(group => group.subject === subjects[0])).toBe(false)
  expect(planned.plan.objects.every(object => object.box && object.box.width > 0 && object.box.height > 0)).toBe(true)
  const rendered = await generateNiloScene({ stage: 'render', utterance: `我想画${title}`, context, plan: planned.plan }, { chatText })
  expect(rendered).toMatchObject({ status: 'ready', metrics: { compiled: 3, customCalls: 0, plans: 0, understandings: 0 } })
  expect(chatText).toHaveBeenCalledTimes(2)
  const [main, left, right] = objects.map(object => visible(rendered.objects.find(item => item.id === object.id).proposal))
  expect(left.right).toBeLessThan(main.left)
  expect(right.left).toBeGreaterThan(main.right)
  for (const item of rendered.objects) {
    expect(item.proposal.template).toBe('illustration')
    expect(item.proposal.x).toBeGreaterThanOrEqual(0)
    expect(item.proposal.y).toBeGreaterThanOrEqual(0)
    expect(item.proposal.x + item.proposal.width).toBeLessThanOrEqual(1)
    expect(item.proposal.y + item.proposal.height).toBeLessThanOrEqual(1)
  }
})

test.each([
  { kind: 'illustration', illustrationId: 'illustration-invented-magic-world' },
  { kind: 'illustration', illustrationId: 'https://example.invalid/scene.png' },
  { kind: 'illustration', illustrationId: 'illustration-library-flower-beginner-01', url: 'https://example.invalid/scene.png' },
])('broader semantic choice does not allow unknown assets or arbitrary URLs: %j', async render => {
  const title = '特别的魔法世界', object = { ...stock('flower', 'main'), render }
  const chatText = modelFor(briefFor(title), planFor(title, [object]))
  const result = await generateNiloScene({ stage: 'plan', utterance: `我想画${title}`, context }, { chatText })
  expect(result).toMatchObject({ status: 'unavailable', reason: 'invalid_plan' })
  expect(result).not.toHaveProperty('plan')
})

test('a broad scene cannot drop an explicitly required known subject after choosing from the wider index', async () => {
  const title = '有鲸鱼的魔法世界', chatText = modelFor(briefFor(title, { requiredSubjects: ['鲸鱼'] }), planFor(title, [stock('flower', 'main')]))
  const result = await generateNiloScene({ stage: 'plan', utterance: `我想画${title}`, context }, { chatText })
  expect(result).toMatchObject({ status: 'unavailable', reason: 'invalid_plan' })
  expect(chatText.mock.calls.at(-1)[0]).toContain('explicitly required subject whale is missing')
})

test('a broad scene cannot quietly omit an unfamiliar explicitly required creature', async () => {
  const title = '阿古斯精灵住的魔法世界', chatText = modelFor(briefFor(title, { requiredSubjects: ['阿古斯精灵'] }), planFor(title, [stock('flower', 'main')]))
  const result = await generateNiloScene({ stage: 'plan', utterance: `我想画${title}`, context }, { chatText })
  expect(result).toMatchObject({ status: 'unavailable', reason: 'invalid_plan' })
  expect(result).not.toHaveProperty('plan')
})

test.each(['魔法世界', '藏着时间的地方', '糖果星球'])('a setting mistakenly classified as one required subject can still become a stock composition: %s', title => {
  const objects = [stock('clock', 'main'), stock('gift')]
  const relations = [{ subjectId: objects[1].id, relation: 'left-of', targetId: objects[0].id }]
  const chatText = modelFor(briefFor(title, { requiredSubjects: [title] }), planFor(title, objects, relations))
  return generateNiloScene({ stage: 'plan', utterance: `我想画${title}`, context }, { chatText }).then(async planned => {
    expect(planned).toMatchObject({ status: 'proposed', metrics: { plans: 1, repairs: 0, customCalls: 0 } })
    expect(planned.plan.objects.every(object => object.render.kind === 'illustration')).toBe(true)
    const rendered = await generateNiloScene({ stage: 'render', utterance: `我想画${title}`, context, plan: planned.plan }, { chatText })
    expect(rendered).toMatchObject({ status: 'ready', metrics: { compiled: 2, customCalls: 0 } })
    expect(chatText).toHaveBeenCalledTimes(2)
  })
})

test('natural flower and generic house nouns normalize matching material names without losing the size idea', async () => {
  const title = '巨大的花朵比小房子还高的世界'
  const objects = [{ ...stock('flower', 'main'), name: '巨大的花朵', essential: ['花朵'] }, { ...stock('cottage'), name: '小房子' }]
  const relations = [{ subjectId: 'flower_1', relation: 'larger-than', targetId: 'cottage_1' }, { subjectId: 'cottage_1', relation: 'right-of', targetId: 'flower_1' }]
  const chatText = modelFor(briefFor(title, { requiredSubjects: ['巨大的花朵', '小房子'] }), planFor(title, objects, relations))
  const planned = await generateNiloScene({ stage: 'plan', utterance: `我想画${title}`, context }, { chatText })
  expect(planned).toMatchObject({ status: 'proposed', metrics: { plans: 1, repairs: 0, customCalls: 0 } })
  const flower = planned.plan.objects.find(object => object.id === 'flower_1')
  expect(flower.name).toBe('小花')
  expect(flower.aliases).toContain('巨大的花朵')
  expect(flower.essential).toEqual(['花朵'])
  expect(flower.render).toEqual(objects[0].render)
  const rendered = await generateNiloScene({ stage: 'render', utterance: `我想画${title}`, context, plan: planned.plan }, { chatText })
  expect(rendered).toMatchObject({ status: 'ready', metrics: { compiled: 2, customCalls: 0 } })
  const flowers = visible(rendered.objects.find(object => object.id === 'flower_1').proposal)
  const house = visible(rendered.objects.find(object => object.id === 'cottage_1').proposal)
  expect(Math.max((flowers.right - flowers.left) * context.canvasAspect, flowers.bottom - flowers.top)).toBeGreaterThan(Math.max((house.right - house.left) * context.canvasAspect, house.bottom - house.top) * 1.35)
})
