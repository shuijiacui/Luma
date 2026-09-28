import { PNG } from 'pngjs'
import { rasterTracingPaths, tracingProjectionMode } from './niloRasterTracing.js'

const clean = value => typeof value === 'string' ? value.trim() : ''
const failure = code => Object.assign(new Error(code), { sceneReason: code })

/** Scene-only image service. Reuses the configured regional workspace, never
 * changes the voice/chat models and never sends credentials to an asset host. */
export function niloImageConfig(env = process.env) {
  const baseUrl = clean(env.NILO_IMAGE_BASE_URL || (env.VOICE_PROVIDER === 'dashscope' ? env.VOICE_BASE_URL : ''))
  const apiKey = clean(env.NILO_IMAGE_API_KEY || (env.VOICE_PROVIDER === 'dashscope' ? env.VOICE_API_KEY : ''))
  let url
  try { url = new URL(baseUrl) } catch { return { enabled: false } }
  const trusted = url.protocol === 'https:' && !url.username && !url.password && !url.port
    && (url.hostname === 'dashscope.aliyuncs.com' || /^ws-[a-z0-9]+\.cn-beijing\.maas\.aliyuncs\.com$/.test(url.hostname))
  return { enabled: !!apiKey && trusted && env.NILO_IMAGE_ENABLED !== 'false', baseUrl: url.origin, apiKey,
    model: clean(env.NILO_IMAGE_MODEL) || 'qwen-image-3.0', timeoutMs: 28000 }
}

async function bodyBytes(response, max) {
  if (Number(response.headers?.get('content-length')) > max) throw failure('image_response_too_large')
  const chunks = []; let count = 0
  for await (const chunk of response.body) {
    count += chunk.length
    if (count > max) throw failure('image_response_too_large')
    chunks.push(Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

export function trustedGeneratedImageUrl(value) {
  let url
  try { url = new URL(value) } catch { throw failure('invalid_image_response') }
  if (url.protocol !== 'https:' || url.username || url.password || url.port
    || !(url.hostname === 'dashscope-a717.oss-accelerate.aliyuncs.com'
      || /^dashscope-result[a-z0-9-]*\.oss-[a-z0-9-]+\.aliyuncs\.com$/.test(url.hostname))) throw failure('invalid_image_response')
  return url.href
}

function decodedPng(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 33 || bytes.length > 12_000_000
    || !bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
    || bytes.toString('ascii', 12, 16) !== 'IHDR') throw failure('invalid_generated_image')
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20)
  if (width < 2 || height < 2 || width > 2048 || height > 2048 || width * height > 4_194_304) throw failure('invalid_generated_image')
  try { return PNG.sync.read(bytes, { checkCRC: true }) } catch { throw failure('invalid_generated_image') }
}

/** Re-encode bounded gray pixels, stripping all provider metadata. The complete
 * image travels with the temporary guide, so no expiring URL or public store
 * can lose or expose a child's reference. It never becomes authored ink. */
export function generatedRasterFromPng(bytes) {
  const source = decodedPng(bytes)
  let output, pngBytes
  for (const maxSide of [960, 768, 640, 512]) {
    const scale = Math.min(1, maxSide / Math.max(source.width, source.height))
    const width = Math.max(2, Math.round(source.width * scale)), height = Math.max(2, Math.round(source.height * scale))
    output = new PNG({ width, height })
    let darkPixels = 0
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const x0 = x * source.width / width, x1 = (x + 1) * source.width / width
      const y0 = y * source.height / height, y1 = (y + 1) * source.height / height
      let sum = 0, area = 0
      for (let sy = Math.floor(y0); sy < Math.ceil(y1); sy++) for (let sx = Math.floor(x0); sx < Math.ceil(x1); sx++) {
        const weight = (Math.min(x1, sx + 1) - Math.max(x0, sx)) * (Math.min(y1, sy + 1) - Math.max(y0, sy))
        const i = (sy * source.width + sx) * 4, a = source.data[i + 3] / 255
        const gray = (.2126 * source.data[i] + .7152 * source.data[i + 1] + .0722 * source.data[i + 2]) * a + 255 * (1 - a)
        sum += gray * weight; area += weight
      }
      const gray = Math.min(255, Math.round(sum / area / 4) * 4), i = (y * width + x) * 4
      output.data[i] = output.data[i + 1] = output.data[i + 2] = gray; output.data[i + 3] = 255
      if (gray < 210) darkPixels++
    }
    if (darkPixels < width * height * .0005 || darkPixels > width * height * .55) throw failure('invalid_generated_image')
    pngBytes = PNG.sync.write(output, { colorType: 0, inputColorType: 6, bitDepth: 8, deflateLevel: 9 })
    if (pngBytes.length <= 250000) break
  }
  if (pngBytes.length > 250000) throw failure('image_response_too_large')
  let trace, dashed = false
  try {
    trace = rasterTracingPaths(output)
    const points = trace.paths.reduce((sum, path) => sum + path.length, 0)
    dashed = tracingProjectionMode(trace) === 'dashed' && trace.paths.length > 0 && trace.paths.length <= 1500 && points <= 50000
      && JSON.stringify(trace.paths).length <= 250000
  } catch {
    // Dense artwork remains a readable gray guide when vector tracing cannot
    // fit its bounded budget. Valid PNG pixels have already been verified.
  }
  return { version: 1, pngBase64: pngBytes.toString('base64'), width: output.width, height: output.height,
    projection: dashed ? 'dashed' : 'gray', ...(dashed ? { paths: trace.paths } : {}) }
}

