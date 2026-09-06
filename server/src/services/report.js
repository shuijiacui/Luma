// 报告生成：家长建议 + 儿童侧描述性反馈
// 基础文案为模板；本模块也提供可选家长文本增强的 prompt 与输出校验。
import { RED_LINE_WORDS } from './score.js'

const ELEMENT_ZH = {
  house: '房子', tree: '树', person: '小人', sun: '太阳', moon: '月亮', star: '星星',
  cloud: '云', rain: '雨', flower: '花', grass: '草', animal: '小动物', mountain: '山',
  river: '小河', water: '溪流', bird: '小鸟', cat: '小猫', dog: '小狗', car: '汽车', rainbow: '彩虹',
  butterfly: '蝴蝶', fish: '小鱼', boat: '小船', fence: '栅栏', road: '小路',
}

const COLOR_ZH = {
  red: '红色', orange: '橙色', yellow: '黄色', green: '绿色', blue: '蓝色',
  purple: '紫色', pink: '粉色', brown: '棕色', black: '黑色', white: '白色',
  gray: '灰色', grey: '灰色', cyan: '青色', magenta: '洋红色', teal: '青绿色',
  gold: '金色', silver: '银色', violet: '紫色',
}

// 颜色修饰前缀 → 中文，用于处理 darkgreen / lightblue 等复合色（vision 模型自由输出）
const COLOR_PREFIX_ZH = {
  dark: '深', light: '浅', deep: '深', pale: '淡', bright: '亮', dull: '暗',
}

function colorLabel(value) {
  if (!value) return null
  const key = String(value).toLowerCase().trim()
  if (COLOR_ZH[key]) return COLOR_ZH[key]
  const norm = key.replace(/[-_\s]/g, '')
  for (const [prefix, zh] of Object.entries(COLOR_PREFIX_ZH)) {
    if (norm.startsWith(prefix)) {
      const base = norm.slice(prefix.length)
      if (COLOR_ZH[base]) return zh + COLOR_ZH[base]
    }
  }
  return value
}

const POSITION_ZH = { center: '中间', corner: '角落', edge: '边上' }
const PRESSURE_ZH = { light: '笔触轻轻的', normal: '笔触很自然', heavy: '笔触好有力气呀' }

// cluster → 画面特征中文标签（供家长侧 evidence 展示，只描述画面，不贴情绪标签）
const CLUSTER_ZH = {
  body_omission: '身体部位省略', weather: '天气意象', house_structure: '房屋结构',
  detail_lack: '细节较少', dark_color: '深色较多', vitality: '画面活力',
  figure_size: '人物大小', composition_edge: '构图位置', tree_damage: '树的形态',
  erasure: '涂改痕迹', crowding: '画面拥挤', heavy_pressure: '笔触较重',
  weak_line: '线条较轻', line_quality: '线条形态', bright_color: '明亮用色',
}

// 按命中 cluster 追加一条「观察导向」建议（客观特征 + 通用陪伴，不下结论、不诊断）
const CLUSTER_ADVICE = {
  dark_color: '画面里深色较多，可以多留意孩子近期的情绪状态',
  erasure: '画面有涂改痕迹，可以温和地了解孩子作画时的想法',
  heavy_pressure: '笔触比较用力，近期多给他一些放松和释放的空间',
  weather: '画里出现了阴雨或夜晚，可以多安排一些户外亲子时间',
  tree_damage: '树画得有些特别，可以和孩子聊聊他心里的想象',
  detail_lack: '画面细节较少（低龄孩子很常见），多鼓励自由表达就好',
  body_omission: '人物部位有省略（低龄孩子很常见），多鼓励孩子表达',
}

