import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { ParentDemoPage } from '@/features/auth/pages/ParentDemoPage'
import { ArchivePage } from '@/features/parents/pages/ArchivePage'
import { fetchMe } from '@/lib/api/authApi'
import { useChildHistory } from '@/hooks/useChildHistory'
import { getCommunicationGuides } from '@/lib/api/communicationApi'

const { logout } = vi.hoisted(() => ({ logout: vi.fn() }))
vi.mock('@/features/auth/AuthContext', () => ({ useAuth: () => ({ session: { id: 'P', token: 'token', role: 'parent', displayName: '家长', isGuest: false }, logout }) }))
vi.mock('@/features/onboarding/useOnboardingTour', () => ({ useOnboardingTour: () => vi.fn() }))
vi.mock('@/lib/api/authApi', () => ({ fetchMe: vi.fn(), listAnalyses: vi.fn(), fetchTrend: vi.fn() }))
vi.mock('@/hooks/useChildHistory', () => ({ useChildHistory: vi.fn() }))
vi.mock('@/hooks/useAuthedImage', () => ({ useAuthedImage: () => null }))
vi.mock('@/lib/api/communicationApi', () => ({ getCommunicationGuides: vi.fn() }))
afterEach(() => { cleanup(); vi.clearAllMocks() })
function family() {
  vi.mocked(fetchMe).mockResolvedValue({ children: [{ id: 'C', nickname: '小朋友', createdAt: '2026-01-01' }], family: { inviteCode: 'TEST23' } } as Awaited<ReturnType<typeof fetchMe>>)
}

test('communication page presents the assistant title exactly once', async () => {
  family()
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  vi.mocked(useChildHistory).mockReturnValue({ analyses: [], error: null, reload: vi.fn() })
  vi.mocked(getCommunicationGuides).mockResolvedValue({ version: 'communication-v1', locale: 'zh', cards: [], mode: 'template', emptyReason: 'no_observations', generatedAt: '' })
  render(<MemoryRouter><ParentDemoPage /></MemoryRouter>)
  await screen.findByText('小朋友 的第一幅画，正在路上')
  fireEvent.click(screen.getAllByText('沟通建议')[0])
  await screen.findByText('从一幅画，开始一次交流')
  expect(screen.getAllByText('AI 沟通助手')).toHaveLength(1)
  expect(screen.getByRole('heading', { name: 'AI 沟通助手', level: 1 })).toBeTruthy()
})
const record = (date: string) => ({ id: date, createdAt: date, imageUrl: null, rawDescription: '模型观察到了树', summary: { elements: ['tree'], distortions: [], darkRatio: .2 }, feedback: null, report: { emotion: '信息不足' as const, confidence: 0, parentAdvice: [], evidence: [] } })

test('real overview follows the compact summary layout and does not invent psychological metrics', async () => {
  family()
  vi.mocked(useChildHistory).mockReturnValue({ analyses: [record(new Date().toISOString())], error: null, reload: vi.fn() })
  render(<MemoryRouter><ParentDemoPage /></MemoryRouter>)
  await screen.findByText('—— AI 画面描述')
  expect(screen.getByText('本周成长摘要')).toBeTruthy()
  expect(screen.getByText('画面观察')).toBeTruthy()
  expect(screen.getByText('本月报告')).toBeTruthy()
  const headerRow = document.querySelector('.luma-parent-head-row')
  expect(headerRow?.querySelector('[data-onboarding="parent-child-switcher"]')).toBeTruthy()
  expect(headerRow?.querySelector('[aria-label="打开头像设置"]')).toBeTruthy()
  expect(screen.queryByText('—— 孩子原话')).toBeNull()
  expect(screen.getByText('本周创作')).toBeTruthy()
  expect(screen.queryByText('表达意愿')).toBeNull()
  expect(screen.queryByText('观察中')).toBeNull()
})

test('header logout ends the session and returns directly to parent login', async () => {
  family()
  vi.mocked(useChildHistory).mockReturnValue({ analyses: [], error: null, reload: vi.fn() })
  function LocationProbe() {
    const location = useLocation()
    return <output data-testid="location">{location.pathname}{location.search}</output>
  }
  render(<MemoryRouter initialEntries={['/parent/demo']}><ParentDemoPage /><LocationProbe /></MemoryRouter>)
  await screen.findByText('小朋友 的第一幅画，正在路上')
  const button = screen.getByRole('button', { name: '退出登录' })
  expect(button.closest('header')).toBeTruthy()
  fireEvent.click(button)
  expect(logout).toHaveBeenCalledTimes(1)
  expect(screen.getByTestId('location').textContent).toBe('/auth?role=parent&mode=login')
})

test('empty family view does not substitute demonstration artwork', async () => {
  family()
  vi.mocked(useChildHistory).mockReturnValue({ analyses: [], error: null, reload: vi.fn() })
  render(<MemoryRouter><ParentDemoPage /></MemoryRouter>)
  await screen.findByText('小朋友 的第一幅画，正在路上')
  expect(screen.queryByText('《一艘去远方的小船》')).toBeNull()
})

test('archive sorts October before September using chronological records', async () => {
  family()
  vi.mocked(useChildHistory).mockReturnValue({ analyses: [record('2026-10-01T00:00:00Z'), record('2026-09-01T00:00:00Z')], error: null, reload: vi.fn() })
  render(<MemoryRouter><ArchivePage /></MemoryRouter>)
  const october = await screen.findByText('2026年10月')
  const september = screen.getByText('2026年9月')
  expect(october.compareDocumentPosition(september) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
})

test('parent with no linked child leaves loading state in archive', async () => {
  vi.mocked(fetchMe).mockResolvedValue({ children: [], family: { inviteCode: 'TEST23' } } as Awaited<ReturnType<typeof fetchMe>>)
  vi.mocked(useChildHistory).mockReturnValue({ analyses: [], error: null, reload: vi.fn() })
  render(<MemoryRouter><ArchivePage /></MemoryRouter>)
  await waitFor(() => expect(screen.getByText('暂无创作记录')).toBeTruthy())
  expect(screen.queryAllByText('加载中…')).toHaveLength(0)
})

test('a family without children can still access account deletion in settings', async () => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  vi.mocked(fetchMe).mockResolvedValue({ children: [], family: { inviteCode: 'TEST23' } } as Awaited<ReturnType<typeof fetchMe>>)
  vi.mocked(useChildHistory).mockReturnValue({ analyses: [], error: null, reload: vi.fn() })
  render(<MemoryRouter><ParentDemoPage /></MemoryRouter>)
  await screen.findByText('邀请孩子加入家庭空间')
  fireEvent.click(screen.getAllByText('家庭设置')[0])
  await screen.findByText('注销整个家庭')
  const accountSection = screen.getAllByRole('button', { name: '退出登录' })
    .map(button => button.closest('section')).find(Boolean)
  expect(accountSection?.parentElement?.firstElementChild).toBe(accountSection)
  expect(accountSection?.querySelector('[aria-label="打开头像设置"]')).toBeNull()
  expect(accountSection?.querySelector('[aria-label="我的头像"]')).toBeTruthy()
})
