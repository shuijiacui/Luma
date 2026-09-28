import { expect, test, vi } from 'vitest'
import { PNG } from 'pngjs'
import { buildRenderedSceneQualityPreview, buildSceneQualityPreview, buildSceneQualityPrompt, sanitizeSceneQuality, sceneQualityMaterialFacts } from '../src/services/niloSceneQuality.js'
import { generateNiloScene as generateScene } from '../src/services/niloScene.js'
const generateNiloScene = (input, options) => generateScene(input, { retrieveMaterials: async () => null, ...options })
import { rasterGuide } from '../src/services/niloScenePreview.js'
import { previousOpenScene } from '../scripts/fixtures/niloOpenScenes.mjs'
import { LLMParseError } from '../src/services/llmClient.js'

const stock = (subject, name, box = { x: .2, y: .2, width: .5, height: .5 }) => ({ id: subject, name, aliases: [name], role: 'main',
  essential: [name], color: '#66729b', render: { kind: 'illustration', illustrationId: `illustration-library-${subject}-beginner-01` }, box })
const plan = (objects = [stock('treehouse', '树屋')]) => ({ version: 1, title: '魔法世界', summary: '树屋旁边有一条路。', request: '我想画一个魔法世界', preserve: [], objects })
const qualityData = input => JSON.parse(buildSceneQualityPrompt(input).split('SCENE QUALITY DATA: ')[1])
const coverage = png => {
  const result = new Uint8Array(png.width * png.height)
  for (let index = 0; index < result.length; index++) result[index] = Math.min(...png.data.subarray(index * 4, index * 4 + 3)) < 255 ? 1 : 0
  return result
}

test('quality feedback requires consistent explicit acceptance and at most three actionable issues', () => {
  expect(sanitizeSceneQuality({ accepted: true, issues: [] })).toEqual({ accepted: true, issues: [] })
  expect(sanitizeSceneQuality({ accepted: false, issues: [' whale: house floats above its spray. '] })).toEqual({ accepted: false, issues: ['whale: house floats above its spray.'] })
  const detailed = 'treehouse: the registered picture includes a rooted trunk and branches, so moving its frame does not create an island. The summary promises a floating island and a child looking upward, but the selected child holds a brush facing forward. Preserve the requested magical world through a visible coherent relation.'
  expect(detailed.length).toBeGreaterThan(240)
  expect(sanitizeSceneQuality({ accepted: false, issues: [detailed] })).toEqual({ accepted: false, issues: [detailed] })
  for (const invalid of [null, [], {}, { accepted: 'true', issues: [] }, { accepted: true, issues: ['missing whale'] },
    { accepted: false, issues: [] }, { accepted: false, issues: [''] }, { accepted: false, issues: [' '] },
    { accepted: false, issues: ['x'.repeat(601)] }, { accepted: false, issues: ['a', 'b', 'c', 'd'] },
    { accepted: false, issues: ['bad\ncommand'] }, { accepted: true, issues: [], alternatePlan: {} },
    { quality: { accepted: true, issues: [] } }]) expect(sanitizeSceneQuality(invalid)).toBeNull()
})

test('actual asset identity is resolved by registered ID and cannot be renamed by plan or materials', () => {
  const counterfeit = plan([stock('treehouse', '漂浮的魔法岛屿')])
  const data = qualityData({ utterance: '画一个漂浮岛', plan: counterfeit,
    materials: { profile: { style: 'storybook', detail: 'simple' }, subjects: [{ variants: [{ id: 'illustration-library-treehouse-beginner-01', name: '漂浮岛', pose: 'floating island' }] }] } })
  expect(data.proposed.objects[0].claimedName).toBe('漂浮的魔法岛屿')
  expect(data.selectedAssetFacts[0]).toMatchObject({ canonicalSubject: 'treehouse', canonicalName: '树屋', catalogueCaption: '树杈上的小屋', registered: true })
  expect(JSON.stringify(data.selectedAssetFacts)).not.toContain('漂浮')
  expect(data.selectedAssetFacts[0].sourceContourBounds).toMatchObject({ left: expect.any(Number), top: expect.any(Number) })
})

test('primitive and custom facts distinguish executable geometry from unproved feature claims', () => {
  const base = { ...stock('treehouse', '路径'), render: { kind: 'compose', primitive: 'path', parameters: { curve: 'left' } } }
  const facts = sceneQualityMaterialFacts(plan([base, { ...base, id: 'custom', render: { kind: 'custom' } },
    { ...base, id: 'missing', render: { kind: 'illustration', illustrationId: 'missing' } }]))
  expect(facts[0]).toMatchObject({ executable: true, primitive: 'path' })
  expect(facts[0].actualGeometry).toContain('two curved open road-edge lines')
  expect(facts[1].state).toContain('not_drawn_yet')
  expect(facts[2].state).toContain('unknown_material')
})

