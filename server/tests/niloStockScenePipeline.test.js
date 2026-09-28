import { expect, test, vi } from 'vitest'
import { generateNiloScene } from '../src/services/niloScene.js'
import { getDrawingIllustration } from '../../shared/niloIllustrations.mjs'
import { compilePlannedScene } from '../src/services/niloSceneCompiler.js'

// Stub only model decisions. These test the real catalogue/layout/projection
// pipeline and paid-call boundary, not artistic or live-model quality.
const context = { requestScope: 'scene', canvasAspect: 1.4, canvasSize: { width: 840, height: 600 }, history: [] }
const brief = (utterance, requiredSubjects = []) => ({ version: 1, intent: utterance, setting: '', mood: [], reference: [],
  requiredSubjects, preservedSubjects: [], excludedSubjects: [], referenceOnlySubjects: [], relationships: [] })
const materialsIn = prompt => JSON.parse(prompt.split('MATERIAL CONTEXT: ')[1].split('\nPREVIOUS PLAN: ')[0])
const object = (id, illustrationId, role = 'main') => {
  const material = getDrawingIllustration(illustrationId)
  return { id, name: material.name, role, essential: [material.name], render: { kind: 'illustration', illustrationId } }
}
const plan = (utterance, objects, extra = {}) => ({ version: 1, title: '新的小世界', summary: '新的小世界', request: utterance,
  objects, relations: [], preserve: [], ...extra })
const reviewScene = async () => ({ accepted: true, issues: [] })

test('an offered complete scene plans with its real profile and renders without an image call or retrieval model', async () => {
  const utterance = '我想画一个魔法世界', generateImage = vi.fn()
  let chosen
  const chatText = vi.fn(async (prompt, options) => {
    if (options.kind === 'nilo_scene_understand') return { brief: brief(utterance) }
    expect(options.kind).toBe('nilo_scene_plan')
    const materials = materialsIn(prompt)
    expect(materials.selection.localRetrieval).toBe(true)
    expect(materials.semanticIndex.rows.length).toBeLessThanOrEqual(40)
    chosen = materials.completeSceneAlternatives.find(item => item.subject === 'scene-magic-world')
    expect(chosen).toBeDefined()
    return { plan: plan(utterance, [object('whole', chosen.id)], { summary: chosen.pose }) }
  })
  const proposed = await generateNiloScene({ stage: 'plan', utterance, context }, { chatText, generateImage, reviewScene })
  expect(proposed).toMatchObject({ status: 'proposed', plan: { materialProfile: { style: 'storybook', detail: 'moderate' } },
    metrics: { understandings: 1, plans: 1, retrievals: 0, imageCalls: 0 } })
  const rendered = await generateNiloScene({ stage: 'render', utterance, context, plan: proposed.plan }, { chatText, generateImage, reviewScene })
  expect(rendered).toMatchObject({ status: 'ready', metrics: { compiled: 1, imageCalls: 0, customCalls: 0 } })
  expect(rendered.objects[0].proposal).toMatchObject({ template: 'illustration', illustrationId: chosen.id })
  expect(generateImage).not.toHaveBeenCalled()
  expect(chatText).toHaveBeenCalledTimes(2)
})

test('separate explicit stock subjects remain selectable and compose without regenerating the setting', async () => {
  const utterance = '画一只鲸鱼，云朵在鲸鱼上方', generateImage = vi.fn()
  const chatText = vi.fn(async (prompt, options) => {
    if (options.kind === 'nilo_scene_understand') return { brief: brief(utterance, ['鲸鱼', '云朵']) }
    const materials = materialsIn(prompt)
    const whale = materials.semanticIndex.rows.find(row => row[2] === 'whale')
    const cloud = materials.semanticIndex.rows.find(row => row[2] === 'cloud')
    expect(whale).toBeDefined(); expect(cloud).toBeDefined()
    return { plan: plan(utterance, [object('whale', whale[1]), object('cloud', cloud[1], 'support')], {
      summary: '鲸鱼上方有一朵云朵。', relations: [{ subjectId: 'cloud', relation: 'above', targetId: 'whale' }] }) }
  })
  const proposed = await generateNiloScene({ stage: 'plan', utterance, context }, { chatText, generateImage, reviewScene })
  expect(proposed.status).toBe('proposed')
  const rendered = await generateNiloScene({ stage: 'render', utterance, context, plan: proposed.plan }, { chatText, generateImage, reviewScene })
  expect(rendered).toMatchObject({ status: 'ready', metrics: { compiled: 2, imageCalls: 0 } })
  expect(generateImage).not.toHaveBeenCalled()
})

test('an explicitly missing feature permits only the minimal focal invention while stock surroundings stay stock', async () => {
  const utterance = '画一只透明的兔子，旁边有云朵', generateImage = vi.fn()
  const chatText = vi.fn(async (prompt, options) => {
    if (options.kind === 'nilo_scene_understand') return { brief: brief(utterance, ['透明的兔子', '云朵']) }
    const materials = materialsIn(prompt), cloud = materials.semanticIndex.rows.find(row => row[2] === 'cloud')
    expect(materials.generationPolicy.allowGenerated).toBe(true)
    return { plan: plan(utterance, [
      { id: 'rabbit', name: '透明的兔子', role: 'main', essential: ['透明的兔子'], render: { kind: 'generated' } },
      object('cloud', cloud[1], 'support'),
    ], { summary: '透明的兔子旁边有一朵云朵。', relations: [{ subjectId: 'cloud', relation: 'right-of', targetId: 'rabbit' }] }) }
  })
  const result = await generateNiloScene({ stage: 'plan', utterance, context }, { chatText, generateImage, reviewScene })
  expect(result.status).toBe('proposed')
  expect(result.plan.objects.map(item => item.render.kind)).toEqual(['generated', 'illustration'])
  expect(generateImage).not.toHaveBeenCalled() // Child confirmation still comes first.
})

test('a broad mood cannot buy an invented whole image even when the image service is enabled', async () => {
  const utterance = '画一个奇妙的世界', generateImage = vi.fn(), review = vi.fn(reviewScene)
  const chatText = vi.fn(async (_prompt, options) => options.kind === 'nilo_scene_understand'
    ? { brief: brief(utterance) } : { plan: plan(utterance, [{ id: 'world', name: '奇妙世界', role: 'main',
      essential: ['自行想象的新城堡'], render: { kind: 'generated' } }]) })
  const result = await generateNiloScene({ stage: 'plan', utterance, context }, { chatText, generateImage, reviewScene: review })
  expect(result).toMatchObject({ status: 'unavailable', reason: 'invalid_plan', metrics: { plans: 2, imageCalls: 0 } })
  expect(generateImage).not.toHaveBeenCalled()
  expect(review).not.toHaveBeenCalled()
})

test('a complete-scene image boundary is never accepted as a whale support surface', () => {
  const whole = object('whole', 'illustration-scene-whale-town-21881c16d14c')
  const house = object('house', 'illustration-library-cottage-beginner-01', 'support')
  const result = compilePlannedScene(plan('再加一座房子', [whole, house], {
    relations: [{ subjectId: 'house', relation: 'on', targetId: 'whole' }] }), { context })
  expect(result.issues.join(' ')).toMatch(/complete scene|indivisible|support/i)
})
