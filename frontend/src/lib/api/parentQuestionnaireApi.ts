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
  childId?: string | null
  revision: number
  childAge: number
  answers: ParentQuestionnaireAnswers
  scores: ParentQuestionnaireScores
  createdAt: string
}

export interface ParentQuestionnaireInput {
  childId?: string | null
  revision: number
  childAge: number
  answers: ParentQuestionnaireAnswers
}

export interface ParentQuestionnairePage {
  records: ParentQuestionnaireRecord[]
  nextOffset: number | null
  latestRevision: number
  total: number
  enabled: boolean
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
  childId?: string | null,
): Promise<ParentQuestionnairePage> {
  if (token) {
    const page = await authFetch<Omit<ParentQuestionnairePage, 'records'> & { responses: ParentQuestionnaireRecord[] }>(
      `/parent-questionnaire/history?offset=${offset}${childId !== undefined ? `&childId=${encodeURIComponent(childId ?? '')}` : ''}`,
      { token },
    )
    return { ...page, records: page.responses }
  }
  const allRecords = guestRecords(ownerId).sort((a, b) => b.revision - a.revision)
  const records = allRecords.filter(record => childId === undefined || (record.childId ?? null) === childId)
  return {
    records: records.slice(offset, offset + GUEST_PAGE_SIZE),
    nextOffset: records.length > offset + GUEST_PAGE_SIZE ? offset + GUEST_PAGE_SIZE : null,
    latestRevision: allRecords[0]?.revision ?? 0,
    total: records.length,
    enabled: false,
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
    childId: input.childId ?? null,
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

export async function setQuestionnairePreference(childId: string, enabled: boolean, token: string) {
  return authFetch<{ enabled: boolean }>('/parent-questionnaire/preferences', {
    method: 'PUT', token, body: { childId, enabled },
  })
}

export interface QuestionnaireDraft {
  childAge: string
  answers: Partial<ParentQuestionnaireAnswers>
  step: number
  revision: number
}

export const questionnaireDraftKey = (ownerId: string, childId: string | null, authenticated: boolean) =>
  `luma_questionnaire_draft_v1:${authenticated ? 'account' : 'guest'}:${encodeURIComponent(ownerId)}:${encodeURIComponent(childId ?? 'unbound')}`

export function readQuestionnaireDraft(key: string): QuestionnaireDraft | null {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? 'null')
    if (!value || typeof value.childAge !== 'string' || !Number.isInteger(value.step) || value.step < 0 || value.step > 15
      || !Number.isSafeInteger(value.revision) || value.revision < 0 || !value.answers || typeof value.answers !== 'object' || Array.isArray(value.answers)) return null
    if (Object.entries(value.answers).some(([id, answer]) => !/^q([1-9]|1[0-5])$/.test(id) || !Number.isInteger(answer) || Number(answer) < 1 || Number(answer) > 4)) return null
    return value
  } catch { return null }
}
