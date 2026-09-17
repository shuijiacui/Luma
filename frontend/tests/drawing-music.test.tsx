import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { DrawingMusic } from '@/features/child/components/DrawingMusic'
import { setLocale } from '@/i18n'

let playResponse: () => Promise<void>
class FakeAudio {
  static instances: FakeAudio[] = []
  src: string
  volume = 1
  loop = false
  preload = ''
  onerror: (() => void) | null = null
  play = vi.fn(() => playResponse())
  pause = vi.fn()
  removeAttribute = vi.fn()
  load = vi.fn()
  constructor(src: string) { this.src = src; FakeAudio.instances.push(this) }
}
beforeEach(() => {
  playResponse = () => Promise.resolve()
  FakeAudio.instances = []
  vi.stubGlobal('Audio', FakeAudio)
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
  act(() => setLocale('zh'))
})
afterEach(() => { cleanup(); act(() => setLocale('zh')); vi.unstubAllGlobals(); vi.restoreAllMocks() })
const enable = () => act(async () => { fireEvent.click(screen.getByRole('button', { name: '开启背景音乐' })) })

test('starts off without loading audio, offers exactly five songs, and localizes controls', () => {
  render(<DrawingMusic />)
  expect(FakeAudio.instances).toHaveLength(0)
  expect(screen.getByRole('button', { name: '开启背景音乐' }).getAttribute('aria-pressed')).toBe('false')
  fireEvent.click(screen.getByRole('button', { name: '选择音乐和音量' }))
  expect(screen.getAllByRole('option').map(option => option.textContent)).toEqual([
    '星星摇篮曲 · 轻柔', '轻柔钢琴 · 轻柔', '晨光微粒 · 轻柔', '快乐节拍 · 欢快', '轻快冒险 · 欢快',
  ])
  fireEvent.change(screen.getByLabelText('选择背景音乐'), { target: { value: 'happy-beat' } })
  expect(FakeAudio.instances).toHaveLength(0)
  act(() => setLocale('en'))
  expect(screen.getByLabelText('Choose background music')).toBeTruthy()
  expect(screen.getByRole('option', { name: 'Happy beat · Cheerful' })).toBeTruthy()
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(screen.queryByRole('combobox')).toBeNull()
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Choose music and volume' }))
})

test('explicit enabling plays quietly, changing songs reuses one player, and off stays off', async () => {
  render(<DrawingMusic />)
  await enable()
  const audio = FakeAudio.instances[0]
  expect(audio.src).toContain('/music/happy-lullaby.mp3')
  expect(audio.loop).toBe(true)
  expect(audio.volume).toBe(.15)
  expect(audio.play).toHaveBeenCalledOnce()
  fireEvent.click(screen.getByRole('button', { name: '选择音乐和音量' }))
  await act(async () => { fireEvent.change(screen.getByLabelText('选择背景音乐'), { target: { value: 'first-light-particles' } }) })
  expect(FakeAudio.instances).toHaveLength(1)
  expect(audio.src).toContain('/music/first-light-particles.mp3')
  expect(audio.play).toHaveBeenCalledTimes(2)
  fireEvent.change(screen.getByRole('slider', { name: /音乐音量/ }), { target: { value: '25' } })
  expect(audio.volume).toBe(.25)
  fireEvent.click(screen.getByRole('button', { name: '关闭背景音乐' }))
  expect(audio.pause).toHaveBeenCalled()
  await act(async () => { document.dispatchEvent(new Event('visibilitychange')) })
  expect(audio.play).toHaveBeenCalledTimes(2)
  expect(screen.getByRole('button', { name: '开启背景音乐' })).toBeTruthy()
})

test('backgrounding pauses, returning resumes only enabled music, and leaving releases the recording', async () => {
  const visibility = vi.spyOn(document, 'visibilityState', 'get')
  const { unmount } = render(<DrawingMusic />)
  await enable()
  const audio = FakeAudio.instances[0]
  visibility.mockReturnValue('hidden')
  act(() => document.dispatchEvent(new Event('visibilitychange')))
  expect(audio.pause).toHaveBeenCalledOnce()
  expect(audio.play).toHaveBeenCalledOnce()
  visibility.mockReturnValue('visible')
  await act(async () => { document.dispatchEvent(new Event('visibilitychange')) })
  expect(audio.play).toHaveBeenCalledTimes(2)
  unmount()
  expect(audio.pause).toHaveBeenCalledTimes(2)
  expect(audio.removeAttribute).toHaveBeenCalledWith('src')
  expect(audio.load).toHaveBeenCalledOnce()
  document.dispatchEvent(new Event('visibilitychange'))
  expect(audio.play).toHaveBeenCalledTimes(2)
})

test('playback failure returns to off and can be retried; a recording error also stops playback', async () => {
  playResponse = () => Promise.reject(new Error('NotAllowedError'))
  render(<DrawingMusic />)
  await enable()
  expect(screen.getByRole('status').textContent).toContain('音乐暂时没播放成功')
  expect(screen.getByRole('button', { name: '开启背景音乐' })).toBeTruthy()
  playResponse = () => Promise.resolve()
  await enable()
  expect(screen.queryByRole('status')).toBeNull()
  expect(screen.getByRole('button', { name: '关闭背景音乐' })).toBeTruthy()
  act(() => FakeAudio.instances[0].onerror?.())
  expect(screen.getByRole('button', { name: '开启背景音乐' })).toBeTruthy()
  expect(screen.getByRole('status')).toBeTruthy()
})

test('turning off while playback is loading ignores its delayed failure', async () => {
  let reject!: (reason: Error) => void
  playResponse = () => new Promise((_, rejectPromise) => { reject = rejectPromise })
  render(<DrawingMusic />)
  fireEvent.click(screen.getByRole('button', { name: '开启背景音乐' }))
  expect(screen.getByText('音乐：加载中')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '关闭背景音乐' }))
  await act(async () => { reject(new Error('AbortError')) })
  expect(screen.queryByRole('status')).toBeNull()
  expect(screen.getByRole('button', { name: '开启背景音乐' })).toBeTruthy()
})
