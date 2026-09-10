import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { App } from '@/app/App'
import { childAppUrl } from '@/config/appMode'
import { ParentTabBar } from '@/features/parents/components/dashboard/ParentSidebar'
import { LanguageSwitcher } from '@/i18n/LanguageSwitcher'
import { getLocale, setLocale, t } from '@/i18n'
import { AuthProvider } from '@/features/auth/AuthContext'
import { UnifiedAuthPage } from '@/features/auth/pages/UnifiedAuthPage'
import { saveSession } from '@/features/auth/storage'
import { HomePage } from '@/features/marketing/pages/HomePage'
import { FamilyDataSettings } from '@/features/parents/components/FamilyDataSettings'
import { authFetch } from '@/lib/api/authFetch'
import { ChildCreatePage } from '@/features/child/pages/ChildCreatePage'
import { clearChildDraft, getChildDraft } from '@/features/child/draft'

vi.mock('@/lib/api/authFetch', () => ({ authFetch: vi.fn() }))
test('drawing header follows the language without replacing the active canvas', () => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  const context = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
  try {
    saveSession({ id: 'guest-child', role: 'child', familyId: 'demo-family', displayName: '小朋友', isGuest: true })
    clearChildDraft()
    getChildDraft('guest-child').artworkId = 'already-open-drawing'
    render(<AuthProvider><MemoryRouter><ChildCreatePage /></MemoryRouter></AuthProvider>)
    const canvas = screen.getByLabelText('自由绘画画布')
    expect(screen.getByText('我的创作空间')).toBeTruthy()
    expect(screen.getByText('让想象从这里开始')).toBeTruthy()
    expect(screen.queryByText('My Creative Space')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Switch to English' }))
    expect(screen.getByText('My Creative Space')).toBeTruthy()
    expect(screen.getByText('Anything can begin here')).toBeTruthy()
    expect(document.querySelector('canvas')).toBe(canvas)
    fireEvent.click(screen.getByRole('button', { name: '切换为中文' }))
    expect(screen.getByText('我的创作空间')).toBeTruthy()
    expect(document.querySelector('canvas')).toBe(canvas)
  } finally { cleanup(); clearChildDraft(); context.mockRestore(); vi.unstubAllGlobals() }
})
beforeEach(() => { localStorage.clear(); act(() => setLocale('zh')) })
afterEach(() => { cleanup(); act(() => setLocale('zh')); vi.clearAllMocks() })

test('switches the live homepage, document language and saved preference without remounting', async () => {
  render(<AuthProvider><MemoryRouter><HomePage /></MemoryRouter></AuthProvider>)
  const home = document.querySelector('main')
  const languageSwitch = screen.getByRole('button', { name: 'Switch to English' })
  expect(languageSwitch.closest('header')).toBeTruthy()
  expect(document.querySelector('.luma-language-bar')).toBeNull()
  fireEvent.click(languageSwitch)
  expect(screen.getByRole('link', { name: "Open children's sign-in" }).getAttribute('href')).toBe(`${childAppUrl}/auth?role=child&mode=login&force=1`)
  expect(document.documentElement.lang).toBe('en')
  expect(localStorage.getItem('luma_locale')).toBe('en')
  expect(document.querySelector('main')).toBe(home)
  fireEvent.click(screen.getByRole('button', { name: 'Plans' }))
  expect(await screen.findByText('Begin with a little creative time')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '切换为中文' }))
  expect(screen.getByText('先开始一段创作时光')).toBeTruthy()
})

test('homepage login entry stays visible with a cached session', () => {
  saveSession({
    id: 'guest-child',
    role: 'child',
    familyId: 'demo-family',
    displayName: '小小创作者',
    isGuest: true,
  })
  render(
    <AuthProvider>
      <MemoryRouter initialEntries={['/auth?role=child&mode=login&force=1']}>
        <UnifiedAuthPage />
      </MemoryRouter>
    </AuthProvider>,
  )
  expect(screen.getByRole('button', { name: '去找 Nilo' })).toBeTruthy()
})

test('switching preserves typed registration values and the form element', async () => {
  render(<AuthProvider><MemoryRouter initialEntries={['/auth?role=parent&mode=register']}><UnifiedAuthPage /></MemoryRouter></AuthProvider>)
  const email = document.querySelector('input[type=email]') as HTMLInputElement
  await userEvent.type(email, 'judge@example.com')
  fireEvent.click(screen.getByRole('button', { name: 'Switch to English' }))
  expect(document.querySelector('input[type=email]')).toBe(email)
  expect(email.value).toBe('judge@example.com')
  expect(screen.getByText('Confirm password')).toBeTruthy()
})

test('templates localize counts and labels while preserving names and unknown user content', () => {
  setLocale('en')
  expect(t('共 12 件作品 · 每一件都是孩子留下的印记')).toBe('12 creations · Each one leaves a little mark')
  expect(t('太阳 的创作旅程')).toBe("太阳's creative journey")
  expect(t('这是我自己的故事')).toBe('这是我自己的故事')
  expect(t('画了 房子、树')).toBe('Drew House, Tree')
  expect(t('需要关注')).toBe('Worth a closer look')
  setLocale('zh')
  expect(t('Worth a closer look')).toBe('需要关注')
})

test('storage events update the selected locale', () => {
  window.dispatchEvent(new StorageEvent('storage', { key: 'luma_locale', newValue: 'en' }))
  expect(getLocale()).toBe('en')
  window.dispatchEvent(new StorageEvent('storage', { key: 'luma_locale', newValue: null }))
  expect(getLocale()).toBe('zh')
})

test.each(['/', '/child/demo'])('app uses the page language switch and scopes the disclaimer on %s', path => {
  render(<MemoryRouter initialEntries={[path]}><Routes><Route element={<App />}><Route path="*" element={<main><header><LanguageSwitcher /></header>Test page</main>} /></Route></Routes></MemoryRouter>)
  expect(screen.getAllByRole('button', { name: 'Switch to English' })).toHaveLength(1)
  expect(document.querySelector('.luma-language-bar')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Switch to English' }))
  expect(document.documentElement.lang).toBe('en')
  const notice = screen.queryByRole('complementary', { name: 'Important disclaimer' })
  expect(Boolean(notice)).toBe(path === '/')
  if (notice) expect(notice.textContent).toContain('AI-generated content may be inaccurate.')
})

test('parent bottom tab bar switches language and reports selection', () => {
  const onSelect = vi.fn()
  render(<><LanguageSwitcher /><ParentTabBar active="overview" onSelect={onSelect} /></>)
  fireEvent.click(screen.getByRole('button', { name: '创作记录' }))
  expect(onSelect).toHaveBeenCalledWith('records')
  fireEvent.click(screen.getByRole('button', { name: 'Switch to English' }))
  expect(screen.getByRole('button', { name: 'Artwork' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Overview' })).toBeTruthy()
  expect(t('溪流')).toBe('Stream')
})

test('English deletion confirmation maps to the stable server contract', async () => {
  setLocale('en')
  vi.mocked(authFetch).mockResolvedValue({ ok: true })
  render(<FamilyDataSettings token="test-token" onDeleted={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: 'Delete family account' }))
  fireEvent.change(document.querySelector('input[type=password]')!, { target: { value: 'secretpass' } })
  fireEvent.change(document.querySelector('input:not([type])')!, { target: { value: 'DELETE FAMILY' } })
  fireEvent.click(screen.getByRole('button', { name: 'Permanently delete' }))
  expect(authFetch).toHaveBeenCalledWith('/auth/family/delete', expect.objectContaining({ body: { password: 'secretpass', confirmation: '删除整个家庭' } }))
})
