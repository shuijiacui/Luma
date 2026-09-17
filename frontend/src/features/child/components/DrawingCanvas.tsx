import { t, useLocale } from '@/i18n'
import type { NiloStrokeSpec } from '@/lib/api/lumaApi'
import { createStrokePainter, type BrushKind } from '../brushes'
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  type PointerEvent as ReactPointerEvent,
} from 'react'

type UndoOwner = 'child' | 'nilo'

type CanvasOp =
  | { owner: UndoOwner; type: 'stroke'; points: { x: number; y: number }[]; color: string; size: number; eraser: boolean }
  | { owner: 'child'; type: 'clear' }

export interface DrawingCanvasHandle {
  /** 撤销孩子自己的最后一笔（可连续点） */
  undo: () => boolean
  clear: () => void
  download: () => void
  /** 导出白底 PNG 的 base64（不含 data: 前缀），供 /api/analyze 使用 */
  exportImage: () => string | null
  exportSnapshot: () => string | null
  /** Nilo 帮孩子添一笔（归一化坐标 → 动画落笔，可撤销；不触发孩子的回合逻辑） */
  drawCompanionStroke: (spec: NiloStrokeSpec) => Promise<void>
  /** 孩子刚画完的最后一笔（归一化坐标），让 Nilo 能呼应/延伸 */
  getLastStroke: () => { points: { x: number; y: number }[]; color: string; width: number } | null
  /** 画面内容分布（size×size 网格，0-1），让 Nilo 贴着孩子画的内容下笔 */
  getInkGrid: (size?: number) => number[]
  /** 撤销 Nilo 的最后一笔（可连续点，与孩子的撤销互不影响） */
  undoCompanionStroke: () => boolean
  /** 两套撤销各自还剩多少笔 */
  getUndoCounts: () => { child: number; nilo: number }
}

interface DrawingCanvasProps {
  color: string
  brushSize: number
  brushKind?: BrushKind
  isEraser: boolean
  onStrokeComplete: () => void
  /** 落笔瞬间（用于收起 Nilo 的提示；不影响绘画本身） */
  onStrokeStart?: () => void
  draft: { history: string[] }
  disabled?: boolean
}

export const DrawingCanvas = forwardRef<
  DrawingCanvasHandle,
  DrawingCanvasProps
