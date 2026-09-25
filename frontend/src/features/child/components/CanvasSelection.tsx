import { useRef, useState, type PointerEvent } from 'react'
import { t } from '@/i18n'
import { lassoGroups, pointGroup, type SelectionBounds, type SelectionCandidate, type SelectionPoint } from '../companion/selectionGeometry'
import '../styles/canvas-selection.css'

interface Props {
  active: boolean
  candidates: SelectionCandidate[]
  selected: string[]
  bounds: SelectionBounds | null
  onChange: (groupIds: string[]) => void
  onDone: () => void
  onCancel?: () => void
}

export function CanvasSelection({ active, candidates, selected, bounds, onChange, onDone, onCancel }: Props) {
  const gesture = useRef<{ id: number; points: SelectionPoint[]; size: { width: number; height: number } } | null>(null)
  const [lasso, setLasso] = useState<SelectionPoint[]>([])
  function point(event: PointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    return { x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) }
  }
  function start(event: PointerEvent<SVGSVGElement>) {
    if (!active || gesture.current || event.isPrimary === false || event.button !== 0) return
    const rect = event.currentTarget.getBoundingClientRect()
    if (!rect.width || !rect.height) return
    event.preventDefault(); event.stopPropagation()
    const points = [point(event)]
    gesture.current = { id: event.pointerId, points, size: { width: rect.width, height: rect.height } }
    event.currentTarget.setPointerCapture(event.pointerId); setLasso(points)
  }
  function move(event: PointerEvent<SVGSVGElement>) {
    const current = gesture.current
    if (!current || current.id !== event.pointerId) return
    event.preventDefault(); event.stopPropagation()
    const next = point(event), previous = current.points.at(-1)!
    if (Math.hypot((next.x - previous.x) * current.size.width, (next.y - previous.y) * current.size.height) < 3) return
    current.points = [...current.points, next]; setLasso(current.points)
  }
  function finish(event: PointerEvent<SVGSVGElement>, cancelled = false) {
    const current = gesture.current
    if (!current || current.id !== event.pointerId) return
    event.preventDefault(); event.stopPropagation(); gesture.current = null; setLasso([])
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    if (cancelled || !active) return
    const end = point(event), points = [...current.points, end], first = points[0]
    const distance = points.reduce((max, p) => Math.max(max, Math.hypot((p.x - first.x) * current.size.width, (p.y - first.y) * current.size.height)), 0)
    if (distance < 8) {
      const id = pointGroup(candidates, end, current.size, event.pointerType === 'touch' ? 22 : 14)
      if (id) onChange(selected.includes(id) ? selected.filter(item => item !== id) : [...selected, id])
    } else {
      const ids = lassoGroups(candidates, points)
      if (ids.length) onChange([...new Set([...selected, ...ids])])
    }
  }
  const selectedSet = new Set(selected)
  return <svg className="nilo-canvas-selection" data-active={active} viewBox="0 0 1 1" preserveAspectRatio="none"
    role="group" aria-label={t(active ? '圈选要修改的笔迹' : '已选择的笔迹')} tabIndex={active ? 0 : undefined}
    onPointerDown={start} onPointerMove={move} onPointerUp={event => finish(event)} onPointerCancel={event => finish(event, true)}
    onLostPointerCapture={() => { gesture.current = null; setLasso([]) }}
    onKeyDown={event => { if (active && (event.key === 'Escape' || event.key === 'Enter')) { event.preventDefault(); if (event.key === 'Escape') onCancel?.(); else onDone() } }}>
    {candidates.filter(candidate => selectedSet.has(candidate.groupId)).map((candidate, index) => candidate.highlight
      ? <image key={`${candidate.groupId}:${index}`} href={candidate.highlight.url} x={candidate.highlight.x} y={candidate.highlight.y}
        width={candidate.highlight.width} height={candidate.highlight.height} opacity=".45" preserveAspectRatio="none" />
      : <polyline key={`${candidate.groupId}:${index}`} points={candidate.points.map(p => `${p.x},${p.y}`).join(' ')} className="nilo-selected-stroke" />)}
    {bounds && <rect x={bounds.x} y={bounds.y} width={Math.max(.002, bounds.width)} height={Math.max(.002, bounds.height)} className="nilo-selection-box" />}
    {active && lasso.length > 1 && <polygon points={lasso.map(p => `${p.x},${p.y}`).join(' ')} className="nilo-selection-lasso" />}
  </svg>
}
