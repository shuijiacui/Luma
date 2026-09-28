import { expect, test } from 'vitest'
import { drawingIllustrations, getDrawingIllustration } from '../../shared/niloIllustrations.mjs'
import { isMaterialEnabled } from '../../shared/niloCuration.mjs'
import { sceneMaterialContext, sceneMaterialProfileForPlan, sceneGenerationIssues, sceneGenerationPolicy, sceneIntentIssues, sceneMaterialStyleIssues } from '../src/services/niloSceneMaterials.js'
import { narrowSceneMaterialsLocally } from '../src/services/niloSceneRetrieval.js'
import { openScenePlanningPrompt } from '../src/services/niloOpenScenePrompt.js'

const brief = (utterance, overrides = {}) => ({ version: 1, intent: utterance, setting: utterance, mood: [], reference: [],
  requiredSubjects: [], preservedSubjects: [], excludedSubjects: [], referenceOnlySubjects: [], relationships: [], motifs: [], ...overrides })
const input = (utterance, changes = {}) => ({ utterance, locale: 'zh', rasterGeneration: true,
  context: { requestScope: 'scene', canvasAspect: 1.4, history: [] }, semanticBrief: brief(utterance), ...changes })
const generated = { objects: [{ id: 'new', name: '自行想出的新场景', essential: ['额外的水晶翅膀城堡'], render: { kind: 'generated' } }] }
const stock = material => ({ id: 'whole', name: material.name, essential: [material.name], role: 'main', render: { kind: 'illustration', illustrationId: material.id } })

test('the curated complete-scene inventory is offered alongside components without exposing rejected candidates', () => {
  const data = input('我想画一个从没见过的奇妙地方'), materials = sceneMaterialContext(data)
  const rawScenes = drawingIllustrations.filter(item => item.completeScene)
  expect(rawScenes).toHaveLength(81)
  const enabled = rawScenes.filter(item => isMaterialEnabled(item.id))
  expect(enabled).toHaveLength(14)
  expect(new Set(materials.completeSceneAlternatives.map(item => item.id))).toEqual(new Set(enabled.map(item => item.id)))
  expect(materials.inventory.components.length).toBeGreaterThan(20)
  expect(materials.inventory.combinations.length).toBeGreaterThan(0)
  expect(materials.inventory.completeScenes).toEqual(expect.arrayContaining(enabled.map(item => item.id)))
  for (const item of materials.completeSceneAlternatives) {
    expect(item).toMatchObject({ tier: 'scene', geometry: 'complete-scene', profile: { style: 'storybook', detail: 'moderate' } })
    expect(item.pose).toBe(getDrawingIllustration(item.id).label)
    expect(item.support).toContain('cannot')
  }
})

test('local narrowing is bounded, deterministic, read-only and retains literal requirements without a provider', () => {
  const data = input('画一只鲸鱼和一座树屋', { semanticBrief: brief('画一只鲸鱼和一座树屋', { requiredSubjects: ['鲸鱼', '树屋'] }) })
  const full = sceneMaterialContext(data, { random: () => 0 }), before = structuredClone(full)
  const selected = narrowSceneMaterialsLocally(full, data)
  expect(selected.selection).toMatchObject({ localRetrieval: true, semanticRetrieval: false })
  expect(selected.semanticIndex.rows.length).toBeLessThanOrEqual(40)
  expect(selected.semanticIndex.rows.map(row => row[2])).toEqual(expect.arrayContaining(['whale', 'treehouse']))
  expect(selected.completeSceneAlternatives.length).toBeLessThanOrEqual(16)
  expect(JSON.stringify(selected).length).toBeLessThan(24000)
  expect(full).toEqual(before)
  expect(narrowSceneMaterialsLocally(full, data)).toEqual(selected)
  expect(selected.requestedSubjects).toEqual(full.requestedSubjects)
  expect(selected.generationPolicy).toEqual(full.generationPolicy)
})

test('whole-scene profile substitution is possible only for one offered whole image, never mixed detail', () => {
  const materials = sceneMaterialContext(input('画一个特别的地方'))
  const material = getDrawingIllustration(materials.completeSceneAlternatives[0].id)
  const plan = { objects: [stock(material)] }
  const actual = sceneMaterialProfileForPlan(plan, materials)
  expect(actual).toEqual({ style: 'storybook', detail: 'moderate' })
  expect(sceneMaterialStyleIssues(plan, actual)).toEqual([])
  expect(sceneMaterialProfileForPlan({ objects: [...plan.objects, { id: 'extra', render: { kind: 'compose' } }] }, materials)).toEqual(materials.profile)
  expect(sceneMaterialStyleIssues(plan, materials.profile).length).toBeGreaterThan(0)
  const simple = sceneMaterialContext(input('画一个简单的地方'))
  expect(simple.completeSceneAlternatives).toEqual([])
  expect(sceneMaterialProfileForPlan(plan, simple)).toEqual(simple.profile)
  const old = sceneMaterialContext({ ...input('把小树移到右边'), plan: { materialProfile: materials.profile, objects: [] } })
  expect(old.completeSceneAlternatives).toEqual([])
})

