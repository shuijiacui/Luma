export type BrushKind = 'round' | 'pencil' | 'marker' | 'crayon' | 'star'

export const BRUSHES: { id: BrushKind; label: string; hint: string }[] = [
  { id: 'round', label: '圆头笔', hint: '画出圆润的线条' },
  { id: 'pencil', label: '铅笔', hint: '描画小小的细节' },
  { id: 'marker', label: '马克笔', hint: '用宽宽的笔头涂色' },
  { id: 'crayon', label: '蜡笔', hint: '留下沙沙的颗粒' },
  { id: 'star', label: '星星笔', hint: '画出一串小星星' },
]

export const PALETTE = [
  ['#20352f', '墨黑'], ['#ffffff', '雪白'], ['#8c9692', '石头灰'], ['#906044', '栗子棕'],
  ['#d74952', '草莓红'], ['#ef7b69', '珊瑚红'], ['#f28c38', '橘子橙'], ['#edcd70', '阳光黄'],
  ['#f5dfa4', '奶油黄'], ['#f5c6ab', '蜜桃色'], ['#e58bb3', '花瓣粉'], ['#c6538c', '玫瑰粉'],
  ['#9bca76', '嫩芽绿'], ['#51a06c', '草地绿'], ['#168a78', '湖水绿'], ['#a5d9c2', '薄荷绿'],
  ['#87cde5', '天空蓝'], ['#4aa5d8', '海洋蓝'], ['#4269bd', '宝石蓝'], ['#34466d', '夜空蓝'],
  ['#7a82d8', '蓝莓紫'], ['#aa80c3', '葡萄紫'], ['#d6bce5', '薰衣草紫'], ['#eadbc5', '沙滩色'],
] as const

export interface BrushSettings { kind: BrushKind; color: string; size: number; eraser: boolean }
export interface Point { x: number; y: number }

/** Stamp at fixed distances, so slow and fast pointer events produce the same texture. */
export function createStrokePainter(context: CanvasRenderingContext2D, settings: BrushSettings, start: Point) {
  const { kind, color, size, eraser } = settings
  const diameter = eraser ? size * 2.5 : kind === 'pencil' ? size * 0.4 : kind === 'star' ? size * 2.5 : kind === 'marker' ? size * 1.8 : size
  const spacing = Math.max(0.5, diameter * (kind === 'star' && !eraser ? 1.25 : kind === 'crayon' && !eraser ? 0.2 : 0.12))
  let last = start
  let remaining = spacing

  function stamp(point: Point) {
    context.save()
    context.globalCompositeOperation = eraser ? 'destination-out' : 'source-over'
    context.globalAlpha = 1
    context.fillStyle = color
    context.translate(point.x, point.y)
    if (!eraser && kind === 'star') {
      context.beginPath()
      for (let i = 0; i < 10; i++) {
        const angle = -Math.PI / 2 + i * Math.PI / 5
        const radius = diameter * (i % 2 === 0 ? 0.5 : 0.22)
        const x = Math.cos(angle) * radius
        const y = Math.sin(angle) * radius
        if (i === 0) context.moveTo(x, y)
        else context.lineTo(x, y)
      }
      context.closePath()
      context.fill()
    } else if (!eraser && kind === 'marker') {
      context.rotate(-Math.PI / 5)
      context.fillRect(-diameter / 2, -diameter / 6, diameter, diameter / 3)
    } else if (!eraser && kind === 'crayon') {
      context.globalAlpha = 0.48
      for (let i = 0; i < 28; i++) {
        const angle = i * 2.399963
        const radius = Math.sqrt((i + 0.5) / 28) * diameter / 2
        context.fillRect(Math.cos(angle) * radius, Math.sin(angle) * radius, Math.max(0.6, diameter * 0.07), Math.max(0.6, diameter * 0.07))
      }
    } else {
      context.beginPath()
      context.arc(0, 0, diameter / 2, 0, Math.PI * 2)
      context.fill()
    }
    context.restore()
  }

  stamp(start) // A tap draws a dot (or one star), too.
  return {
    moveTo(point: Point) {
      const dx = point.x - last.x
      const dy = point.y - last.y
      const distance = Math.hypot(dx, dy)
      if (distance === 0) return
      let travelled = remaining
      while (travelled <= distance) {
        stamp({ x: last.x + dx * travelled / distance, y: last.y + dy * travelled / distance })
        travelled += spacing
      }
      remaining = travelled - distance
      last = point
    },
  }
}
