import { editableObjects } from '../companion/objects'
import type { DrawingProposal } from '../companion/proposals'
import { pixelOccupancy } from '../../../../../shared/niloOccupancy.mjs'
import type { InkPixels } from '../../../../../shared/niloContact.mjs'
import { t, useLocale } from '@/i18n'
import type { NiloStrokeSpec } from '@/lib/api/lumaApi'
import { randomId } from '@/lib/randomId'
import { BRUSHES, createStrokePainter, type BrushKind } from '../brushes'
import { visibleOperations, canvasUndoCounts, cloneCanvasDocument, getCanvasProvenance, paintCanvasOperation, undoCanvasOwner, type CanvasDocument, type CanvasOperation } from '../canvasDocument'
import { getCompanionScene, type CompanionScene } from '../companionScene'
import { exportCompanionFocus } from '../companion/focus'
import type { CanvasDraft } from '../draft'
import { forwardRef, useEffect, useImperativeHandle, useRef, type PointerEvent as ReactPointerEvent } from 'react'

export interface DrawingCanvasHandle {
  flushDraft: () => void
  /** Undo the latest committed contribution, regardless of its author. */
  undo: () => boolean
  clear: () => void
  download: () => void
  exportImage: () => string | null
  exportSnapshot: () => string | null
  exportChildImage: () => string | null
  /** Compact child-only observation; legacy base images remain explicitly unknown. */
  exportObservation: () => string | null
  /** Confirmed child + Nilo image for collaboration; never used for child-only analysis. */
  exportCompanionObservation: () => string | null
  exportCompanionFocus?: () => ReturnType<typeof exportCompanionFocus>
  getCompanionScene: () => CompanionScene
  getDocument: () => CanvasDocument
  getRevision: () => number
  commitCompanionStrokes: (specs: NiloStrokeSpec[], expectedRevision: number, object?: { proposals: DrawingProposal[]; aspect: number }, targetId?: string) => boolean
  getEditableObjects?: () => ReturnType<typeof editableObjects>
  previewWithoutObject?: (id: string | null) => void
  getOccupancyWithoutObject?: (id: string, size?: number) => number[]
  drawCompanionStroke: (spec: NiloStrokeSpec) => Promise<void>
  getLastStroke: () => { points: { x: number; y: number }[]; color: string; width: number; brushKind?: BrushKind } | null
  /** Most recent visible child stroke, in current CSS pixels (not backing-store pixels). */
  getLastDrawingStyle: () => { brushKind: BrushKind; color: string; size: number } | null
  getInkGrid: (size?: number) => number[]
  getOccupancy: (size?: number) => number[]
  /** Current original pixels, read only for contact-boundary refinement. */
  getCollisionPixels?: () => InkPixels | undefined
  /** Exact visible-ink contact at a normalized point; radius is in CSS pixels. */
  hasInkAt: (point: { x: number; y: number }, radius: number) => boolean
  undoCompanionStroke: () => boolean
  getUndoCounts: () => { child: number; nilo: number }
}

interface DrawingCanvasProps {
  color: string
  brushSize: number
  brushKind?: BrushKind
  isEraser: boolean
  onStrokeComplete: () => void
  onStrokeStart?: () => void
  draft: CanvasDraft
  disabled?: boolean
}

