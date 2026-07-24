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
      const rect = canvas.getBoundingClientRect()
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(rect.width * pixelRatio)
      canvas.height = Math.round(rect.height * pixelRatio)
      historyRef.current = [canvas.toDataURL('image/png')]
    }

    resizeCanvas()
    const observer = new ResizeObserver(resizeCanvas)
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [])

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
      const canvas = canvasRef.current
      if (!canvas) return
      const exportCanvas = document.createElement('canvas')
      exportCanvas.width = canvas.width
      exportCanvas.height = canvas.height
      const context = exportCanvas.getContext('2d')
      if (!context) return
      context.fillStyle = '#fffdf8'
      context.fillRect(0, 0, exportCanvas.width, exportCanvas.height)
      context.drawImage(canvas, 0, 0)

      const link = document.createElement('a')
      link.download = `luma-creation-${Date.now()}.png`
      link.href = exportCanvas.toDataURL('image/png')
      link.click()
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
