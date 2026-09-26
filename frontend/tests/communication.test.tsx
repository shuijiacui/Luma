import { afterEach, expect, test, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ArtworkSuggestions as CommunicationSection } from '@/features/parents/components/ArtworkSuggestions'
import { getCommunicationGuides, type CommunicationResponse } from '@/lib/api/communicationApi'
import { setLocale } from '@/i18n'

vi.mock('@/lib/api/communicationApi', () => ({ getCommunicationGuides: vi.fn() }))
vi.mock('@/hooks/useAuthedImage', () => ({ useAuthedImage: () => null }))
afterEach(() => { cleanup(); vi.resetAllMocks(); act(() => setLocale('zh')) })
const response = (subject = '树'): CommunicationResponse => ({
  version: 'communication-v1', mode: 'template', locale: 'zh', emptyReason: null, generatedAt: '2026-09-26',
  cards: [{ id: subject, sourceId: subject, createdAt: '2026-09-25T00:00:00Z', imageUrl: null,
    subject, title: `从${subject}聊起`, observation: `画面中可以看到${subject}。`, focus: 'story', evidenceIds: ['OBS-elements'], provenanceNote: null,
    opener: `你愿意讲讲画里的${subject}吗？`, followUp: '你愿意再说一点吗？', alternative: '一起看看也可以。' }],
})

test('source and opening are prominent; responses are independently expandable and no extra assistant title', async () => {
  vi.mocked(getCommunicationGuides).mockResolvedValue(response())
  render(<CommunicationSection childName="孩子" childId="C" token="T" />)
  expect(await screen.findByText('“你愿意讲讲画里的树吗？”')).toBeTruthy()
  expect(screen.getByText('画面中可以看到树。')).toBeTruthy()
  expect(screen.getByText('2026年9月25日')).toBeTruthy()
  expect(screen.getByRole('button', { name: '查看来源作品' })).toBeTruthy()
  const details = screen.getByText('接下来怎么聊').closest('details')!
  expect(details.open).toBe(false)
  fireEvent.click(screen.getByText('接下来怎么聊'))
  expect(details.open).toBe(true)
  expect(screen.queryByText('AI 沟通助手')).toBeNull()
  expect(screen.queryByText('观察：')).toBeNull()
})

test('failed requests can retry, and empty data offers the actual artwork reading action', async () => {
  vi.mocked(getCommunicationGuides).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ ...response(), cards: [], emptyReason: 'no_observations' })
  const choose = vi.fn()
  render(<CommunicationSection childName="孩子" childId="C" token="T" onChooseArtwork={choose} />)
  await screen.findByRole('alert')
  expect(screen.queryByText('从一幅画，开始一次交流')).toBeNull()
  fireEvent.click(screen.getByText('重试'))
  fireEvent.click(await screen.findByRole('button', { name: '选择作品生成解读' }))
  expect(choose).toHaveBeenCalledOnce()
  expect(screen.queryByText('听听小船的故事')).toBeNull()
})

test('switching children aborts and ignores late responses; switching language requests localized cards', async () => {
  let finish!: (value: CommunicationResponse) => void
  vi.mocked(getCommunicationGuides).mockImplementationOnce(() => new Promise(resolve => { finish = resolve })).mockResolvedValue(response('船'))
  const view = render(<CommunicationSection childName="A" childId="A" token="T" />)
  view.rerender(<CommunicationSection childName="B" childId="B" token="T" />)
  await screen.findByText('从船聊起')
  expect(vi.mocked(getCommunicationGuides).mock.calls[0][3].aborted).toBe(true)
  await act(async () => finish(response('树')))
  expect(screen.queryByText('从树聊起')).toBeNull()
  act(() => setLocale('en'))
  await waitFor(() => expect(getCommunicationGuides).toHaveBeenLastCalledWith('B', 'T', 'en', expect.any(AbortSignal)))
})

test('demonstration is explicit and never used for a real family without a child', () => {
  const view = render(<CommunicationSection childName="孩子" isGuest />)
  expect(screen.getAllByText('示例作品')).toHaveLength(2)
  expect(getCommunicationGuides).not.toHaveBeenCalled()
  view.rerender(<CommunicationSection childName="孩子" />)
  expect(screen.queryByText('示例作品')).toBeNull()
  expect(screen.getByText('连接孩子的创作空间后，就能从作品里找到话题。')).toBeTruthy()
})
