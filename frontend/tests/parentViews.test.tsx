import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ParentDemoPage } from '@/features/auth/pages/ParentDemoPage'
import { ArchivePage } from '@/features/parents/pages/ArchivePage'
import { fetchMe } from '@/lib/api/authApi'
import { useChildHistory } from '@/hooks/useChildHistory'

vi.mock('@/features/auth/AuthContext', () => ({ useAuth: () => ({ session: { id: 'P', token: 'token', role: 'parent', displayName: '家长', isGuest: false }, logout: vi.fn() }) }))
vi.mock('@/features/onboarding/OnboardingContext', () => ({ isOnboardingDone: () => true, isOnboardingShownThisSession: () => true, markOnboardingDone: vi.fn(), markOnboardingShownThisSession: vi.fn(), useOnboarding: () => ({ start: vi.fn() }) }))
vi.mock('@/lib/api/authApi', () => ({ fetchMe: vi.fn(), listAnalyses: vi.fn(), fetchTrend: vi.fn() }))
vi.mock('@/hooks/useChildHistory', () => ({ useChildHistory: vi.fn() }))
vi.mock('@/hooks/useAuthedImage', () => ({ useAuthedImage: () => null }))
afterEach(() => { cleanup(); vi.clearAllMocks() })
function family() {
  vi.mocked(fetchMe).mockResolvedValue({ children: [{ id: 'C', nickname: '小朋友', createdAt: '2026-01-01' }], family: { inviteCode: 'TEST23' } } as Awaited<ReturnType<typeof fetchMe>>)
}
const record = (date: string) => ({ id: date, createdAt: date, imageUrl: null, rawDescription: '模型观察到了树', summary: { elements: ['tree'], distortions: [], darkRatio: .2 }, feedback: null, report: { emotion: '信息不足' as const, confidence: 0, parentAdvice: [], evidence: [] } })

test('real overview labels model description and does not invent psychological metrics', async () => {
  family()
  vi.mocked(useChildHistory).mockReturnValue({ analyses: [record(new Date().toISOString())], error: null, reload: vi.fn() })
  render(<MemoryRouter><ParentDemoPage /></MemoryRouter>)
  await screen.findByText('—— AI 画面描述')
  expect(screen.queryByText('—— 孩子原话')).toBeNull()
  expect(screen.getByText('近 4 周作品数')).toBeTruthy()
  expect(screen.queryByText('表达意愿')).toBeNull()
  expect(screen.getByText('观察中')).toBeTruthy()
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
})
