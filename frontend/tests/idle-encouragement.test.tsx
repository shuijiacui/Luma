import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { useIdleEncouragement } from '@/features/child/useIdleEncouragement'
import { t } from '@/i18n'

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
})
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks() })
const advance = (ms: number) => act(() => { vi.advanceTimersByTime(ms) })

test('waits a minute, reminds only once per pause, and can randomly select all four localized messages', () => {
  const random = vi.spyOn(Math, 'random').mockReturnValue(0)
  const { result } = renderHook(() => useIdleEncouragement(true))
  const messages = new Set<string>()
  for (let index = 0; index < 4; index++) {
    random.mockReturnValue(index / 4)
    advance(59_999)
    expect(result.current.message).toBeNull()
    advance(1)
    const message = result.current.message!
    expect(message).toBeTruthy()
    expect(t(message, 'en')).not.toBe(message)
    messages.add(message)
    const calls = random.mock.calls.length
    advance(180_000)
    expect(random.mock.calls.length).toBe(calls)
    expect(result.current.message).toBe(message)
    act(() => result.current.resetIdle())
  }
  expect(messages.size).toBe(4)
})

test('drawing resets elapsed time; hidden Nilo, guides, and busy periods require a fresh quiet minute', () => {
  const { result, rerender } = renderHook(({ enabled }) => useIdleEncouragement(enabled), { initialProps: { enabled: true } })
  advance(50_000)
  act(() => result.current.resetIdle())
  advance(50_000)
  expect(result.current.message).toBeNull()
  rerender({ enabled: false })
  advance(120_000)
  expect(result.current.message).toBeNull()
  rerender({ enabled: true })
  advance(59_999)
  expect(result.current.message).toBeNull()
  advance(1)
  const message = result.current.message
  rerender({ enabled: false })
  rerender({ enabled: true })
  advance(120_000)
  expect(result.current.message).toBe(message)
})

test('background time is excluded and unmount removes the timer and visibility listener', () => {
  const visibility = vi.spyOn(document, 'visibilityState', 'get')
  const { result, unmount } = renderHook(() => useIdleEncouragement(true))
  advance(50_000)
  visibility.mockReturnValue('hidden')
  act(() => document.dispatchEvent(new Event('visibilitychange')))
  advance(120_000)
  expect(result.current.message).toBeNull()
  visibility.mockReturnValue('visible')
  act(() => document.dispatchEvent(new Event('visibilitychange')))
  advance(59_999)
  expect(result.current.message).toBeNull()
  unmount()
  expect(vi.getTimerCount()).toBe(0)
  act(() => document.dispatchEvent(new Event('visibilitychange')))
  expect(vi.getTimerCount()).toBe(0)
})