>(function DrawingCanvas(
  { color, brushSize, brushKind = 'round', isEraser, onStrokeComplete, onStrokeStart, draft, disabled },
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
  // Nilo 添笔的动画可以被撤销/清空/卸载打断
  const companionRef = useRef<{ cancelled: boolean } | null>(null)
  // 两套独立撤销：按"谁画的"记录笔迹操作，撤销时从底图重建
  const opsRef = useRef<CanvasOp[]>([])
  const baseSnapshotRef = useRef<string | null>(null)
  // 记录孩子最近一笔与当前笔迹，供 Nilo 的"看得懂"上下文使用
  const lastStrokeRef = useRef<{ points: { x: number; y: number }[]; color: string; width: number } | null>(null)
  const currentStrokeRef = useRef<{ points: { x: number; y: number }[]; color: string; width: number; eraser: boolean } | null>(null)

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
      const scale = Math.min(canvas.width / image.width, canvas.height / image.height)
      const width = image.width * scale, height = image.height * scale
      context.drawImage(image, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height)
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

  useEffect(() => () => { if (companionRef.current) companionRef.current.cancelled = true }, [])

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
    if (!canvas || restoringRef.current || isDrawingRef.current) return null
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

  function registerOp(op: CanvasOp) {
    if (opsRef.current.length === 0) {
      baseSnapshotRef.current = historyRef.current[historyRef.current.length - 1] ?? ''
    }
    opsRef.current.push(op)
  }

  function paintOp(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement, op: CanvasOp) {
    if (op.type === 'clear') {
      context.clearRect(0, 0, canvas.width, canvas.height)
      return
    }
    if (!op.points.length) return
    const points = op.points.map(point => ({ x: point.x * canvas.width, y: point.y * canvas.height }))
    const painter = createStrokePainter(
      context,
      { kind: 'round', color: op.color, size: op.size, eraser: op.eraser },
      points[0],
    )
    for (let i = 1; i < points.length; i += 1) painter.moveTo(points[i])
  }

  function paintSnapshot(snapshot: string): Promise<void> {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return Promise.resolve()
    context.clearRect(0, 0, canvas.width, canvas.height)
    if (!snapshot) return Promise.resolve()
    return new Promise(resolve => {
      const image = new Image()
      image.onload = () => {
        context.save()
        context.globalCompositeOperation = 'source-over'
        const scale = Math.min(canvas.width / image.width, canvas.height / image.height)
        const width = image.width * scale
        const height = image.height * scale
        context.drawImage(image, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height)
        context.restore()
        resolve()
      }
      image.onerror = () => resolve()
      image.src = snapshot
    })
  }

  /** 撤销某一方的一笔后：从底图 + 剩余笔迹重建画面 */
  async function rebuildFromOps() {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    restoringRef.current = true
    await paintSnapshot(baseSnapshotRef.current ?? '')
    for (const op of opsRef.current) paintOp(context, canvas, op)
    restoringRef.current = false
    if (opsRef.current.length > 0) saveSnapshot()
    const lastChild = [...opsRef.current].reverse().find(op => op.owner === 'child' && op.type === 'stroke' && !op.eraser)
    lastStrokeRef.current = lastChild && lastChild.type === 'stroke'
      ? { points: lastChild.points.map(point => ({ ...point })), color: lastChild.color, width: lastChild.size }
      : null
  }

  function undoOwner(owner: UndoOwner) {
    if (disabled || restoringRef.current || isDrawingRef.current) return false
    const index = opsRef.current.reduce((found, op, i) => (op.owner === owner ? i : found), -1)
    if (index < 0) return false
    if (companionRef.current) companionRef.current.cancelled = true
    opsRef.current.splice(index, 1)
    // 先同步更新草稿历史（撤销后的底图），再异步重绘画布
    const base = baseSnapshotRef.current ?? ''
    historyRef.current = base ? [base] : ['']
    draft.history = [...historyRef.current]
    void rebuildFromOps()
    return true
  }

  useImperativeHandle(forwardedRef, () => ({
    undo() {
      return undoOwner('child')
    },
    clear() {
      if (companionRef.current) companionRef.current.cancelled = true
      if (disabled || isDrawingRef.current) return
      const canvas = canvasRef.current
      const context = canvas?.getContext('2d')
      if (!canvas || !context) return
      restoreVersionRef.current++
      restoringRef.current = false
      registerOp({ owner: 'child', type: 'clear' })
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
    exportSnapshot() {
      if (!canvasRef.current || restoringRef.current || isDrawingRef.current) return null
      return canvasRef.current.toDataURL('image/png')
    },
    undoCompanionStroke() {
      return undoOwner('nilo')
    },
    getUndoCounts() {
      return {
        child: opsRef.current.filter(op => op.owner === 'child').length,
        nilo: opsRef.current.filter(op => op.owner === 'nilo').length,
      }
    },
    getLastStroke() {
      const stroke = lastStrokeRef.current
      return stroke ? { points: stroke.points.map(point => ({ ...point })), color: stroke.color, width: stroke.width } : null
    },
    getInkGrid(size = 4) {
      const canvas = canvasRef.current
      const context = canvas?.getContext('2d')
      if (!canvas || !context) return []
      const cells = Math.max(2, Math.min(8, Math.round(size)))
      const grid = new Array<number>(cells * cells).fill(0)
      try {
        const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height)
        const step = 3
        for (let y = 0; y < height; y += step) {
          const row = Math.min(cells - 1, Math.floor((y / height) * cells))
          for (let x = 0; x < width; x += step) {
            if (data[(y * width + x) * 4 + 3] > 8) {
              grid[row * cells + Math.min(cells - 1, Math.floor((x / width) * cells))] += 1
            }
          }
        }
        const max = Math.max(1, ...grid)
        return grid.map(value => Math.round((value / max) * 100) / 100)
      } catch {
        return grid
      }
    },
    drawCompanionStroke(spec) {
      const canvas = canvasRef.current
      const context = canvas?.getContext('2d')
      if (disabled || restoringRef.current || !canvas || !context || !spec?.points?.length) return Promise.resolve()
      const rect = canvas.getBoundingClientRect()
      const scale = canvas.width / (rect.width || canvas.width)
      // 轻微抖动让 AI 的笔触更像手绘，而不是机械线条
      const points = spec.points.map((point, index) => ({
        x: point.x * canvas.width + Math.sin(index * 12.9898) * canvas.width * 0.0025,
        y: point.y * canvas.height + Math.cos(index * 78.233) * canvas.height * 0.0025,
      }))
      const painter = createStrokePainter(
        context,
        { kind: 'round', color: spec.color, size: Math.max(2, (spec.width || 6) * scale), eraser: false },
        points[0],
      )
      const state = { cancelled: false }
      companionRef.current = state
      return new Promise<void>(resolve => {
        let index = 1
        const step = () => {
          if (state.cancelled || !canvasRef.current) { resolve(); return }
          painter.moveTo(points[index])
          index += 1
          if (index < points.length) {
            window.requestAnimationFrame(step)
          } else {
            if (companionRef.current === state) companionRef.current = null
            registerOp({
              owner: 'nilo',
              type: 'stroke',
              points: points.map(point => ({ x: point.x / canvas.width, y: point.y / canvas.height })),
              color: spec.color,
              size: Math.max(2, (spec.width || 6) * scale),
              eraser: false,
            })
            saveSnapshot()
            resolve()
          }
        }
        window.requestAnimationFrame(step)
      })
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
    onStrokeStart?.()
    pointerRef.current = event.pointerId
    const point = getPoint(event)
    const scale = canvas.width / canvas.getBoundingClientRect().width
    currentStrokeRef.current = {
      points: [{ x: point.x / canvas.width, y: point.y / canvas.height }],
      color,
      width: brushSize,
      eraser: isEraser,
    }

    painterRef.current = createStrokePainter(context, { kind: brushKind, color, size: brushSize * scale, eraser: isEraser }, point)
  }

  function draw(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!isDrawingRef.current || pointerRef.current !== event.pointerId) return
    const point = getPoint(event)
    painterRef.current?.moveTo(point)
    const canvas = canvasRef.current
    const stroke = currentStrokeRef.current
    if (canvas && stroke) {
      const next = { x: point.x / canvas.width, y: point.y / canvas.height }
      const previous = stroke.points[stroke.points.length - 1]
      if (previous && Math.hypot(next.x - previous.x, next.y - previous.y) > 0.008) {
        stroke.points.push(next)
        if (stroke.points.length > 24) stroke.points.splice(1, 1)
      }
    }
  }

  function finishDrawing(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!isDrawingRef.current || pointerRef.current !== event.pointerId) return
    if (event.type === 'pointerup') painterRef.current?.moveTo(getPoint(event))
    isDrawingRef.current = false
    painterRef.current = null
    pointerRef.current = null
    if (canvasRef.current?.hasPointerCapture(event.pointerId)) canvasRef.current.releasePointerCapture(event.pointerId)
    const finished = currentStrokeRef.current
    currentStrokeRef.current = null
    if (finished && finished.points.length > 1 && !finished.eraser) {
      lastStrokeRef.current = { points: [...finished.points], color: finished.color, width: finished.width }
    }
    if (finished) {
      const canvas = canvasRef.current
      const scale = canvas ? canvas.width / (canvas.getBoundingClientRect().width || canvas.width) : 1
      registerOp({
        owner: 'child',
        type: 'stroke',
        points: [...finished.points],
        color: finished.color,
        size: finished.width * scale,
        eraser: finished.eraser,
      })
    }
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
