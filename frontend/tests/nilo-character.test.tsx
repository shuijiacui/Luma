import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { useReducedMotion } from 'framer-motion'
import { setLocale } from '@/i18n'
import { NiloCharacter } from '@/features/child/components/NiloCharacter'

vi.mock('framer-motion', async importOriginal => ({
  ...await importOriginal<typeof import('framer-motion')>(),
  useReducedMotion: vi.fn(() => true),
}))

const parts = [
  ['head', '摸摸 Nilo 的头'],
  ['nose', '点点 Nilo 的鼻子'],
  ['hand', '和 Nilo 击掌'],
  ['belly', '挠挠 Nilo 的肚子'],
  ['tail', '碰碰 Nilo 的尾巴'],
  ['lantern', '点亮 Nilo 的星星灯'],
] as const

beforeEach(() => {
  localStorage.clear()
  setLocale('zh')
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date', 'performance'] })
  vi.setSystemTime(new Date('2026-09-08T12:00:00Z'))
  vi.mocked(useReducedMotion).mockReturnValue(true)
})
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

function prepare(disabled = false) {
  const playSound = vi.fn()
  const view = render(<NiloCharacter disabled={disabled} playSound={playSound} />)
  const companion = view.container.querySelector('.nilo-companion')!
  return { ...view, companion, playSound }
}

test.each(parts)('%s responds on its first accessible button activation and returns to rest', (part, label) => {
  const { companion, playSound } = prepare()
  const button = screen.getByRole('button', { name: label })
  expect(button.tagName).toBe('BUTTON')
  expect(companion.getAttribute('data-reaction')).toBe('idle')
  fireEvent.click(button)
  expect(companion.getAttribute('data-reaction')).toBe(part)
  expect(playSound).toHaveBeenCalledExactlyOnceWith(part)
  act(() => vi.advanceTimersByTime(6000))
  expect(companion.getAttribute('data-reaction')).toBe('idle')
})

test.each(['{Enter}', ' '])('native keyboard activation with %s triggers exactly one interaction', async key => {
  // Keyboard defaults are asynchronous DOM behavior; use the real event loop here.
  vi.useRealTimers()
  const user = userEvent.setup()
  const { companion, playSound } = prepare()
  screen.getByRole('button', { name: '和 Nilo 击掌' }).focus()
  await user.keyboard(key)
  expect(playSound).toHaveBeenCalledExactlyOnceWith('hand')
  expect(companion.getAttribute('data-reaction')).toBe('hand')
})

test('rapid alternating touches are bounded, then accept a different body part without becoming stuck', () => {
  const { companion, playSound } = prepare()
  fireEvent.click(screen.getByRole('button', { name: parts[0][1] }))
  act(() => vi.advanceTimersByTime(219))
  fireEvent.click(screen.getByRole('button', { name: parts[1][1] }))
  expect(playSound).toHaveBeenCalledTimes(1)
  expect(companion.getAttribute('data-reaction')).toBe('head')
  act(() => vi.advanceTimersByTime(2))
  fireEvent.click(screen.getByRole('button', { name: parts[5][1] }))
  expect(playSound).toHaveBeenLastCalledWith('lantern')
  expect(companion.getAttribute('data-reaction')).toBe('lantern')
  for (const [part, label] of parts) {
    act(() => vi.advanceTimersByTime(221))
    fireEvent.click(screen.getByRole('button', { name: label }))
    expect(companion.getAttribute('data-reaction')).toBe(part)
  }
  act(() => vi.advanceTimersByTime(6000))
  expect(companion.getAttribute('data-reaction')).toBe('idle')
  fireEvent.click(screen.getByRole('button', { name: parts[1][1] }))
  expect(companion.getAttribute('data-reaction')).toBe('nose')
})

test('a previous reaction cannot end a newer, longer lantern response early', () => {
  const { companion, playSound } = prepare()
  fireEvent.click(screen.getByRole('button', { name: parts[0][1] }))
  act(() => vi.advanceTimersByTime(1000))
  fireEvent.click(screen.getByRole('button', { name: parts[5][1] }))
  // The original head response would have ended by now; the new lamp is still responding.
  act(() => vi.advanceTimersByTime(800))
  expect(companion.getAttribute('data-reaction')).toBe('lantern')
  expect(companion.getAttribute('data-phase')).toBe('respond')
  expect(playSound).toHaveBeenCalledTimes(2)
  act(() => vi.advanceTimersByTime(1700))
  expect(companion.getAttribute('data-reaction')).toBe('idle')
})

