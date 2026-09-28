import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { PNG } from 'pngjs'
import { generateNiloScene, sanitizeSceneInput } from '../src/services/niloScene.js'
import { generatedRasterFromPng } from '../src/services/niloImageGenerator.js'
import { scenePalette } from '../../shared/niloSceneDrawing.mjs'
import { LLMParseError } from '../src/services/llmClient.js'

// A real bounded PNG passes through the production cleanup/tracing renderer.
// The fake vision verdict exercises sequencing/contracts, not artistic quality.
function rasterDrawing(shift = 0) {
  const png = new PNG({ width: 96, height: 64 }); png.data.fill(255)
  for (let y = 12; y < 52; y++) for (let x = 12 + shift; x < 80 + shift; x++) {
    if (y > 15 && y < 48 && x > 15 + shift && x < 76 + shift) continue
    const at = (y * png.width + x) * 4
    png.data[at] = png.data[at + 1] = png.data[at + 2] = 32
  }
  return generatedRasterFromPng(PNG.sync.write(png))
}
const focal = { id: 'whale_town', name: '鲸鱼背上的小镇', aliases: ['鲸鱼小镇'], role: 'main', essential: ['完整鲸鱼身体', '鲸鱼背部接着几座小房子'],
  render: { kind: 'generated' }, box: { x: .1, y: .3, width: .6, height: .5 }, color: '#66729b' }
const moon = { id: 'moon', name: '月亮', aliases: ['弯月'], role: 'atmosphere', essential: ['弯月'],
  render: { kind: 'illustration', illustrationId: 'illustration-library-moon-beginner-01' }, box: { x: .77, y: .08, width: .15, height: .19 }, color: '#66729b' }
const plan = objects => ({ version: 1, title: '鲸背小镇', summary: '几座小房子和鲸鱼背部连在一起，月亮在旁边。', request: '我想画住在鲸鱼背上的小镇，旁边有月亮。',
  objects: objects ?? [structuredClone(focal), structuredClone(moon)], palette: { ...scenePalette }, preserve: ['保留孩子的小船'] })
const input = (scenePlan = plan(), extra = {}) => ({ stage: 'render', utterance: scenePlan.request, plan: scenePlan, locale: 'zh',
  context: { canvasAspect: 1.4, requestScope: 'scene', scene: { childBounds: null, niloBounds: null, recentContributions: [] } }, ...extra })
const visible = (object = focal, pass = true) => ({ observed: { subject: 'a long animal body carrying small rooftops', parts: ['body contour', 'roof shapes'], connections: ['rooftops touch the back'] },
  recognizable: pass, features: object.essential.map(essential => ({ essential, visible: pass })) })
const acceptWhole = () => ({ accepted: true, issues: [] })
const nonblank = image => {
  const png = PNG.sync.read(Buffer.from(image, 'base64'))
  expect(png.data.some((value, index) => index % 4 !== 3 && value < 230)).toBe(true)
  return png
}
beforeEach(() => { vi.stubEnv('NILO_IMAGE_ENABLED', 'false') })
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers() })

test('multiple uncached image units are rejected before any paid request while existing guides remain untouched', async () => {
  const generateImage = vi.fn(), reviewScene = vi.fn()
  const scenePlan = plan([structuredClone(focal), { ...structuredClone(focal), id: 'another', box: { x: .7, y: .1, width: .25, height: .3 } }])
  const result = await generateNiloScene(input(scenePlan), { generateImage, reviewScene })
  expect(result).toMatchObject({ status: 'unavailable', reason: 'invalid_plan', metrics: { imageCalls: 0 } })
  expect(generateImage).not.toHaveBeenCalled()
  expect(reviewScene).not.toHaveBeenCalled()
})