test('reviewed support facts are preserved so overall contour tops cannot masquerade as body support', () => {
  const facts = sceneQualityMaterialFacts(plan([stock('whale', '鲸鱼')]))
  expect(facts[0]).toMatchObject({ supportsOn: false })
  expect(facts[0].supportReason).toMatch(/spout|back/i)
})

test('quality contract requires evidence while allowing several legitimate realizations of an open idea', () => {
  const prompt = buildSceneQualityPrompt({ utterance: '画一个安静而神奇的地方，但不要城堡', plan: plan(),
    relations: [{ subjectId: 'treehouse', relation: 'above', targetId: 'cloud' }] })
  expect(prompt).toContain('actual pixels outrank both captions and planner names')
  expect(prompt).toContain('Optional brief motifs may change')
  expect(prompt).toContain('giant flowers sheltering small houses')
  expect(prompt).toContain('shortening the summary alone cannot repair it')
  expect(prompt).toContain('actual final frames and pixels must support them')
  expect(prompt).toContain('不要城堡')
  expect(qualityData({ plan: plan(), relations: [{ subjectId: 'treehouse', relation: 'above', targetId: 'cloud' }] }).proposed.declaredRelations)
    .toEqual([{ subjectId: 'treehouse', relation: 'above', targetId: 'cloud' }])
  expect(prompt).not.toContain('/nilo-illustrations/')
})

test('optional brainstorms cannot leak into quality requirements through motifs, relationships or interpretation prose', () => {
  const brief = { version: 1, intent: '发光树下蹲着孩子', setting: '围满岩壁的地方', mood: ['必须发光'],
    requiredSubjects: ['树', '蹲着的孩子'], excludedSubjects: ['城堡'], referenceOnlySubjects: [],
    reference: [{ phrase: '安静而神奇', meaning: '需要围岩壁发光树和蹲下孩子' }],
    motifs: [{ subject: '发光树', role: 'focal', reason: '必须画它才神奇' }], relationships: ['蹲着的孩子被岩壁围住'] }
  const data = qualityData({ utterance: '画一个安静而神奇的地方，不要城堡', brief, plan: plan() })
  expect(data.brief).toEqual({ requiredSubjects: [], excludedSubjects: ['城堡'], referenceOnlySubjects: [], references: ['安静而神奇'] })
  expect(JSON.stringify(data)).not.toMatch(/岩壁|蹲|发光树|必须发光/)
})

test('quality receives only bounded existing-child location and never confuses omitted original ink with missing generated subjects', () => {
  const bounds = { x: .32, y: .79, width: .23, height: .13 }
  const context = { canvasAspect: 1.4, imageBase64: 'private-original-image', childId: 'private-child-id',
    history: [{ role: 'user', text: 'private-history' }], scene: { childBounds: { ...bounds, label: 'private-rectangle-label' },
      recentContributions: [{ text: 'private-contribution' }], niloBounds: { x: 0, y: 0, width: 1, height: 1 } } }
  const input = { utterance: '在我的小船上方画一个漂浮的花园，小船别动', plan: plan(), context }
  const data = qualityData(input)
  expect(data.context).toEqual({ scene: { childBounds: bounds } })
  const prompt = buildSceneQualityPrompt(input)
  expect(prompt).toContain('their absence is not a missing subject or evidence of failed preservation')
  expect(prompt).toContain('application preserves the original strokes without modification')
  expect(prompt).toContain('Bounds give location, not visual identity')
  expect(prompt).not.toContain('private-')
  for (const childBounds of [null, {}, { ...bounds, x: -.01 }, { ...bounds, width: 0 }, { ...bounds, x: .99 },
    { ...bounds, y: .99 }, { ...bounds, height: Infinity }, { ...bounds, y: '0.79' }]) {
    expect(qualityData({ ...input, context: { scene: { childBounds } } })).not.toHaveProperty('context')
  }
})

