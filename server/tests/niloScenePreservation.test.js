import { expect, test, vi } from 'vitest'
import { bindPreservedChildContent, preservedChildSubjects, preservedOnlySubjects, requestsAdditionalInstance } from '../src/services/niloScenePreservation.js'
import { alignGeneratedSceneContract } from '../src/services/niloSceneContract.js'
import { sceneAdditionRequiredSubjects, sceneIntentIssues, sceneMaterialContext } from '../src/services/niloSceneMaterials.js'
import { sanitizeSceneUnderstanding, ungroundedSceneSubjects } from '../src/services/niloSceneIntent.js'
import { generateNiloScene } from '../src/services/niloScene.js'

const childBounds = { x: .32, y: .79, width: .23, height: .13 }
const brief = (preserved, added) => ({ version: 1, intent: '在已有画面上方添加新内容', reference: [], setting: '', mood: [],
  // Deliberately include the existing noun in requiredSubjects, reproducing a
  // plausible interpretation mistake rather than trusting the model to fix it.
  requiredSubjects: [preserved, added], preservedSubjects: [preserved], excludedSubjects: [], referenceOnlySubjects: [], motifs: [], relationships: [] })
const input = (preserved = '小船', added = '花朵') => ({ stage: 'plan', locale: 'zh', rasterGeneration: true,
  utterance: `在我的${preserved}上方画${added}，${preserved}别动`,
  semanticBrief: brief(preserved, added), context: { requestScope: 'scene', canvasAspect: 1.4, history: [], scene: { childBounds, niloBounds: null, recentContributions: [] } } })
const plan = (preserved = '小船', added = '花朵') => ({ version: 1, title: '新的小发现', summary: `一朵${added}在${preserved}上方。`, request: '模型缩写的请求', preserve: [],
  objects: [{ id: 'addition', name: added, aliases: [added], role: 'main', essential: [added], render: { kind: 'generated' },
    color: '#66729b', box: { x: .2, y: .1, width: .6, height: .5 } }] })

test.each(['小船', '大树', '太阳'])('existing %s becomes an external anchor, never an extra generated feature', preserved => {
  const request = input(preserved), before = structuredClone(request)
  const result = alignGeneratedSceneContract(bindPreservedChildContent(plan(preserved), request), request)
  expect(result.preserve).toEqual([preserved])
  expect(result.summary).toContain(preserved)
  expect(result.request).toBe(request.utterance)
  expect(result.objects[0].essential.join(' ')).not.toContain(preserved)
  expect(result.objects[0].essential.join(' ')).toContain('花朵')
  expect(sceneAdditionRequiredSubjects(request)).toEqual(['花朵'])
  expect(sceneIntentIssues(result, request.semanticBrief, undefined, request)).toEqual([])
  expect(sceneMaterialContext(request)).toMatchObject({ preservedSubjects: [preserved], requestedSubjects: ['flower'] })
  expect(request).toEqual(before)
})

test('literal keep grammar protects unfamiliar child-created subjects even when the optional brief field is absent', () => {
  const request = input('阿古斯精灵')
  delete request.semanticBrief.preservedSubjects
  expect(preservedChildSubjects(request)).toEqual(['阿古斯精灵'])
  const result = alignGeneratedSceneContract(bindPreservedChildContent(plan('阿古斯精灵'), request), request)
  expect(result.objects[0].essential.join(' ')).not.toContain('阿古斯精灵')
  expect(sceneIntentIssues(result, request.semanticBrief, undefined, request)).toEqual([])
})

test.each(['小船正上方', '孩子画的小船正上方', '小船的正下方'])('spatial anchor %s survives as placement without becoming duplicate generated content', anchor => {
  const request = input(), proposed = plan()
  proposed.summary = `在${anchor}，漂浮着一朵花朵。`
  const result = alignGeneratedSceneContract(bindPreservedChildContent(proposed, request), request)
  expect(result.summary).toBe(proposed.summary)
  expect(result.objects[0].essential.join(' ')).not.toContain('小船')
  expect(result.objects[0].essential.join(' ')).toContain('花朵')
  expect(sceneIntentIssues(result, request.semanticBrief, undefined, request)).toEqual([])
})

