import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { t, useLocale } from '@/i18n'
import { createStrokePainter } from '../brushes'
import { proposalStrokes, type DrawingProposal } from '../companion/proposals'
import { projectionTransform } from '../companion/projectionTransform'
import { getDrawingIllustration } from '../../../../../shared/niloIllustrations.mjs'

/** Tracing paths pass through to the paper; only the two handles receive gestures. */
export function CompanionProjection({ proposal, additions, aspect, turnDuration, tracing = false, overInk = false, onEdit, onInteractionStart }: { proposal: DrawingProposal; additions?: DrawingProposal[]; aspect: number; turnDuration?: number; tracing?: boolean; overInk?: boolean; onEdit?: (patch: Partial<DrawingProposal>) => void; onInteractionStart?: () => void }) {
  useLocale()
  const ref = useRef<HTMLCanvasElement>(null)
  const pen = useRef<HTMLSpanElement>(null)
  const [viewOriginal, setViewOriginal] = useState(false)
  const [failedImages, setFailedImages] = useState<string[]>([])
  const illustrations = useMemo(() => [proposal, ...(additions ?? [])].flatMap(item => {
    const asset = item.template === 'illustration' && item.illustrationId ? getDrawingIllustration(item.illustrationId) : undefined
    return asset ? [{ proposal: item, asset }] : []
  }), [proposal, additions])
  const illustrationKey = illustrations.map(item => item.asset.id).join(',')
  useEffect(() => { setViewOriginal(false); setFailedImages([]) }, [illustrationKey])
  // Raster illustrations are references only, including when opened from an older workflow.
  const isGuide = tracing || illustrations.length > 0
  const gesture = useRef<{ id: number; x: number; y: number; rect: DOMRect; items: DrawingProposal[]; mode: 'move' | 'resize'; width: number; height: number } | null>(null)
  const editable = !!onEdit && turnDuration === undefined
  function start(event: ReactPointerEvent<HTMLButtonElement>, mode: 'move' | 'resize') {
    if (!editable || gesture.current || event.button !== 0 || event.isPrimary === false) return
    const rect = ref.current?.getBoundingClientRect()
    if (!rect?.width || !rect.height) return
    event.preventDefault(); event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    const items = [proposal, ...(additions ?? [])]
    gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, rect, items, mode,
      width: Math.max(...items.map(p => p.x + p.width)) - Math.min(...items.map(p => p.x)),
      height: Math.max(...items.map(p => p.y + p.height)) - Math.min(...items.map(p => p.y)) }
    onInteractionStart?.()
  }
  function move(event: ReactPointerEvent<HTMLButtonElement>) {
    const g = gesture.current
    if (!g || g.id !== event.pointerId) return
    event.preventDefault(); event.stopPropagation()
    const dx = (event.clientX - g.x) / g.rect.width, dy = (event.clientY - g.y) / g.rect.height
    const w = g.width * g.rect.width, h = g.height * g.rect.height
    // Project the pointer onto the diagonal: both axes contribute, without distortion.
    const scale = 1 + ((event.clientX - g.x) * w + (event.clientY - g.y) * h) / (w * w + h * h)
    const patch = projectionTransform(g.items, g.mode === 'move' ? { dx, dy } : { scale }, aspect, g.rect)
    if (patch) onEdit?.(patch)
  }
  function end(event: ReactPointerEvent<HTMLButtonElement>, cancel = false) {
    const g = gesture.current
    if (!g || g.id !== event.pointerId) return
    if (!cancel) move(event)
    gesture.current = null
    event.preventDefault(); event.stopPropagation()
    if (cancel) { const p = g.items[0]; onEdit?.({ x:p.x, y:p.y, width:p.width, height:p.height }) }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }
  function keyboard(event: ReactKeyboardEvent<HTMLButtonElement>, resize: boolean) {
    if (!editable) return
    const arrows: Record<string, [number, number]> = { ArrowLeft:[-.01,0], ArrowRight:[.01,0], ArrowUp:[0,-.01], ArrowDown:[0,.01] }
    const delta = arrows[event.key]
    const factor = ['+', '=', 'ArrowRight', 'ArrowUp'].includes(event.key) ? 1.05 : .95
    if (!delta && !['+', '=', '-'].includes(event.key)) return
    event.preventDefault(); event.stopPropagation(); onInteractionStart?.()
    const patch = projectionTransform([proposal, ...(additions ?? [])], resize || !delta ? { scale: factor } : { dx:delta[0], dy:delta[1] }, aspect, ref.current?.getBoundingClientRect())
    if (patch) onEdit?.(patch)
  }
  const strokes = useMemo(() => [proposal, ...(additions ?? [])].flatMap(item => proposalStrokes(item, aspect)), [proposal, additions, aspect])
  const bounds = useMemo(() => {
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity
    // A valid contribution can contain 64 paths of 4096 points. Spreading those
    // points into Math.min/max can exceed the browser's function argument limit.
    for (const stroke of strokes) for (const point of stroke.points) {
      left = Math.min(left, point.x); top = Math.min(top, point.y)
      right = Math.max(right, point.x); bottom = Math.max(bottom, point.y)
    }
    for (const { proposal: p } of illustrations) {
      const angle = p.rotation * Math.PI / 180
      const width = Math.abs(p.width * Math.cos(angle)) + Math.abs(p.height * Math.sin(angle)) / aspect
      const height = Math.abs(p.height * Math.cos(angle)) + Math.abs(p.width * Math.sin(angle)) * aspect
      const x = p.x + (p.width - width) / 2, y = p.y + (p.height - height) / 2
      left = Math.min(left, x); top = Math.min(top, y)
      right = Math.max(right, x + width); bottom = Math.max(bottom, y + height)
    }
    return Number.isFinite(left) && Number.isFinite(top) && Number.isFinite(right) && Number.isFinite(bottom)
      ? { left, top, right, bottom } : null
  }, [strokes, illustrations, aspect])
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
        if (isGuide) {
          ctx.strokeStyle = '#9ca3af'
          ctx.lineWidth = 1.6 * scale
          ctx.lineCap = 'round'; ctx.lineJoin = 'round'
          ctx.setLineDash([6 * scale, 5 * scale])
          ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y)
        }
        const painter = isGuide ? { moveTo: (point: { x: number; y: number }) => ctx.lineTo(point.x, point.y) }
          : createStrokePainter(ctx, { kind: spec.brushKind ?? 'round', color: spec.color, size: spec.width * scale, eraser: false }, points[0])
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
        if (isGuide) ctx.stroke()
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
  }, [strokes, turnDuration, isGuide])
  if (!bounds) return null
  const { left, top, right, bottom } = bounds
  return <div className={`nilo-projection pointer-events-none absolute inset-0${isGuide ? ' nilo-tracing-projection' : ''}${isGuide && overInk ? ' nilo-tracing-over-ink' : ''}${turnDuration !== undefined ? ' nilo-turn-drawing' : ''}`} aria-label={t(illustrations.length ? 'Nilo 的插画参考底图' : tracing ? 'Nilo 的灰色虚线描摹底图' : turnDuration !== undefined ? 'Nilo 正在画，接着你的这一笔' : 'Nilo 的投影，尚未加入画作')}>
    <canvas ref={ref} className="absolute inset-0 size-full" aria-hidden="true" />
    {illustrations.map(({ proposal: p, asset }) => <img key={asset.id} src={asset.src} alt={asset.name} draggable={false}
      className={`nilo-illustration-guide${viewOriginal ? ' nilo-illustration-original' : ''}`}
      style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%`, width: `${p.width * 100}%`, height: `${p.height * 100}%`, transform: `rotate(${p.rotation}deg)` }}
      onError={() => setFailedImages(ids => ids.includes(asset.id) ? ids : [...ids, asset.id])}
      onLoad={() => setFailedImages(ids => ids.filter(id => id !== asset.id))} />)}
    {failedImages.length > 0 && <span className="nilo-illustration-notice" role="status">{t('参考图暂时没加载好，可以继续画或换个画法。')}</span>}
    {turnDuration !== undefined ? <span ref={pen} className="nilo-drawing-pen" aria-hidden="true">✎</span> : <>
      <div className={`nilo-projection-controls absolute rounded-xl${isGuide ? '' : ' border border-dashed border-luma-teal-500/60'}`} style={{ left: `${left * 100}%`, top: `${top * 100}%`, width: `${(right - left) * 100}%`, height: `${(bottom - top) * 100}%` }}>
        {illustrations.length > 0 && <button type="button" className="nilo-illustration-view" aria-pressed={viewOriginal}
          onClick={() => { onInteractionStart?.(); setViewOriginal(value => !value) }}>{t(viewOriginal ? '继续描画' : '看原图')}</button>}
        {editable && <>
          <button type="button" className="nilo-projection-move" aria-label={t('拖动 Nilo 的投影')} onPointerDown={e => start(e, 'move')} onPointerMove={move} onPointerUp={e => end(e)} onPointerCancel={e => end(e, true)} onLostPointerCapture={e => end(e, true)} onKeyDown={e => keyboard(e, false)}>{isGuide && <span aria-hidden="true">✥</span>}</button>
          <button type="button" className="nilo-projection-resize" aria-label={t('调整 Nilo 投影大小')} onPointerDown={e => start(e, 'resize')} onPointerMove={move} onPointerUp={e => end(e)} onPointerCancel={e => end(e, true)} onLostPointerCapture={e => end(e, true)} onKeyDown={e => keyboard(e, true)}><span aria-hidden="true">↘</span></button>
        </>}
      </div>
      {!isGuide && <span className="absolute rounded-full bg-white/95 px-2 py-1 text-[10px] font-bold text-luma-teal-800 shadow-sm" style={{ left: `${Math.min(75, left * 100)}%`, top: `max(0px, calc(${top * 100}% - 28px))` }}>{t(editable ? '拖一拖，拉角角变大小' : 'Nilo 的想法')}</span>}
    </>}
  </div>
}
