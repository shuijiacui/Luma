import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { useEffect } from 'react'
import { OnboardingProvider, useOnboarding, type OnboardingStep } from '@/features/onboarding/OnboardingContext'
import { OnboardingOverlay } from '@/features/onboarding/OnboardingOverlay'
import { findVisibleTarget, intersect, placeCard, visibleRect, type Rect } from '@/features/onboarding/geometry'
import { readTourStatus, tourStorageKey, useOnboardingTour } from '@/features/onboarding/useOnboardingTour'
import { parentSteps } from '@/features/onboarding/steps/parentSteps'
import { childSteps, canvasSteps } from '@/features/onboarding/steps/childSteps'
import { setLocale, t } from '@/i18n'
import { MemoryRouter } from 'react-router-dom'
import { ParentDemoPage } from '@/features/auth/pages/ParentDemoPage'
import { fetchMe } from '@/lib/api/authApi'

const auth = vi.hoisted(() => ({ session: { id: 'A', role: 'parent', isGuest: false, token: 'test', familyId: 'F', displayName: '家长' } }))
const emptyHistory = vi.hoisted(() => ({ analyses: [], error: null, reload: vi.fn() }))
vi.mock('@/features/auth/AuthContext', () => ({ useAuth: () => auth }))
vi.mock('@/lib/api/authApi', () => ({ fetchMe: vi.fn() }))
vi.mock('@/hooks/useChildHistory', () => ({ useChildHistory: () => emptyHistory }))
vi.mock('@/hooks/useAuthedImage', () => ({ useAuthedImage: () => null }))
vi.mock('framer-motion', async original => ({ ...await original<typeof import('framer-motion')>(), useReducedMotion: () => true }))
const stepA: OnboardingStep = { id: 'a', target: '[data-stop="a"]', title: '第一站', body: '看看这里' }
const stepB: OnboardingStep = { id: 'b', target: '[data-stop="b"]', title: '第二站', body: '再看看这里' }
const sampleSteps = [stepA, stepB]
const box = (left: number, top: number, width: number, height: number) => ({ left, top, width, height, x: left, y: top, right: left + width, bottom: top + height, toJSON() {} })

beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear(); sessionStorage.clear(); setLocale('zh')
  auth.session = { ...auth.session, id: 'A', role: 'parent', isGuest: false }
  vi.stubGlobal('innerWidth', 1280); vi.stubGlobal('innerHeight', 800)
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const values = this.dataset.box?.split(',').map(Number)
    return values ? box(values[0], values[1], values[2], values[3]) : box(200, 160, 160, 60)
  })
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(function (this: HTMLElement) {
    return [this.getBoundingClientRect()] as unknown as DOMRectList
  })
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(260)
})
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
async function settle(ms = 120) { await act(async () => { await vi.advanceTimersByTimeAsync(ms) }) }

function Controls({ steps = sampleSteps, onDismiss = vi.fn() }: { steps?: OnboardingStep[]; onDismiss?: (result: string) => void }) {
  const tour = useOnboarding()
  return <><button onClick={() => tour.start(steps, { onDismiss })}>开始</button><output data-testid="tour-state">{tour.active ? tour.steps[tour.currentIndex].id : 'closed'}</output><button onClick={() => tour.completeInteraction('canvas-stroke')}>完成一笔</button></>
}
function mountTour(steps = sampleSteps, onDismiss = vi.fn()) {
  const view = render(<OnboardingProvider><Controls steps={steps} onDismiss={onDismiss} /><button data-stop="a">目标 A</button><button data-stop="b">目标 B</button><OnboardingOverlay /></OnboardingProvider>)
  fireEvent.click(screen.getByText('开始'))
  return view
}

test('selects the visible mobile navigation instead of its hidden desktop duplicate', () => {
  render(<><aside style={{ display: 'none' }}><button data-stop="nav">桌面</button></aside><button data-stop="nav">手机</button></>)
  expect(findVisibleTarget('[data-stop="nav"]')?.textContent).toBe('手机')
})
test('clips a highlight to its scroll container', () => {
  render(<div style={{ overflowY: 'auto' }} data-box="0,100,400,300"><button data-stop="clip" data-box="40,60,100,100">目标</button></div>)
  expect(visibleRect(screen.getByText('目标'), { left: 0, top: 0, width: 400, height: 800 })).toEqual({ left: 40, top: 100, width: 100, height: 60 })
})

