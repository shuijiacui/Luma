import { afterEach, expect, test, vi } from 'vitest'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { useChildHistory } from '@/hooks/useChildHistory'
import { listAnalyses } from '@/lib/api/authApi'

vi.mock('@/lib/api/authApi', () => ({ listAnalyses: vi.fn() }))
afterEach(() => { cleanup(); vi.clearAllMocks() })
const item = (id: string) => ({ id, summary: { elements: [] } })

test('switching children clears old data and late response cannot overwrite new child', async () => {
  let finishA: (v: unknown) => void = () => {}
  vi.mocked(listAnalyses).mockImplementation(((id: string) => id === 'A'
    ? new Promise(resolve => { finishA = resolve })
    : Promise.resolve({ analyses: [item('B-work')] })) as typeof listAnalyses)
  const { result, rerender } = renderHook(({ child }) => useChildHistory(child, 'token'), { initialProps: { child: 'A' } })
  rerender({ child: 'B' })
  await waitFor(() => expect(result.current.analyses?.[0]?.id).toBe('B-work'))
  await act(async () => { finishA({ analyses: [item('A-work')] }) })
  expect(result.current.analyses?.[0]?.id).toBe('B-work')
})

test('network failure stays an error, and retry recovers without demo content', async () => {
  vi.mocked(listAnalyses).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ analyses: [] })
  const { result } = renderHook(() => useChildHistory('A', 'token'))
  await waitFor(() => expect(result.current.error).toBeTruthy())
  expect(result.current.analyses).toBeNull()
  act(() => result.current.reload())
  await waitFor(() => expect(result.current.analyses).toEqual([]))
  expect(result.current.error).toBeNull()
})

test('guest/no child converges to an empty state', () => {
  const { result } = renderHook(() => useChildHistory())
  expect(result.current.analyses).toEqual([])
  expect(result.current.error).toBeNull()
})