test('new inverted geometry missing a source view is repaired before approval or paid image generation', async () => {
  const proposed = plan([{ ...structuredClone(focal), rotation: 180 }])
  proposed.summary = '鲸鱼背上的小镇上下颠倒。'
  proposed.request = '画上下颠倒的鲸鱼小镇'
  const generateImage = vi.fn(), reviewScene = vi.fn(acceptWhole)
  let plans = 0
  const chatText = vi.fn(async (prompt, options) => {
    if (options.kind === 'nilo_scene_understand') return { brief: { version: 1, intent: proposed.request,
      reference: [], setting: '鲸鱼小镇', mood: [], requiredSubjects: ['鲸鱼'], excludedSubjects: [], referenceOnlySubjects: [], relationships: [] } }
    plans++
    if (plans === 1) return { plan: structuredClone(proposed) }
    expect(prompt).toContain('MUST include render.sourceDescription')
    const repaired = structuredClone(proposed)
    repaired.objects[0].render.sourceDescription = '正常朝向的鲸鱼，背部上方连接几座小房子。'
    return { plan: repaired }
  })
  const result = await generateNiloScene({ ...input(proposed), stage: 'plan', plan: undefined }, { chatText, generateImage, reviewScene })
  expect(result).toMatchObject({ status: 'proposed', metrics: { plans: 2, repairs: 1 } })
  expect(result.plan.objects[0].render.sourceDescription).toContain('正常朝向')
  expect(generateImage).not.toHaveBeenCalled()
  expect(reviewScene).toHaveBeenCalledOnce()
})

test('generated pixels receive object inspection then whole-scene inspection before an atomic ready response', async () => {
  const raster = rasterDrawing(), order = [], passedSignals = []
  const generateImage = vi.fn(async (object, actualPlan, options) => {
    order.push('image'); passedSignals.push(options.signal)
    expect(object).toEqual(focal)
    expect(actualPlan.request).toBe(plan().request)
    expect(actualPlan.objects[0].essential).toEqual(focal.essential)
    return raster
  })
  const chatWithImage = vi.fn(async (image, prompt, options) => {
    passedSignals.push(options.signal); nonblank(image)
    if (options.kind === 'nilo_scene_review') {
      order.push('object-review')
      expect(image).toBe(raster.pngBase64)
      expect(prompt).toContain(focal.essential[1])
      expect(options).toMatchObject({ retries: 0, privateContent: true })
      return visible()
    }
    expect(options.kind).toBe('nilo_scene_quality')
    order.push('whole-review')
    expect(image).not.toBe(raster.pngBase64)
    const data = JSON.parse(prompt.split('SCENE QUALITY DATA: ')[1])
    expect(data.childRequest).toBe(plan().request)
    expect(JSON.stringify(data)).toContain('whale_town')
    expect(JSON.stringify(data)).toContain('moon')
    return acceptWhole()
  })
  const result = await generateNiloScene(input(), { generateImage, chatWithImage, chatText: () => { throw new Error('No text drawing should run') } })
  expect(result.status).toBe('ready')
  expect(order).toEqual(['image', 'object-review', 'whole-review'])
  expect(new Set(passedSignals).size).toBe(1)
  expect(result.objects.map(object => object.id)).toEqual(['whale_town', 'moon'])
  expect(result.objects[0].proposal).toMatchObject({ template: 'generated', subject: focal.name, raster })
  expect(result.objects[1].proposal).toMatchObject({ template: 'illustration', illustrationId: moon.render.illustrationId })
  expect(result.metrics).toMatchObject({ imageCalls: 1, reviews: 1, qualityReviews: 1, customCalls: 0 })
})

test('a missing fused feature redraws the same target once and passes concrete missing evidence to the generator', async () => {
  const first = rasterDrawing(), repaired = rasterDrawing(3)
  const generateImage = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(repaired)
  const chatWithImage = vi.fn().mockResolvedValueOnce({ ...visible(), features: [visible().features[0], { essential: focal.essential[1], visible: false }] }).mockResolvedValueOnce(visible())
  const reviewScene = vi.fn(acceptWhole)
  const result = await generateNiloScene(input(), { generateImage, chatWithImage, reviewScene })
  expect(result.status).toBe('ready')
  expect(generateImage).toHaveBeenCalledTimes(2)
  expect(generateImage.mock.calls[1][0]).toEqual(focal)
  expect(generateImage.mock.calls[1][1].request).toBe(plan().request)
  expect(generateImage.mock.calls[1][2].missing).toEqual([focal.essential[1]])
  expect(chatWithImage.mock.calls.map(call => call[0])).toEqual([first.pngBase64, repaired.pngBase64])
  expect(reviewScene).toHaveBeenCalledOnce()
  expect(reviewScene.mock.calls[0][0].objects.find(object => object.id === focal.id).proposal.raster).toEqual(repaired)
})

