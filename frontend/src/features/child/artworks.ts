import { authFetch } from '@/lib/api/authFetch'
import type { AuthSession } from '@/features/auth/types'
import { getCanvasProvenance, type CanvasDocument, type CanvasProvenance } from './canvasDocument'

export interface ArtworkSummary {
  id: string
  revision: number
  createdAt: string
  updatedAt: string
  imageUrl?: string
  image?: string
  provenance?: CanvasProvenance
}
export interface Artwork extends ArtworkSummary { image: string; document?: CanvasDocument }
export interface ArtworkPage { artworks: ArtworkSummary[]; nextOffset: number | null }
const guestKey = 'luma_guest_artworks_v1'
function guestWorks(): Artwork[] {
  const value: unknown = JSON.parse(localStorage.getItem(guestKey) ?? '[]')
  if (!Array.isArray(value)) throw new Error('无法读取历史图画')
  return value
}
function requireSession(session: AuthSession | null): asserts session is AuthSession {
  if (!session || session.role !== 'child' || (!session.isGuest && !session.token)) throw new Error('请先登录')
}
export async function listArtworks(session: AuthSession | null, offset = 0): Promise<ArtworkPage> {
  requireSession(session)
  if (!session.isGuest) return authFetch(`/artworks?offset=${offset}`, { token: session.token })
  const works = guestWorks().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  return { artworks: works.slice(offset, offset + 24), nextOffset: works.length > offset + 24 ? offset + 24 : null }
}
export async function readArtwork(session: AuthSession | null, id: string): Promise<Artwork> {
  requireSession(session)
  if (!session.isGuest) return authFetch(`/artworks/${encodeURIComponent(id)}`, { token: session.token })
  const work = guestWorks().find(work => work.id === id)
  if (!work) throw new Error('找不到这幅画')
  return work
}
export async function saveArtwork(session: AuthSession | null, id: string, revision: number, image: string, document?: CanvasDocument): Promise<ArtworkSummary> {
  requireSession(session)
  if (!session.isGuest) return authFetch(`/artworks/${encodeURIComponent(id)}`, { method: 'PUT', token: session.token, body: { image, revision, document } })
  const works = guestWorks()
  const previous = works.find(work => work.id === id)
  if (previous?.image === image && JSON.stringify(previous.document) === JSON.stringify(document)) return previous
  if ((previous?.revision ?? 0) !== revision) throw new Error('这幅画已在其他页面更新，请先下载当前画作，再从历史图画重新打开。')
  const now = new Date().toISOString()
  const work: Artwork = { id, image, document, provenance: document ? getCanvasProvenance(document) : 'unknown', revision: revision + 1, createdAt: previous?.createdAt ?? now, updatedAt: now }
  // setItem is atomic: quota failures preserve previously saved artwork.
  try { localStorage.setItem(guestKey, JSON.stringify([work, ...works.filter(item => item.id !== id)])) }
  catch { throw new Error('浏览器空间不足，请先下载这幅画，或登录账号后保存。') }
  return work
}
