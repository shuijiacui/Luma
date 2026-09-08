import { t, useLocale } from '@/i18n'
import { createStrokePainter, type BrushKind } from '../brushes'
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  type PointerEvent as ReactPointerEvent,
} from 'react'

export interface DrawingCanvasHandle {
  undo: () => void
  clear: () => void
  download: () => void
  /** 导出白底 PNG 的 base64（不含 data: 前缀），供 /api/analyze 使用 */
  exportImage: () => string | null
}

interface DrawingCanvasProps {
  color: string
  brushSize: number
  brushKind?: BrushKind
  isEraser: boolean
  onStrokeComplete: () => void
  draft: { history: string[] }
  disabled?: boolean
}

export const DrawingCanvas = forwardRef<
  DrawingCanvasHandle,
  DrawingCanvasProps
>(function DrawingCanvas(
  { color, brushSize, brushKind = 'round', isEraser, onStrokeComplete, draft, disabled },
  forwardedRef,
) {
  useLocale()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const isDrawingRef = useRef(false)
  const pointerRef = useRef<number | null>(null)
  const painterRef = useRef<ReturnType<typeof createStrokePainter> | null>(null)
  const historyRef = useRef<string[]>([...draft.history])
  const restoringRef = useRef(false)
  // 撤销请求版本号：连续快速点撤销会产生多个并发的 Image.onload，
  // 解码完成顺序不保证与点击顺序一致，靠版本号在回调里丢弃过期结果
  const restoreVersionRef = useRef(0)

  function restoreSnapshot(snapshot: string) {
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext('2d')
    if (!context) return

    const version = ++restoreVersionRef.current
    restoringRef.current = !!snapshot

    context.clearRect(0, 0, canvas.width, canvas.height)
    if (!snapshot) return

    const image = new Image()
    image.onload = () => {
      if (restoreVersionRef.current !== version) return // 已有更新的撤销请求，丢弃这次结果
      context.clearRect(0, 0, canvas.width, canvas.height)
      context.save()
      context.globalCompositeOperation = 'source-over'
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      context.restore()
      restoringRef.current = false
    }
    image.src = snapshot
    image.onerror = () => { if (restoreVersionRef.current === version) restoringRef.current = false }
  }

  function saveSnapshot() {
    const canvas = canvasRef.current
    if (!canvas) return
    historyRef.current = [
      ...historyRef.current.slice(-19),
      canvas.toDataURL('image/png'),
    ]
    draft.history = [...historyRef.current]
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    function resizeCanvas() {
      if (!canvas) return
      const context = canvas.getContext('2d')
      if (!context) return

      const rect = canvas.getBoundingClientRect()
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
      const nextWidth = Math.round(rect.width * pixelRatio)
      const nextHeight = Math.round(rect.height * pixelRatio)
      if (nextWidth < 1 || nextHeight < 1) return

      // 尺寸没变就别折腾，避免同一尺寸下反复清空重绘
      if (canvas.width === nextWidth && canvas.height === nextHeight) return

      // 修改 canvas.width/height 会清空画布内容，所以先把当前画面拍成快照，
      // 换完尺寸后再把快照画回去，避免转屏/地址栏收起/窗口拖拽时孩子的画作丢失
      const snapshot = document.createElement('canvas')
      snapshot.width = canvas.width
      snapshot.height = canvas.height
      snapshot.getContext('2d')?.drawImage(canvas, 0, 0)

      canvas.width = nextWidth
      canvas.height = nextHeight

      context.drawImage(snapshot, 0, 0, canvas.width, canvas.height)
    }

    resizeCanvas()
    restoreSnapshot(historyRef.current.at(-1) ?? '')
    const observer = new ResizeObserver(resizeCanvas)
    observer.observe(canvas)
    const version = restoreVersionRef
    return () => { observer.disconnect(); version.current++ }
  }, [])

  function flattenToCanvas() {
    const canvas = canvasRef.current
    if (!canvas || restoringRef.current) return null
    const exportCanvas = document.createElement('canvas')
    exportCanvas.width = canvas.width
    exportCanvas.height = canvas.height
    const context = exportCanvas.getContext('2d')
    if (!context) return null
    context.fillStyle = '#fffdf8'
    context.fillRect(0, 0, exportCanvas.width, exportCanvas.height)
    context.drawImage(canvas, 0, 0)
    return exportCanvas
  }

  useImperativeHandle(forwardedRef, () => ({
    undo() {
      if (disabled || isDrawingRef.current) return
      if (historyRef.current.length <= 1) return
      historyRef.current.pop()
      draft.history = [...historyRef.current]
      restoreSnapshot(historyRef.current.at(-1) ?? '')
      onStrokeComplete()
    },
    clear() {
      if (disabled || isDrawingRef.current) return
      const canvas = canvasRef.current
      const context = canvas?.getContext('2d')
      if (!canvas || !context) return
      restoreVersionRef.current++
      restoringRef.current = false
      context.clearRect(0, 0, canvas.width, canvas.height)
      saveSnapshot()
      onStrokeComplete()
    },
    download() {
      const exportCanvas = flattenToCanvas()
      if (!exportCanvas) return

      const link = document.createElement('a')
      link.download = `luma-creation-${Date.now()}.png`
      link.href = exportCanvas.toDataURL('image/png')
      link.click()
    },
    exportImage() {
      const exportCanvas = flattenToCanvas()
      if (!exportCanvas) return null
      return exportCanvas.toDataURL('image/png').split(',')[1] ?? null
    },
  }))

  function getPoint(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    return {
      x: (event.clientX - rect.left) * (canvas.width / rect.width),
      y: (event.clientY - rect.top) * (canvas.height / rect.height),
    }
  }

  function startDrawing(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (disabled || restoringRef.current || isDrawingRef.current || !event.isPrimary || event.button !== 0) return
    restoreVersionRef.current++
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return

    canvas.setPointerCapture(event.pointerId)
    isDrawingRef.current = true
    pointerRef.current = event.pointerId
    const point = getPoint(event)
    const scale = canvas.width / canvas.getBoundingClientRect().width

    painterRef.current = createStrokePainter(context, { kind: brushKind, color, size: brushSize * scale, eraser: isEraser }, point)
  }

  function draw(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!isDrawingRef.current || pointerRef.current !== event.pointerId) return
    const point = getPoint(event)
    painterRef.current?.moveTo(point)
  }

  function finishDrawing(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!isDrawingRef.current || pointerRef.current !== event.pointerId) return
    if (event.type === 'pointerup') painterRef.current?.moveTo(getPoint(event))
    isDrawingRef.current = false
    painterRef.current = null
    pointerRef.current = null
    if (canvasRef.current?.hasPointerCapture(event.pointerId)) canvasRef.current.releasePointerCapture(event.pointerId)
    saveSnapshot()
    onStrokeComplete()
  }

  return (
    <canvas
      ref={canvasRef}
      className="block h-full min-h-0 w-full cursor-crosshair touch-none rounded-[1.5rem] bg-white"
      aria-label={t("自由绘画画布")}
      onPointerDown={startDrawing}
      onPointerMove={draw}
      onPointerUp={finishDrawing}
      onPointerCancel={finishDrawing}
      onLostPointerCapture={finishDrawing}
    />
  )
})
