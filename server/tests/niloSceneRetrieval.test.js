import { expect, test, vi } from 'vitest'
import { buildSceneRetrievalPrompt, narrowSceneMaterials } from '../src/services/niloSceneRetrieval.js'
import { sceneMaterialContext } from '../src/services/niloSceneMaterials.js'
import { generateNiloScene } from '../src/services/niloScene.js'
import { LLMParseError } from '../src/services/llmClient.js'
import { getDrawingIllustration } from '../../shared/niloIllustrations.mjs'

function fixture() {
  return {
    profile: { style: 'storybook', detail: 'simple' }, lineFamily: 'reference',
    subjects: [
      { subject: 'tree', name: '树', variants: [{ id: 'tree-main', pose: '完整大树', visibleBounds: { left: .1, right: .9 } }, { id: 'tree-alternative', pose: '另一棵树' }] },
      { subject: 'flower', name: '花', variants: [{ id: 'flower-main' }] },
      { subject: 'whale', name: '鲸鱼', variants: [{ id: 'whale-old', pose: '保留原图' }] },
    ],
    semanticIndex: { columns: ['kind', 'id', 'subject', 'name', 'pose', 'roles', 'tags', 'geometry', 'support'], meaning: '实际形态与审核支撑事实', rows: [
      ['illustration', 'tree-main', 'tree', '树', '完整大树', 'setting', 'forest', 'complete-object', ''],
      ['illustration', 'flower-main', 'flower', '花', '展开的花瓣', 'accent', 'garden', 'complete-object', ''],
      ['recipe', 'boat-index-only', 'boat', '小船', '船身与帆完整', 'focal', 'river', 'complete-object', [0.2, 0.6, 0.3]],
      ['illustration', 'whale-old', 'whale', '鲸鱼', '喷泉占据背部', 'focal', 'sea', 'complete-object', 'no: spout occupies back'],
    ] },
    retainedRecipeIds: [], retainedIllustrationIds: [], requestedSubjects: ['tree'],
    unavailableRequestedSubjects: ['unicorn'], selection: { subjectCount: 3, variantCount: 4, indexedSubjectCount: 4, revision: false, semantic: true },
  }
}

test('retrieval sees the complete compact index and exact request without duplicate variants, geometry or planning work', () => {
  const materials = fixture(), snapshot = structuredClone(materials)
  const prompt = buildSceneRetrievalPrompt({ utterance: '树下的小船，不要星星', brief: { intent: '船在树下', requiredSubjects: ['树', '船'], excludedSubjects: ['星星'], motifs: [{ subject: '这不是额外要求' }] }, materials,
    previousPlan: { summary: '原来的鲸鱼', objects: [{ id: 'whale', name: '鲸鱼', essential: ['鲸鱼'], render: { kind: 'illustration', illustrationId: 'whale-old' }, box: { x: .2, y: .3, width: .4, height: .2 }, sketch: { paths: ['MALICIOUS-DRAWING-PATHS'] } }] } })
  expect(prompt).toContain('树下的小船，不要星星')
  expect(prompt).toContain('船在树下')
  expect(prompt).toContain('boat-index-only')
  expect(prompt).toContain('spout occupies back')
  expect(prompt).toContain('[0.2,0.6,0.3]')
  expect(prompt).toContain('faithful custom generation')
  expect(prompt).not.toContain('tree-alternative')
  expect(prompt).not.toContain('visibleBounds')
  expect(prompt).not.toContain('MALICIOUS-DRAWING-PATHS')
  expect(prompt).not.toContain('这不是额外要求')
  expect(materials).toEqual(snapshot)
})

test('keeps only selected variants and index rows, including selected rows absent from prioritized subjects', () => {
  const materials = fixture(), snapshot = structuredClone(materials)
  const narrowed = narrowSceneMaterials(materials, { ids: ['tree-main', 'boat-index-only'] })
  expect(narrowed.subjects.map(group => group.subject)).toEqual(['tree'])
  expect(narrowed.subjects[0].variants.map(item => item.id)).toEqual(['tree-main'])
  expect(narrowed.semanticIndex.rows.map(row => row[1])).toEqual(['tree-main', 'boat-index-only'])
  expect(narrowed.selection).toEqual({ subjectCount: 1, variantCount: 1, indexedSubjectCount: 2, revision: false, semantic: true, semanticRetrieval: true })
  expect(narrowed.unavailableRequestedSubjects).toEqual(['unicorn'])
  narrowed.subjects[0].variants[0].visibleBounds.left = .3
  narrowed.semanticIndex.rows[1][8][0] = .1
  expect(materials).toEqual(snapshot)
})

