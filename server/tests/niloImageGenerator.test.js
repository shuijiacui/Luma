import { expect, test, vi } from 'vitest'
import { PNG } from 'pngjs'
import { generateNiloImage, generatedRasterFromPng, generatedObjectPrompt, niloImageConfig, trustedGeneratedImageUrl } from '../src/services/niloImageGenerator.js'
import { validateGeneratedRaster } from '../../shared/niloGeneratedRaster.mjs'
import { thinkingOptions } from '../src/services/llmClient.js'
import { niloSceneModelConfig } from '../src/services/niloSceneModels.js'

function drawing() {
  const png = new PNG({ width: 80, height: 60 }); png.data.fill(255)
  for (let y = 10; y < 50; y++) for (let x = 10; x < 70; x++) if (x < 13 || x > 66 || y < 13 || y > 46) {
    const at = (y * 80 + x) * 4; png.data[at] = png.data[at + 1] = png.data[at + 2] = 0
  }
  return PNG.sync.write(png)
}
const object = { id: 'focal', name: '风中的小屋', essential: ['完整小屋和张开的翅膀'], box: { x: .1, y: .1, width: .8, height: .7 } }
const plan = { request: '画长翅膀的小屋，别改我的树', summary: '小屋张开两侧的翅膀。', preserve: ['孩子原来的树'] }
const config = { enabled: true, baseUrl: 'https://ws-test.cn-beijing.maas.aliyuncs.com', apiKey: 'synthetic-secret', model: 'qwen-image-3.0', timeoutMs: 1000 }

test('scene image configuration is regional, optional and separate from global chat/voice model choices', () => {
  expect(niloImageConfig({}).enabled).toBe(false)
  const env = { VOICE_PROVIDER: 'dashscope', VOICE_BASE_URL: config.baseUrl, VOICE_API_KEY: config.apiKey, LLM_TEXT_MODEL: 'parent-text', LLM_VISION_MODEL: 'parent-vision' }
  expect(niloImageConfig(env)).toMatchObject({ enabled: true, model: 'qwen-image-3.0' })
  expect(niloImageConfig({ ...env, NILO_IMAGE_ENABLED: 'false' }).enabled).toBe(false)
  expect(niloImageConfig({ ...env, NILO_IMAGE_BASE_URL: 'https://evil.test' }).enabled).toBe(false)
  expect(niloSceneModelConfig(env)).toMatchObject({ textModel: 'qwen3.8-max', visionModel: 'qwen3.8-max' })
  expect(niloSceneModelConfig({ ...env, NILO_SCENE_PROVIDER: 'default' })).toMatchObject({ textModel: 'parent-text', visionModel: 'parent-vision' })
  expect(env.LLM_TEXT_MODEL).toBe('parent-text')
})

test('provider-specific thinking control applies only to the intended host and model', () => {
  expect(thinkingOptions({ baseUrl: config.baseUrl }, 'qwen3.6-plus', true)).toEqual({ enable_thinking: false })
  expect(thinkingOptions({ baseUrl: config.baseUrl }, 'qwen3.6-plus', false)).toEqual({})
  expect(thinkingOptions({ baseUrl: 'https://not-maas.aliyuncs.com.example.com' }, 'qwen3.6-plus', true)).toEqual({})
  expect(thinkingOptions({ baseUrl: config.baseUrl }, 'another-model', true)).toEqual({})
})

test('new and variant prompts retain the full fused identity and exclusions without including a real child image', () => {
  const prompt = generatedObjectPrompt(object, plan, { variation: true, missing: ['翅膀必须连接墙面'] })
  for (const value of [object.name, ...object.essential, plan.request, plan.summary, ...plan.preserve, '保持同一个主体', '翅膀必须连接墙面']) expect(prompt).toContain(value)
  expect(prompt).not.toContain('base64')
})

test('generation names separately rendered subjects so whole-plan context cannot silently duplicate them', () => {
  const prompt = generatedObjectPrompt(object, { ...plan, objects: [object, { id: 'other', name: '小火箭', essential: ['圆窗和尾翼'] }] })
  expect(prompt).toContain('本图不得重复出现')
  expect(prompt).toContain('"name":"小火箭","features":["圆窗和尾翼"]')
})

test('an explicit source view draws in source coordinates while the approved final contract stays with the application', () => {
  const sourceDescription = 'A suspended ladder with its broad platform below and a loop above.'
  const turned = { ...object, rotation: 180, render: { kind: 'generated', sourceDescription } }
  const prompt = generatedObjectPrompt(turned, plan, { missing: ['The final loop belongs below the platform.'] })
  expect(prompt).toContain(sourceDescription)
  expect(prompt).toContain('不再旋转或翻转')
  expect(prompt).toContain('反向修正')
  // Conflicting final-coordinate prose cannot bias the image generator back
  // into the wrong orientation; it is retained by planning and pixel review.
  expect(prompt).not.toContain(plan.summary)
  expect(prompt).not.toContain(plan.request)
  expect(generatedObjectPrompt({ ...turned, rotation: 0 }, plan)).not.toContain(sourceDescription)
})