test('malformed object vision is not approval and consumes the same bounded regeneration allowance', async () => {
  const generateImage = vi.fn(async () => rasterDrawing())
  const chatWithImage = vi.fn().mockRejectedValueOnce(new LLMParseError('incomplete review', '{"observed":')).mockResolvedValueOnce(visible())
  const result = await generateNiloScene(input(), { generateImage, chatWithImage, reviewScene: acceptWhole })
  expect(result.status).toBe('ready')
  expect(result.metrics).toMatchObject({ imageCalls: 2, reviews: 2, repairs: 1 })
  expect(generateImage.mock.calls[1][2].missing).toEqual(focal.essential)
})

test('two rejected object images return no partial objects, stock preview or raster bytes', async () => {
  const generateImage = vi.fn(async () => rasterDrawing()), reviewScene = vi.fn(acceptWhole)
  const result = await generateNiloScene(input(), { generateImage, chatWithImage: async () => visible(focal, false), reviewScene })
  expect(result).toMatchObject({ status: 'unavailable', reason: 'visual_mismatch', failedObjectIds: [focal.id], metrics: { imageCalls: 2, reviews: 2 } })
  expect(result).not.toHaveProperty('objects')
  expect(result).not.toHaveProperty('proposal')
  expect(JSON.stringify(result)).not.toContain('pngBase64')
  expect(reviewScene).not.toHaveBeenCalled()
  expect(result.plan.request).toBe(plan().request)
})

test.each(['rejected', 'malformed'])('whole-image %s quality keeps individually accepted drawings atomic and unavailable', async outcome => {
  const result = await generateNiloScene(input(), { generateImage: async () => rasterDrawing(), chatWithImage: async () => visible(),
    reviewScene: async () => outcome === 'rejected' ? { accepted: false, issues: ['The houses float above the whale instead of touching its back.'] } : { accepted: true } })
  expect(result).toMatchObject({ status: 'unavailable', reason: 'visual_mismatch', metrics: { imageCalls: 1, qualityReviews: 1 } })
  expect(result).not.toHaveProperty('objects')
  expect(JSON.stringify(result)).not.toContain('pngBase64')
})

test('variantObjectId regenerates only the selected complete object and reuses unrelated generated and stock pixels exactly', async () => {
  const second = { ...structuredClone(focal), id: 'lantern', name: '提灯', aliases: [], role: 'support', essential: ['提灯的完整外形'],
    box: { x: .72, y: .55, width: .18, height: .25 } }
  const scenePlan = plan([structuredClone(focal), second, structuredClone(moon)])
  const chatWithImage = vi.fn(async (_image, prompt) => visible(JSON.parse(prompt.split('OBJECT: ')[1])))
  const original = await generateNiloScene(input(), { generateImage: async () => rasterDrawing(), chatWithImage, reviewScene: acceptWhole })
  const prior = await generateNiloScene(input(scenePlan, { context: { ...input().context, previousScene: original } }),
    { generateImage: async () => rasterDrawing(), chatWithImage, reviewScene: acceptWhole })
  expect(prior.status).toBe('ready')
  const snapshot = structuredClone(prior), newRaster = rasterDrawing(4), generateImage = vi.fn(async () => newRaster)
  chatWithImage.mockClear()
  const result = await generateNiloScene(input(prior.plan, { variantObjectId: focal.id,
    context: { ...input().context, previousScene: prior } }), { generateImage, chatWithImage, reviewScene: acceptWhole })
  expect(result.status).toBe('ready')
  expect(generateImage).toHaveBeenCalledOnce()
  expect(generateImage.mock.calls[0][0]).toEqual(prior.plan.objects[0])
  expect(generateImage.mock.calls[0][2]).toMatchObject({ variation: true })
  expect(result.metrics).toMatchObject({ imageCalls: 1, reused: 2, reviews: 1, qualityReviews: 1 })
  expect(result.plan).toEqual(prior.plan)
  expect(result.objects.find(object => object.id === focal.id).proposal.raster).toEqual(newRaster)
  for (const id of ['lantern', 'moon']) expect(result.objects.find(object => object.id === id)).toEqual(prior.objects.find(object => object.id === id))
  expect(prior).toEqual(snapshot)
})

test('cached generated objects add no provider or visual-review call unless explicitly varied', async () => {
  const prior = await generateNiloScene(input(), { generateImage: async () => rasterDrawing(), chatWithImage: async () => visible(), reviewScene: acceptWhole })
  const forbidden = vi.fn(() => { throw new Error('unchanged cached pixels must be reused') })
  const result = await generateNiloScene(input(prior.plan, { context: { ...input().context, previousScene: prior } }),
    { generateImage: forbidden, chatWithImage: forbidden, reviewScene: forbidden })
  expect(result.status).toBe('ready')
  expect(result.objects).toEqual(prior.objects)
  expect(result.metrics).toMatchObject({ imageCalls: 0, reused: 2, reviews: 0, qualityReviews: 0 })
  expect(forbidden).not.toHaveBeenCalled()
})

