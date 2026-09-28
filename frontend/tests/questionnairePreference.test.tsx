import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ParentQuestionnaireSection } from '@/features/parents/components/ParentQuestionnaireSection'
import { authFetch } from '@/lib/api/authFetch'

vi.mock('@/lib/api/authFetch', () => ({ authFetch: vi.fn() }))
afterEach(() => { cleanup(); vi.resetAllMocks(); localStorage.clear() })

test('consent is explicit, persists through the API, and failures do not pretend it saved', async () => {
  vi.mocked(authFetch).mockResolvedValue({ responses: [], nextOffset: null, latestRevision: 0, total: 0, enabled: false })
  render(<ParentQuestionnaireSection ownerId="parent" token="token" children={[{ id: 'one', nickname: '小树' }, { id: 'two', nickname: '小花' }]} />)
  const toggle = await screen.findByRole('switch', { name: '让沟通助手参考这份问卷' }) as HTMLInputElement
  expect(toggle.checked).toBe(false)
  vi.mocked(authFetch).mockResolvedValueOnce({ enabled: true })
  fireEvent.click(toggle)
  await waitFor(() => expect(toggle.checked).toBe(true))
  expect(authFetch).toHaveBeenLastCalledWith('/parent-questionnaire/preferences', { method: 'PUT', token: 'token', body: { childId: 'one', enabled: true } })
  vi.mocked(authFetch).mockRejectedValueOnce(new Error('offline'))
  fireEvent.click(toggle)
  expect((await screen.findByRole('alert')).textContent).toBe('设置未保存，请重试。')
  expect(toggle.checked).toBe(true)
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'two' } })
  expect((await screen.findByRole('switch') as HTMLInputElement).checked).toBe(false)
})