test('preserved phrases require exact request grounding, explicit existing references and evidence of child ink', () => {
  const request = input()
  expect(sanitizeSceneUnderstanding(request.semanticBrief).preservedSubjects).toEqual(['小船'])
  expect(ungroundedSceneSubjects({ ...request.semanticBrief, preservedSubjects: ['绿色帆船'] }, request.utterance)).toContain('绿色帆船')
  expect(sanitizeSceneUnderstanding({ ...request.semanticBrief, preservedSubjects: ['x'.repeat(61)] })).toBeNull()
  expect(sanitizeSceneUnderstanding({ ...request.semanticBrief, preservedSubjects: '小船' })).toBeNull()
  const noInk = { ...request, context: { ...request.context, scene: { childBounds: null, recentContributions: [] } } }
  expect(preservedChildSubjects(noInk)).toEqual([])
  expect(bindPreservedChildContent({ ...plan(), preserve: ['小船'] }, noInk).preserve).toEqual([])
  expect(sceneAdditionRequiredSubjects(noInk)).toEqual(['小船', '花朵'])
  expect(preservedChildSubjects({ ...request, utterance: '画小船和花朵' })).toEqual([])
  expect(preservedChildSubjects({ ...request, utterance: '画我的小船' })).toEqual([])
  expect(preservedChildSubjects({ ...request, utterance: '不要保留我的小船' })).toEqual([])
  expect(preservedChildSubjects({ ...request, utterance: 'draw my boat', semanticBrief: { preservedSubjects: ['boat'] } })).toEqual([])
  expect(preservedChildSubjects({ ...request, utterance: "don't keep my boat", semanticBrief: { preservedSubjects: ['boat'] } })).toEqual([])
  expect(preservedChildSubjects({ ...request, semanticBrief: { ...request.semanticBrief, preservedSubjects: ['花朵'] } })).toEqual(['小船'])
  expect(preservedChildSubjects({ ...noInk, context: { ...noInk.context, scene: { childBounds: null,
    recentContributions: [{ owner: 'nilo', strokeCount: 2, bounds: childBounds }] } } })).toEqual([])
})

test('preservation cannot hide a missing new subject or authorize a duplicate stock/generated child anchor', () => {
  const request = input(), bound = bindPreservedChildContent(plan(), request)
  const missing = { ...bound, objects: [{ ...bound.objects[0], name: '月亮', aliases: ['月亮'], essential: ['月亮'] }] }
  expect(sceneIntentIssues(missing, request.semanticBrief, undefined, request).join(' ')).toContain('flower is missing')
  const duplicate = { ...bound, objects: [{ ...bound.objects[0], essential: ['花朵和一艘小船'] }] }
  expect(sceneIntentIssues(duplicate, request.semanticBrief, undefined, request).join(' ')).toContain('duplicates preserved child content')
  const stock = { ...bound, objects: [{ ...bound.objects[0], name: '小船', aliases: ['小船'], essential: ['小船'],
    render: { kind: 'illustration', illustrationId: 'illustration-library-boat-beginner-01' } }] }
  expect(sceneIntentIssues(stock, request.semanticBrief, undefined, request).join(' ')).toContain('duplicates preserved child content')
  // An untrusted preserve field alone does not satisfy a new required noun.
  expect(sceneIntentIssues(bound, request.semanticBrief).join(' ')).toContain('boat is missing')
})

