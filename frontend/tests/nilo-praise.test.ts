import { expect, test } from 'vitest'

import { describeStrokeLocally } from '@/features/child/niloPraise'

const stroke = (points: { x: number; y: number }[], color = '#6fa8d8') => ({ points, color, width: 5 })

test('波浪线会被夸成"弯弯的小路"，并给出下一步建议', () => {
  const wave = stroke(Array.from({ length: 14 }, (_, i) => ({ x: (i / 13) * 0.6 + 0.1, y: 0.5 + Math.sin(i / 1.4) * 0.06 })))
  const result = describeStrokeLocally(wave, { strokes: 0, inkGrid: [0, 0.8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] })
  expect(result.praise).toContain('弯弯')
  expect(result.suggestion.length).toBeGreaterThan(0)
})

test('直线 / 小圆点 / 圈 会得到不同的具体夸奖', () => {
  const straight = describeStrokeLocally(stroke([{ x: 0.1, y: 0.5 }, { x: 0.5, y: 0.5 }, { x: 0.9, y: 0.5 }]), { strokes: 0 })
  expect(straight.praise).toContain('直直')
  const dot = describeStrokeLocally(stroke([{ x: 0.5, y: 0.5 }, { x: 0.51, y: 0.5 }]), { strokes: 0 })
  expect(dot.praise).toContain('小圆点')
  const loop = describeStrokeLocally(stroke(Array.from({ length: 20 }, (_, i) => ({ x: 0.5 + Math.cos((i / 19) * Math.PI * 2) * 0.2, y: 0.5 + Math.sin((i / 19) * Math.PI * 2) * 0.2 }))), { strokes: 0 })
  expect(loop.praise).toContain('一圈一圈')
})

test('颜色夸奖路径也会给出建议，且建议总是非空', () => {
  const wave = stroke(Array.from({ length: 12 }, (_, i) => ({ x: (i / 11) * 0.6 + 0.1, y: 0.5 + Math.sin(i / 1.4) * 0.05 })), '#e4a86a')
  const result = describeStrokeLocally(wave, { strokes: 1 })
  expect(result.praise.length).toBeGreaterThan(0)
  expect(result.suggestion.length).toBeGreaterThan(0)
})
