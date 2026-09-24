// 画作特征提取：多模态 LLM → 结构化特征 JSON
// 特征输入校验与门控（knowledge/observation/README.md）：
//   1. 每维度必须带 confidence 0-1
//   2. server 丢弃 confidence < 0.5 的维度，不进检索
//   3. 先输出 rawDescription 再给特征，描述原文入库供人工抽查
import { chatWithImage as defaultChatWithImage } from './llmClient.js'

export const FEATURE_DIMENSIONS = ['elements', 'colors', 'composition', 'distortions', 'erasureMarks']
export const GATE_THRESHOLD = 0.5

const COMPOSITION_ENUMS = {
  size: ['small', 'normal', 'large'],
  position: ['center', 'corner', 'edge', 'bottom'],
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
  return `你是5–12岁儿童绘画的画面观察员。只记录看得见的笔迹，不推测情绪、人格、家庭或创作动机。不要把 Nilo 的笔迹当成孩子的笔迹。
不确定的对象不要猜名称；空白区域不代表某个部位“缺失”。物体位置用完整画布的 0–1 坐标估计；看不清就标为 unclear，不要编造方框。
静态图像不能测量实际笔压、擦除次数；pressure 固定 normal，erasureMarks 固定 0。

先输出一段自然语言画面描述（rawDescription），再输出结构化特征。严格输出如下 JSON（不要输出任何其他文字）：
{
  "rawDescription": "画面中有什么、位置、颜色、笔触的客观描述",
  "elements": ["画面元素，英文枚举，如 house/tree/person/sun/moon/cloud/rain/flower/animal/mountain/river"],
  "objects": [{"label":"tree", "visibility":"visible", "bbox":{"x":0.1,"y":0.2,"width":0.3,"height":0.4}, "confidence":0.8}],
  "colors": { "dominant": ["主色调英文"], "darkRatio": 0.0到1.0的深色占比 },
  "composition": { "size": "small|normal|large", "position": "center|corner|edge|bottom", "pressure": "normal" },
  "distortions": [],
  "erasureMarks": 0,
  "confidence": { "elements": 0.0, "colors": 0.0, "composition": 0.0, "distortions": 0.0, "erasureMarks": 0.0 }
}
objects 最多 12 个。bbox 必须落在画布内；unclear 对象的 bbox 为 null。不要凭空补全看不见的部分。
confidence 是模型自评，不是经样本校准的准确率；看不清就给低分。`
}

export function validateFeatures(obj, { gated = false } = {}) {
  const fail = msg => { throw new FeatureExtractionError(`invalid features: ${msg}`, obj) }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) fail('not an object')
  if (typeof obj.rawDescription !== 'string' || !obj.rawDescription.trim()) fail('rawDescription required')
  const strings = v => Array.isArray(v) && v.length <= 100 && v.every(s => typeof s === 'string' && s.length > 0 && s.length <= 100)
  if (obj.rawDescription.length > 10000) fail('rawDescription too long')
  if (!strings(obj.elements)) fail('elements must be string array')
  if (obj.objects !== undefined) {
    if (!Array.isArray(obj.objects) || obj.objects.length > 12) fail('objects must be array of at most 12')
    for (const object of obj.objects) {
      if (!object || typeof object.label !== 'string' || object.label.length < 1 || object.label.length > 60
        || !['visible', 'unclear'].includes(object.visibility)
        || !Number.isFinite(object.confidence) || object.confidence < 0 || object.confidence > 1) fail('invalid object')
      const box = object.bbox
      if (object.visibility === 'unclear' && box !== null) fail('unclear object must have null bbox')
      if (object.visibility === 'visible' && (!box || !['x', 'y', 'width', 'height'].every(k => Number.isFinite(box[k]) && box[k] >= 0 && box[k] <= 1)
        || box.width <= 0 || box.height <= 0 || box.x + box.width > 1 || box.y + box.height > 1)) fail('invalid object bbox')
    }
  }
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
  if (dropped.includes('elements')) gated.objects = []
  else if (Array.isArray(gated.objects)) gated.objects = gated.objects.filter(o => o.visibility === 'visible' && o.confidence >= 0.5)
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