export const DrawingCanvas = forwardRef<DrawingCanvasHandle, DrawingCanvasProps>(function DrawingCanvas(
  { color, brushSize, brushKind = 'round', isEraser, onStrokeComplete, onStrokeStart, draft, disabled }, forwardedRef,
) {
  useLocale()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const documentRef = useRef<CanvasDocument>(draft.document ? cloneCanvasDocument(draft.document) : {
    version: 1, baseSource: draft.history.at(-1) ? 'unknown' : 'child',
    ...(draft.history.at(-1) ? { baseImage: draft.history.at(-1) } : {}), operations: [],
  })
  const hiddenObjectRef = useRef<string | null>(null)
  const baseImageRef = useRef<HTMLImageElement | null>(null)
  const restoringRef = useRef(false)
  const revisionRef = useRef(0)
  const pointerRef = useRef<number | null>(null)
  const painterRef = useRef<ReturnType<typeof createStrokePainter> | null>(null)
  const currentStrokeRef = useRef<Extract<CanvasOperation, { type: 'stroke' }> | null>(null)

  function renderDocument(context: CanvasRenderingContext2D, width: number, height: number, childOnly = false, source = documentRef.current, hiddenId: string | null = null) {
    context.clearRect(0, 0, width, height)
    const base = baseImageRef.current
    if (base && source.baseImage) {
      const scale = Math.min(width / base.width, height / base.height)
      context.drawImage(base, (width - base.width * scale) / 2, (height - base.height * scale) / 2, base.width * scale, base.height * scale)
    }
    for (const op of visibleOperations(source)) if ((!hiddenId || op.owner !== 'nilo' || op.groupId !== hiddenId) && (!childOnly || op.owner === 'child')) paintCanvasOperation(context, width, height, op)
  }

  function makeCanvas(childOnly = false, maxSide?: number) {
    const canvas = canvasRef.current
    if (!canvas || restoringRef.current || pointerRef.current !== null || !canvas.width || !canvas.height) return null
    if (childOnly && getCanvasProvenance(documentRef.current) === 'unknown') return null
    const result = document.createElement('canvas')
    const ratio = maxSide ? Math.min(1, maxSide / Math.max(canvas.width, canvas.height)) : 1
    result.width = Math.max(1, Math.round(canvas.width * ratio))
    result.height = Math.max(1, Math.round(canvas.height * ratio))
    const context = result.getContext('2d')
    if (!context) return null
    renderDocument(context, result.width, result.height, childOnly)
    context.save()
    context.globalCompositeOperation = 'destination-over'
    context.fillStyle = '#fffdf8'
    context.fillRect(0, 0, result.width, result.height)
    context.restore()
    return result
  }

  function persist() {
    draft.document = cloneCanvasDocument(documentRef.current)
    if (canvasRef.current) draft.history = [canvasRef.current.toDataURL('image/png')]
  }

  function repaint() {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    renderDocument(context, canvas.width, canvas.height)
    persist()
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let disposed = false
    function resize() {
      if (!canvas) return
      if (currentStrokeRef.current) finishStroke()
      const rect = canvas.getBoundingClientRect()
      const ratio = Math.min(window.devicePixelRatio || 1, 2)
      const width = Math.round(rect.width * ratio), height = Math.round(rect.height * ratio)
      if (width < 1 || height < 1 || (width === canvas.width && height === canvas.height)) return
      canvas.width = width
      canvas.height = height
      revisionRef.current++
      if (!restoringRef.current) repaint()
    }
    restoringRef.current = !!documentRef.current.baseImage
    resize()
    if (documentRef.current.baseImage) {
      const image = new Image()
      image.onload = () => {
        if (disposed) return
        baseImageRef.current = image
        restoringRef.current = false
        repaint()
      }
      // An unreadable legacy image must not silently turn into a new blank painting.
      image.onerror = () => { if (!disposed) restoringRef.current = true }
      image.src = documentRef.current.baseImage
    } else repaint()
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    return () => { disposed = true; observer.disconnect() }
  }, [])

  function undoOwner(owner: 'child' | 'nilo') {
    if (disabled || restoringRef.current || pointerRef.current !== null || !undoCanvasOwner(documentRef.current, owner)) return false
    revisionRef.current++
    repaint()
    return true
  }

  function commitCompanionStrokes(specs: NiloStrokeSpec[], expectedRevision: number, object?: { proposals: DrawingProposal[]; aspect: number }, targetId?: string) {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (disabled || restoringRef.current || pointerRef.current !== null || !canvas || !context || expectedRevision !== revisionRef.current
      || !Array.isArray(specs) || (!specs.length && !targetId) || specs.length > 64) return false
    if (specs.some(spec => !/^#[0-9a-f]{6}$/i.test(spec.color) || !Number.isFinite(spec.width) || spec.width < 1 || spec.width > 32
      || (spec.brushKind !== undefined && !BRUSHES.some(brush => brush.id === spec.brushKind))
      || !Array.isArray(spec.points) || !spec.points.length || spec.points.length > 4096
      || spec.points.some(point => !Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1))) return false
    if (targetId && !visibleOperations(documentRef.current).some(op=>op.owner==='nilo'&&op.groupId===targetId)) return false
    const groupId = targetId ?? randomId()
    const scale = canvas.width / (canvas.getBoundingClientRect().width || canvas.width)
    const ops: Extract<CanvasOperation,{type:'stroke'}>[] = specs.map((spec, index) => ({ owner: 'nilo', type: 'stroke', groupId, points: spec.points.map(point => ({ ...point })),
      ...(index===0&&object?{object:{...structuredClone(object),name:object.proposals.map(p=>p.subject??p.template).join('、').slice(0,240)}}:{}),
      color: spec.color, size: spec.width * scale, brushKind: spec.brushKind ?? 'round', eraser: false, referenceWidth: canvas.width, referenceHeight: canvas.height }))
    // Prepare in isolation: rejected contributions never leave partial marks.
    const next: CanvasDocument = { ...documentRef.current, coCreated: true, operations: [...documentRef.current.operations, ...(targetId?[{type:'edit' as const, owner:'nilo' as const, groupId:randomId(),targetId,replacement:ops}]:ops)] }
    const staging = document.createElement('canvas')
    staging.width = canvas.width; staging.height = canvas.height
    const stagingContext = staging.getContext('2d')
    if (!stagingContext) return false
    try {
      renderDocument(stagingContext, staging.width, staging.height, false, next)
      const snapshot = staging.toDataURL('image/png')
      context.save()
      try {
        context.globalCompositeOperation = 'copy'
        context.drawImage(staging, 0, 0)
      } finally { context.restore() }
      hiddenObjectRef.current = null
      documentRef.current = next
      revisionRef.current++
      draft.document = cloneCanvasDocument(next)
      draft.history = [snapshot]
      return true
    } catch { return false }
  }

  function getOccupancy(size = 32, hiddenId?: string) {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    const cells = Math.max(2, Math.min(256, Number.isFinite(size) ? Math.round(size) : 32))
    const hits = new Array<number>(cells * cells).fill(0)

    if (!canvas || !context) return hits
    try {
      const staging = document.createElement('canvas'); staging.width=canvas.width;staging.height=canvas.height
      const ctx=staging.getContext('2d');if(!ctx)return hits
      renderDocument(ctx,staging.width,staging.height,false,documentRef.current,hiddenId??null)
      return pixelOccupancy(ctx.getImageData(0, 0, staging.width, staging.height), cells)
    } catch { return hits }
  }

  function hasInkAt(point: { x: number; y: number }, radius: number) {
    const canvas = canvasRef.current
    if (!canvas || restoringRef.current || pointerRef.current !== null || !canvas.width || !canvas.height
      || ![point.x, point.y, radius].every(Number.isFinite) || point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1
      || radius <= 0 || radius > 64) return false
    const rect = canvas.getBoundingClientRect(), context = canvas.getContext('2d')
    if (!context || rect.width <= 0 || rect.height <= 0) return false
    const sx = canvas.width / rect.width, sy = canvas.height / rect.height
    const cx = point.x * canvas.width, cy = point.y * canvas.height
    const left = Math.max(0, Math.floor(cx - radius * sx)), top = Math.max(0, Math.floor(cy - radius * sy))
    const right = Math.min(canvas.width, Math.ceil(cx + radius * sx)), bottom = Math.min(canvas.height, Math.ceil(cy + radius * sy))
    if (right <= left || bottom <= top) return false
    try {
      // Read only the brush-sized patch. Coarse occupancy cells cannot establish
      // a real connection, especially after erasure or on high-DPI canvases.
      const { data, width, height } = context.getImageData(left, top, right - left, bottom - top)
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4
        if (data[i + 3] <= 8 || Math.min(data[i], data[i + 1], data[i + 2]) >= 242) continue
        const dx = Math.max(left + x - cx, cx - left - x - 1, 0) / sx
        const dy = Math.max(top + y - cy, cy - top - y - 1, 0) / sy
        if (Math.hypot(dx, dy) <= radius) return true
      }
    } catch { /* An unreadable canvas is not proof of a joint. */ }
    return false
  }

  function lastChildStroke() {
    const operation = [...documentRef.current.operations].reverse().find(item => item.type === 'clear' || (item.owner === 'child' && item.type==='stroke' && !item.eraser))
    return operation?.type === 'stroke' ? operation : null
  }

  function strokeCssSize(operation: Extract<CanvasOperation, { type: 'stroke' }>) {
    const canvas = canvasRef.current
    const cssWidth = canvas?.getBoundingClientRect().width
      || (canvas?.width ?? operation.referenceWidth) / Math.min(window.devicePixelRatio || 1, 2)
    return operation.size * cssWidth / operation.referenceWidth
  }

  useImperativeHandle(forwardedRef, () => ({
    flushDraft: finishStroke,
    undo: () => {
      const last = documentRef.current.operations.at(-1)
      return last ? undoOwner(last.owner) : false
    },
    undoCompanionStroke: () => undoOwner('nilo'),
    getUndoCounts: () => canvasUndoCounts(documentRef.current),
    getDocument: () => cloneCanvasDocument(documentRef.current),
    getRevision: () => revisionRef.current,
    commitCompanionStrokes,
    getEditableObjects: () => editableObjects(documentRef.current),
    previewWithoutObject: id => { hiddenObjectRef.current=id; repaint() },
    getOccupancyWithoutObject: (id, size=256) => getOccupancy(size,id),
    async drawCompanionStroke(spec) { commitCompanionStrokes([spec], revisionRef.current) },
    clear() {
      if (disabled || restoringRef.current || pointerRef.current !== null) return
      documentRef.current.operations.push({ owner: 'child', type: 'clear', groupId: randomId() })
      revisionRef.current++
      repaint()
      onStrokeComplete()
    },
    download() {
      const output = makeCanvas()
      if (!output) return
      const link = document.createElement('a')
      link.download = `luma-creation-${Date.now()}.png`
      link.href = output.toDataURL('image/png')
      link.click()
    },
    exportImage: () => makeCanvas()?.toDataURL('image/png').split(',')[1] ?? null,
    exportChildImage: () => makeCanvas(true)?.toDataURL('image/png').split(',')[1] ?? null,
    exportObservation: () => makeCanvas(getCanvasProvenance(documentRef.current) !== 'unknown', 768)?.toDataURL('image/png') ?? null,
    exportCompanionObservation: () => makeCanvas(false, 768)?.toDataURL('image/png') ?? null,
    exportCompanionFocus: () => {
      try {
        const source = makeCanvas(false)
        return source ? exportCompanionFocus(source, getCompanionScene(documentRef.current)) : null
      } catch { return null } // Optional magnification must not block the full view.
    },
    getCompanionScene: () => getCompanionScene(documentRef.current),
    exportSnapshot: () => restoringRef.current || pointerRef.current !== null ? null : canvasRef.current?.toDataURL('image/png') ?? null,
    getLastStroke() {
      const op = lastChildStroke()
      return op ? { points: op.points.map(point => ({ ...point })), color: op.color, width: strokeCssSize(op), brushKind: op.brushKind } : null
    },
    getLastDrawingStyle() {
      const op = lastChildStroke()
      return op ? { brushKind: op.brushKind, color: op.color, size: strokeCssSize(op) } : null
    },
    getOccupancy,
    getCollisionPixels: () => {
      const canvas = canvasRef.current
      if (!canvas || restoringRef.current || pointerRef.current !== null
        || canvas.width * canvas.height > 4194304 || canvas.width > 4096 || canvas.height > 4096) return undefined
      try { return canvas.getContext('2d')?.getImageData(0, 0, canvas.width, canvas.height) }
      catch { return undefined }
    },
    hasInkAt,
    getInkGrid(size = 4) {
      const grid = getOccupancy(size)
      const maximum = Math.max(0.001, ...grid)
      return grid.map(cell => cell / maximum)
    },
  }))

  function getPoint(event: { clientX: number; clientY: number }) {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    return { x: Math.max(0, Math.min(canvas.width, (event.clientX - rect.left) * canvas.width / rect.width)),
      y: Math.max(0, Math.min(canvas.height, (event.clientY - rect.top) * canvas.height / rect.height)) }
  }

  function startDrawing(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (disabled || restoringRef.current || pointerRef.current !== null || !event.isPrimary || event.button !== 0) return
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    canvas.setPointerCapture(event.pointerId)
    pointerRef.current = event.pointerId
    revisionRef.current++
    onStrokeStart?.()
    const point = getPoint(event)
    const scale = canvas.width / (canvas.getBoundingClientRect().width || canvas.width)
    const settings = { kind: brushKind, color, size: brushSize * scale, eraser: isEraser }
    currentStrokeRef.current = { owner: 'child', type: 'stroke', groupId: randomId(),
      points: [{ x: point.x / canvas.width, y: point.y / canvas.height }], color, size: settings.size, brushKind, eraser: isEraser,
      referenceWidth: canvas.width, referenceHeight: canvas.height }
    painterRef.current = createStrokePainter(context, settings, point)
  }

  function addPoint(event: { clientX: number; clientY: number }) {
    const op = currentStrokeRef.current
    if (!op) return
    const point = getPoint(event)
    painterRef.current?.moveTo(point)
    const normalized = { x: point.x / op.referenceWidth, y: point.y / op.referenceHeight }
    const previous = op.points.at(-1)
    if (!previous || previous.x !== normalized.x || previous.y !== normalized.y) op.points.push(normalized)
  }

  function draw(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (pointerRef.current !== event.pointerId) return
    const samples = event.nativeEvent.getCoalescedEvents?.() ?? []
    if (samples.length) samples.forEach(addPoint)
    else addPoint(event)
  }

  function finishStroke() {
    const pointerId = pointerRef.current
    const op = currentStrokeRef.current
    pointerRef.current = null
    painterRef.current = null
    currentStrokeRef.current = null
    if (pointerId !== null && canvasRef.current?.hasPointerCapture(pointerId)) canvasRef.current.releasePointerCapture(pointerId)
    if (op) {
      documentRef.current.operations.push(op)
      revisionRef.current++
      persist()
      onStrokeComplete()
    }
  }

  function finishDrawing(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (pointerRef.current !== event.pointerId) return
    if (event.type === 'pointerup') addPoint(event)
    finishStroke()
  }

  return <canvas ref={canvasRef} className="block h-full min-h-0 w-full cursor-crosshair touch-none rounded-[1.5rem] bg-white"
    aria-label={t('自由绘画画布')} onPointerDown={startDrawing} onPointerMove={draw} onPointerUp={finishDrawing}
    onPointerCancel={finishDrawing} onLostPointerCapture={finishDrawing} />
})
