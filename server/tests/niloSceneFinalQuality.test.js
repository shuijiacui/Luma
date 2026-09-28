import { expect, test, vi } from 'vitest'
import { PNG } from 'pngjs'
import { generateNiloScene } from '../src/services/niloScene.js'
import { LLMParseError } from '../src/services/llmClient.js'
import { rasterGuide } from '../src/services/niloScenePreview.js'

const custom = { id: 'island', name: '漂浮岛', aliases: ['岛'], role: 'support', essential: ['悬空岛屿轮廓'], color: '#66729b', render: { kind: 'custom' }, box: { x: .56, y: .18, width: .3, height: .3 } }
const stock = { id: 'treehouse', name: '树屋', aliases: ['树屋'], role: 'main', essential: ['树屋'], color: '#66729b', render: { kind: 'illustration', illustrationId: 'illustration-library-treehouse-beginner-01' }, box: { x: .1, y: .2, width: .35, height: .45 } }
const sketch = { aspect: 1, paths: [[['M', .1, .2], ['Q', .5, .02, .9, .2], ['L', .7, .75], ['L', .4, .9], ['Z']]] }
const plan = { version: 1, title: '漂浮岛场景', summary: '树屋右侧有一座漂浮岛。', request: '画一个树屋和漂浮岛的神奇场景', objects: [stock, custom], preserve: [] }
const input = () => ({ stage: 'render', plan: structuredClone(plan), context: { requestScope: 'scene', canvasAspect: 1.4, canvasSize: { width: 840, height: 600 }, scene: { childBounds: { x: .05, y: .8, width: .2, height: .1 } } } })
const drawing = () => ({ sketch, features: [{ essential: custom.essential[0], paths: [0] }] })
const objectReview = { observed: { subject: 'A floating triangular outline', parts: ['curved top', 'pointed underside'], connections: ['outline is connected'] }, recognizable: true, features: [{ essential: custom.essential[0], visible: true }] }

test('a completed mixed scene receives a final actual-pixel review after object verification; cached geometry adds no new review', async () => {
  const request = input(), original = structuredClone(request), calls = []
  let finalImage, finalData
  const chatText = vi.fn(async (_prompt, options) => { calls.push(options.kind); expect(options.kind).toBe('nilo_scene_object'); return drawing() })
  const chatWithImage = vi.fn(async (image, prompt, options) => {
    calls.push(options.kind)
    if (options.kind === 'nilo_scene_review') { expect(PNG.sync.read(Buffer.from(image, 'base64')).width).toBe(320); return objectReview }
    expect(options.kind).toBe('nilo_scene_quality')
    finalImage = image; finalData = JSON.parse(prompt.split('SCENE QUALITY DATA: ')[1])
    expect(PNG.sync.read(Buffer.from(image, 'base64')).width).toBe(840)
    expect(finalData.phase).toBe('final_rendered_composition')
    expect(finalData.childRequest).toBe(plan.request)
    expect(finalData.proposed.objects.map(object => object.id)).toEqual(['treehouse', 'island'])
    expect(finalData.selectedAssetFacts.find(object => object.objectId === 'island').state).toContain('generated_geometry')
    expect(prompt).toContain('There is no pending-drawing exemption')
    return { accepted: true, issues: [] }
  })
  const result = await generateNiloScene(request, { chatText, chatWithImage })
  expect(result).toMatchObject({ status: 'ready', metrics: { customCalls: 1, reviews: 1, qualityReviews: 1, repairs: 0 } })
  expect(calls).toEqual(['nilo_scene_object', 'nilo_scene_review', 'nilo_scene_quality'])
  expect(Buffer.from(finalImage, 'base64')).toEqual(rasterGuide(result.objects.map(object => object.proposal), { inspection: true }))
  for (const object of result.objects) {
    const frame = finalData.proposed.objects.find(item => item.id === object.id).frame
    expect(frame).toEqual(Object.fromEntries(['x', 'y', 'width', 'height'].map(key => [key, object.proposal[key]])))
  }
  expect(request).toEqual(original)
  const cached = await generateNiloScene({ ...request, context: { ...request.context, previousScene: result } }, { chatText, chatWithImage })
  expect(cached).toMatchObject({ status: 'ready', metrics: { reused: 2, customCalls: 0, reviews: 0, qualityReviews: 0 } })
  expect(calls).toHaveLength(3)
})

test.each([
  { label: 'rejected', answer: { accepted: false, issues: ['Island and treehouse do not form the requested setting.'] }, reason: 'visual_mismatch' },
  { label: 'malformed approval', answer: { accepted: true }, reason: 'visual_mismatch' },
  { label: 'invalid JSON', error: new LLMParseError('final review truncated', '{"accepted":'), reason: 'invalid_response' },
  { label: 'provider failure', error: new Error('review provider failed'), reason: 'provider_error' },
])('a $label final review never exposes half-approved geometry or silently retries the scene', async ({ answer, error, reason }) => {
  const chatText = vi.fn(async () => drawing()), stages = []
  const chatWithImage = vi.fn(async (_image, _prompt, options) => {
    stages.push(options.kind)
    if (options.kind === 'nilo_scene_review') return objectReview
    expect(options.kind).toBe('nilo_scene_quality')
    if (error) throw error
    return answer
  })
  const result = await generateNiloScene(input(), { chatText, chatWithImage })
  expect(result).toMatchObject({ status: 'unavailable', reason, metrics: { customCalls: 1, reviews: 1, qualityReviews: 1, repairs: 0 } })
  expect(result).not.toHaveProperty('objects')
  expect(result).not.toHaveProperty('proposal')
  if (reason === 'visual_mismatch') expect(result.failedObjectIds).toEqual(['island'])
  expect(chatText).toHaveBeenCalledOnce()
  expect(stages).toEqual(['nilo_scene_review', 'nilo_scene_quality'])
})