test('pending custom features are reviewed as an explicit contract, not rejected for missing not-yet-generated pixels', () => {
  const scene = plan([{ ...stock('cottage', '糖果做的小房子'), essential: ['糖果小屋轮廓', '屋顶由棒棒糖组成'], render: { kind: 'custom' } }])
  const prompt = buildSceneQualityPrompt({ utterance: '画一个糖果星球', plan: scene })
  expect(prompt).toContain('NEVER reject it merely because pixels have not been generated yet')
  expect(qualityData({ utterance: '画一个糖果星球', plan: scene }).proposed.objects[0].requiredFeatures).toContain('屋顶由棒棒糖组成')
  expect(buildSceneQualityPreview({ plan: scene })).toBeNull()
})

test('generated sourceView is bounded pre-rotation contract data, while the summary and pixels retain final orientation', () => {
  const sourceDescription = '正常坐标的小镇，屋顶尖端朝上，几座房屋连着同一块平台。'
  const object = { ...stock('cottage', '倒置的小镇'), essential: ['屋顶尖端朝下', '几座房屋连着同一块平台'], rotation: 180,
    render: { kind: 'generated', sourceDescription } }
  const scene = { ...plan([object]), summary: '平台下方连着屋顶朝下的小镇。' }
  for (const rendered of [false, true]) {
    const input = { utterance: '画一个倒着的小镇', plan: scene, rendered }, data = qualityData(input), prompt = buildSceneQualityPrompt(input)
    expect(data.proposed.objects[0]).toMatchObject({ sourceView: sourceDescription, rotation: 180, requiredFeatures: object.essential })
    expect(data.proposed.summary).toBe(scene.summary)
    expect(prompt).toContain('rotation=180')
    expect(prompt).toMatch(/without adding or (?:omitting|losing)/)
  }
  const stockWithClaim = { ...stock('cottage', '小屋'), render: { ...stock('cottage', '小屋').render, sourceDescription: 'PRIVATE_source_claim' } }
  expect(qualityData({ plan: plan([stockWithClaim]) }).proposed.objects[0]).not.toHaveProperty('sourceView')
  expect(buildSceneQualityPrompt({ plan: plan([stockWithClaim]) })).not.toContain('PRIVATE_source_claim')
  const oversized = { ...object, render: { kind: 'generated', sourceDescription: `a\n${'b'.repeat(1200)}` } }
  const bounded = qualityData({ plan: plan([oversized]) }).proposed.objects[0].sourceView
  expect(bounded).toHaveLength(1000)
  expect(bounded).not.toContain('\n')
})

test('inspection preview preserves every production pixel position and only improves contrast', async () => {
  const scene = plan([stock('treehouse', '树屋')]), context = { canvasAspect: 1.4, canvasSize: { width: 840, height: 600 } }
  const chatText = vi.fn(() => { throw new Error('Unexpected provider call') })
  const result = await generateNiloScene({ stage: 'render', plan: scene, context }, { chatText, chatWithImage: chatText })
  expect(result.status).toBe('ready')
  const preview = buildSceneQualityPreview({ plan: scene, context })
  expect(preview).toMatchObject({ width: 840, height: 600 })
  expect(preview.objects[0].proposal.x).toBeCloseTo(result.objects[0].proposal.x, 12)
  expect(preview.objects[0].proposal.width).toBeCloseTo(result.objects[0].proposal.width, 12)
  const inspection = PNG.sync.read(Buffer.from(preview.imageBase64, 'base64'))
  const normal = PNG.sync.read(rasterGuide(result.objects.map(object => object.proposal)))
  expect(coverage(inspection)).toEqual(coverage(normal))
  expect(inspection.data.reduce((minimum, value) => Math.min(minimum, value), 255))
    .toBeLessThan(normal.data.reduce((minimum, value) => Math.min(minimum, value), 255))
  expect(chatText).not.toHaveBeenCalled()
})

test('preview applies real connector geometry and supports portrait canvas ratios', async () => {
  const scene = previousOpenScene(), context = { canvasAspect: 1.4 }
  const result = await generateNiloScene({ stage: 'render', plan: scene, context })
  const preview = buildSceneQualityPreview({ plan: scene, context })
  expect(preview).not.toBeNull()
  const actual = result.objects.find(object => object.id === 'path').proposal
  const projected = preview.objects.find(object => object.id === 'path').proposal
  expect(projected.x).toBeCloseTo(actual.x, 10)
  expect(projected.y).toBeCloseTo(actual.y, 10)
  expect(projected.width).toBeCloseTo(actual.width, 10)
  const portrait = buildSceneQualityPreview({ plan: plan(), context: { canvasAspect: .75 } })
  const png = PNG.sync.read(Buffer.from(portrait.imageBase64, 'base64'))
  expect([png.width, png.height]).toEqual([630, 840])
  expect(png.data.some((value, index) => index % 4 !== 3 && value < 220)).toBe(true)
})