test('preserves retained candidates automatically without allowing the model to select an out-of-index variant', () => {
  const materials = fixture()
  materials.retainedIllustrationIds = ['whale-old', 'tree-alternative']
  materials.selection.revision = true
  const narrowed = narrowSceneMaterials(materials, { ids: ['flower-main'] })
  expect(narrowed.subjects.flatMap(group => group.variants.map(item => item.id))).toEqual(['tree-alternative', 'flower-main', 'whale-old'])
  expect(narrowed.semanticIndex.rows.map(row => row[1])).toEqual(['flower-main', 'whale-old'])
  expect(narrowed.retainedIllustrationIds).toEqual(materials.retainedIllustrationIds)
  expect(narrowSceneMaterials(materials, { ids: ['tree-alternative'] })).toBeNull()
})

test.each([null, {}, [], 'tree-main', { ids: [] }, { ids: ['unknown'] }, { ids: ['tree-alternative'] }, { ids: ['tree-main', 'unknown'] }, { ids: ['tree-main', 'tree-main'] }, { ids: [7] }, { ids: [' tree-main'] }, { ids: ['tree-main'], plan: {} }, { ids: Array(9).fill('tree-main') }])('invalid or empty retrieval fails open to full catalogue: %j', raw => {
  const materials = fixture(), snapshot = structuredClone(materials)
  expect(narrowSceneMaterials(materials, raw)).toBeNull()
  expect(materials).toEqual(snapshot)
})

test('does not infer selection authority when the full eligible index is missing', () => {
  const materials = fixture()
  delete materials.semanticIndex
  expect(narrowSceneMaterials(materials, { ids: ['tree-main'] })).toBeNull()
  expect(narrowSceneMaterials(null, { ids: ['tree-main'] })).toBeNull()
})

test('real full-catalogue retrieval can choose outside prioritized suggestions and substantially reduce the planning catalogue', () => {
  const materials = sceneMaterialContext({ utterance: '我想画一个以前没见过的奇妙世界', semanticBrief: { intent: '陌生奇妙世界', setting: '', mood: ['奇妙'], requiredSubjects: [], excludedSubjects: [], referenceOnlySubjects: [], motifs: [] } })
  const prioritized = new Set(materials.subjects.flatMap(group => group.variants.map(item => item.id)))
  const outside = materials.semanticIndex.rows.find(row => !prioritized.has(row[1]))
  expect(outside).toBeTruthy()
  const narrowed = narrowSceneMaterials(materials, { ids: [outside[1], materials.semanticIndex.rows.find(row => row !== outside)[1]] })
  expect(narrowed.semanticIndex.rows).toContainEqual(outside)
  expect(narrowed.semanticIndex.rows).toHaveLength(2)
  expect(JSON.stringify(narrowed).length).toBeLessThan(JSON.stringify(materials).length / 3)
})

const serviceInput = { stage: 'plan', utterance: '我想画一个神奇世界', context: { requestScope: 'scene', canvasAspect: 1.4, canvasSize: { width: 840, height: 600 } } }
const serviceBrief = { version: 1, intent: '一个神奇世界', setting: '神奇世界', mood: ['奇妙'], reference: [], requiredSubjects: [], excludedSubjects: [], referenceOnlySubjects: [], motifs: [], relationships: [] }
const stock = (subject, role = 'main') => {
  const id = `illustration-library-${subject}-beginner-01`, material = getDrawingIllustration(id)
  return { id: `${subject}_1`, name: material.name, aliases: [material.name], role, essential: [material.name], render: { kind: 'illustration', illustrationId: id } }
}
const servicePlan = (objects = [stock('tree'), stock('flower', 'support')]) => ({ version: 1, title: '一个新世界', request: serviceInput.utterance,
  summary: objects.map(object => object.name).join('和'), objects,
  relations: objects.length === 2 ? [{ subjectId: objects[1].id, relation: 'left-of', targetId: objects[0].id }] : [], preserve: [] })
const promptMaterials = prompt => JSON.parse(prompt.split('MATERIAL CONTEXT: ')[1].split('\nPREVIOUS PLAN: ')[0])
const approve = async () => ({ accepted: true, issues: [] })