test('image download permits only signed provider result hosts and does not leak authorization', async () => {
  const url = 'https://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/example.png?Expires=123'
  const fetchImpl = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ url }] })))
    .mockResolvedValueOnce(new Response(drawing(), { headers: { 'content-type': 'image/png' } }))
  const result = await generateNiloImage(object, plan, { config, fetchImpl })
  expect(validateGeneratedRaster(result)).not.toBeNull()
  expect(result).not.toHaveProperty('url')
  expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe('Bearer synthetic-secret')
  expect(fetchImpl.mock.calls[1][1]).not.toHaveProperty('headers')
  expect(fetchImpl.mock.calls[1][1].redirect).toBe('error')
  expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toMatchObject({ model: config.model, n: 1, enable_thinking: false, prompt_extend: false })
})

test('accepts the observed Qwen image acceleration bucket without allowing arbitrary OSS buckets', () => {
  const url = 'https://dashscope-a717.oss-accelerate.aliyuncs.com/example.png?Expires=123'
  expect(trustedGeneratedImageUrl(url)).toBe(url)
  expect(() => trustedGeneratedImageUrl('https://other.oss-accelerate.aliyuncs.com/a.png')).toThrow('invalid_image_response')
  expect(() => trustedGeneratedImageUrl('https://dashscope-a717.oss-accelerate.aliyuncs.com.evil.test/a.png')).toThrow('invalid_image_response')
})

test.each(['http://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/a.png', 'https://127.0.0.1/a.png', 'https://example.com/a.png', 'https://dashscope-result-bj.oss-cn-beijing.aliyuncs.com.evil.test/a.png', 'https://key@dashscope-result-bj.oss-cn-beijing.aliyuncs.com/a.png'])('rejects untrusted generated asset URL %s', url => {
  expect(() => trustedGeneratedImageUrl(url)).toThrow('invalid_image_response')
})

test('PNG normalization preserves proportions, strips ancillary data and produces a bounded self-contained guide', () => {
  const result = generatedRasterFromPng(drawing()), restored = PNG.sync.read(Buffer.from(result.pngBase64, 'base64'))
  expect(validateGeneratedRaster(result)).not.toBeNull()
  expect(restored.width / restored.height).toBe(80 / 60)
  expect(Buffer.byteLength(result.pngBase64, 'base64')).toBeLessThan(250000)
  for (let i = 0; i < restored.data.length; i += 4) {
    expect(restored.data[i]).toBe(restored.data[i + 1]); expect(restored.data[i]).toBe(restored.data[i + 2]); expect(restored.data[i + 3]).toBe(255)
  }
})

test('invalid, oversized-header and blank PNGs cannot be issued as generated references', () => {
  const empty = new PNG({ width: 20, height: 20 }); empty.data.fill(255)
  const largeHeader = Buffer.from(drawing()); largeHeader.writeUInt32BE(200000, 16)
  for (const bytes of [Buffer.from('not an image'), largeHeader, PNG.sync.write(empty)]) expect(() => generatedRasterFromPng(bytes)).toThrow('invalid_generated_image')
})

test('dense valid artwork stays available as a gray guide when tracing exceeds the path budget', () => {
  const png = new PNG({ width: 640, height: 640 }); png.data.fill(255)
  for (let y = 5; y < 630; y += 10) for (let x = 5; x < 630; x += 10) {
    for (let dy = 0; dy < 5; dy++) for (let dx = 0; dx < 5; dx++) if (!dx || !dy || dx === 4 || dy === 4) {
      const i = ((y + dy) * 640 + x + dx) * 4
      png.data[i] = png.data[i + 1] = png.data[i + 2] = 0
    }
  }
  const result = generatedRasterFromPng(PNG.sync.write(png))
  expect(result.projection).toBe('gray')
  expect(validateGeneratedRaster(result)).not.toBeNull()
  expect(result).not.toHaveProperty('paths')
  expect(PNG.sync.read(Buffer.from(result.pngBase64, 'base64')).width).toBe(640)
})

test('provider error responses never expose credentials or provider payload text', async () => {
  await expect(generateNiloImage(object, plan, { config, fetchImpl: async () => new Response('synthetic-secret prompt private', { status: 403 }) }))
    .rejects.toThrow('image_provider_error')
  await expect(generateNiloImage(object, plan, { config: { enabled: false } })).rejects.toThrow('image_model_unavailable')
})
