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
  isEraser: boolean
  onStrokeComplete: () => void
}

export const DrawingCanvas = forwardRef<
  DrawingCanvasHandle,
  DrawingCanvasProps
>(function DrawingCanvas(
  { color, brushSize, isEraser, onStrokeComplete },
  forwardedRef,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const isDrawingRef = useRef(false)
  const historyRef = useRef<string[]>([])

  function restoreSnapshot(snapshot: string) {
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext('2d')
    if (!context) return

    context.clearRect(0, 0, canvas.width, canvas.height)
    if (!snapshot) return

    const image = new Image()
    image.onload = () => {
      context.clearRect(0, 0, canvas.width, canvas.height)
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
    }
    image.src = snapshot
  }

  function saveSnapshot() {
    const canvas = canvasRef.current
    if (!canvas) return
    historyRef.current = [
      ...historyRef.current.slice(-19),
      canvas.toDataURL('image/png'),
    ]
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

      // 尺寸没变就别折腾，避免同一尺寸下反复清空重绘
      if (canvas.width === nextWidth && canvas.height === nextHeight) return

      // 修改 canvas.width/height 会清空画布内容，所以先把当前画面拍成快照，
      // 换完尺寸后再把快照画回去，避免转屏/地址栏收起/窗口拖拽时孩子的画作丢失
      const hasContent = canvas.width > 0 && canvas.height > 0
      const snapshot = hasContent ? canvas.toDataURL('image/png') : null

      canvas.width = nextWidth
      canvas.height = nextHeight

      if (!snapshot) {
        historyRef.current = [canvas.toDataURL('image/png')]
        return
      }

      const image = new Image()
      image.onload = () => {
        context.drawImage(image, 0, 0, canvas.width, canvas.height)
        historyRef.current = [canvas.toDataURL('image/png')]
      }
      image.src = snapshot
    }

    resizeCanvas()
    const observer = new ResizeObserver(resizeCanvas)
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [])

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
      restoreSnapshot(historyRef.current.at(-1) ?? '')
    },
    clear() {
      const canvas = canvasRef.current
      const context = canvas?.getContext('2d')
      if (!canvas || !context) return
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
    if (!canvas || !context) return

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
      className="h-full min-h-[440px] w-full cursor-crosshair touch-none rounded-[1.5rem] bg-white"
      aria-label="自由绘画画布"
      onPointerDown={startDrawing}
      onPointerMove={draw}
      onPointerUp={finishDrawing}
      onPointerCancel={finishDrawing}
      onPointerLeave={finishDrawing}
    />
  )
})
