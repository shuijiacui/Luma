import { t, useLocale } from '@/i18n'
import type { NiloStrokeSpec } from '@/lib/api/lumaApi'
import { BRUSHES, createStrokePainter, type BrushKind } from '../brushes'
import { canvasUndoCounts, cloneCanvasDocument, getCanvasProvenance, paintCanvasOperation, undoCanvasOwner, type CanvasDocument, type CanvasOperation } from '../canvasDocument'
import { getCompanionScene, type CompanionScene } from '../companionScene'
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
  getCompanionScene: () => CompanionScene
  getDocument: () => CanvasDocument
  getRevision: () => number
  commitCompanionStrokes: (specs: NiloStrokeSpec[], expectedRevision: number) => boolean
  drawCompanionStroke: (spec: NiloStrokeSpec) => Promise<void>
  getLastStroke: () => { points: { x: number; y: number }[]; color: string; width: number; brushKind?: BrushKind } | null
  /** Most recent visible child stroke, in current CSS pixels (not backing-store pixels). */
  getLastDrawingStyle: () => { brushKind: BrushKind; color: string; size: number } | null
  getInkGrid: (size?: number) => number[]
  getOccupancy: (size?: number) => number[]
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
  const baseImageRef = useRef<HTMLImageElement | null>(null)
  const restoringRef = useRef(false)
  const revisionRef = useRef(0)
  const pointerRef = useRef<number | null>(null)
  const painterRef = useRef<ReturnType<typeof createStrokePainter> | null>(null)
  const currentStrokeRef = useRef<Extract<CanvasOperation, { type: 'stroke' }> | null>(null)

  function renderDocument(context: CanvasRenderingContext2D, width: number, height: number, childOnly = false, source = documentRef.current) {
    context.clearRect(0, 0, width, height)
    const base = baseImageRef.current
    if (base && source.baseImage) {
      const scale = Math.min(width / base.width, height / base.height)
      context.drawImage(base, (width - base.width * scale) / 2, (height - base.height * scale) / 2, base.width * scale, base.height * scale)
    }
    for (const op of source.operations) if (!childOnly || op.owner === 'child') paintCanvasOperation(context, width, height, op)
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

  function commitCompanionStrokes(specs: NiloStrokeSpec[], expectedRevision: number) {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (disabled || restoringRef.current || pointerRef.current !== null || !canvas || !context || expectedRevision !== revisionRef.current
      || !Array.isArray(specs) || !specs.length || specs.length > 64) return false
    if (specs.some(spec => !/^#[0-9a-f]{6}$/i.test(spec.color) || !Number.isFinite(spec.width) || spec.width < 1 || spec.width > 32
      || (spec.brushKind !== undefined && !BRUSHES.some(brush => brush.id === spec.brushKind))
      || !Array.isArray(spec.points) || !spec.points.length || spec.points.length > 4096
      || spec.points.some(point => !Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1))) return false
    const groupId = crypto.randomUUID()
    const scale = canvas.width / (canvas.getBoundingClientRect().width || canvas.width)
    const ops: CanvasOperation[] = specs.map(spec => ({ owner: 'nilo', type: 'stroke', groupId, points: spec.points.map(point => ({ ...point })),
      color: spec.color, size: spec.width * scale, brushKind: spec.brushKind ?? 'round', eraser: false, referenceWidth: canvas.width, referenceHeight: canvas.height }))
    // Prepare in isolation: rejected contributions never leave partial marks.
    const next: CanvasDocument = { ...documentRef.current, coCreated: true, operations: [...documentRef.current.operations, ...ops] }
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
      documentRef.current = next
      revisionRef.current++
      draft.document = cloneCanvasDocument(next)
      draft.history = [snapshot]
      return true
    } catch { return false }
  }

  function getOccupancy(size = 32) {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    const cells = Math.max(2, Math.min(64, Number.isFinite(size) ? Math.round(size) : 32))
    const hits = new Array<number>(cells * cells).fill(0)
    const totals = new Array<number>(cells * cells).fill(0)
    if (!canvas || !context) return hits
    try {
      const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height)
      const step = Math.max(1, Math.floor(Math.min(width, height) / (cells * 6)))
      for (let y = 0; y < height; y += step) for (let x = 0; x < width; x += step) {
        const index = Math.floor(y / height * cells) * cells + Math.floor(x / width * cells)
        const pixel = (y * width + x) * 4
        totals[index]++
        if (data[pixel + 3] > 8 && Math.min(data[pixel], data[pixel + 1], data[pixel + 2]) < 242) hits[index]++
      }
      return hits.map((hit, index) => hit / Math.max(1, totals[index]))
    } catch { return hits }
  }

  function lastChildStroke() {
    const operation = [...documentRef.current.operations].reverse().find(item => item.type === 'clear' || (item.owner === 'child' && !item.eraser))
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
    async drawCompanionStroke(spec) { commitCompanionStrokes([spec], revisionRef.current) },
    clear() {
      if (disabled || restoringRef.current || pointerRef.current !== null) return
      documentRef.current.operations.push({ owner: 'child', type: 'clear', groupId: crypto.randomUUID() })
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
    currentStrokeRef.current = { owner: 'child', type: 'stroke', groupId: crypto.randomUUID(),
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