// P3 描述性反馈：只含客观元素 / 颜色 / 构图描述，不含任何情绪词 / 诱导词
export function buildFeedback(features) {
  const desc = []

  const names = (features?.elements ?? []).map(e => ELEMENT_ZH[e] ?? e)
  if (names.length) desc.push(`你画了${names.join('、')}`)

  const darkRatio = features?.colors?.darkRatio
  if (typeof darkRatio === 'number') {
    if (darkRatio >= 0.6) desc.push('用了好多深颜色')
    else if (darkRatio <= 0.25) desc.push('颜色亮亮的')
  }
  const dominant = (features?.colors?.dominant ?? [])
    .map(c => colorLabel(c)).filter(Boolean).slice(0, 3)
  if (dominant.length) desc.push(`涂了${dominant.join('、')}`)

  const pos = features?.composition?.position
  if (pos === 'corner' || pos === 'edge') desc.push(`画在${POSITION_ZH[pos]}`)
  const pressure = features?.source === 'digital_canvas' ? null : features?.composition?.pressure
  if (pressure && pressure !== 'normal' && PRESSURE_ZH[pressure]) desc.push(PRESSURE_ZH[pressure])

  if (desc.length === 0) return '哇，Nilo 看到你的画啦'
  return `哇，Nilo 看到${desc.join('，')}`
}

export const FOLLOW_UP = '还想再画点什么吗？'

// 家长沟通建议（基线，按情绪给出；非干预方案）
const PARENT_ADVICE = {
  乐观平稳: [
    '画面中出现了积极的信号，继续保持日常的亲子互动与陪伴',
    '鼓励孩子多用绘画表达自己',
  ],
  未见明显风险信号: [
    '本次画面未出现知识库收录的风险信号，继续保持日常陪伴与观察',
    '单幅画能反映的信息有限，建议结合日常状态综合了解孩子',
  ],
  焦虑倾向: [
    '近期多安排轻松的亲子共处时间，避免直接追问',
    '留意孩子的睡眠与饮食变化，保持规律作息',
    '先倾听、少评价，让孩子自己说',
  ],
  低落倾向: [
    '多倾听孩子的想法，不急于评价或纠正',
    '增加户外活动和同伴交往的机会',
    '持续观察，可与学校老师沟通了解在校状态',
  ],
  需要关注: [
    '画面中出现了需要留意的信号，建议近期密切观察孩子的状态',
    '保持耐心倾听，避免质问式沟通',
    '如类似信号持续出现，可考虑寻求专业心理咨询资源',
  ],
  信息不足: ['本次画面信息不足，建议继续观察'],
}

// 从评分结果提取命中的 cluster（去重，用于差异化建议与证据标签）
function collectClusters(scoreResult) {
  const set = new Set()
  for (const g of Object.values(scoreResult.groups ?? {})) {
    for (const h of g.hits ?? []) if (h.entry?.cluster) set.add(h.entry.cluster)
  }
  return [...set]
}

export function buildReport(scoreResult) {
  let parentAdvice = PARENT_ADVICE[scoreResult.emotion] ?? PARENT_ADVICE.信息不足

  // 差异化：按命中 cluster 追加一条观察导向建议（最多一条，避免啰嗦）
  const clusters = collectClusters(scoreResult)
  const extra = clusters.map(c => CLUSTER_ADVICE[c]).filter(Boolean).slice(0, 1)
  if (extra.length) parentAdvice = [...parentAdvice, ...extra]

  // evidence 增加 clusterLabel（画面特征中文标签，帮助家长理解判定依据来自画面的什么）
  const clusterById = new Map()
  for (const g of Object.values(scoreResult.groups ?? {})) {
    for (const h of g.hits ?? []) {
      if (h.entry?.id && h.entry?.cluster) clusterById.set(h.entry.id, h.entry.cluster)
    }
  }
  const evidence = (scoreResult.evidence ?? []).map(e => {
    const cluster = clusterById.get(e.entryId)
    return cluster ? { ...e, clusterLabel: CLUSTER_ZH[cluster] ?? cluster } : e
  })

  // 输出红线双保险：建议文案命中疾病词 → 降级
  const redLine = new RegExp(RED_LINE_WORDS.join('|'))
  if (redLine.test(parentAdvice.join(''))) {
    return { emotion: '信息不足', confidence: 0, evidence: [], parentAdvice: PARENT_ADVICE.信息不足 }
  }
  return {
    emotion: scoreResult.emotion,
    confidence: scoreResult.confidence,
    evidence,
    parentAdvice,
  }
}