const cases: [string, Rect, Rect][] = [
  ['desktop sidebar', { left: 0, top: 0, width: 1440, height: 900 }, { left: 30, top: 300, width: 200, height: 54 }],
  ['short desktop', { left: 0, top: 0, width: 1024, height: 600 }, { left: 400, top: 280, width: 220, height: 70 }],
  ['narrow phone bottom nav', { left: 0, top: 0, width: 320, height: 568 }, { left: 130, top: 500, width: 64, height: 50 }],
  ['phone top bar', { left: 0, top: 0, width: 390, height: 844 }, { left: 20, top: 70, width: 350, height: 42 }],
  ['tablet canvas', { left: 0, top: 0, width: 1180, height: 820 }, { left: 400, top: 310, width: 240, height: 100 }],
  ['landscape phone', { left: 0, top: 0, width: 844, height: 390 }, { left: 500, top: 90, width: 180, height: 120 }],
  ['visual viewport and safe area', { left: 44, top: 30, width: 712, height: 400 }, { left: 340, top: 320, width: 60, height: 60 }],
]
test.each(cases)('%s: card stays inside the viewport and does not cover its target', (_, v, target) => {
  for (const height of [240, 360]) {
    const position = placeCard(target, { width: 336, height }, v)
    const card = { ...position, height: Math.min(height, position.maxHeight) }
    expect(intersect(card, target)).toBeNull()
    expect(card.left).toBeGreaterThanOrEqual(v.left + 16)
    expect(card.top).toBeGreaterThanOrEqual(v.top + 16)
    expect(card.left + card.width).toBeLessThanOrEqual(v.left + v.width - 16)
    expect(card.top + card.height).toBeLessThanOrEqual(v.top + v.height - 16)
    expect(card.height).toBeGreaterThan(0)
  }
})

test('blank mask clicks do not dismiss; previous and explicit completion work', async () => {
  const dismissed = vi.fn()
  mountTour(sampleSteps, dismissed)
  await settle()
  expect(screen.getByRole('dialog').textContent).toContain('第一站')
  fireEvent.click(document.querySelector('.luma-tour-blocker')!)
  expect(dismissed).not.toHaveBeenCalled()
  fireEvent.click(screen.getByText('下一步')); await settle()
  expect(screen.getByRole('dialog').textContent).toContain('第二站')
  fireEvent.click(screen.getByText('上一步')); await settle()
  expect(screen.getByRole('dialog').textContent).toContain('第一站')
  fireEvent.click(screen.getByText('下一步')); await settle()
  fireEvent.click(screen.getByText('知道啦'))
  expect(dismissed).toHaveBeenCalledExactlyOnceWith('completed')
})

test('waits for an asynchronously mounted target before showing the explanation', async () => {
  let release!: () => void
  mountTour([{ ...stepA, target: '[data-stop="late"]', prepare: () => new Promise<void>(resolve => { release = resolve }) }])
  await settle()
  expect(screen.getByRole('dialog').textContent).toContain('正在找到这个位置')
  const button = document.createElement('button'); button.dataset.stop = 'late'; document.body.append(button)
  await act(async () => release())
  await settle()
  expect(screen.getByRole('dialog').textContent).toContain('第一站')
  button.remove()
})

test('skips an unavailable target without falsely recording a completed tour', async () => {
  const dismissed = vi.fn()
  mountTour([{ ...stepA, target: '#missing' }], dismissed)
  await settle(3300)
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(dismissed).toHaveBeenCalledExactlyOnceWith('skipped')
})

test('actual target click runs its handler and advances exactly one interactive step', async () => {
  const action = vi.fn()
  render(<OnboardingProvider><Controls steps={[{ ...stepA, interaction: 'click' }, stepB]} /><button data-stop="a" onClick={action}>摸摸头</button><button data-stop="b">门</button><OnboardingOverlay /></OnboardingProvider>)
  fireEvent.click(screen.getByText('开始')); await settle()
  expect(document.querySelectorAll('.luma-tour-blocker')).toHaveLength(4)
  fireEvent.click(screen.getByText('摸摸头')); fireEvent.click(screen.getByText('摸摸头'))
  await settle()
  expect(action).toHaveBeenCalledTimes(2)
  expect(screen.getByTestId('tour-state').textContent).toBe('b')
})

test('drawing only advances after the stroke completion event', async () => {
  mountTour([{ ...stepA, id: 'canvas-stroke', interaction: 'stroke' }, stepB])
  await settle()
  fireEvent.click(screen.getByText('目标 A'))
  expect(screen.getByTestId('tour-state').textContent).toBe('canvas-stroke')
  fireEvent.click(screen.getByText('完成一笔')); await settle()
  expect(screen.getByTestId('tour-state').textContent).toBe('b')
})

test('remeasures on resize, target movement and language changes', async () => {
  mountTour(); await settle()
  const ring = document.querySelector<HTMLElement>('.luma-tour-ring')!
  const oldLeft = ring.style.left
  screen.getByText('目标 A').dataset.box = '500,80,120,44'
  vi.stubGlobal('innerWidth', 700)
  fireEvent(window, new Event('resize')); await settle()
  expect(ring.style.left).not.toBe(oldLeft)
  act(() => setLocale('en')); await settle()
  expect(screen.getByRole('button', { name: /Next/ })).toBeTruthy()
  expect(screen.getByTestId('tour-state').textContent).toBe('a')
})

