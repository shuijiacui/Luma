import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { DrawingInsightSection } from '@/features/parents/components/DrawingInsightSection'
import { listAnalyses, fetchTrend } from '@/lib/api/authApi'
import { fetchReport } from '@/lib/api/lumaApi'

vi.mock('@/lib/api/authApi', () => ({ listAnalyses: vi.fn(), fetchTrend: vi.fn() }))
vi.mock('@/lib/api/lumaApi', () => ({ fetchReport: vi.fn() }))
vi.mock('@/hooks/useAuthedImage', () => ({ useAuthedImage: () => null }))
afterEach(() => { cleanup(); vi.clearAllMocks(); sessionStorage.clear() })
const analysis = (id: string) => ({ id, createdAt: '2026-09-01T00:00:00Z', imageUrl: null, rawDescription: '一棵树', summary: { elements: ['tree'] }, report: null })
const report = { emotion: '未见明显风险信号', confidence: .6, evidence: [], parentAdvice: ['一起看看画面'] } as const

test('new parent device generates historical report using ID with no sessionStorage', async () => {
  vi.mocked(listAnalyses).mockResolvedValue({ analyses: [analysis('saved-art')] } as Awaited<ReturnType<typeof listAnalyses>>)
  vi.mocked(fetchTrend).mockResolvedValue({ withReport: 0 } as Awaited<ReturnType<typeof fetchTrend>>)
  vi.mocked(fetchReport).mockResolvedValue({ ...report, parentAdvice: [...report.parentAdvice] })
  const updated = vi.fn()
  render(<DrawingInsightSection childId="child-A" token="parent-token" onUpdated={updated} />)
  fireEvent.click(await screen.findByRole('button', { name: '生成画面解读' }))
  await waitFor(() => expect(fetchReport).toHaveBeenCalledWith(null, { token: 'parent-token', analysisId: 'saved-art' }))
  await screen.findByText('一起看看画面')
  expect(updated).toHaveBeenCalledOnce()
})

test('late generation after switching keyed child does not update new child', async () => {
  let finish: (v: unknown) => void = () => {}
  vi.mocked(listAnalyses).mockImplementation(async id => ({ analyses: [analysis(id + '-art')] }) as Awaited<ReturnType<typeof listAnalyses>>)
  vi.mocked(fetchTrend).mockResolvedValue({ withReport: 0 } as Awaited<ReturnType<typeof fetchTrend>>)
  vi.mocked(fetchReport).mockImplementation(() => new Promise(resolve => { finish = resolve }))
  const updated = vi.fn()
  const { rerender } = render(<DrawingInsightSection key="A" childId="A" token="token" onUpdated={updated} />)
  fireEvent.click(await screen.findByRole('button', { name: '生成画面解读' }))
  rerender(<DrawingInsightSection key="B" childId="B" token="token" onUpdated={updated} />)
  finish({ ...report, parentAdvice: ['A 的旧建议'] })
  await screen.findByRole('button', { name: '生成画面解读' })
  expect(screen.queryByText('A 的旧建议')).toBeNull()
  expect(updated).not.toHaveBeenCalled()
})
