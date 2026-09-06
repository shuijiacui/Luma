import { afterEach, expect, test, vi } from 'vitest'
import { exportArchive } from '@/features/parents/exportArchive'
import { fetchAuthedObjectUrl } from '@/lib/api/authedImage'
import type { AnalysisSummary } from '@/lib/api/authApi'

vi.mock('@/lib/api/authedImage', () => ({ fetchAuthedObjectUrl: vi.fn() }))
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })
const blobText = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsText(blob)
})

test('export contains original image, escapes text, and excludes tokens', async () => {
  const urls: Blob[] = []
  vi.stubGlobal('URL', { createObjectURL: (blob: Blob) => { urls.push(blob); return 'blob:download' }, revokeObjectURL: vi.fn() })
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  vi.mocked(fetchAuthedObjectUrl).mockResolvedValue('blob:original')
  vi.stubGlobal('fetch', vi.fn(async () => ({ blob: async () => new Blob(['original image'], { type: 'image/png' }) })))
  const a = { id:'one', createdAt:'2026-09-01', imageUrl:'/api/analyses/one/image', rawDescription:'<script>alert(1)</script>', report:null } as AnalysisSummary
  await exportArchive([a], 'private-access-token', '<孩子>', 2026)
  const html = await blobText(urls[0])
  expect(html).toContain('data:image/png;base64,')
  expect(html).toContain('&lt;script&gt;')
  expect(html).not.toContain('<script>')
  expect(html).not.toContain('private-access-token')
  expect(html).toContain('&lt;孩子&gt;')
})
