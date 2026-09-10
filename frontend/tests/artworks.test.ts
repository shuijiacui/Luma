import { beforeEach, expect, test, vi } from 'vitest'
import { listArtworks, readArtwork, saveArtwork } from '@/features/child/artworks'
import { clearChildDraft, getChildDraft, restoreChildArtwork } from '@/features/child/draft'
import type { AuthSession } from '@/features/auth/types'

const guest: AuthSession = { id: 'guest-child', role: 'child', isGuest: true, familyId: 'demo', displayName: '小朋友' }
beforeEach(() => { localStorage.clear(); clearChildDraft() })
test('guest saves survive draft reset and reopening restores the saved image as undo baseline', async () => {
  await saveArtwork(guest, 'one', 0, 'data:image/png;base64,first')
  clearChildDraft()
  const artwork = await readArtwork(guest, 'one')
  const draft = restoreChildArtwork(guest.id, artwork)
  expect(draft.canvas.history).toEqual(['data:image/png;base64,first'])
  await saveArtwork(guest, 'one', draft.artworkRevision!, 'data:image/png;base64,continued')
  const page = await listArtworks(guest)
  expect(page.artworks).toHaveLength(1)
  expect(page.artworks[0].revision).toBe(2)
  expect((await readArtwork(guest, 'one')).image).toBe('data:image/png;base64,continued')
  expect(getChildDraft('another-child').canvas.history).toEqual([''])
})
test('storage failure and stale revisions preserve the saved artwork', async () => {
  await saveArtwork(guest, 'one', 0, 'first')
  await expect(saveArtwork(guest, 'one', 0, 'stale')).rejects.toThrow('其他页面更新')
  const fail = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('quota', 'QuotaExceededError') })
  await expect(saveArtwork(guest, 'one', 1, 'second')).rejects.toThrow('空间不足')
  fail.mockRestore()
  expect((await readArtwork(guest, 'one')).image).toBe('first')
})
test('missing authentication never falls back to the guest gallery', async () => {
  await saveArtwork(guest, 'one', 0, 'guest image')
  await expect(listArtworks(null)).rejects.toThrow('请先登录')
  await expect(listArtworks({ ...guest, id: 'real-child', isGuest: false })).rejects.toThrow('请先登录')
})
