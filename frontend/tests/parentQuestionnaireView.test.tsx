import { beforeEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ParentQuestionnaireSection } from '@/features/parents/components/ParentQuestionnaireSection'

beforeEach(() => {
  localStorage.clear()
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  cleanup()
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
  expect(screen.getByText('第 1 次记录')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '查看填写记录与变化' }))
  await screen.findByText('填写记录与变化')
  expect(screen.getAllByText('第 1 次记录').length).toBeGreaterThan(0)
  expect(screen.getAllByText('首次记录').length).toBeGreaterThan(0)
  expect(screen.getByText(/支持性资源/)).toBeTruthy()
})
