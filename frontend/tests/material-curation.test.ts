import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { apiClient } from '@/lib/api/client'
import { refreshMaterialCuration } from '@/features/child/companion/materialCuration'
import { getMaterialCuration, setMaterialCuration } from '../../shared/niloCuration.mjs'

vi.mock('@/lib/api/client', () => ({ apiClient: vi.fn() }))
const original = getMaterialCuration()
beforeEach(() => { vi.mocked(apiClient).mockReset(); setMaterialCuration({ version: 1, decisions: { 'school-0': 'reject' } }) })
afterEach(() => { setMaterialCuration(original); vi.useRealTimers() })

test('review decisions refresh as one shared request and replace the last valid snapshot', async () => {
  let finish!: (value: unknown) => void
  vi.mocked(apiClient).mockImplementation(() => new Promise(resolve => { finish = resolve }))
  const first = refreshMaterialCuration(), second = refreshMaterialCuration()
  expect(first).toBe(second)
  finish({ version: 1, decisions: { 'illustration-reading-child': 'reject', 'school-1': 'keep' } })
  await first
  expect(apiClient).toHaveBeenCalledOnce()
  expect(apiClient).toHaveBeenCalledWith('/nilo/materials/curation', expect.objectContaining({ cache: 'no-store', signal: expect.any(AbortSignal) }))
  expect(getMaterialCuration().decisions).toEqual({ 'illustration-reading-child': 'reject', 'school-1': 'keep' })
})

test.each(['offline', 'malformed'])('a %s review response retains known exclusions', async failure => {
  if (failure === 'offline') vi.mocked(apiClient).mockRejectedValue(new Error('offline'))
  else vi.mocked(apiClient).mockResolvedValue({ version: 4, decisions: {} })
  await refreshMaterialCuration()
  expect(getMaterialCuration().decisions).toEqual({ 'school-0': 'reject' })
})

test('an unresponsive review request times out without blocking a new guide or applying a late stale response', async () => {
  vi.useFakeTimers()
  let finish!: (value: unknown) => void
  vi.mocked(apiClient).mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  const stalled = refreshMaterialCuration()
  await vi.advanceTimersByTimeAsync(1500)
  await stalled
  expect(getMaterialCuration().decisions).toEqual({ 'school-0': 'reject' })
  vi.mocked(apiClient).mockResolvedValueOnce({ version: 1, decisions: { 'school-1': 'reject' } })
  await refreshMaterialCuration()
  finish({ version: 1, decisions: {} })
  await Promise.resolve()
  expect(getMaterialCuration().decisions).toEqual({ 'school-1': 'reject' })
})