// 只把确定性评分已经选中的证据交给文本模型组织语言；模型不能改变判定结果
export function buildParentNarrativePrompt(scoreResult, report) {
  const evidence = report.evidence.map(item => ({
    id: item.entryId,
    feature: item.clusterLabel ?? '画面特征',
    summary: item.summary,
  }))
  return `你是儿童绘画观察与家长沟通助手，不是医生，也不能进行心理诊断。
请基于下面已经由系统确定的结果，写一段温和、自然、易懂的家长说明。
严格要求：
1. 只能解释提供的画面观察和知识库证据，不能新增事实、证据或情绪判断。
2. 不得使用疾病名、诊断、概率、风险等级，不得把单幅画等同于孩子的真实心理状态。
3. 必须明确“这只是单幅画的参考，需要结合日常观察”。
4. 只返回 JSON，不要 Markdown：{"summary":"一段80到140字的说明","advice":["2到4条具体且温和的沟通建议"]}

系统判定：${report.emotion}
系统参考分值：${Math.round(report.confidence * 100)}（不是医学概率）
知识库证据：${JSON.stringify(evidence, null, 2)}
系统原始建议：${JSON.stringify(report.parentAdvice)}`
}

export function validateParentNarrative(value) {
  if (!value || typeof value !== 'object' || typeof value.summary !== 'string'
    || !Array.isArray(value.advice) || value.advice.length < 2 || value.advice.length > 4
    || value.advice.some(item => typeof item !== 'string' || item.length < 2)) return null
  const text = [value.summary, ...value.advice].join('')
  const redLine = new RegExp(RED_LINE_WORDS.join('|'))
  if (redLine.test(text) || text.length < 40 || text.length > 900) return null
  return { summary: value.summary.trim(), advice: value.advice.map(item => item.trim()) }
}

// 联网搜索 → 家长沟通建议（只做主题白名单的亲子陪伴内容，不进判定链）
export function buildWebAdvicePrompt(pages) {
  const snippets = pages.map(p => `- ${p.title}\n  ${p.snippet}`).join('\n').slice(0, 2400)
  return `你是儿童亲子沟通助手，不是医生。下面是从网络搜索到的通用育儿、亲子陪伴建议片段。
请整理出2条温和、具体、非判断性的家长沟通建议。
严格要求：
1. 只围绕陪伴、倾听、亲子互动等通用方法，不得出现疾病、诊断、心理测评、症状等字眼。
2. 不下结论，不评判孩子，不依据单幅画做任何心理判断。
3. 只返回JSON，不要Markdown：{"advice":["建议1","建议2"]}

搜索片段：
${snippets}`
}

export function validateWebAdvice(value) {
  if (!value || !Array.isArray(value.advice) || value.advice.length < 1 || value.advice.length > 3
    || value.advice.some(item => typeof item !== 'string' || item.trim().length < 2)) return null
  const advice = value.advice.map(item => item.trim()).filter(Boolean)
  const redLine = new RegExp(RED_LINE_WORDS.join('|'))
  if (redLine.test(advice.join(''))) return null
  return advice
}

// 把知识库证据改写成人话（保留 entryId 可追溯，仅供家长阅读）
export function buildEvidencePlainPrompt(evidence) {
  const items = evidence.map((e, i) => `${i + 1}. [${e.clusterLabel ?? '画面特征'}] ${e.summary}`).join('\n')
  return `你是儿童绘画观察与家长沟通助手，不是医生。请把下面每条「画面特征依据」改写成一句家长能看懂的温和说明。
严格要求：
1. 只说画面观察到什么、相关研究的一般提示，以及"仅供参考、不能说明孩子真实状态"的立场。
2. 删掉数据、术语和内部备注（如同簇、取max、OR值、Rasch、Fig、置信度等）。
3. 不得出现疾病、诊断、心理测评、症状等字眼。
4. 每条一行、不超过 40 字，数量必须与输入一致。
5. 只返回 JSON，不要 Markdown：{"items":["说明1","说明2"]}

依据列表：
${items}`
}

export function validateEvidencePlain(value, count) {
  if (!value || !Array.isArray(value.items) || value.items.length !== count) return null
  const items = value.items.map(s => (typeof s === 'string' ? s.trim() : '')).filter(Boolean)
  if (items.length !== count) return null
  const redLine = new RegExp(RED_LINE_WORDS.join('|'))
  if (redLine.test(items.join(''))) return null
  return items
}