test('explicitly drawing another instance remains mandatory and is not erased by preservation', () => {
  const request = { ...input(), utterance: '保留我的小船，再画一艘小船，旁边有花朵' }
  expect(preservedChildSubjects(request)).toEqual(['小船'])
  expect(preservedOnlySubjects(request)).toEqual([])
  expect(sceneAdditionRequiredSubjects(request)).toEqual(['小船', '花朵'])
  const next = plan()
  next.summary = '另一艘小船旁边有花朵。'
  next.objects[0].name = '小船和花朵'
  const result = alignGeneratedSceneContract(bindPreservedChildContent(next, request), request)
  expect(result.objects[0].essential.join(' ')).toContain('小船')
  expect(sceneIntentIssues(result, request.semanticBrief, undefined, request)).toEqual([])
  expect(requestsAdditionalInstance('小船别动，不要再画小船', '小船')).toBe(false)
  expect(requestsAdditionalInstance('保留我的小船，再画花朵在小船上方', '小船')).toBe(false)
  expect(requestsAdditionalInstance('keep my boat and draw another boat', 'boat')).toBe(true)
  expect(requestsAdditionalInstance('keep my boat and draw another tree above my boat', 'boat')).toBe(false)
})

test('new attached features are not discarded merely because their base noun already exists', () => {
  const request = input('兔子')
  request.semanticBrief.requiredSubjects = ['长翅膀的兔子', '花朵']
  expect(sceneAdditionRequiredSubjects(request)).toContain('长翅膀的兔子')
})

test.each(['小船', '大树', '太阳'])('the real planning pipeline binds existing %s before review and preserves the contract for rendering', async preserved => {
  const request = input(preserved), proposed = plan(preserved), generateImage = vi.fn()
  // Ordinary flowers already exist in the library; preservation must not
  // require newly generated pixels merely because an image model is enabled.
  proposed.objects[0].render = { kind: 'illustration', illustrationId: 'illustration-library-flower-beginner-01' }
  const chatText = vi.fn(async (_prompt, options) => options.kind === 'nilo_scene_understand'
    ? { brief: request.semanticBrief } : { plan: proposed })
  const reviewScene = vi.fn(async assessment => {
    expect(assessment.plan.preserve).toEqual([preserved])
    expect(assessment.plan.objects[0].essential.join(' ')).not.toContain(preserved)
    return { accepted: true, issues: [] }
  })
  const result = await generateNiloScene(request, { chatText, generateImage, reviewScene })
  expect(result).toMatchObject({ status: 'proposed', plan: { preserve: [preserved], request: request.utterance }, metrics: { understandings: 1, plans: 1, repairs: 0 } })
  expect(generateImage).not.toHaveBeenCalled()
  expect(reviewScene).toHaveBeenCalledTimes(1)
  expect(result).not.toHaveProperty('objects')
})

test('a repeated child identity fails atomically after the bounded repair, without generating pixels', async () => {
  const request = input(), duplicate = plan()
  duplicate.objects[0].name = '小船和花朵'
  const generateImage = vi.fn(), reviewScene = vi.fn()
  const chatText = vi.fn(async (_prompt, options) => options.kind === 'nilo_scene_understand'
    ? { brief: request.semanticBrief } : { plan: duplicate })
  const result = await generateNiloScene(request, { chatText, generateImage, reviewScene })
  expect(result).toMatchObject({ status: 'unavailable', reason: 'invalid_plan', metrics: { plans: 2, repairs: 1 } })
  expect(result).not.toHaveProperty('plan')
  expect(result).not.toHaveProperty('objects')
  expect(generateImage).not.toHaveBeenCalled()
  expect(reviewScene).not.toHaveBeenCalled()
})

test('cancellation during existing-content understanding never exposes a partial preservation plan', async () => {
  const controller = new AbortController(), generateImage = vi.fn()
  const result = generateNiloScene(input(), { signal: controller.signal, generateImage, chatText: () => new Promise(() => {}) })
  controller.abort()
  expect(await result).toMatchObject({ status: 'unavailable', reason: 'cancelled' })
  expect(await result).not.toHaveProperty('plan')
  expect(generateImage).not.toHaveBeenCalled()
})
