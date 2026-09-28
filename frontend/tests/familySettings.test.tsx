import type { ComponentProps } from 'react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { FamilySettings } from '@/features/parents/components/FamilySettings'
import { authFetch } from '@/lib/api/authFetch'
import { listParentQuestionnaireRecords } from '@/lib/api/parentQuestionnaireApi'
import { setLocale } from '@/i18n'

vi.mock('@/lib/api/authFetch', () => ({ authFetch: vi.fn() }))
vi.mock('@/lib/api/parentQuestionnaireApi', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/api/parentQuestionnaireApi')>(),
  listParentQuestionnaireRecords: vi.fn(),
  saveParentQuestionnaireRecord: vi.fn(),
}))

beforeEach(() => {
  localStorage.clear()
  setLocale('zh')
  vi.mocked(authFetch).mockResolvedValue({ ok: true })
  vi.mocked(listParentQuestionnaireRecords).mockResolvedValue({ records: [], nextOffset: null, latestRevision: 0, total: 0, enabled: false })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function familyProps(overrides: Partial<ComponentProps<typeof FamilySettings>> = {}): ComponentProps<typeof FamilySettings> {
  return {
    ownerId: 'parent-one',
    parentName: '小树的家长',
    token: 'parent-token',
    isGuest: false,
    children: [
      { id: 'child-one', nickname: '小树', avatar: '/one.svg', birthDate: '2018-03-15' },
      { id: 'child-two', nickname: '小花', avatar: '/two.svg', birthDate: '2020-07-20' },
    ],
    selectedChildId: 'child-one',
    inviteCode: 'FAMILY23',
    copied: false,
    onCopyInvite: vi.fn().mockResolvedValue(undefined),
    onSelectChild: vi.fn(),
    onProfileSaved: vi.fn(),
    onRestartTour: vi.fn(),
    onLogout: vi.fn(),
    onRegister: vi.fn(),
    ...overrides,
  }
}

test('each child keeps their own birth date update and overview destination', async () => {
  const props = familyProps()
  render(<FamilySettings {...props} />)
  await screen.findByRole('button', { name: '开始了解' })

  const childCards = ['小树', '小花'].map(name => {
    const card = screen.getByRole('heading', { name }).closest('.family-settings-child')
    expect(card).not.toBeNull()
    return within(card as HTMLElement)
  })

  for (const child of childCards) fireEvent.click(child.getByText('编辑孩子资料'))
  const firstDate = childCards[0].getByLabelText('出生日期（由家长填写）') as HTMLInputElement
  const secondDate = childCards[1].getByLabelText('出生日期（由家长填写）') as HTMLInputElement
  expect(firstDate.value).toBe('2018-03-15')
  expect(secondDate.value).toBe('2020-07-20')

  fireEvent.change(firstDate, { target: { value: '2018-04-16' } })
  fireEvent.click(childCards[0].getByRole('button', { name: '保存日期' }))
  await waitFor(() => expect(props.onProfileSaved).toHaveBeenCalledTimes(1))
  expect(authFetch).toHaveBeenNthCalledWith(1, '/children/child-one/profile', {
    method: 'POST', token: 'parent-token', body: { birthDate: '2018-04-16' },
  })
  expect(secondDate.value).toBe('2020-07-20')

  fireEvent.change(secondDate, { target: { value: '2020-08-21' } })
  fireEvent.click(childCards[1].getByRole('button', { name: '保存日期' }))
  await waitFor(() => expect(props.onProfileSaved).toHaveBeenCalledTimes(2))
  expect(authFetch).toHaveBeenNthCalledWith(2, '/children/child-two/profile', {
    method: 'POST', token: 'parent-token', body: { birthDate: '2020-08-21' },
  })
  expect(firstDate.value).toBe('2018-04-16')

  fireEvent.click(screen.getByRole('button', { name: '查看成长概览 · 小花' }))
  fireEvent.click(screen.getByRole('button', { name: '查看成长概览 · 小树' }))
  expect(props.onSelectChild).toHaveBeenNthCalledWith(1, 'child-two')
  expect(props.onSelectChild).toHaveBeenNthCalledWith(2, 'child-one')
})

test('questionnaire opens without surrounding settings and restores them on return', async () => {
  render(<FamilySettings {...familyProps()} />)
  await screen.findByRole('button', { name: '开始了解' })
  expect(screen.getByRole('region', { name: '家长账号' })).toBeTruthy()
  expect(screen.getByRole('region', { name: '家庭成员' })).toBeTruthy()
  expect(screen.getByRole('button', { name: '注销整个家庭' })).toBeTruthy()

  fireEvent.click(screen.getByRole('button', { name: '开始了解' }))
  await screen.findByRole('heading', { name: '先说说孩子的年龄' })
  expect(screen.queryByRole('region', { name: '家长账号' })).toBeNull()
  expect(screen.queryByRole('region', { name: '家庭成员' })).toBeNull()
  expect(screen.queryByRole('button', { name: '注销整个家庭' })).toBeNull()
  expect(screen.queryByRole('button', { name: '复制邀请码' })).toBeNull()

  fireEvent.click(screen.getByRole('button', { name: '返回家庭设置' }))
  await screen.findByRole('button', { name: '继续未完成的问卷' })
  expect(screen.getByRole('region', { name: '家长账号' })).toBeTruthy()
  expect(screen.getByRole('region', { name: '家庭成员' })).toBeTruthy()
  expect(screen.getByRole('button', { name: '注销整个家庭' })).toBeTruthy()
  expect(screen.getByRole('button', { name: '复制邀请码' })).toBeTruthy()
  expect(authFetch).not.toHaveBeenCalled()
})

test('guest settings hide real profile and deletion controls and explain failed copying', async () => {
  const props = familyProps({
    ownerId: 'guest-parent',
    isGuest: true,
    onCopyInvite: vi.fn().mockRejectedValue(new Error('clipboard unavailable')),
  })
  render(<FamilySettings {...props} />)
  await screen.findByRole('button', { name: '开始了解' })

  expect(screen.queryByText('编辑孩子资料')).toBeNull()
  expect(screen.queryByLabelText('出生日期（由家长填写）')).toBeNull()
  expect(screen.queryByRole('button', { name: '注销整个家庭' })).toBeNull()
  expect(listParentQuestionnaireRecords).toHaveBeenCalledWith('guest-parent', undefined, 0, 'child-one')

  fireEvent.click(screen.getByRole('button', { name: '复制邀请码' }))
  expect((await screen.findByRole('alert')).textContent).toBe('暂时无法自动复制，请选中邀请码手动复制。')
  expect(props.onCopyInvite).toHaveBeenCalledOnce()
  expect(authFetch).not.toHaveBeenCalled()

  fireEvent.click(screen.getByRole('button', { name: '创建正式账号' }))
  expect(props.onRegister).toHaveBeenCalledOnce()
})
