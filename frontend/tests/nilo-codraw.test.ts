import { afterEach, expect, test, vi } from 'vitest'

import { authFetch } from '@/lib/api/authFetch'
import { requestNiloStroke } from '@/lib/api/lumaApi'
import { createLocalNiloStroke, nextCodrawIntent, readCodrawMode, saveCodrawMode } from '@/features/child/niloCodraw'

vi.mock('@/lib/api/authFetch', () => ({ authFetch: vi.fn() }))

afterEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
})

test('本地兜底笔触永远落在画布范围内，且形状会轮换', () => {
  const kinds = new Set<string>()
  for (let index = 0; index < 12; index += 1) {
    const stroke = createLocalNiloStroke(index)
    kinds.add(stroke.kind)
    expect(stroke.points.length).toBeGreaterThanOrEqual(2)
    expect(stroke.color).toMatch(/^#[0-9a-f]{6}$/i)
    expect(stroke.width).toBeGreaterThanOrEqual(2)
    for (const point of stroke.points) {
      expect(point.x).toBeGreaterThanOrEqual(0)
      expect(point.x).toBeLessThanOrEqual(1)
      expect(point.y).toBeGreaterThanOrEqual(0)
      expect(point.y).toBeLessThanOrEqual(1)
    }
  }
  expect(kinds.size).toBeGreaterThanOrEqual(6)
})

test('Nilo 陪伴模式默认关闭，选择后会记住', () => {
  expect(readCodrawMode()).toBe('off')
  saveCodrawMode('ask')
  expect(readCodrawMode()).toBe('ask')
  saveCodrawMode('turn')
  expect(readCodrawMode()).toBe('turn')
  localStorage.setItem('luma_nilo_codraw', 'bogus')
  expect(readCodrawMode()).toBe('off')
})

test('请求 Nilo 下一笔时带上模式、画了几笔与最近用色', async () => {
  vi.mocked(authFetch).mockResolvedValue({ stroke: null, fallback: true })
  await requestNiloStroke('AAAA', {
    token: 'tok',
    mode: 'ask',
    strokes: 3,
    recentColors: ['#6fa8d8'],
  })
  expect(authFetch).toHaveBeenCalledWith('/nilo/stroke', expect.objectContaining({
    method: 'POST',
    token: 'tok',
    body: expect.objectContaining({
      imageBase64: 'AAAA',
      mode: 'ask',
      context: expect.objectContaining({ strokes: 3, recentColors: ['#6fa8d8'] }),
    }),
  }))
})

test('有画面分布时，本地兜底笔触会贴着孩子画过的内容下笔', () => {
  // 内容集中在右下（第 10 格），兜底应落在相邻格，而不是左上角
  const inkGrid = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0]
  const stroke = createLocalNiloStroke(0, { inkGrid, intent: 'detail' })
  const cx = stroke.points.reduce((sum, p) => sum + p.x, 0) / stroke.points.length
  const cy = stroke.points.reduce((sum, p) => sum + p.y, 0) / stroke.points.length
  // 内容格中心是 (0.625, 0.625)：兜底应落在相邻格（距离 < 0.45），而不是画面另一角
  expect(Math.hypot(cx - 0.625, cy - 0.625)).toBeLessThan(0.45)
  expect(Math.hypot(cx - 0.125, cy - 0.125)).toBeGreaterThan(0.3)
})

test('意图轮换会换形状：呼应意图画线/波浪，细节意图画小点/星/花', () => {
  expect(['wave', 'line', 'zigzag', 'spiral']).toContain(createLocalNiloStroke(0, { intent: 'echo' }).kind)
  expect(['dot', 'star', 'flower']).toContain(createLocalNiloStroke(0, { intent: 'detail' }).kind)
  expect(['sun', 'cloud', 'heart', 'leaf']).toContain(createLocalNiloStroke(0, { intent: 'companion' }).kind)
  expect(nextCodrawIntent(0)).toBe('companion')
  expect(nextCodrawIntent(1)).toBe('detail')
  expect(nextCodrawIntent(2)).toBe('echo')
})
