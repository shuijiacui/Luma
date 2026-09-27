const question = (id, text, dimension, reverse = false) => ({ id, number: Number(id.slice(1)), text, dimension, reverse })

export const PARENT_QUESTIONNAIRE_QUESTIONS = [
  question('q1', '当孩子情绪不好时，他/她愿意主动向我表达。', 'communication'),
  question('q2', '我常常能通过孩子的表情或肢体语言，读懂他/她的情绪。', 'empathy'),
  question('q3', '在引导孩子行为时，我有时会感到无从下手或缺乏策略。', 'pressure', true),
  question('q4', '我能感受到我和孩子之间有着深厚的情感连接。', 'connection'),
  question('q5', '在陪伴孩子成长的过程中，我有时会感到缺乏支持。', 'pressure', true),
  question('q6', '有时我会不确定自己的陪伴方式是否真的适合孩子。', 'pressure', true),
  question('q7', '当孩子尝试表达时，我会努力耐心倾听。', 'communication'),
  question('q8', '面对孩子的日常状况，我有时会控制不住失去耐心。', 'pressure', true),
  question('q9', '我认为我对孩子的喜好、习惯有足够的了解。', 'empathy'),
  question('q10', '我有时会不知道如何用孩子能理解的方式与他/她沟通。', 'communication', true),
  question('q11', '我能够接纳孩子独特的表达方式和成长节奏。', 'acceptance'),
  question('q12', '我每天会尽量留出一些专属时间，全身心地陪伴孩子。', 'acceptance'),
  question('q13', '我有时会为孩子的未来发展感到担忧。', 'pressure', true),
  question('q14', '在和孩子相处时，我更多是陪伴者和支持者，而不是管理者。', 'connection'),
  question('q15', '照顾孩子的日常起居让我感到有些疲惫，我需要更多的自我关怀。', 'pressure', true),
]

export const PARENT_QUESTIONNAIRE_DIMENSIONS = [
  { id: 'communication', label: '双向沟通' },
  { id: 'empathy', label: '情绪感知与共情' },
  { id: 'connection', label: '亲子连接感' },
  { id: 'pressure', label: '陪伴效能与压力' },
  { id: 'acceptance', label: '接纳与陪伴质量' },
]

export const PARENT_QUESTIONNAIRE_ANSWER_OPTIONS = [
  { value: 1, label: '非常不同意' },
  { value: 2, label: '不同意' },
  { value: 3, label: '同意' },
  { value: 4, label: '非常同意' },
]

export function normalizeParentQuestionnaireAnswers(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const normalized = {}
  for (const item of PARENT_QUESTIONNAIRE_QUESTIONS) {
    const answer = value[item.id]
    if (!Number.isInteger(answer) || answer < 1 || answer > 4) return null
    normalized[item.id] = answer
  }
  return normalized
}

export function validateParentQuestionnaireAnswers(value) {
  return normalizeParentQuestionnaireAnswers(value) !== null
}

export function scoreParentQuestionnaire(value) {
  const answers = normalizeParentQuestionnaireAnswers(value)
  if (!answers) throw new Error('invalid parent questionnaire answers')
  const dimensions = {}
  let supportTotal = 0
  let supportMax = 0

  for (const dimension of PARENT_QUESTIONNAIRE_DIMENSIONS) {
    const items = PARENT_QUESTIONNAIRE_QUESTIONS.filter(item => item.dimension === dimension.id)
    const support = items.reduce((sum, item) => sum + (item.reverse ? 5 - answers[item.id] : answers[item.id]), 0)
    const min = items.length
    const max = items.length * 4
    supportTotal += support
    supportMax += max
    dimensions[dimension.id] = {
      score: Math.round(((support - min) / (max - min)) * 1000) / 10,
      support,
      min,
      max,
      count: items.length,
    }
  }

  return {
    total: Math.round((supportTotal / supportMax) * 1000) / 10,
    dimensions,
  }
}