export function generatedObjectPrompt(object, plan, { missing = [], variation = false } = {}) {
  const separate = (plan.objects ?? []).filter(item => item.id !== object.id).map(item => ({ name: item.name, features: item.essential }))
  const sourceView = object.rotation === 180 && typeof object.render?.sourceDescription === 'string' ? object.render.sourceDescription : null
  // Give the image model an artist's brief. Repeated renderer/schema language
  // encouraged detached reference sheets instead of one connected scene.
  const brief = sourceView
    ? `画出以下完整画面，严格按所述上下左右方向，不再旋转或翻转：${sourceView}`
    : `画一幅完整、连贯的儿童绘本画面：${separate.length ? object.name : plan.summary}\n具体主体：${object.name}\n具体形态要求：${(object.essential ?? []).join('；')}\n孩子的原始要求（保留明确的特征和排除项）：${plan.request}`
  return [brief,
    '让主体处于同一个连贯空间，接触、承托、包含或道路连接关系清楚可见。突出主场景，完整轮廓留在画内，四周留少量白边。材质通过形状和结构体现，建筑入口与居住者比例相称。',
    '画风：精致而简洁的儿童涂色书，统一中等粗细的黑色顺滑轮廓线，纯白背景，留出供孩子涂色和继续画的空间。整张图只是一幅画面，不附带其他角度、局部示意或分散的小素材。不要文字、边框、颜色、阴影、排线或密集小装饰。',
    separate.length ? `本图只画指定主体及其组成部分。以下物品由外部单独绘制，本图不得重复出现，即使原始要求提及它们：${JSON.stringify(separate)}` : '',
    plan.preserve?.length ? `以下内容已在孩子的画布上，是定位参照，本图不要重画或复制：${JSON.stringify(plan.preserve)}` : '',
    variation ? '在保持同一个主体、含义和所有必要特征的前提下，换一种画法，不要换成别的物品。' : '',
    missing.length ? `修正上次缺失的可见特征${sourceView ? '（反馈描述的是本图旋转180度后的最终画面，请对本图做反向修正）' : ''}：${JSON.stringify(missing)}` : '',
  ].filter(Boolean).join('\n')
}

export async function generateNiloImage(object, plan, { config = niloImageConfig(), signal, fetchImpl = fetch, missing, variation } = {}) {
  if (!config.enabled) throw failure('image_model_unavailable')
  const requestSignal = AbortSignal.any([AbortSignal.timeout(config.timeoutMs ?? 28000), ...(signal ? [signal] : [])])
  const aspect = Math.max(.5, Math.min(2, (object.box.width * (plan.canvasAspect ?? 1.4)) / object.box.height))
  const size = aspect > 1.15 ? '1024x768' : aspect < .87 ? '768x1024' : '1024x1024'
  const response = await fetchImpl(`${config.baseUrl}/compatible-mode/v1/images/generations`, { method: 'POST', redirect: 'error', signal: requestSignal,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify({ model: config.model, prompt: generatedObjectPrompt(object, plan, { missing, variation }), size, n: 1,
      // The planner already supplies a complete checked shape/placement
      // contract. A second automatic rewrite can reinterpret those directions
      // or add detail that the child never approved.
      prompt_extend: false, enable_thinking: false, watermark: false }) })
  if (!response.ok) throw failure('image_provider_error')
  let result
  try { result = JSON.parse((await bodyBytes(response, 256000)).toString('utf8')) } catch (error) { throw error.sceneReason ? error : failure('invalid_image_response') }
  if (!Array.isArray(result.data) || result.data.length !== 1) throw failure('invalid_image_response')
  const imageUrl = trustedGeneratedImageUrl(result.data[0]?.url)
  const image = await fetchImpl(imageUrl, { redirect: 'error', signal: requestSignal })
  if (!image.ok) throw failure('image_provider_error')
  const raster = generatedRasterFromPng(await bodyBytes(image, 12_000_000))
  requestSignal.throwIfAborted()
  return raster
}
