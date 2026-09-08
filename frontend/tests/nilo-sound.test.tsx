import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { useNiloSound } from '@/features/child/hooks/useNiloSound'

function parameter() {
  return {
    setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(), cancelScheduledValues: vi.fn(), setTargetAtTime: vi.fn(),
  }
}

class FakeAudioContext {
  static instances: FakeAudioContext[] = []
  state = 'running'
  currentTime = 10
  destination = {}
  oscillators: ReturnType<FakeAudioContext['createOscillator']>[] = []
  gains: ReturnType<FakeAudioContext['createGain']>[] = []
  constructor() { FakeAudioContext.instances.push(this) }
  resume = vi.fn(async () => { this.state = 'running' })
  close = vi.fn(async () => { this.state = 'closed' })
  createOscillator() {
    const oscillator = {
      type: 'sine', frequency: parameter(), connect: vi.fn(), disconnect: vi.fn(),
      start: vi.fn(), stop: vi.fn(), onended: null as (() => void) | null,
    }
    this.oscillators.push(oscillator)
    return oscillator
  }
  createGain() {
    const gain = { gain: parameter(), connect: vi.fn(), disconnect: vi.fn() }
    this.gains.push(gain)
    return gain
  }
}

beforeEach(() => {
  localStorage.clear()
  FakeAudioContext.instances = []
  vi.stubGlobal('AudioContext', FakeAudioContext)
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

test('audio stays off by default and remembers an explicit choice', () => {
  const { result, unmount } = renderHook(useNiloSound)
  act(() => result.current.play('lantern'))
  expect(result.current.soundOn).toBe(false)
  expect(FakeAudioContext.instances).toHaveLength(0)
  act(() => result.current.toggleSound())
  expect(result.current.soundOn).toBe(true)
  expect(localStorage.getItem('luma_nilo_sound')).toBe('on')
  unmount()
  const restored = renderHook(useNiloSound)
  expect(restored.result.current.soundOn).toBe(true)
  // Restoring the preference alone must not create an autoplay context.
  expect(FakeAudioContext.instances).toHaveLength(1)
})

test('a sound can follow enabling audio in the same touch gesture; every note ends and disconnects', () => {
  const { result } = renderHook(useNiloSound)
  act(() => { result.current.toggleSound(); result.current.play('lantern') })
  const context = FakeAudioContext.instances[0]
  expect(context.oscillators.length).toBeGreaterThan(0)
  for (const oscillator of context.oscillators) {
    expect(oscillator.start).toHaveBeenCalledOnce()
    expect(oscillator.stop.mock.calls[0][0]).toBeGreaterThan(oscillator.start.mock.calls[0][0])
    oscillator.onended?.()
    expect(oscillator.disconnect).toHaveBeenCalledOnce()
  }
  for (const gain of context.gains) expect(gain.disconnect).toHaveBeenCalledOnce()
})

test('rapid tapping is throttled and sustained tapping has a bounded number of active voices', () => {
  localStorage.setItem('luma_nilo_sound', 'on')
  let now = 0
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  const { result } = renderHook(useNiloSound)
  act(() => result.current.play('lantern'))
  const context = FakeAudioContext.instances[0]
  const firstPhrase = context.oscillators.length
  for (let i = 0; i < 10; i++) act(() => result.current.play('lantern'))
  expect(context.oscillators).toHaveLength(firstPhrase)
  // Leave voices alive to model delayed audio hardware; scheduling still stays bounded.
  for (let i = 0; i < 20; i++) {
    now += 301
    act(() => result.current.play('lantern'))
  }
  expect(context.oscillators.length).toBeLessThanOrEqual(12)
})

test.each(['mute', 'unmount'] as const)('a delayed tablet audio unlock cannot play after %s', async action => {
  const { result, unmount } = renderHook(useNiloSound)
  act(() => result.current.toggleSound())
  const context = FakeAudioContext.instances[0]
  context.state = 'suspended'
  let resolveResume!: () => void
  context.resume.mockImplementation(() => new Promise<void>(resolve => { resolveResume = resolve }))
  act(() => result.current.play('head'))
  expect(context.resume).toHaveBeenCalledOnce()
  expect(context.oscillators).toHaveLength(0)
  if (action === 'mute') act(() => result.current.toggleSound())
  else unmount()
  await act(async () => { context.state = 'running'; resolveResume(); await Promise.resolve() })
  expect(context.oscillators).toHaveLength(0)
})

test('muting fades active notes and unmount releases the audio context', () => {
  localStorage.setItem('luma_nilo_sound', 'on')
  const { result, unmount } = renderHook(useNiloSound)
  act(() => result.current.play('belly'))
  const context = FakeAudioContext.instances[0]
  act(() => result.current.toggleSound())
  expect(localStorage.getItem('luma_nilo_sound')).toBe('off')
  for (const gain of context.gains) expect(gain.gain.setTargetAtTime).toHaveBeenCalledWith(0, context.currentTime, .012)
  unmount()
  expect(context.close).toHaveBeenCalledOnce()
  for (const oscillator of context.oscillators) expect(oscillator.disconnect).toHaveBeenCalledOnce()
  for (const gain of context.gains) expect(gain.disconnect).toHaveBeenCalledOnce()
})

test('a browser without Web Audio still supports the preference and visual callback flow', () => {
  vi.stubGlobal('AudioContext', undefined)
  const { result } = renderHook(useNiloSound)
  expect(() => act(() => { result.current.toggleSound(); result.current.play('nose') })).not.toThrow()
  expect(result.current.soundOn).toBe(true)
})