test('quality preview never drops a custom, unknown or unrepresentable object to produce a misleading picture', () => {
  expect(buildSceneQualityPreview({ plan: plan([{ ...stock('treehouse', '鲸鱼尾巴城堡'), render: { kind: 'custom' } }]) })).toBeNull()
  expect(buildSceneQualityPreview({ plan: plan([{ ...stock('treehouse', '树屋'), render: { kind: 'illustration', illustrationId: 'missing' } }]) })).toBeNull()
  expect(buildSceneQualityPreview({ plan: plan(), context: { canvasAspect: 9 } })).toBeNull()
  expect(buildSceneQualityPreview({ plan: plan(), context: { previousScene: { objects: [{ proposal: { rotation: 25 } }] } } })).toBeNull()
  expect(buildSceneQualityPreview({ plan: plan(), previousScene: { objects: [{ proposal: { rotation: 25 } }] } })).toBeNull()
})

const semanticBrief = { version: 1, intent: '一个安静而神奇的地方', reference: [], setting: '树屋旁', mood: ['安静', '神奇'],
  requiredSubjects: [], excludedSubjects: [], referenceOnlySubjects: [], motifs: [{ subject: '树屋', role: 'focal', reason: '作为探索的入口' }], relationships: [] }
const sceneInput = () => ({ stage: 'plan', utterance: '画一个安静而神奇的地方，不要月亮', locale: 'zh',
  context: { requestScope: 'scene', canvasAspect: 1.4, canvasSize: { width: 840, height: 600 },
    scene: { childBounds: null, niloBounds: null, recentContributions: [] } } })

test('the real quality call rejects a false summary then reviews one corrected proposal with original intent retained', async () => {
  const input = sceneInput(), original = structuredClone(input), calls = []
  const first = { ...plan(), summary: '发光小点环绕漂浮的岛屿。' }, corrected = { ...plan(), summary: '树杈上的小屋是安静的秘密入口。' }
  let plans = 0, reviews = 0
  const chatText = vi.fn(async (prompt, options) => {
    calls.push(options.kind)
    if (options.kind === 'nilo_scene_understand') return { brief: { ...semanticBrief, excludedSubjects: ['月亮'] } }
    expect(options.kind).toBe('nilo_scene_plan')
    if (plans++) {
      expect(prompt).toContain(input.utterance)
      expect(prompt).toContain('treehouse has rooted branches, not an island; the claimed light dots do not exist')
      expect(prompt).toContain('Keep every explicit child subject, feature and exclusion')
    }
    return { plan: plans === 1 ? first : corrected }
  })
  const chatWithImage = vi.fn(async (image, prompt, options) => {
    calls.push(options.kind)
    expect(options.kind).toBe('nilo_scene_quality')
    expect(PNG.sync.read(Buffer.from(image, 'base64')).width).toBe(840)
    expect(prompt).toContain(input.utterance)
    return reviews++ === 0 ? { accepted: false, issues: ['treehouse has rooted branches, not an island; the claimed light dots do not exist'] } : { accepted: true, issues: [] }
  })
  const result = await generateNiloScene(input, { chatText, chatWithImage })
  expect(result).toMatchObject({ status: 'proposed', metrics: { plans: 2, qualityReviews: 2, repairs: 1 } })
  expect(result.plan.summary).toBe(corrected.summary)
  expect(calls).toEqual(['nilo_scene_understand', 'nilo_scene_plan', 'nilo_scene_quality', 'nilo_scene_plan', 'nilo_scene_quality'])
  expect(input).toEqual(original)
  expect(result).not.toHaveProperty('objects')
})

test.each([{ accepted: true }, { accepted: true, issues: ['actually missing a required feature'] }, { accepted: false, issues: [] }])('malformed quality cannot become approval and review attempts remain bounded: %j', async quality => {
  const chatText = vi.fn(async (_prompt, options) => options.kind === 'nilo_scene_understand' ? { brief: semanticBrief } : { plan: plan() })
  const chatWithImage = vi.fn(async () => quality)
  const result = await generateNiloScene(sceneInput(), { chatText, chatWithImage })
  expect(result).toMatchObject({ status: 'unavailable', reason: 'invalid_plan', metrics: { plans: 2, qualityReviews: 2, repairs: 1 } })
  expect(result).not.toHaveProperty('plan')
  expect(chatWithImage).toHaveBeenCalledTimes(2)
})