test.each(['cancel', 'timeout'])('%s ends pending generation without exposing a late image or calling inspection', async reason => {
  vi.useFakeTimers()
  const controller = new AbortController(), chatWithImage = vi.fn(), reviewScene = vi.fn()
  let complete, providerSignal
  const generateImage = vi.fn((_object, _plan, options) => { providerSignal = options.signal; return new Promise(resolve => { complete = resolve }) })
  const pending = generateNiloScene(input(), { generateImage, chatWithImage, reviewScene, signal: controller.signal, timeoutMs: 40 })
  expect(generateImage).toHaveBeenCalledOnce()
  if (reason === 'cancel') controller.abort()
  else await vi.advanceTimersByTimeAsync(40)
  const result = await pending
  expect(result).toMatchObject({ status: 'unavailable', reason: reason === 'cancel' ? 'cancelled' : 'timeout' })
  expect(providerSignal.aborted).toBe(true)
  expect(result).not.toHaveProperty('objects')
  complete(rasterDrawing())
  await Promise.resolve(); await Promise.resolve()
  expect(chatWithImage).not.toHaveBeenCalled()
  expect(reviewScene).not.toHaveBeenCalled()
})

test('planning may promise a generated object only with the configured/injected image capability and never generates before confirmation', async () => {
  const planned = plan([structuredClone(focal)]), chatText = vi.fn(async () => ({ plan: planned }))
  const request = input(planned, { stage: 'plan', utterance: '画鲸鱼背上的小镇', context: { canvasAspect: 1.4, requestScope: 'object' } })
  delete request.plan
  const disabled = await generateNiloScene(request, { chatText })
  expect(disabled).toMatchObject({ status: 'unavailable', reason: 'invalid_plan' })
  const generateImage = vi.fn(async () => rasterDrawing())
  const enabled = await generateNiloScene(request, { chatText, generateImage })
  expect(enabled.status).toBe('proposed')
  expect(enabled.plan.objects[0].render).toEqual({ kind: 'generated' })
  expect(generateImage).not.toHaveBeenCalled()
  expect(enabled).not.toHaveProperty('objects')
})

test('an integrated generated idea is reviewed as a feature contract without requiring not-yet-created PNG pixels', async () => {
  const proposed = { ...plan([structuredClone(focal)]), request: '我想画住在鲸鱼背上的小镇', summary: '几座小房子连接在鲸鱼宽宽的背上。', relations: [] }
  const brief = { version: 1, intent: proposed.request, setting: '鲸鱼背上的小镇', mood: [], reference: [],
    requiredSubjects: ['鲸鱼'], excludedSubjects: [], referenceOnlySubjects: [], motifs: [], relationships: ['小镇住在鲸鱼背上'] }
  const stages = [], generateImage = vi.fn(), chatWithImage = vi.fn()
  const chatText = vi.fn(async (prompt, options) => {
    stages.push(options.kind)
    if (options.kind === 'nilo_scene_understand') return { brief }
    if (options.kind === 'nilo_scene_plan') return { plan: proposed }
    expect(options.kind).toBe('nilo_scene_quality')
    expect(prompt).toContain('IDEA CONTRACT')
    expect(prompt).toContain('No image exists yet for generated objects')
    expect(prompt).toContain('AFTER confirmation')
    expect(prompt).toContain(proposed.summary)
    return acceptWhole()
  })
  const request = input(proposed, { stage: 'plan', utterance: proposed.request })
  delete request.plan
  const result = await generateNiloScene(request, { generateImage, chatText, chatWithImage, retrieveMaterials: async () => null })
  expect(result.status).toBe('proposed')
  expect(stages).toEqual(['nilo_scene_understand', 'nilo_scene_plan', 'nilo_scene_quality'])
  expect(result.plan.objects[0].essential).toEqual([proposed.summary])
  expect(generateImage).not.toHaveBeenCalled()
  expect(chatWithImage).not.toHaveBeenCalled()
  expect(result).not.toHaveProperty('objects')
})

test('variation cannot target stock, unknown objects or a planning transaction', () => {
  for (const patch of [{ variantObjectId: 'moon' }, { variantObjectId: 'missing' }, { stage: 'plan', variantObjectId: focal.id }]) {
    expect(() => sanitizeSceneInput({ ...input(), ...patch })).toThrow('invalid scene variant')
  }
})

