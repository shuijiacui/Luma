import { beforeEach, expect, test } from 'vitest'
import type { ParentQuestionnaireAnswers } from '../../shared/parentQuestionnaire.mjs'
import {
  listParentQuestionnaireRecords,
  saveParentQuestionnaireRecord,
} from '@/lib/api/parentQuestionnaireApi'

const answers = Object.fromEntries(
  Array.from({ length: 15 }, (_, index) => [`q${index + 1}`, 3]),
) as ParentQuestionnaireAnswers

beforeEach(() => localStorage.clear())

test('guest questionnaire history keeps every revision and rejects stale saves', async () => {
  expect(await listParentQuestionnaireRecords('guest-parent')).toEqual({ records: [], nextOffset: null })

  const first = await saveParentQuestionnaireRecord('guest-parent', { revision: 0, childAge: 6, answers })
  expect(first).toMatchObject({ revision: 1, childAge: 6 })
  expect(first.scores.total).toBe(63.3)

  const second = await saveParentQuestionnaireRecord('guest-parent', {
    revision: 1,
    childAge: 7,
    answers: { ...answers, q1: 4 },
  })
  expect(second.revision).toBe(2)
  expect(second.scores.total).toBeGreaterThan(first.scores.total)

  const history = await listParentQuestionnaireRecords('guest-parent')
  expect(history.records.map(record => record.revision)).toEqual([2, 1])
  expect(history.records[1].answers.q1).toBe(3)

  await expect(saveParentQuestionnaireRecord('guest-parent', { revision: 1, childAge: 7, answers })).rejects.toThrow('问卷已在其他页面更新')
})
