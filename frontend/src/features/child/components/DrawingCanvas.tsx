import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import type { CanvasDraft } from '../draft'

export interface DrawingCanvasHandle {
  undo: () => void
  clear: () => void
  download: () => void
  /** 导出白底 PNG 的 base64（不含 data: 前缀），供 /api/analyze 使用 */
  exportImage: () => string | null
}

interface DrawingCanvasProps {
  draft: CanvasDraft
  color: string
  brushSize: number
  isEraser: boolean
  onStrokeComplete: () => void
}

export const DrawingCanvas = forwardRef<
  DrawingCanvasHandle,
  DrawingCanvasProps
>(function DrawingCanvas(
  { color, brushSize, isEraser, onStrokeComplete, draft },
  forwardedRef,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const isDrawingRef = useRef(false)
  const historyRef = useRef<string[]>(draft.history)
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
    restoringRef.current = true

    context.clearRect(0, 0, canvas.width, canvas.height)
    if (!snapshot) { restoringRef.current = false; return }

    const image = new Image()
    image.onload = () => {
      if (restoreVersionRef.current !== version) return // 已有更新的撤销请求，丢弃这次结果
      context.clearRect(0, 0, canvas.width, canvas.height)
      context.globalCompositeOperation = 'source-over'
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      restoringRef.current = false
    }
    image.onerror = () => { if (version === restoreVersionRef.current) restoringRef.current = false }
    image.src = snapshot
  }

  function saveSnapshot() {
    const canvas = canvasRef.current
    if (!canvas) return
    historyRef.current = [
      ...historyRef.current.slice(-19),
      canvas.toDataURL('image/png'),
    ]
    draft.history = historyRef.current
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const versionRef = restoreVersionRef
    function resizeCanvas(forceRestore = false) {
      if (!canvas) return
      const context = canvas.getContext('2d')
      if (!context) return

      const rect = canvas.getBoundingClientRect()
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
      const nextWidth = Math.round(rect.width * pixelRatio)
      const nextHeight = Math.round(rect.height * pixelRatio)

      // 尺寸没变就别折腾，避免同一尺寸下反复清空重绘
      if (!forceRestore && canvas.width === nextWidth && canvas.height === nextHeight) return

      // 修改 canvas.width/height 会清空画布内容，所以先把当前画面拍成快照，
      // 换完尺寸后再把快照画回去，避免转屏/地址栏收起/窗口拖拽时孩子的画作丢失
      if (nextWidth <= 0 || nextHeight <= 0) return
      // Finish an in-progress stroke before a resize, and retain undo history.
      if (isDrawingRef.current && !restoringRef.current) {
        isDrawingRef.current = false
        historyRef.current = [...historyRef.current.slice(-19), canvas.toDataURL('image/png')]
        draft.history = historyRef.current
      }
      const snapshot = historyRef.current.at(-1) ?? ''

      canvas.width = nextWidth
      canvas.height = nextHeight

      restoreSnapshot(snapshot)
    }

    // StrictMode re-runs this effect after invalidating the first image decode.
    resizeCanvas(true)
    const observer = new ResizeObserver(() => resizeCanvas())
    observer.observe(canvas)
    return () => {
      if (isDrawingRef.current && !restoringRef.current) {
        historyRef.current = [...historyRef.current.slice(-19), canvas.toDataURL('image/png')]
        draft.history = historyRef.current
      }
      ++versionRef.current
      observer.disconnect()
    }
  }, [draft])

  function flattenToCanvas() {
    const canvas = canvasRef.current
    if (!canvas) return null
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
      if (historyRef.current.length <= 1) return
      historyRef.current.pop()
      draft.history = historyRef.current
      restoreSnapshot(historyRef.current.at(-1) ?? '')
    },
    clear() {
      const canvas = canvasRef.current
      const context = canvas?.getContext('2d')
      if (!canvas || !context) return
      ++restoreVersionRef.current
      restoringRef.current = false
      context.clearRect(0, 0, canvas.width, canvas.height)
      saveSnapshot()
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
      if (restoringRef.current) return null
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
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context || restoringRef.current || (event.pointerType === 'mouse' && event.button !== 0)) return

    canvas.setPointerCapture(event.pointerId)
    isDrawingRef.current = true
    const point = getPoint(event)
    const scale = canvas.width / canvas.getBoundingClientRect().width

    context.beginPath()
    context.moveTo(point.x, point.y)
    context.lineCap = 'round'
    context.lineJoin = 'round'
    context.lineWidth = brushSize * scale
    context.strokeStyle = color
    context.globalCompositeOperation = isEraser
      ? 'destination-out'
      : 'source-over'
  }

  function draw(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!isDrawingRef.current) return
    const context = canvasRef.current?.getContext('2d')
    if (!context) return
    const point = getPoint(event)
    context.lineTo(point.x, point.y)
    context.stroke()
  }

  function finishDrawing() {
    if (!isDrawingRef.current) return
    isDrawingRef.current = false
    canvasRef.current?.getContext('2d')?.closePath()
    saveSnapshot()
    onStrokeComplete()
  }

  return (
    <canvas
      ref={canvasRef}
      className="block h-full w-full cursor-crosshair touch-none rounded-[1.5rem] bg-white"
      aria-label="自由绘画画布"
      onPointerDown={startDrawing}
      onPointerMove={draw}
      onPointerUp={finishDrawing}
      onPointerCancel={finishDrawing}
      onPointerLeave={finishDrawing}
    />
  )
})
