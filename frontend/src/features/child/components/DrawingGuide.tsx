import { useEffect, useRef } from 'react'

import {
  WARMUP_SHAPES,
  type WarmupShape,
  type WarmupShapeId,
} from './warmupShapes'

function getShape(shapeId: WarmupShapeId): WarmupShape {
  return (
    WARMUP_SHAPES.find((shape) => shape.id === shapeId) ?? WARMUP_SHAPES[0]
  )
}

interface DrawingGuideProps {
  /** null 表示已清除引导图形（自由画板） */
  shapeId: WarmupShapeId | null
}

function drawGuide(canvas: HTMLCanvasElement, shapeId: WarmupShapeId | null) {
  const context = canvas.getContext('2d')
  if (!context) return
  context.clearRect(0, 0, canvas.width, canvas.height)
  if (!shapeId) return
  const shape = getShape(shapeId)
  context.save()
  context.strokeStyle = '#8fb4ab'
  context.lineWidth = Math.max(2, Math.round(canvas.width * 0.006))
  context.setLineDash([
    Math.max(8, Math.round(canvas.width * 0.024)),
    Math.max(10, Math.round(canvas.width * 0.03)),
  ])
  context.lineCap = 'round'
  context.lineJoin = 'round'
  shape.draw(context, canvas.width, canvas.height)
  context.restore()
}

/**
 * 叠加在大画板上的虚线引导图形层（半圆/圆/星星…）。
 * 只是视觉提示，pointer-events-none，不阻挡画画，也不会进入分析导出的 PNG。
 */
export function DrawingGuide({ shapeId }: DrawingGuideProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const shapeIdRef = useRef<WarmupShapeId | null>(shapeId)
  shapeIdRef.current = shapeId

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const parent = canvas.parentElement
    if (!parent) return

    const syncSize = () => {
      const rect = parent.getBoundingClientRect()
      if (rect.width < 2 || rect.height < 2) return
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
      const nextWidth = Math.round(rect.width * pixelRatio)
      const nextHeight = Math.round(rect.height * pixelRatio)
      if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
        canvas.width = nextWidth
        canvas.height = nextHeight
      }
      drawGuide(canvas, shapeIdRef.current)
    }

    syncSize()
    const observer = new ResizeObserver(syncSize)
    observer.observe(parent)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    drawGuide(canvas, shapeId)
  }, [shapeId])

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 h-full w-full"
      aria-hidden="true"
    />
  )
}

