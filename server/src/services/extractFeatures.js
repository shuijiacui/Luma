// 画作特征提取：多模态 LLM → 结构化特征 JSON
// 防幻觉三闸（docs/RAG设计.md「特征可信度过滤」）：
//   1. 每维度必须带 confidence 0-1
//   2. server 丢弃 confidence < 0.5 的维度，不进检索
//   3. 先输出 rawDescription 再给特征，描述原文入库供人工抽查
import { chatWithImage as defaultChatWithImage } from './llmClient.js'

export const FEATURE_DIMENSIONS = ['elements', 'colors', 'composition', 'distortions', 'erasureMarks']
export const GATE_THRESHOLD = 0.5

const COMPOSITION_ENUMS = {
  size: ['small', 'normal', 'large'],
  position: ['center', 'corner', 'edge'],
  pressure: ['light', 'normal', 'heavy'],
}

export class FeatureExtractionError extends Error {
  constructor(message, raw) {
    super(message)
    this.name = 'FeatureExtractionError'
    this.raw = raw
  }
}

export function buildExtractionPrompt() {
  return `你是儿童绘画观察员。只描述画面客观元素，不做任何心理解读、不推测情绪。

先输出一段自然语言画面描述（rawDescription），再输出结构化特征。严格输出如下 JSON（不要输出任何其他文字）：
{
  "rawDescription": "画面中有什么、位置、颜色、笔触的客观描述",
  "elements": ["画面元素，英文枚举，如 house/tree/person/sun/moon/cloud/rain/flower/animal/mountain/river"],
  "colors": { "dominant": ["主色调英文"], "darkRatio": 0.0到1.0的深色占比 },
  "composition": { "size": "small|normal|large", "position": "center|corner|edge", "pressure": "light|normal|heavy" },
  "distortions": ["扭曲/异常特征英文，如 blackened_sun/bent_tree/missing_hands/missing_feet/hands_behind_back"],
  "erasureMarks": 明显涂改次数（整数）,
  "confidence": { "elements": 0.0, "colors": 0.0, "composition": 0.0, "distortions": 0.0, "erasureMarks": 0.0 }
}
confidence 是你对每个维度提取把握的诚实自评（0-1），看不清就给低分。`
}

export function validateFeatures(obj, { gated = false } = {}) {
  const fail = msg => { throw new FeatureExtractionError(`invalid features: ${msg}`, obj) }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) fail('not an object')
  if (typeof obj.rawDescription !== 'string' || !obj.rawDescription.trim()) fail('rawDescription required')
  const strings = v => Array.isArray(v) && v.length <= 100 && v.every(s => typeof s === 'string' && s.length > 0 && s.length <= 100)
  if (obj.rawDescription.length > 10000) fail('rawDescription too long')
  if (!strings(obj.elements)) fail('elements must be string array')
  if (!(gated && obj.colors === null) && (!obj.colors || !strings(obj.colors.dominant))) fail('colors.dominant must be string array')
  if (!(gated && obj.colors === null) && (!Number.isFinite(obj.colors.darkRatio) || obj.colors.darkRatio < 0 || obj.colors.darkRatio > 1))
    fail('colors.darkRatio must be number in [0,1]')
  for (const [k, enums] of Object.entries(COMPOSITION_ENUMS)) {
    if (!(gated && obj.composition === null) && !enums.includes(obj.composition?.[k])) fail(`composition.${k} must be one of ${enums.join('/')}`)
  }
  if (!strings(obj.distortions)) fail('distortions must be string array')
  if (!Number.isInteger(obj.erasureMarks) || obj.erasureMarks < 0) fail('erasureMarks must be non-negative integer')
  for (const dim of FEATURE_DIMENSIONS) {
    const c = obj.confidence?.[dim]
    if (!Number.isFinite(c) || c < 0 || c > 1) fail(`confidence.${dim} must be number in [0,1]`)
  }
  return true
}

// L1→L2 闸门：丢弃 confidence < threshold 的维度（中性化处理，不参与检索）
export function gateFeatures(features, threshold = GATE_THRESHOLD) {
  const dropped = []
  const gated = { ...features, confidence: { ...features.confidence } }
  for (const dim of FEATURE_DIMENSIONS) {
    const c = features.confidence?.[dim]
    if (typeof c !== 'number' || c < threshold) {
      dropped.push(dim)
      if (dim === 'elements') gated.elements = []
      else if (dim === 'colors') gated.colors = null
      else if (dim === 'composition') gated.composition = null
      else if (dim === 'distortions') gated.distortions = []
      else if (dim === 'erasureMarks') gated.erasureMarks = 0
    }
  }
  if (dropped.length) console.warn(`[gate] dropped low-confidence dimensions: ${dropped.join(', ')}`)
  return { features: gated, dropped }
}

export function allDimensionsEmpty(features) {
  if (!features) return true
  return (features.elements?.length ?? 0) === 0
    && (features.distortions?.length ?? 0) === 0
    && (features.erasureMarks ?? 0) === 0
    && !features.colors
    && !features.composition
}

// 每次上传完整画布：当前快照替代旧快照，不能把整幅图当增量累加。
export function mergeFeatures(prior, next) {
  return next
}

export async function extractFeatures(imageBase64, { chatWithImage = defaultChatWithImage } = {}) {
  const raw = await chatWithImage(imageBase64, buildExtractionPrompt())
  validateFeatures(raw) // 非法 → FeatureExtractionError（带 raw）
  const { features, dropped } = gateFeatures(raw)
  return { ...features, droppedDimensions: dropped }
}
