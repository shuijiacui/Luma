export type ParentQuestionnaireAnswer = 1 | 2 | 3 | 4
export type ParentQuestionnaireQuestionId = `q${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15}`
export type ParentQuestionnaireAnswers = Record<ParentQuestionnaireQuestionId, ParentQuestionnaireAnswer>
export type ParentQuestionnaireDimensionId = 'communication' | 'empathy' | 'connection' | 'pressure' | 'acceptance'

export interface ParentQuestionnaireDimensionScore {
  score: number
  support: number
  min: number
  max: number
  count: number
}

export interface ParentQuestionnaireScores {
  total: number
  dimensions: Record<ParentQuestionnaireDimensionId, ParentQuestionnaireDimensionScore>
}

export interface ParentQuestionnaireQuestion {
  id: ParentQuestionnaireQuestionId
  number: number
  text: string
  dimension: ParentQuestionnaireDimensionId
  reverse: boolean
}

export const PARENT_QUESTIONNAIRE_QUESTIONS: ParentQuestionnaireQuestion[]
export const PARENT_QUESTIONNAIRE_DIMENSIONS: { id: ParentQuestionnaireDimensionId; label: string }[]
export const PARENT_QUESTIONNAIRE_ANSWER_OPTIONS: { value: ParentQuestionnaireAnswer; label: string }[]
export function normalizeParentQuestionnaireAnswers(value: unknown): ParentQuestionnaireAnswers | null
export function validateParentQuestionnaireAnswers(value: unknown): boolean
export function scoreParentQuestionnaire(value: ParentQuestionnaireAnswers): ParentQuestionnaireScores