test.each([false, true])('quality JSON parsing failure requires a real second review and never leaks an unchecked plan (fail both: %s)', async failBoth => {
  const input = sceneInput(), original = structuredClone(input), stages = []
  let plans = 0, reviews = 0
  const chatText = vi.fn(async (prompt, options) => {
    stages.push(options.kind)
    if (options.kind === 'nilo_scene_understand') return { brief: semanticBrief }
    expect(options.kind).toBe('nilo_scene_plan')
    if (plans++) {
      expect(prompt).toContain(input.utterance)
      expect(prompt).toContain('Repair the SAME child intent once')
    }
    return { plan: { ...plan(), summary: plans === 1 ? '第一次候选树屋。' : '再次审核的树屋。' } }
  })
  const chatWithImage = vi.fn(async (image, _prompt, options) => {
    stages.push(options.kind)
    expect(options.kind).toBe('nilo_scene_quality')
    expect(PNG.sync.read(Buffer.from(image, 'base64')).width).toBe(840)
    if (reviews++ === 0 || failBoth) throw new LLMParseError('incomplete quality JSON', '{"accepted":')
    return { accepted: true, issues: [] }
  })
  const result = await generateNiloScene(input, { chatText, chatWithImage })
  expect(stages).toEqual(['nilo_scene_understand', 'nilo_scene_plan', 'nilo_scene_quality', 'nilo_scene_plan', 'nilo_scene_quality'])
  expect(result.metrics).toMatchObject({ plans: 2, qualityReviews: 2, repairs: 1 })
  expect(chatWithImage).toHaveBeenCalledTimes(2)
  expect(input).toEqual(original)
  expect(result).not.toHaveProperty('objects')
  if (failBoth) {
    expect(result).toMatchObject({ status: 'unavailable', reason: 'invalid_plan' })
    expect(result).not.toHaveProperty('plan')
  } else expect(result).toMatchObject({ status: 'proposed', plan: { summary: '再次审核的树屋。' } })
})

test('a literal simple object adds no semantic or quality calls', async () => {
  const chatText = vi.fn(async () => ({ plan: plan() })), chatWithImage = vi.fn()
  const input = sceneInput(); input.utterance = '画一个树屋'; input.context.requestScope = 'object'
  const result = await generateNiloScene(input, { chatText, chatWithImage })
  expect(result).toMatchObject({ status: 'proposed', metrics: { understandings: 0, qualityReviews: 0, plans: 1 } })
  expect(chatText).toHaveBeenCalledOnce(); expect(chatWithImage).not.toHaveBeenCalled()
})

test('semantic review sees generated guide pixels instead of the original child image and writes no child content', async () => {
  const childImage = 'private-child-canvas-sentinel', input = { ...sceneInput(), imageBase64: childImage }, original = structuredClone(input)
  const chatText = vi.fn(async () => ({ brief: semanticBrief }))
  const chatWithImage = vi.fn(async (image, _prompt, options) => {
    if (options.kind === 'nilo_scene_plan') { expect(image).toBe(childImage); return { plan: plan() } }
    expect(options.kind).toBe('nilo_scene_quality')
    expect(image).not.toBe(childImage)
    const png = PNG.sync.read(Buffer.from(image, 'base64'))
    expect(png.data.subarray(0, 4)).toEqual(Buffer.from([255, 255, 255, 255]))
    return { accepted: true, issues: [] }
  })
  expect(await generateNiloScene(input, { chatText, chatWithImage })).toMatchObject({ status: 'proposed', metrics: { qualityReviews: 1 } })
  expect(chatWithImage).toHaveBeenCalledTimes(2)
  expect(input).toEqual(original)
})

test('planned inversion is visible in preview and fact evidence rather than only being mentioned in prose', async () => {
  const inverted = plan([{ ...stock('treehouse', '树屋'), rotation: 180 }]), context = { canvasAspect: 1.4 }
  const result = await generateNiloScene({ stage: 'render', plan: inverted, context })
  const preview = buildSceneQualityPreview({ plan: inverted, context })
  expect(sceneQualityMaterialFacts(inverted)[0].rotation).toBe(180)
  expect(qualityData({ plan: inverted }).proposed.objects[0].rotation).toBe(180)
  expect(preview.objects[0].proposal.rotation).toBe(180)
  expect(coverage(PNG.sync.read(Buffer.from(preview.imageBase64, 'base64'))))
    .toEqual(coverage(PNG.sync.read(rasterGuide(result.objects.map(object => object.proposal)))))
})

