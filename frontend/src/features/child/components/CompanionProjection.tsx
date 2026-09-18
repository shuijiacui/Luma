import { useEffect, useMemo, useRef } from 'react'
import { t, useLocale } from '@/i18n'
import { createStrokePainter } from '../brushes'
import { proposalStrokes, type DrawingProposal } from '../companion/proposals'

/** Non-interactive overlay: drawing gestures reach the child's canvas underneath. */
export function CompanionProjection({ proposal, additions, aspect }: { proposal: DrawingProposal; additions?: DrawingProposal[]; aspect: number }) {
  useLocale()
  const ref = useRef<HTMLCanvasElement>(null)
  const strokes = useMemo(() => [proposal, ...(additions ?? [])].flatMap(item => proposalStrokes(item, aspect)), [proposal, additions, aspect])
  const points = strokes.flatMap(stroke => stroke.points)
  const left = Math.min(...points.map(point => point.x)), top = Math.min(...points.map(point => point.y))
  const right = Math.max(...points.map(point => point.x)), bottom = Math.max(...points.map(point => point.y))
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const draw = () => {
      const rect = canvas.getBoundingClientRect()
      const ratio = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(rect.width * ratio); canvas.height = Math.round(rect.height * ratio)
      const ctx = canvas.getContext('2d')
      if (!ctx || !canvas.width || !canvas.height) return
      for (const spec of strokes) {
        const points = spec.points.map(p => ({ x: p.x * canvas.width, y: p.y * canvas.height }))
        const painter = createStrokePainter(ctx, { kind: spec.brushKind ?? 'round', color: spec.color, size: spec.width * ratio, eraser: false }, points[0])
        points.slice(1).forEach(painter.moveTo)
      }
    }
    draw()
    const observer = new ResizeObserver(draw); observer.observe(canvas)
    return () => observer.disconnect()
  }, [strokes])
  return <div className="nilo-projection pointer-events-none absolute inset-0" aria-label={t('Nilo 的投影，尚未加入画作')}>
    <canvas ref={ref} className="absolute inset-0 size-full" aria-hidden="true" />
    <div className="absolute rounded-xl border border-dashed border-luma-teal-500/60" style={{ left: `${left * 100}%`, top: `${top * 100}%`, width: `${(right - left) * 100}%`, height: `${(bottom - top) * 100}%` }} />
    <span className="absolute rounded-full bg-white/95 px-2 py-1 text-[10px] font-bold text-luma-teal-800 shadow-sm" style={{ left: `${Math.min(75, left * 100)}%`, top: `${Math.max(0, top * 100 - 5)}%` }}>{t('Nilo 的想法')}</span>
  </div>
}