test('disabling in the middle of a reaction clears it and prevents further input', () => {
  const { companion, playSound, rerender } = prepare()
  fireEvent.click(screen.getByRole('button', { name: parts[5][1] }))
  expect(companion.getAttribute('data-reaction')).toBe('lantern')
  rerender(<NiloCharacter disabled playSound={playSound} />)
  expect(companion.getAttribute('data-reaction')).toBe('idle')
  for (const [, label] of parts) {
    const button = screen.getByRole('button', { name: label }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    fireEvent.click(button)
  }
  act(() => vi.advanceTimersByTime(6000))
  expect(playSound).toHaveBeenCalledTimes(1)
  rerender(<NiloCharacter disabled={false} playSound={playSound} />)
  fireEvent.click(screen.getByRole('button', { name: parts[0][1] }))
  expect(companion.getAttribute('data-reaction')).toBe('head')
  expect(playSound).toHaveBeenCalledTimes(2)
})

test('the visible hint control retains its pressed state through an interaction', () => {
  const { playSound } = prepare()
  fireEvent.click(screen.getByRole('button', { pressed: false }))
  expect(screen.getByRole('button', { pressed: true })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: parts[2][1] }))
  act(() => vi.advanceTimersByTime(6000))
  expect(screen.getByRole('button', { pressed: true })).toBeTruthy()
  expect(playSound).toHaveBeenCalledExactlyOnceWith('hand')
  fireEvent.click(screen.getByRole('button', { pressed: true }))
  expect(screen.getByRole('button', { pressed: false })).toBeTruthy()
})

test('reduced motion keeps all six interactions available', () => {
  vi.mocked(useReducedMotion).mockReturnValue(true)
  const { companion, playSound } = prepare()
  expect(companion.getAttribute('data-reduced-motion')).toBe('true')
  for (const [part, label] of parts) {
    fireEvent.click(screen.getByRole('button', { name: label }))
    expect(companion.getAttribute('data-reaction')).toBe(part)
    act(() => vi.advanceTimersByTime(6000))
  }
  expect(playSound).toHaveBeenCalledTimes(6)
})

test('changing the system motion preference updates an active character and unsubscribes on unmount', () => {
  vi.mocked(useReducedMotion).mockReturnValue(false)
  const preference = Object.assign(new EventTarget(), {
    matches: false,
    media: '(prefers-reduced-motion: reduce)',
  })
  const matchMedia = vi.fn(() => preference)
  const removeListener = vi.spyOn(preference, 'removeEventListener')
  vi.stubGlobal('matchMedia', matchMedia)
  const { companion, container, playSound, unmount } = prepare()
  expect(matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)')
  expect(companion.getAttribute('data-reduced-motion')).toBe('false')
  fireEvent.click(screen.getByRole('button', { name: parts[0][1] }))
  act(() => vi.advanceTimersByTime(300))
  expect(container.querySelectorAll('.nilo-particles > span')).toHaveLength(6)

  act(() => { preference.matches = true; preference.dispatchEvent(new Event('change')) })
  expect(companion.getAttribute('data-reduced-motion')).toBe('true')
  expect(companion.getAttribute('data-paused')).toBe('true')
  expect(container.querySelectorAll('.nilo-particles > span')).toHaveLength(1)
  fireEvent.click(screen.getByRole('button', { name: parts[5][1] }))
  expect(companion.getAttribute('data-reaction')).toBe('lantern')
  expect(playSound).toHaveBeenLastCalledWith('lantern')

  act(() => { preference.matches = false; preference.dispatchEvent(new Event('change')) })
  expect(companion.getAttribute('data-reduced-motion')).toBe('false')
  expect(companion.getAttribute('data-paused')).toBe('false')
  expect(container.querySelectorAll('.nilo-particles > span')).toHaveLength(6)
  unmount()
  expect(removeListener).toHaveBeenCalledWith('change', expect.any(Function))
})

test('unmounting an active reaction releases its scheduled callbacks', () => {
  vi.mocked(useReducedMotion).mockReturnValue(false)
  const initialTimers = vi.getTimerCount()
  const { unmount, playSound } = prepare()
  fireEvent.click(screen.getByRole('button', { name: parts[5][1] }))
  expect(vi.getTimerCount()).toBeGreaterThan(initialTimers)
  unmount()
  expect(vi.getTimerCount()).toBe(initialTimers)
  act(() => vi.advanceTimersByTime(10000))
  expect(playSound).toHaveBeenCalledTimes(1)
})