test('inspection contrast preserves dense grayscale geometry and never changes evaluation gallery defaults', () => {
  const proposal = { template: 'illustration', illustrationId: 'illustration-bookshop', x: .1, y: .1, width: .5, height: .6, rotation: 0 }
  const normal = PNG.sync.read(rasterGuide([proposal])), inspected = PNG.sync.read(rasterGuide([proposal], { inspection: true }))
  expect(coverage(inspected)).toEqual(coverage(normal))
  let normalDarkest = 255, inspectedDarkest = 255
  for (let index = 0; index < normal.data.length; index += 4) { normalDarkest = Math.min(normalDarkest, normal.data[index]); inspectedDarkest = Math.min(inspectedDarkest, inspected.data[index]) }
  expect(normalDarkest).toBeGreaterThanOrEqual(155)
  expect(inspectedDarkest).toBeLessThan(normalDarkest)
})

const customFixture = () => {
  const scene = plan([stock('treehouse', '树屋', { x: .1, y: .1, width: .3, height: .4 }),
    { ...stock('island', '漂浮岛', { x: .5, y: .5, width: .3, height: .2 }), render: { kind: 'custom' }, essential: ['悬空的岛屿轮廓'] }])
  const stockObjects = buildSceneQualityPreview({ plan: { ...scene, objects: [scene.objects[0]] } }).objects
  const objects = [...stockObjects, { id: 'island', name: '漂浮岛', proposal: {
    template: 'custom', contribution: 'object', placementPolicy: 'free', subject: '漂浮岛',
    sketch: { aspect: 2, paths: [[['M', .05, .1], ['L', .95, .1], ['L', .5, .9], ['Z']]] },
    x: .52, y: .55, width: .28, height: .196, rotation: 25, color: '#66729b', strokeWidth: 3,
    target: 'whole picture', relation: '树屋旁的漂浮岛。',
  } }]
  return { scene, objects }
}

test('final mixed preview uses every exact rendered proposal and preserves manual transforms without changing child content', () => {
  const { scene, objects } = customFixture(), original = structuredClone(objects)
  const context = { canvasAspect: 1.4, imageBase64: 'private-child-ink-never-used' }
  const preview = buildRenderedSceneQualityPreview({ plan: scene, objects, context })
  expect(preview).toMatchObject({ width: 840, height: 600, objects })
  expect(Buffer.from(preview.imageBase64, 'base64')).toEqual(rasterGuide(objects.map(object => object.proposal), { inspection: true }))
  expect(objects).toEqual(original)
  expect(preview.objects[1].proposal.rotation).toBe(25)
  const data = qualityData({ utterance: scene.request, plan: scene, rendered: true, objects })
  expect(data.phase).toBe('final_rendered_composition')
  expect(data.selectedAssetFacts[1]).toMatchObject({ state: expect.stringContaining('generated_geometry'), rotation: 25, frame: { x: .52, y: .55, width: .28, height: .196 } })
  expect(data.proposed.objects[1].frame).toEqual(data.selectedAssetFacts[1].frame)
  const prompt = buildSceneQualityPrompt({ utterance: scene.request, plan: scene, rendered: true, objects })
  expect(prompt).toContain('There is no pending-drawing exemption')
  expect(prompt).not.toContain('NEVER reject it merely because pixels have not been generated yet')
  expect(prompt).not.toContain('not_drawn_yet')
})

test('final mixed preview fails closed for missing, duplicate, substituted, invalid or blank subjects', () => {
  const { scene, objects } = customFixture()
  const changed = modify => { const next = structuredClone(objects); modify(next); return next }
  for (const invalid of [[], objects.slice(0, 1), [objects[0], objects[0]],
    changed(next => { next[1].id = 'unknown' }), changed(next => { next[1].name = 'renamed' }),
    changed(next => { next[0].proposal.illustrationId = 'illustration-library-rabbit-beginner-01' }),
    changed(next => { next[1].proposal = { ...next[0].proposal } }),
    changed(next => { next[1].proposal.x = 2 }),
    changed(next => { next[1].proposal.sketch.paths = [] }),
    changed(next => { next[1].proposal.sketch.paths = [[['M', .5, .5], ['L', .5, .5]]] }),
  ]) expect(buildRenderedSceneQualityPreview({ plan: scene, objects: invalid })).toBeNull()
  expect(buildRenderedSceneQualityPreview({ plan: scene, objects, context: { canvasAspect: 9 } })).toBeNull()
})
