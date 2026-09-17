import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

import { ChildCreatePage } from '@/features/child/pages/ChildCreatePage'
import { clearChildDraft, getChildDraft } from '@/features/child/draft'
import { requestNiloPraise, requestNiloStroke } from '@/lib/api/lumaApi'

vi.mock('@/features/auth/AuthContext', () => ({
  useAuth: () => ({ session: { id: 'guest-child', role: 'child', displayName: '小朋友', isGuest: true } }),
}))
vi.mock('@/features/onboarding/OnboardingContext', () => ({
  useOnboarding: () => ({ active: false, completeInteraction: vi.fn() }),
}))
vi.mock('@/features/onboarding/useOnboardingTour', () => {
  const start = vi.fn()
  return { useOnboardingTour: () => start }
})
vi.mock('@/lib/api/lumaApi', () => ({
  analyzeDrawing: vi.fn(), requestNiloPraise: vi.fn(), requestNiloStroke: vi.fn(),
}))
vi.mock('framer-motion', async original => ({
  ...await original<typeof import('framer-motion')>(),
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
}))

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
  localStorage.clear()
  clearChildDraft()
  getChildDraft('guest-child').artworkId = 'open-drawing'
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
  const ctx = {
    save: vi.fn(), restore: vi.fn(), clearRect: vi.fn(), drawImage: vi.fn(), translate: vi.fn(),
    rotate: vi.fn(), beginPath: vi.fn(), closePath: vi.fn(), arc: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(),
    fill: vi.fn(), fillRect: vi.fn(), globalAlpha: 1, globalCompositeOperation: 'source-over', fillStyle: '',
  } as unknown as CanvasRenderingContext2D
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx)
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,drawing')
  vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 320, height: 240 } as DOMRect)
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  vi.stubGlobal('Image', class { onload?: () => void; set src(_value: string) { this.onload?.() } })
  vi.mocked(requestNiloPraise).mockResolvedValue({ praise: '我看到你在认真画啦～', suggestion: '可以试着画一条小鱼。' })
  vi.mocked(requestNiloStroke).mockResolvedValue({ stroke: {
    kind: 'line', points: [{ x: 0.2, y: 0.2 }, { x: 0.3, y: 0.3 }], color: '#6fa8d8', width: 5,
    say: '我在这里加一条小波浪～',
  } })
})
afterEach(() => {
  cleanup()
  clearChildDraft()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

function prepare() {
  render(<MemoryRouter><ChildCreatePage /></MemoryRouter>)
  const canvas = screen.getByLabelText('自由绘画画布') as HTMLCanvasElement
  canvas.setPointerCapture = vi.fn()
  canvas.hasPointerCapture = vi.fn().mockReturnValue(true)
  canvas.releasePointerCapture = vi.fn()
  return canvas
}
function pointer(canvas: HTMLCanvasElement, type: string) {
  const event = new Event(type, { bubbles: true })
  Object.assign(event, { pointerId: 1, isPrimary: true, button: 0, clientX: 20, clientY: 30 })
  fireEvent(canvas, event)
}

test('short-pause praise and the one-minute reminder coexist; hiding cancels both', async () => {
  const canvas = prepare()
  pointer(canvas, 'pointerdown')
  pointer(canvas, 'pointerup')
  await act(async () => { await vi.advanceTimersByTimeAsync(2600) })
  expect(requestNiloPraise).toHaveBeenCalledOnce()
  expect(screen.getByText('我看到你在认真画啦～')).toBeTruthy()
  await act(async () => { await vi.advanceTimersByTimeAsync(57_400) })
  const reminders = [
    '在想接下来画什么吗？慢慢想，我陪着你～',
    '不知道画什么也没关系，可以先试试喜欢的颜色。',
    '休息一下也很好，想画的时候再继续吧。',
    '要不要试着画一个小圆圈，看看它会变成什么？',
  ]
  expect(reminders.some(line => screen.queryByText(line))).toBe(true)
  pointer(canvas, 'pointerdown')
  pointer(canvas, 'pointerup')
  fireEvent.doubleClick(screen.getByRole('button', { name: '双击隐藏 Nilo' }))
  await act(async () => { await vi.advanceTimersByTimeAsync(120_000) })
  expect(requestNiloPraise).toHaveBeenCalledOnce()
  expect(reminders.some(line => screen.queryByText(line))).toBe(false)
  expect(localStorage.getItem('luma_nilo_visible')).toBe('0')
  expect(screen.getByRole('button', { name: '显示 Nilo' })).toBeTruthy()
  expect(document.querySelector('canvas')).toBe(canvas)
})

test('music and independent Nilo undo remain available in co-drawing; hiding cancels the ask dialog', async () => {
  const frames: FrameRequestCallback[] = []
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.push(callback); return frames.length })
  const canvas = prepare()
  expect(screen.getByRole('button', { name: '开启背景音乐' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '一人一笔' }))
  pointer(canvas, 'pointerdown')
  pointer(canvas, 'pointerup')
  await act(async () => {
    await vi.advanceTimersByTimeAsync(450)
    frames.splice(0).forEach(frame => frame(0))
  })
  expect(requestNiloStroke).toHaveBeenCalled()
  expect(screen.getByRole('button', { name: '撤销 Nilo 这一笔' })).toBeTruthy()
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '撤销', exact: true })) })
  expect(screen.getByRole('button', { name: '撤销 Nilo 这一笔' })).toBeTruthy()
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '撤销 Nilo 这一笔' })) })
  expect(screen.queryByRole('button', { name: '撤销 Nilo 这一笔' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '停笔问问' }))
  pointer(canvas, 'pointerdown')
  pointer(canvas, 'pointerup')
  fireEvent.doubleClick(screen.getByRole('button', { name: '双击隐藏 Nilo' }))
  await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
  fireEvent.click(screen.getByRole('button', { name: '显示 Nilo' }))
  expect(screen.queryByRole('dialog', { name: '要我帮你接下一笔吗？' })).toBeNull()
  expect(screen.getByRole('button', { name: '开启背景音乐' })).toBeTruthy()
  expect(document.querySelector('canvas')).toBe(canvas)
})
