import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { PeriodicReportsSection } from '@/features/parents/components/PeriodicReportsSection'
import { FamilyDataSettings } from '@/features/parents/components/FamilyDataSettings'
import { authFetch } from '@/lib/api/authFetch'

vi.mock('@/lib/api/authFetch', () => ({ authFetch: vi.fn() }))
afterEach(() => { cleanup(); vi.resetAllMocks() })

test('digest request failure is distinct from empty data and can be retried', async () => {
  vi.mocked(authFetch).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ reports: [], total: 0, nextOffset: null })
  render(<PeriodicReportsSection childId="C" childName="孩子" token="token" />)
  await screen.findByRole('alert')
  expect(screen.queryByText(/还没有已结束周期/)).toBeNull()
  fireEvent.click(screen.getByText('重试'))
  await screen.findByText(/还没有已结束周期/)
})

test('late response from another child cannot overwrite the new child view', async () => {
  let finish!: (value: unknown) => void
  vi.mocked(authFetch).mockImplementationOnce(() => new Promise(resolve => { finish = resolve })).mockResolvedValue({ reports: [], total: 0, nextOffset: null })
  const view = render(<PeriodicReportsSection childId="A" childName="A" token="token" />)
  view.rerender(<PeriodicReportsSection childId="B" childName="B" token="token" />)
  await screen.findByText(/还没有已结束周期/)
  finish({ reports: [{ id: 'old' }], total: 1, nextOffset: null })
  await waitFor(() => expect(screen.getByText(/还没有已结束周期/)).toBeTruthy())
  fireEvent.click(screen.getByText('每月报告'))
  await waitFor(() => expect(vi.mocked(authFetch).mock.calls.at(-1)?.[0]).toContain('/children/B/digests?kind=monthly'))
})

test('family deletion is explicit, leaves session on failure, and exits only after success', async () => {
  const onDeleted = vi.fn()
  vi.mocked(authFetch).mockRejectedValueOnce(new Error('密码不正确，未删除任何数据')).mockResolvedValueOnce({ ok: true })
  render(<FamilyDataSettings token="parent-token" onDeleted={onDeleted} />)
  fireEvent.click(screen.getByText('注销整个家庭'))
  const submit = screen.getByText('确认永久注销').closest('button')!
  expect(submit.disabled).toBe(true)
  fireEvent.change(screen.getByLabelText('家长登录密码'), { target: { value: 'secret123' } })
  fireEvent.change(screen.getByLabelText('输入“删除整个家庭”确认'), { target: { value: '删除整个家庭' } })
  fireEvent.click(submit)
  await screen.findByRole('alert')
  expect(onDeleted).not.toHaveBeenCalled()
  fireEvent.click(submit)
  await waitFor(() => expect(onDeleted).toHaveBeenCalledOnce())
  expect(authFetch).toHaveBeenLastCalledWith('/auth/family/delete', { method: 'POST', token: 'parent-token', body: { password: 'secret123', confirmation: '删除整个家庭' } })
})
