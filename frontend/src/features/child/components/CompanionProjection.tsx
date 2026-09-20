import { useEffect, useMemo, useRef } from 'react'
import { t, useLocale } from '@/i18n'
import { createStrokePainter } from '../brushes'
import { proposalStrokes, type DrawingProposal } from '../companion/proposals'

/** Non-interactive overlay: drawing gestures reach the child's canvas underneath. */
export function CompanionProjection({ proposal, additions, aspect, turnDuration }: { proposal: DrawingProposal; additions?: DrawingProposal[]; aspect: number; turnDuration?: number }) {
  useLocale()
  const ref = useRef<HTMLCanvasElement>(null)
  const pen = useRef<HTMLSpanElement>(null)
  const strokes = useMemo(() => [proposal, ...(additions ?? [])].flatMap(item => proposalStrokes(item, aspect)), [proposal, additions, aspect])
  const bounds = useMemo(() => {
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity
    // A valid contribution can contain 64 paths of 4096 points. Spreading those
    // points into Math.min/max can exceed the browser's function argument limit.
    for (const stroke of strokes) for (const point of stroke.points) {
      left = Math.min(left, point.x); top = Math.min(top, point.y)
      right = Math.max(right, point.x); bottom = Math.max(bottom, point.y)
    }
    return Number.isFinite(left) && Number.isFinite(top) && Number.isFinite(right) && Number.isFinite(bottom)
      ? { left, top, right, bottom } : null
  }, [strokes])
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const started = performance.now()
    let frame = 0
    const duration = turnDuration ?? 0
    const draw = () => {
      const rect = canvas.getBoundingClientRect()
      const ratio = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(rect.width * ratio); canvas.height = Math.round(rect.height * ratio)
      const ctx = canvas.getContext('2d')
      if (!ctx || !canvas.width || !canvas.height) return
      // Match DrawingCanvas even when layout produces fractional CSS widths.
      const scale = canvas.width / rect.width
      const progress = duration > 0 ? Math.min(1, (performance.now() - started) / duration) : 1
      const paths = strokes.map(spec => ({ spec, points: spec.points.map(p => ({ x: p.x * canvas.width, y: p.y * canvas.height })) }))
      let total = 0
      for (const { points } of paths) for (let i = 1; i < points.length; i++) total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y)
      let remaining = total * progress
      let tip: { x: number; y: number } | null = null
      for (const { spec, points } of paths) {
        if (!points.length) continue
        if (turnDuration !== undefined && remaining <= 0) break
        const painter = createStrokePainter(ctx, { kind: spec.brushKind ?? 'round', color: spec.color, size: spec.width * scale, eraser: false }, points[0])
        tip = points[0]
        for (let i = 1; i < points.length; i++) {
          const previous = points[i - 1], next = points[i]
          const distance = Math.hypot(next.x - previous.x, next.y - previous.y)
          if (turnDuration !== undefined && distance > remaining) {
            const ratio = remaining / distance
            tip = { x: previous.x + (next.x - previous.x) * ratio, y: previous.y + (next.y - previous.y) * ratio }
            painter.moveTo(tip); remaining = 0; break
          }
          painter.moveTo(next); tip = next; remaining -= distance
        }
      }
      if (pen.current) {
        pen.current.style.opacity = tip && progress < 1 ? '1' : '0'
        if (tip) { pen.current.style.left = `${tip.x / canvas.width * 100}%`; pen.current.style.top = `${tip.y / canvas.height * 100}%` }
      }
      if (progress < 1) frame = requestAnimationFrame(draw)
    }
    draw()
    const observer = new ResizeObserver(() => { cancelAnimationFrame(frame); draw() }); observer.observe(canvas)
    return () => { observer.disconnect(); cancelAnimationFrame(frame) }
  }, [strokes, turnDuration])
  if (!bounds) return null
  const { left, top, right, bottom } = bounds
  return <div className={`nilo-projection pointer-events-none absolute inset-0${turnDuration !== undefined ? ' nilo-turn-drawing' : ''}`} aria-label={t(turnDuration !== undefined ? 'Nilo 正在画，接着你的这一笔' : 'Nilo 的投影，尚未加入画作')}>
    <canvas ref={ref} className="absolute inset-0 size-full" aria-hidden="true" />
    {turnDuration !== undefined ? <span ref={pen} className="nilo-drawing-pen" aria-hidden="true">✎</span> : <>
      <div className="absolute rounded-xl border border-dashed border-luma-teal-500/60" style={{ left: `${left * 100}%`, top: `${top * 100}%`, width: `${(right - left) * 100}%`, height: `${(bottom - top) * 100}%` }} />
      <span className="absolute rounded-full bg-white/95 px-2 py-1 text-[10px] font-bold text-luma-teal-800 shadow-sm" style={{ left: `${Math.min(75, left * 100)}%`, top: `max(0px, calc(${top * 100}% - 28px))` }}>{t('Nilo 的想法')}</span>
    </>}
  </div>
}