test('keyboard stays in the guide; Escape skips and restores focus', async () => {
  const dismissed = vi.fn()
  render(<OnboardingProvider><Controls onDismiss={dismissed} /><button data-stop="a">目标 A</button><OnboardingOverlay /></OnboardingProvider>)
  screen.getByText('开始').focus()
  fireEvent.click(screen.getByText('开始')); await settle()
  fireEvent.keyDown(document, { key: 'Tab' })
  expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true)
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(dismissed).toHaveBeenCalledExactlyOnceWith('skipped')
  expect(document.activeElement).toBe(screen.getByText('开始'))
})

function ScopedTour() {
  const launch = useOnboardingTour('welcome', 'parent')
  useEffect(() => { launch(sampleSteps) }, [launch])
  return <button onClick={() => launch(sampleSteps, true)}>重看</button>
}
test('completion and skipping are scoped to account, role and version; replay is available', async () => {
  const key = tourStorageKey('parent', 'A', 'welcome')
  const view = render(<OnboardingProvider><ScopedTour /><button data-stop="a">目标 A</button><button data-stop="b">目标 B</button><OnboardingOverlay /></OnboardingProvider>)
  await settle()
  fireEvent.click(screen.getByText('以后再看'))
  expect(readTourStatus(key)).toBe('skipped')
  fireEvent.click(screen.getByText('重看')); await settle()
  fireEvent.click(screen.getByText('下一步')); await settle()
  fireEvent.click(screen.getByText('知道啦'))
  expect(readTourStatus(key)).toBe('completed')
  view.unmount()
  auth.session = { ...auth.session, id: 'B' }
  render(<OnboardingProvider><ScopedTour /><button data-stop="a">目标 A</button><OnboardingOverlay /></OnboardingProvider>)
  await settle()
  expect(screen.getByRole('dialog')).toBeTruthy()
  expect(readTourStatus(tourStorageKey('parent', 'B', 'welcome'))).toBeNull()
  expect(readTourStatus(tourStorageKey('child', 'A', 'welcome'))).toBeNull()
})

test('leaving a page cancels its tour and releases timers', async () => {
  const view = render(<OnboardingProvider><ScopedTour /><button data-stop="a">目标 A</button><OnboardingOverlay /></OnboardingProvider>)
  await settle()
  view.rerender(<OnboardingProvider><p>另一页</p><OnboardingOverlay /></OnboardingProvider>)
  await settle()
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(vi.getTimerCount()).toBe(0)
})

test('parent steps prepare the correct view and every new guide string has English text', () => {
  const show = vi.fn()
  const steps = parentSteps(false, show)
  steps[0].prepare?.(); expect(show).toHaveBeenLastCalledWith('settings')
  steps[1].prepare?.(); expect(show).toHaveBeenLastCalledWith('overview')
  expect(parentSteps(true, show)[0].id).toBe('parent-child')
  for (const step of [...steps, ...childSteps, ...canvasSteps]) {
    expect(t(step.title, 'en')).not.toBe(step.title)
    expect(t(step.body, 'en')).not.toBe(step.body)
  }
})

test('a real empty family tour opens settings for the invite, returns to overview, and reaches both navigation buttons', async () => {
  vi.mocked(fetchMe).mockResolvedValue({ children: [], family: { inviteCode: 'HELLO1' } } as Awaited<ReturnType<typeof fetchMe>>)
  const nativeStyle = window.getComputedStyle.bind(window)
  // jsdom does not render Framer Motion frames; leave layout visibility under test.
  vi.spyOn(window, 'getComputedStyle').mockImplementation(element => {
    const style = nativeStyle(element)
    return new Proxy(style, { get(target, key) { return key === 'opacity' ? '1' : Reflect.get(target, key) } })
  })
  render(<OnboardingProvider><MemoryRouter><ParentDemoPage /></MemoryRouter><OnboardingOverlay /></OnboardingProvider>)
  await settle(0)
  await settle(650)
  await settle()
  expect(screen.getByRole('dialog').textContent).toContain('先连接孩子的创作空间')
  expect(findVisibleTarget('[data-onboarding="parent-invite"]')?.textContent).toContain('HELLO1')
  fireEvent.click(screen.getByText('下一步')); await settle(); await settle()
  expect(screen.getByRole('dialog').textContent).toContain('最近的创作，从这里看')
  expect(screen.getByText('邀请孩子加入家庭空间')).toBeTruthy()
  fireEvent.click(screen.getByText('下一步')); await settle()
  expect(screen.getByRole('dialog').textContent).toContain('留住每一次小小创作')
  fireEvent.click(screen.getByText('下一步')); await settle()
  expect(screen.getByRole('dialog').textContent).toContain('回看一段时间的成长')
  fireEvent.click(screen.getByText('知道啦')); await settle(700)
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(readTourStatus(tourStorageKey('parent', 'A', 'welcome'))).toBe('completed')
  expect(readTourStatus(tourStorageKey('parent', 'A', 'settings'))).toBeNull()
})
