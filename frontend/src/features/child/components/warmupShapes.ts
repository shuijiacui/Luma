/**
 * 画板「引导图形」定义：半圆/圆/三角形/星星/爱心/云朵。
 * 以浅色虚线轮廓叠加在大画板上，引导小朋友在此基础上添画；
 * 可通过操作板的「换图形 / 清除图形」切换或移除。
 */
export type WarmupShapeId =
  | 'semicircle'
  | 'circle'
  | 'triangle'
  | 'star'
  | 'heart'
  | 'cloud'

export interface WarmupShape {
  id: WarmupShapeId
  label: string
  prompt: string
  draw: (
    context: CanvasRenderingContext2D,
    width: number,
    height: number,
  ) => void
}

export const WARMUP_SHAPES: readonly WarmupShape[] = [
  {
    id: 'semicircle',
    label: '半圆',
    prompt: '这是一个小小的半圆～你来帮它画完整吧！',
    draw: (context, width, height) => {
      const centerX = width / 2
      const centerY = height * 0.62
      const radius = Math.min(width, height) * 0.3
      context.beginPath()
      context.arc(centerX, centerY, radius, Math.PI, 0, false)
      context.closePath()
      context.stroke()
    },
  },
  {
    id: 'circle',
    label: '圆形',
    prompt: '一个圆圆的圈圈！它可以变成太阳、气球或小星球～',
    draw: (context, width, height) => {
      const centerX = width / 2
      const centerY = height / 2
      const radius = Math.min(width, height) * 0.3
      context.beginPath()
      context.arc(centerX, centerY, radius, 0, Math.PI * 2)
      context.stroke()
    },
  },
  {
    id: 'triangle',
    label: '三角形',
    prompt: '尖尖的三角形！它可以变成一座山或一顶帐篷～',
    draw: (context, width, height) => {
      const centerX = width / 2
      const centerY = height * 0.6
      const radius = Math.min(width, height) * 0.32
      context.beginPath()
      context.moveTo(centerX, centerY - radius)
      context.lineTo(centerX + radius * 0.866, centerY + radius * 0.5)
      context.lineTo(centerX - radius * 0.866, centerY + radius * 0.5)
      context.closePath()
      context.stroke()
    },
  },
  {
    id: 'star',
    label: '星星',
    prompt: '一颗亮晶晶的小星星！你想把它变成什么呢？',
    draw: (context, width, height) => {
      const centerX = width / 2
      const centerY = height / 2
      const outer = Math.min(width, height) * 0.32
      const inner = outer * 0.45
      context.beginPath()
      for (let index = 0; index < 10; index += 1) {
        const angle = -Math.PI / 2 + (index * Math.PI) / 5
        const radius = index % 2 === 0 ? outer : inner
        const x = centerX + Math.cos(angle) * radius
        const y = centerY + Math.sin(angle) * radius
        if (index === 0) context.moveTo(x, y)
        else context.lineTo(x, y)
      }
      context.closePath()
      context.stroke()
    },
  },
  {
    id: 'heart',
    label: '爱心',
    prompt: '一颗软软的小爱心～你想把它送给谁呢？',
    draw: (context, width, height) => {
      const centerX = width / 2
      const centerY = height / 2
      const scale = Math.min(width, height) / 260
      context.beginPath()
      context.moveTo(centerX, centerY + scale * 44)
      context.bezierCurveTo(
        centerX - scale * 78,
        centerY - scale * 6,
        centerX - scale * 36,
        centerY - scale * 64,
        centerX,
        centerY - scale * 20,
      )
      context.bezierCurveTo(
        centerX + scale * 36,
        centerY - scale * 64,
        centerX + scale * 78,
        centerY - scale * 6,
        centerX,
        centerY + scale * 44,
      )
      context.stroke()
    },
  },
  {
    id: 'cloud',
    label: '云朵',
    prompt: '一朵软绵绵的云～云的上面会住着谁呢？',
    draw: (context, width, height) => {
      const centerX = width / 2
      const centerY = height * 0.56
      const unit = Math.min(width, height) / 130
      context.beginPath()
      context.moveTo(centerX - 32 * unit, centerY + 13 * unit)
      context.lineTo(centerX + 32 * unit, centerY + 13 * unit)
      context.quadraticCurveTo(centerX + 46 * unit, centerY + 13 * unit, centerX + 38 * unit, centerY - 1 * unit)
      context.quadraticCurveTo(centerX + 46 * unit, centerY - 16 * unit, centerX + 24 * unit, centerY - 16 * unit)
      context.quadraticCurveTo(centerX + 18 * unit, centerY - 32 * unit, centerX, centerY - 26 * unit)
      context.quadraticCurveTo(centerX - 18 * unit, centerY - 34 * unit, centerX - 24 * unit, centerY - 12 * unit)
      context.quadraticCurveTo(centerX - 46 * unit, centerY - 10 * unit, centerX - 34 * unit, centerY + 6 * unit)
      context.closePath()
      context.stroke()
    },
  },
] as const

