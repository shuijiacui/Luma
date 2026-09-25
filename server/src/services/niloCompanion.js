// Nilo 共创（方案 B）：把孩子的当前画面交给多模态模型，只返回「添一笔」的结构化指令。
// 关键约束：只画一笔、不写字、不覆盖主体、坐标归一化、内容安全；模型慢/失败时由前端降级为本地规则笔触。
import { chatWithImage as defaultChatWithImage, LLMParseError } from './llmClient.js'

export const NILO_STROKE_KINDS = [
  'dot', 'wave', 'line', 'star', 'heart', 'sun', 'cloud', 'flower', 'zigzag', 'spiral', 'leaf',
]
/** 服务端兜底超时：超过就交给前端本地规则笔触，孩子不会卡住 */
export const DEFAULT_NILO_TIMEOUT_MS = 8000
const MAX_POINTS = 24
const MAX_SAY_LENGTH = 30
const FORBIDDEN_WORDS = ['杀', '死', '血', '鬼', '恐怖', '暴力', '枪', '刀', '打人', '爆炸', '车祸', '尸体']

/** 给多模态模型的提示词：只输出一笔的 JSON 指令 */
export function buildNiloStrokePrompt({ mode = 'turn', locale = 'zh', strokes = 0, recentColors = [], lastStroke = null, inkGrid = [], intent = 'companion', recentKinds = [] } = {}) {
  const sayRule = locale === 'en'
    ? 'say 用英文，不超过 8 个单词'
    : 'say 用中文，不超过 18 个字'
  return `你是温柔的小水獭 Nilo，正在陪 5-10 岁的孩子画画。
请看这张孩子正在画的画，然后只决定"添一笔"：一个简单、柔和、孩子能看懂的形状或线条。

必须遵守的规则：
1. 只画一笔（一条连续路径），不要写任何文字、字母或数字。
2. 不覆盖、不涂改孩子已经画好的内容；尽量选画面里相对空的位置下笔。
2.1 先花一秒判断孩子在画什么（船 / 房子 / 人物 / 小动物 / 自然 / 抽象线条都可以），再决定添一笔和它有关的东西：
    - 船、道路、旅行 → 小海浪、小鱼、云朵
    - 房子、家 → 太阳、小花、树
    - 人物、伙伴 → 气球、小伙伴、爱心
    - 动物、自然 → 小草、叶子、星星
    - 实在看不出内容 → 顺着孩子最后一笔的方向轻轻延伸一下，像一次"接力"。
3. 内容必须温和友善：禁止恐怖、暴力、血腥、武器、受伤、死亡等任何不适内容。
4. 坐标使用归一化数值：x、y 都在 0 到 1 之间，左上角是 (0,0)，右下角是 (1,1)。
5. kind 只能从这些里选一个：dot(小点) / wave(波浪) / line(短线) / star(星星) / heart(爱心) / sun(太阳) / cloud(云朵) / flower(小花) / zigzag(折线) / spiral(螺旋) / leaf(叶子)。
6. color 用柔和的十六进制色，如 #6fa8d8 / #e4a86a / #8fbf7a / #d98fa6 / #7a82d8。
6.1 形状要换着来，不要总是画星星：优先波浪、云朵、小花、小鱼、太阳、叶子、小点、螺旋等；${recentKinds.length ? `最近已经画过 ${recentKinds.join('、')}，这一次请换一个不一样的。` : '也不要连续两次画同一种形状。'}
7. points 给 3 到 16 个点；width 取 3 到 12。
8. ${sayRule}，温柔鼓励，不含任何恐怖暴力内容。
9. ${mode === 'ask'
    ? '这是孩子主动邀请你接一笔，请清楚、完整地画出一个好看的形状。'
    : '孩子还在画，你只是轻轻补一笔，越简单越好。'}
10. ${strokes > 0
    ? `孩子已经画了大约 ${strokes} 笔，画面可能比较丰富，请挑还没有东西的地方。`
    : '画面可能还很空，可以画一个小点或小波浪陪孩子开始。'}
${recentColors.length ? `11. 孩子最近用过这些颜色：${recentColors.join('、')}，可以呼应其中一种。` : ''}
${lastStroke ? `12. 孩子刚刚画的最后一笔：颜色 ${lastStroke.color}，粗细约 ${lastStroke.width}，路径点 ${JSON.stringify(lastStroke.points)}（归一化坐标）。可以顺着它延伸，或在它旁边呼应它。` : ''}
${Array.isArray(inkGrid) && inkGrid.length === 16 ? `13. 画面内容分布（4×4 网格，从左到右、从上到下，数值越大表示那一格画得越多）：${inkGrid.join(', ')}。请在这些数值较大的格子旁边下笔，不要孤零零地放在完全空白的角落。` : ''}
${intent === 'echo' ? '14. 这一轮的意图：顺着孩子最后一笔的方向轻轻延伸/呼应它。' : intent === 'detail' ? '15. 这一轮的意图：在孩子已经画好的内容旁边补一个小细节（小点、小星星、小花）。' : '16. 这一轮的意图：给孩子画的内容添一个相关的小伙伴或元素，让它看起来像在互动。'}

只输出 JSON，不要解释、不要代码块：
{"kind":"wave","points":[[0.2,0.7],[0.25,0.66],[0.3,0.7]],"color":"#6fa8d8","width":6,"say":"我在这里加一条小波浪～"}`
}

