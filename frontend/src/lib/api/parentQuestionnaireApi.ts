import {
  normalizeParentQuestionnaireAnswers,
  scoreParentQuestionnaire,
  type ParentQuestionnaireAnswers,
  type ParentQuestionnaireScores,
} from '../../../../shared/parentQuestionnaire.mjs'
import { ApiError } from './client'
import { authFetch } from './authFetch'

export interface ParentQuestionnaireRecord {
  id: string
  revision: number
  childAge: number
  answers: ParentQuestionnaireAnswers
  scores: ParentQuestionnaireScores
  createdAt: string
}

export interface ParentQuestionnaireInput {
  revision: number
  childAge: number
  answers: ParentQuestionnaireAnswers
}

export interface ParentQuestionnairePage {
  records: ParentQuestionnaireRecord[]
  nextOffset: number | null
}

const GUEST_PAGE_SIZE = 24
const guestKey = (ownerId: string) => `luma_parent_questionnaire_v1:${encodeURIComponent(ownerId)}`

function guestRecords(ownerId: string): ParentQuestionnaireRecord[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(guestKey(ownerId)) ?? '[]')
    return Array.isArray(value) ? value as ParentQuestionnaireRecord[] : []
  } catch {
    return []
  }
}

function newId() {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export async function listParentQuestionnaireRecords(
  ownerId: string,
  token?: string,
  offset = 0,
): Promise<ParentQuestionnairePage> {
  if (token) {
    const page = await authFetch<{ responses: ParentQuestionnaireRecord[]; nextOffset: number | null }>(
      `/parent-questionnaire/history?offset=${offset}`,
      { token },
    )
    return { records: page.responses, nextOffset: page.nextOffset }
  }
  const records = guestRecords(ownerId).sort((a, b) => b.revision - a.revision)
  return {
    records: records.slice(offset, offset + GUEST_PAGE_SIZE),
    nextOffset: records.length > offset + GUEST_PAGE_SIZE ? offset + GUEST_PAGE_SIZE : null,
  }
}

export async function saveParentQuestionnaireRecord(
  ownerId: string,
  input: ParentQuestionnaireInput,
  token?: string,
): Promise<ParentQuestionnaireRecord> {
  if (token) {
    return authFetch<ParentQuestionnaireRecord>('/parent-questionnaire', {
      method: 'POST',
      token,
      body: input,
    })
  }

  const answers = normalizeParentQuestionnaireAnswers(input.answers)
  if (!answers || !Number.isInteger(input.childAge) || input.childAge < 5 || input.childAge > 12) {
    throw new ApiError(400, '请确认孩子年龄并完成全部题目。')
  }
  const records = guestRecords(ownerId).sort((a, b) => b.revision - a.revision)
  const currentRevision = records[0]?.revision ?? 0
  if (input.revision !== currentRevision) {
    throw new ApiError(409, '问卷已在其他页面更新，请刷新后再试。')
  }
  const record: ParentQuestionnaireRecord = {
    id: newId(),
    revision: currentRevision + 1,
    childAge: input.childAge,
    answers,
    scores: scoreParentQuestionnaire(answers),
    createdAt: new Date().toISOString(),
  }
  try {
    localStorage.setItem(guestKey(ownerId), JSON.stringify([record, ...records]))
  } catch {
    throw new ApiError(507, '浏览器空间不足，暂时无法保存本次问卷。')
  }
  return record
}
