import { afterEach, expect, test, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import { ChildHomePage } from '@/features/child/pages/ChildHomePage'
import { clearChildDraft, getChildDraft } from '@/features/child/draft'

vi.mock('@/features/auth/AuthContext', () => ({
  useAuth: () => ({
    session: { id: 'guest-child', role: 'child', familyId: 'family-luma-demo', displayName: '小小探险家', isGuest: true },
    logout: vi.fn(),
  }),
}))
vi.mock('@/features/onboarding/useOnboardingTour', () => ({ useOnboardingTour: () => vi.fn() }))
vi.mock('@/features/child/hooks/useNiloSound', () => ({
  useNiloSound: () => ({ soundOn: false, toggleSound: vi.fn(), play: vi.fn() }),
}))
vi.mock('framer-motion', async original => ({
  ...await original<typeof import('framer-motion')>(),
  useReducedMotion: () => true,
}))

afterEach(() => {
  cleanup()
  clearChildDraft()
  vi.useRealTimers()
})

test('从小屋大门进入画板会开始一张全新的画（清掉上一次的草稿）', () => {
  vi.useFakeTimers()
  const draft = getChildDraft('guest-child')
  draft.canvas.history = ['data:image/png;base64,OLD-DRAWING']
  draft.artworkId = 'old-artwork'
  draft.artworkRevision = 3

  render(<MemoryRouter><ChildHomePage /></MemoryRouter>)
  fireEvent.click(screen.getByRole('button', { name: '打开大门，去画画' }))
  act(() => { vi.advanceTimersByTime(200) })

  const fresh = getChildDraft('guest-child')
  expect(fresh.canvas.history).toEqual([''])
  expect(fresh.artworkId).toBeUndefined()
  expect(fresh.artworkRevision).toBeUndefined()
})