function normalizePoints(rawPoints) {
  const out = []
  for (const point of Array.isArray(rawPoints) ? rawPoints.slice(0, MAX_POINTS) : []) {
    const x = Array.isArray(point) ? Number(point[0]) : Number(point?.x)
    const y = Array.isArray(point) ? Number(point[1]) : Number(point?.y)
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null
    if (x < 0 || x > 1 || y < 0 || y > 1) return null
    out.push({ x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000 })
  }
  return out.length >= 2 ? out : null
}

/** 服务端校验与净化：任何越界坐标、非法颜色/宽度、不适措辞都会被拒绝（→ 前端降级） */
export function validateNiloStroke(raw) {
  if (!raw || typeof raw !== 'object') return null
  const kind = typeof raw.kind === 'string' ? raw.kind.trim().toLowerCase() : ''
  if (!NILO_STROKE_KINDS.includes(kind)) return null

  const points = normalizePoints(raw.points)
  if (!points) return null

  const color = typeof raw.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(raw.color.trim())
    ? raw.color.trim().toLowerCase()
    : null
  if (!color) return null

  const width = Math.round(Number(raw.width))
  if (!Number.isFinite(width) || width < 2 || width > 20) return null

  const say = typeof raw.say === 'string'
    ? raw.say.replace(/\s+/g, ' ').trim().slice(0, MAX_SAY_LENGTH)
    : ''
  if (FORBIDDEN_WORDS.some(word => say.includes(word))) return null

  return { kind, points, color, width, say }
}

