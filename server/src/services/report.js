// 报告生成：家长建议 + 儿童侧描述性反馈
// 全部为模板化文案，不调 LLM（可控、不失真、防诱导措辞 —— 红线 4）
import { RED_LINE_WORDS } from './score.js'

const ELEMENT_ZH = {
  house: '房子', tree: '树', person: '小人', sun: '太阳', moon: '月亮', star: '星星',
  cloud: '云', rain: '雨', flower: '花', grass: '草', animal: '小动物', mountain: '山',
  river: '小河', bird: '小鸟', cat: '小猫', dog: '小狗', car: '汽车', rainbow: '彩虹',
  butterfly: '蝴蝶', fish: '小鱼', boat: '小船', fence: '栅栏', road: '小路',
}

// P3 描述性反馈：只含客观元素描述，不含任何情绪词/诱导词
export function buildFeedback(features) {
  const names = (features?.elements ?? []).map(e => ELEMENT_ZH[e] ?? e)
  if (names.length === 0) return '我看到你的画了'
  return `我看到你画了${names.join('、')}`
}

export const FOLLOW_UP = '想再画点什么吗？'

// 家长沟通建议（非干预方案）
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

export function buildReport(scoreResult) {
  let parentAdvice = PARENT_ADVICE[scoreResult.emotion] ?? PARENT_ADVICE.信息不足
  // 输出红线双保险：建议文案命中疾病词 → 降级
  const redLine = new RegExp(RED_LINE_WORDS.join('|'))
  if (redLine.test(parentAdvice.join(''))) {
    return { emotion: '信息不足', confidence: 0, evidence: [], parentAdvice: PARENT_ADVICE.信息不足 }
  }
  return {
    emotion: scoreResult.emotion,
    confidence: scoreResult.confidence,
    evidence: scoreResult.evidence,
    parentAdvice,
  }
}