const neutralObservation = { subject: 'A long rounded silhouette with small roof shapes', parts: ['long body', 'several rooftops'],
  connections: ['rooftops touch the body'], orientation: 'roofs above the long body', uncertain: [] }

test('one integrated reference is observed without its requested identity, then judged once as the complete final canvas', async () => {
  const scenePlan = plan([{ ...structuredClone(focal), rotation: 180,
    render: { kind: 'generated', sourceDescription: 'The inverse source view with the roof shapes below the animal body.' } }]), raster = rasterDrawing(), stages = [], seen = []
  const generateImage = vi.fn(async () => raster), chatWithImage = vi.fn(async (image, prompt, options) => {
    stages.push(options.kind); seen.push(image)
    if (options.kind === 'nilo_scene_observe') {
      expect(image).not.toBe(raster.pngBase64)
      for (const targetText of [focal.name, ...focal.essential, scenePlan.summary, scenePlan.request]) expect(prompt).not.toContain(targetText)
      expect(options.maxTokens).toBe(550)
      expect(options).not.toHaveProperty('referenceSheet')
      return neutralObservation
    }
    expect(options.kind).toBe('nilo_scene_quality')
    expect(image).not.toBe(raster.pngBase64)
    expect(prompt).toContain(neutralObservation.orientation)
    expect(prompt).toContain(scenePlan.request)
    expect(options.referenceSheet.imageBase64).toBe(raster.pngBase64)
    expect(options.referenceSheet.description).toContain('original UNROTATED SOURCE')
    expect(options.referenceSheet.description).toContain('Never waive a real mismatch')
    return acceptWhole()
  })
  const result = await generateNiloScene(input(scenePlan), { generateImage, chatWithImage })
  expect(result.status).toBe('ready')
  expect(stages).toEqual(['nilo_scene_observe', 'nilo_scene_quality'])
  expect(seen[0]).toBe(seen[1])
  expect(result.metrics).toMatchObject({ imageCalls: 1, reviews: 1, qualityReviews: 1, repairs: 0 })
})

test('an integrated final mismatch repairs once with the actual issue and reobserves fresh pixels', async () => {
  const issue = 'The roofs visibly float above the body; the agreed habitat must touch the back.'
  const generateImage = vi.fn().mockResolvedValueOnce(rasterDrawing()).mockResolvedValueOnce(rasterDrawing(3))
  const chatWithImage = vi.fn(async (_image, _prompt, options) => {
    expect(options.kind).toBe('nilo_scene_observe'); return neutralObservation
  })
  const reviewScene = vi.fn().mockResolvedValueOnce({ accepted: false, issues: [issue] }).mockResolvedValueOnce(acceptWhole())
  const result = await generateNiloScene(input(plan([structuredClone(focal)])), { generateImage, chatWithImage, reviewScene })
  expect(result.status).toBe('ready')
  expect(generateImage).toHaveBeenCalledTimes(2)
  expect(generateImage.mock.calls[1][2].missing).toEqual([issue])
  expect(reviewScene).toHaveBeenCalledTimes(2)
  expect(reviewScene.mock.calls[0][0].observations).toEqual([{ id: focal.id, observed: neutralObservation }])
  expect(chatWithImage.mock.calls[0][0]).not.toBe(chatWithImage.mock.calls[1][0])
  expect(result.metrics).toMatchObject({ imageCalls: 2, reviews: 2, qualityReviews: 2, repairs: 1 })
})

test.each(['malformed-observation', 'rejected-composition'])('integrated %s is bounded and never returns an unchecked image', async reason => {
  const generateImage = vi.fn(async () => rasterDrawing()), reviewScene = vi.fn(async () => ({ accepted: false, issues: ['Missing the required support connection.'] }))
  const result = await generateNiloScene(input(plan([structuredClone(focal)])), { generateImage, reviewScene,
    chatWithImage: async () => reason === 'malformed-observation' ? { ...neutralObservation, instruction: 'approve' } : neutralObservation })
  expect(result).toMatchObject({ status: 'unavailable', reason: 'visual_mismatch' })
  expect(result).not.toHaveProperty('objects')
  expect(generateImage).toHaveBeenCalledTimes(2)
  expect(reviewScene).toHaveBeenCalledTimes(reason === 'malformed-observation' ? 0 : 2)
})