test('an explicitly injected selector can narrow the scene index while the real registry remains authoritative', async () => {
  const ids = [stock('tree').render.illustrationId, stock('flower').render.illustrationId]
  const model = (plan = servicePlan(), selection = { ids }) => vi.fn(async (_prompt, options) => {
    if (options.kind === 'nilo_scene_understand') return { brief: serviceBrief }
    if (options.kind === 'nilo_scene_select') return selection
    if (options.kind === 'nilo_scene_plan') return { plan }
    throw new Error(`Unexpected model stage ${options.kind}`)
  })
  const retrieveMaterials = vi.fn(async () => ({ ids }))
  const chatText = model(), result = await generateNiloScene(serviceInput, { chatText, retrieveMaterials, reviewScene: approve })
  expect(result).toMatchObject({ status: 'proposed', metrics: { understandings: 1, retrievals: 1, plans: 1, repairs: 0, qualityReviews: 1 } })
  expect(chatText.mock.calls.map(([, options]) => options.kind)).toEqual(['nilo_scene_understand', 'nilo_scene_plan'])
  const fullIndex = retrieveMaterials.mock.calls[0][0].materials.semanticIndex, materials = promptMaterials(chatText.mock.calls[1][0])
  expect(fullIndex.rows.length).toBeGreaterThan(ids.length)
  expect(new Set(materials.semanticIndex.rows.map(row => row[1]))).toEqual(new Set(ids))
  expect(materials.subjects.flatMap(group => group.variants).every(item => ids.includes(item.id))).toBe(true)
  expect(materials.selection.semanticRetrieval).toBe(true)
  // Retrieval narrows model context, not the registered renderer's authority.
  // An eligible real stock image still works if the planner chooses it itself.
  const other = stock('moon'), anotherRealId = model(servicePlan([other]))
  expect(ids).not.toContain(other.render.illustrationId)
  const real = await generateNiloScene(serviceInput, { chatText: anotherRealId, retrieveMaterials, reviewScene: approve })
  expect(real).toMatchObject({ status: 'proposed', metrics: { repairs: 0 } })
  expect(real.plan.objects[0].render).toEqual(other.render)
  // Even an ID repeated by both selector and planner cannot create an asset.
  const fake = { ...stock('tree'), render: { kind: 'illustration', illustrationId: 'illustration-invented-retrieval-tree' } }
  const invalid = await generateNiloScene(serviceInput, { chatText: model(servicePlan([fake])),
    retrieveMaterials: async () => ({ ids: [fake.render.illustrationId] }), reviewScene: approve })
  expect(invalid).toMatchObject({ status: 'unavailable', reason: 'invalid_plan' })
  expect(invalid).not.toHaveProperty('plan')
})

test('malformed or unparseable retrieval falls back without repair and a simple object skips retrieval entirely', async () => {
  for (const selection of [{ ids: ['not-in-eligible-index'] }, new LLMParseError('truncated selection', '{"ids":[')]) {
    const retrieveMaterials = vi.fn(async () => { if (selection instanceof Error) throw selection; return selection })
    const chatText = vi.fn(async (_prompt, options) => {
      if (options.kind === 'nilo_scene_understand') return { brief: serviceBrief }
      if (options.kind === 'nilo_scene_select') {
        if (selection instanceof Error) throw selection
        return selection
      }
      if (options.kind === 'nilo_scene_plan') return { plan: servicePlan() }
      throw new Error(`Unexpected model stage ${options.kind}`)
    })
    const result = await generateNiloScene(serviceInput, { chatText, retrieveMaterials, reviewScene: approve })
    expect(result).toMatchObject({ status: 'proposed', metrics: { understandings: 1, retrievals: 1, plans: 1, repairs: 0 } })
    expect(chatText.mock.calls.map(([, options]) => options.kind)).toEqual(['nilo_scene_understand', 'nilo_scene_plan'])
    const fullIndex = retrieveMaterials.mock.calls[0][0].materials.semanticIndex, fallback = promptMaterials(chatText.mock.calls[1][0])
    expect(fallback.semanticIndex).toEqual(fullIndex)
    expect(fallback.selection.semanticRetrieval).toBeUndefined()
  }
  const sun = stock('sun'), chatText = vi.fn(async () => ({ plan: { ...servicePlan([sun]), request: '画一个太阳' } })), retrieveMaterials = vi.fn(() => { throw new Error('literal object must not retrieve') })
  const result = await generateNiloScene({ ...serviceInput, utterance: '画一个太阳', context: { ...serviceInput.context, requestScope: 'object' } }, { chatText, retrieveMaterials, reviewScene: approve })
  expect(result).toMatchObject({ status: 'proposed', metrics: { understandings: 0, retrievals: 0, plans: 1, repairs: 0 } })
  expect(chatText.mock.calls.map(([, options]) => options.kind)).toEqual(['nilo_scene_plan'])
  expect(retrieveMaterials).not.toHaveBeenCalled()
})