async function withTimeout(run, timeoutMs) {
  let timer
  try {
    return await Promise.race([
      run(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('nilo_timeout')), timeoutMs)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/** 有些模型会先输出一段话再给 JSON，这里做一次宽松提取 */
function extractLooseJson(text) {
  if (typeof text !== 'string') return null
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try { return JSON.parse(text.slice(start, end + 1)) } catch { return null }
}

/** 生成一笔；失败/超时/非法都返回 { stroke: null }，由前端用本地规则笔触兜底 */
export async function generateNiloStroke({
  imageBase64,
  context = {},
  chatWithImage = defaultChatWithImage,
  timeoutMs = DEFAULT_NILO_TIMEOUT_MS,
} = {}) {
  if (typeof imageBase64 !== 'string' || !imageBase64) return { stroke: null, reason: 'image_required' }
  if (typeof chatWithImage !== 'function') return { stroke: null, reason: 'model_unavailable' }
  const prompt = buildNiloStrokePrompt(context)
  try {
    const raw = await withTimeout(
      () => chatWithImage(imageBase64, prompt, {
        maxTokens: 2000,
        // 强制 JSON 输出，否则 DeepSeek 会先输出推理文字导致解析失败
        responseFormat: { type: 'json_object' },
        signal: typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(timeoutMs) : undefined,
      }),
      timeoutMs,
    )
    const stroke = validateNiloStroke(raw)
    return stroke ? { stroke } : { stroke: null, reason: 'invalid_stroke' }
  } catch (error) {
    // 模型仍可能夹带解释文字：从原始输出里再捞一次 JSON
    if (error instanceof LLMParseError) {
      const stroke = validateNiloStroke(extractLooseJson(error.raw))
      if (stroke) return { stroke }
    }
    return { stroke: null, reason: error instanceof Error ? error.message : 'nilo_failed' }
  }
}

/** 看图夸奖 + 下一步建议的提示词 */
export function buildNiloPraisePrompt({ locale = 'zh', strokes = 0, recentColors = [], lastStroke = null, inkGrid = [] } = {}) {
  const lang = locale === 'en' ? 'praise 与 suggestion 都用英文，分别不超过 10 个单词' : 'praise 与 suggestion 都用中文，praise ≤18 字、suggestion ≤20 字'
  return `你是温柔的小水獭 Nilo，正在看 5-10 岁孩子画的画。
请认真看画面里真实存在的东西（线条、颜色、形状、人物、动物、景物），然后输出 JSON：
{"praise":"一句具体的夸奖","suggestion":"一个下一步的小建议"}

要求：
1. ${lang}。
2. 夸奖要具体：说出你看到的东西，例如"这条线弯弯的，好像一条小路～""这个颜色暖暖的，像晒过太阳"，不要只说"你真棒"。
3. 建议要孩子马上能做到，例如"可以试着画一条小鱼""要不要在旁边加一个小太阳"。
4. 只描述画面里真实看得到的颜色、线条、形状或孩子明确说出的选择，不确定就不要编造，也不要从一张图猜测努力程度、感受或性格。
   语气像一起画画的朋友，开头和句式可以变化；不用每次都说“太棒了”，不打分、不比较、不称赞天赋。建议是邀请，不是要求，孩子可以画自己的版本。
5. 温和友善，禁止恐怖、暴力、血腥、武器、受伤、死亡等内容。
${strokes > 0 ? `6. 孩子已经画了大约 ${strokes} 笔，画面可能比较丰富。` : '6. 画面可能还比较简单，多鼓励孩子继续画。'}
${lastStroke ? `7. 孩子最后一笔：颜色 ${lastStroke.color}，粗细约 ${lastStroke.width}，路径点 ${JSON.stringify(lastStroke.points)}（归一化坐标）。夸奖可以描述这一笔。` : ''}
${Array.isArray(inkGrid) && inkGrid.length === 16 ? `8. 画面内容分布（4×4，数值越大表示那一格画得越多）：${inkGrid.join(', ')}。` : ''}
${recentColors.length ? `9. 孩子最近用过的颜色：${recentColors.join('、')}。` : ''}

只输出 JSON，不要解释、不要代码块。`
}

/** 校验模型给的夸奖/建议：长度与内容安全 */
export function validateNiloPraise(raw) {
  if (!raw || typeof raw !== 'object') return null
  const clean = value => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, MAX_SAY_LENGTH) : '')
  const praise = clean(raw.praise)
  const suggestion = clean(raw.suggestion)
  if (!praise) return null
  if (FORBIDDEN_WORDS.some(word => praise.includes(word) || suggestion.includes(word))) return null
  return { praise, suggestion }
}

/** 生成一句看图夸奖 + 建议；失败/超时返回 { praise: null }，由前端本地分析兜底 */
export async function generateNiloPraise({
  imageBase64,
  context = {},
  chatWithImage = defaultChatWithImage,
  timeoutMs = DEFAULT_NILO_TIMEOUT_MS,
} = {}) {
  if (typeof imageBase64 !== 'string' || !imageBase64) return { praise: null, reason: 'image_required' }
  if (typeof chatWithImage !== 'function') return { praise: null, reason: 'model_unavailable' }
  try {
    const raw = await withTimeout(
      () => chatWithImage(imageBase64, buildNiloPraisePrompt(context), {
        maxTokens: 1600,
        responseFormat: { type: 'json_object' },
        signal: typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(timeoutMs) : undefined,
      }),
      timeoutMs,
    )
    const result = validateNiloPraise(raw)
    return result ? result : { praise: null, reason: 'invalid_praise' }
  } catch (error) {
    if (error instanceof LLMParseError) {
      const result = validateNiloPraise(extractLooseJson(error.raw))
      if (result) return result
    }
    return { praise: null, reason: error instanceof Error ? error.message : 'nilo_failed' }
  }
}
