import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { App } from '@/app/App'
import { childAppUrl } from '@/config/appMode'
import { ParentSidebar } from '@/features/parents/components/dashboard/ParentSidebar'
import { LanguageSwitcher } from '@/i18n/LanguageSwitcher'
import { getLocale, setLocale, t } from '@/i18n'
import { AuthProvider } from '@/features/auth/AuthContext'
import { UnifiedAuthPage } from '@/features/auth/pages/UnifiedAuthPage'
import { HomePage } from '@/features/marketing/pages/HomePage'
import { FamilyDataSettings } from '@/features/parents/components/FamilyDataSettings'
import { authFetch } from '@/lib/api/authFetch'

vi.mock('@/lib/api/authFetch', () => ({ authFetch: vi.fn() }))
beforeEach(() => { localStorage.clear(); act(() => setLocale('zh')) })
afterEach(() => { cleanup(); act(() => setLocale('zh')); vi.clearAllMocks() })

test('switches the live homepage, document language and saved preference without remounting', async () => {
  render(<AuthProvider><MemoryRouter><HomePage /></MemoryRouter></AuthProvider>)
  const home = document.querySelector('main')
  const languageSwitch = screen.getByRole('button', { name: 'Switch to English' })
  expect(languageSwitch.closest('header')).toBeTruthy()
  expect(document.querySelector('.luma-language-bar')).toBeNull()
  fireEvent.click(languageSwitch)
  expect(screen.getByRole('link', { name: "Open children's sign-in" }).getAttribute('href')).toBe(`${childAppUrl}/auth?role=child&mode=login`)
  expect(document.documentElement.lang).toBe('en')
  expect(localStorage.getItem('luma_locale')).toBe('en')
  expect(document.querySelector('main')).toBe(home)
  fireEvent.click(screen.getByRole('button', { name: 'Plans' }))
  expect(await screen.findByText('Begin with a little creative time')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '切换为中文' }))
  expect(screen.getByText('先开始一段创作时光')).toBeTruthy()
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

test('merged parent sidebar keeps logout functional in both languages', () => {
  const logout = vi.fn()
  render(<><LanguageSwitcher /><ParentSidebar active="overview" onSelect={vi.fn()} onLogout={logout} /></>)
  fireEvent.click(screen.getByRole('button', { name: '退出登录' }))
  fireEvent.click(screen.getByRole('button', { name: 'Switch to English' }))
  fireEvent.click(screen.getByRole('button', { name: t('退出登录') }))
  expect(logout).toHaveBeenCalledTimes(2)
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
