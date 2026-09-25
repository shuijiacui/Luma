import { useLayoutEffect, useRef, useState, type ReactNode, type Ref } from 'react'
import type { CanvasDocument } from '../canvasDocument'
import { documentAspect, fitDrawingSurface } from '../drawingSurfaceGeometry'

export interface DrawingSurfaceProps {
  children: ReactNode
  surfaceRef: Ref<HTMLDivElement>
  document?: CanvasDocument
  guideAspect?: number
  onReady?: () => void
}

export function DrawingSurface({ children, surfaceRef, document, guideAspect, onReady }: DrawingSurfaceProps) {
  const outerRef = useRef<HTMLDivElement>(null)
  const aspect = useRef<number | null>(documentAspect(document))
  const latestDocument = useRef(document)
  latestDocument.current = document
  const latestGuideAspect = useRef(guideAspect)
  latestGuideAspect.current = guideAspect
  const measureRef = useRef<() => void>(() => {})
  const readyRef = useRef(onReady)
  readyRef.current = onReady
  const announced = useRef(false)
  const [size, setSize] = useState({ width: 0, height: 0 })
  useLayoutEffect(() => {
    const frame = outerRef.current
    if (!frame) return
    function measure() {
      const rect = frame!.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return
      // Empty paper may fill a changing workspace. Once ink exists, keep its frame
      // so opening the tools or switching screens cannot distort earlier marks.
      aspect.current ??= documentAspect(latestDocument.current) ?? latestGuideAspect.current ?? null
      if (aspect.current === null && latestDocument.current?.baseImage) aspect.current = rect.width / rect.height
      const next = fitDrawingSurface(rect.width, rect.height, aspect.current ?? rect.width / rect.height)
      setSize(previous => Math.abs(previous.width - next.width) < .01 && Math.abs(previous.height - next.height) < .01 ? previous : next)
    }
    measureRef.current = measure
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(frame)
    return () => observer.disconnect()
  }, [])
  useLayoutEffect(() => { measureRef.current() }, [document, guideAspect])
  useLayoutEffect(() => {
    if (!size.width || !size.height || announced.current) return
    announced.current = true
    readyRef.current?.()
  }, [size.width, size.height])
  return <div ref={outerRef} className="relative flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden" data-drawing-surface-frame>
    <div ref={surfaceRef} className="relative shrink-0 overflow-hidden rounded-luma-lg bg-white shadow-luma-md" data-drawing-surface
      style={{ width: size.width || '100%', height: size.height || '100%' }}>
      {children}
    </div>
  </div>
}
