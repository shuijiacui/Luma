import { beforeEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ParentQuestionnaireSection } from '@/features/parents/components/ParentQuestionnaireSection'
import { listParentQuestionnaireRecords, questionnaireDraftKey, saveParentQuestionnaireRecord } from '@/lib/api/parentQuestionnaireApi'
import type { ParentQuestionnaireAnswers } from '../../shared/parentQuestionnaire.mjs'

beforeEach(() => {
  localStorage.clear()
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  cleanup()
})

test('a partial draft survives remounting and stays scoped to the chosen child', async () => {
  const props = { ownerId: 'guest-parent', children: [{ id: 'one', nickname: '小树' }, { id: 'two', nickname: '小花' }] }
  const first = render(<ParentQuestionnaireSection {...props} />)
  fireEvent.click(await screen.findByRole('button', { name: '开始了解' }))
  fireEvent.change(screen.getByLabelText('孩子年龄'), { target: { value: '7' } })
  fireEvent.click(screen.getByRole('button', { name: '开始 15 道题' }))
  fireEvent.click(screen.getByRole('button', { name: /^3同意$/ }))
  first.unmount()
  render(<ParentQuestionnaireSection {...props} />)
  await screen.findByRole('button', { name: '继续未完成的问卷' })
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'two' } })
  await screen.findByRole('button', { name: '开始了解' })
  expect(screen.queryByRole('button', { name: '继续未完成的问卷' })).toBeNull()
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'one' } })
  fireEvent.click(await screen.findByRole('button', { name: '继续未完成的问卷' }))
  expect(screen.getByRole('button', { name: /^3同意$/ }).getAttribute('aria-pressed')).toBe('true')
  expect(screen.getByText('第 1 题')).toBeTruthy()
})

const allAnswers = Object.fromEntries(Array.from({ length: 15 }, (_, index) => [`q${index + 1}`, 3])) as ParentQuestionnaireAnswers

test('history loads beyond 24 records without comparing against an unloaded record', async () => {
  for (let revision = 0; revision < 25; revision++) await saveParentQuestionnaireRecord('history-owner', { revision, childAge: 7, childId: 'one', answers: allAnswers })
  render(<ParentQuestionnaireSection ownerId="history-owner" children={[{ id: 'one', nickname: '小树' }]} />)
  await screen.findByText('共 25 次记录')
  fireEvent.click(screen.getByRole('button', { name: /查看填写记录与变化/ }))
  expect(screen.getAllByText('加载更早记录后可比较').length).toBeGreaterThan(0)
  expect(screen.queryByText('记录版本 1')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '加载更早记录' }))
  await screen.findByText('记录版本 1')
  expect(screen.queryByRole('button', { name: '加载更早记录' })).toBeNull()
})

test('stale recovered drafts require a deliberate version refresh and clear after saving', async () => {
  const key = questionnaireDraftKey('draft-owner', null, false)
  localStorage.setItem(key, JSON.stringify({ revision: 0, childAge: '7', step: 15, answers: { ...allAnswers, q1: 4 } }))
  await saveParentQuestionnaireRecord('draft-owner', { revision: 0, childAge: 7, answers: allAnswers })
  render(<ParentQuestionnaireSection ownerId="draft-owner" />)
  fireEvent.click(await screen.findByRole('button', { name: '继续未完成的问卷' }))
  fireEvent.click(screen.getByRole('button', { name: '保存这次记录' }))
  await screen.findByRole('alert')
  const refresh = await screen.findByRole('button', { name: '保留答案，更新保存版本' })
  await waitFor(() => expect((refresh as HTMLButtonElement).disabled).toBe(false))
  fireEvent.click(refresh)
  fireEvent.click(screen.getByRole('button', { name: '保存这次记录' }))
  await screen.findByText('本次陪伴感受概览')
  expect(localStorage.getItem(key)).toBeNull()
  const records = (await listParentQuestionnaireRecords('draft-owner')).records
  expect(records.map(record => record.answers.q1)).toEqual([4, 3])
})

test('guest can complete, revise and review questionnaire history from family settings', async () => {
  render(<ParentQuestionnaireSection ownerId="guest-parent" />)

  await screen.findByText('亲子日常陪伴小调查')
  fireEvent.click(screen.getByRole('button', { name: '开始了解' }))
  fireEvent.change(screen.getByLabelText('孩子年龄'), { target: { value: '7' } })
  fireEvent.click(screen.getByRole('button', { name: '开始 15 道题' }))

  for (let index = 0; index < 15; index += 1) {
    fireEvent.click(screen.getByRole('button', { name: /^3同意$/ }))
    fireEvent.click(screen.getByRole('button', { name: index < 14 ? '下一题' : '保存这次记录' }))
  }

  await screen.findByText('本次陪伴感受概览')
  expect(screen.getByText('记录版本 1')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '查看填写记录与变化' }))
  await screen.findByText('填写记录与变化')
  expect(screen.getAllByText('记录版本 1').length).toBeGreaterThan(0)
  expect(screen.getAllByText('首次记录').length).toBeGreaterThan(0)
  expect(screen.getByText(/支持性资源/)).toBeTruthy()
})