test('registered complete-scene contents fulfil real nouns but cannot masquerade as detached parts', () => {
  const material = drawingIllustrations.find(item => item.completeScene && item.subject === 'scene-whale-town' && isMaterialEnabled(item.id))
  const plan = { summary: material.label, objects: [stock(material)] }
  const meaning = brief('鲸鱼和小房子', { requiredSubjects: ['鲸鱼', '小房子'] })
  expect(sceneIntentIssues(plan, meaning)).toEqual([])
  expect(sceneMaterialStyleIssues(plan, { style: 'storybook', detail: 'moderate' })).toEqual([])
  expect(sceneMaterialStyleIssues({ objects: [{ ...stock(material), name: '鲸鱼' }] }, { style: 'storybook', detail: 'moderate' }).join(' ')).toContain('not 鲸鱼')
  const forged = { summary: '一座学校', objects: [{ ...stock(material), aliases: ['学校'], essential: ['学校'] }] }
  expect(sceneIntentIssues(forged, brief('学校', { requiredSubjects: ['学校'] })).join(' ')).toContain('missing')
  expect(sceneIntentIssues(plan, brief('不要鲸鱼', { excludedSubjects: ['鲸鱼'] })).join(' ')).toContain('excluded')
})

test('complete scenes containing excluded or preserved subjects are unavailable as new alternatives', () => {
  const excluded = input('我想画小镇，不要鲸鱼', { semanticBrief: brief('我想画小镇，不要鲸鱼', { excludedSubjects: ['鲸鱼'] }) })
  expect(sceneMaterialContext(excluded).completeSceneAlternatives.some(item => item.contents.includes('whale'))).toBe(false)
  const preserved = input('在我的鲸鱼上方画花园，鲸鱼别动', {
    context: { requestScope: 'scene', history: [], scene: { childBounds: { x: .2, y: .7, width: .5, height: .2 } } },
    semanticBrief: brief('在我的鲸鱼上方画花园，鲸鱼别动', { preservedSubjects: ['鲸鱼'] }) })
  expect(sceneMaterialContext(preserved).completeSceneAlternatives.some(item => item.contents.includes('whale'))).toBe(false)
})

test.each(['我想画一个魔法世界', '画一个安静而神奇的地方', 'A dreamy world like a storybook', '一个很勇敢的世界'])('vague scenes cannot authorize invented generated requirements: %s', utterance => {
  const data = input(utterance), materials = sceneMaterialContext(data)
  expect(sceneGenerationPolicy(data, materials).allowGenerated).toBe(false)
  expect(sceneGenerationIssues(generated, data, materials).join(' ')).toContain('broad setting/mood')
  expect(sceneGenerationIssues({ objects: [] }, data, materials)).toEqual([])
  const forged = { ...data, semanticBrief: { ...data.semanticBrief, relationships: ['一个长水晶翅膀的城堡'] } }
  expect(sceneGenerationPolicy(forged, materials).allowGenerated).toBe(false)
})

test.each([
  ['画一只长着翅膀的兔子', ['长着翅膀的兔子']],
  ['画一个阿古斯精灵', ['阿古斯精灵']],
  ['画一座由玻璃做成的小屋', ['小屋']],
  ['画一只透明的兔子', ['透明的兔子']],
  ['画一只戴墨镜的狗', ['戴墨镜的狗']],
  ['Draw a house suspended underneath an enormous leaf', ['house', 'leaf']],
])('explicit missing poses, materials, interactions and unfamiliar identities remain allowed: %s', (utterance, requiredSubjects) => {
  const data = input(utterance, { semanticBrief: brief(utterance, { requiredSubjects }) }), materials = sceneMaterialContext(data)
  expect(sceneGenerationPolicy(data, materials).allowGenerated).toBe(true)
  expect(sceneGenerationIssues(generated, data, materials)).toEqual([])
  expect(sceneGenerationIssues({ objects: [...generated.objects, { ...generated.objects[0], id: 'two' }] }, data, materials).length).toBeGreaterThan(0)
  expect(data.semanticBrief.requiredSubjects).toEqual(requiredSubjects)
})

test('ordinary size, position and appearance cannot alone authorize new generated shapes', () => {
  const utterance = '画一朵巨大的花朵和一只可爱的小兔子'
  const data = input(utterance, { semanticBrief: brief(utterance, { requiredSubjects: ['巨大的花朵', '可爱的小兔子'] }) })
  const materials = sceneMaterialContext(data)
  expect(sceneGenerationPolicy(data, materials).allowGenerated).toBe(false)
  expect(sceneGenerationIssues(generated, data, materials).length).toBeGreaterThan(0)
})

test('a literal requested relation is preserved even without a theme label, and previous generated objects remain reusable', () => {
  const utterance = '画一条小鱼住在树洞里面', relation = '小鱼住在树洞里面'
  const data = input(utterance, { semanticBrief: brief(utterance, { requiredSubjects: ['小鱼'], relationships: [relation] }) })
  const materials = sceneMaterialContext(data)
  expect(sceneGenerationPolicy(data, materials).explicitRequirements).toContain(relation)
  expect(sceneGenerationIssues(generated, data, materials)).toEqual([])
  expect(sceneGenerationIssues(generated, { ...input('换一种画法'), plan: generated }, sceneMaterialContext(input('换一种画法')))).toEqual([])
})

test('planning exposes stock-first alternatives and the original feature contract without a generated default', () => {
  const data = input('画一只透明的兔子，不要城堡', { semanticBrief: brief('画一只透明的兔子，不要城堡', { requiredSubjects: ['透明的兔子'], excludedSubjects: ['城堡'] }) })
  const materials = narrowSceneMaterialsLocally(sceneMaterialContext(data), data)
  const prompt = openScenePlanningPrompt(data, materials, data.semanticBrief)
  expect(prompt).toContain('THREE inventory levels')
  expect(prompt).toContain('cannot be cut apart')
  expect(prompt).toContain('smallest focal subject')
  expect(prompt).toContain('透明的兔子')
  expect(prompt).toContain('不要城堡')
  expect(prompt).not.toContain('Return exactly one main object')
  expect(prompt).not.toContain('application uses ONE integrated generated reference')
})
