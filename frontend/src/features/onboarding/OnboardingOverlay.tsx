import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'

import { useOnboarding } from './OnboardingContext'

interface Rect {
  top: number
  left: number
  width: number
  height: number
}

const PADDING = 8

function getTargetRect(selector: string): Rect | null {
  const el = document.querySelector(selector)
  if (!el) return null
  const r = el.getBoundingClientRect()
  return {
    top: r.top - PADDING,
    left: r.left - PADDING,
    width: r.width + PADDING * 2,
    height: r.height + PADDING * 2,
  }
}

export function OnboardingOverlay() {
  const { active, steps, currentIndex, next, skip } = useOnboarding()
  const step = steps[currentIndex]
  const isLast = currentIndex === steps.length - 1

  const [rect, setRect] = useState<Rect | null>(null)
  const rafRef = useRef<number>(0)

  useLayoutEffect(() => {
    if (!active || !step) return
    const measure = () => {
      setRect(getTargetRect(step.target))
    }
    measure()
    // Re-measure on resize / scroll in case layout shifts
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
      cancelAnimationFrame(rafRef.current)
    }
  }, [active, step])

  // Scroll target into view when step changes
  useEffect(() => {
    if (!active || !step) return
    const el = document.querySelector(step.target)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      // Re-measure after scroll settles
      rafRef.current = requestAnimationFrame(() => {
        setRect(getTargetRect(step.target))
      })
    }
  }, [active, step])

  if (!active || !step) return null

  // Determine bubble position: below target if top half of screen, else above
  const vp = window.innerHeight
  const BUBBLE_H = 220 // generous estimate to ensure button stays in viewport
  const bubbleBelow = rect ? rect.top + rect.height / 2 < vp / 2 : true
  const rawBubbleTop = rect
    ? bubbleBelow
      ? rect.top + rect.height + 16
      : rect.top - BUBBLE_H - 16
    : (vp - BUBBLE_H) / 2
  const bubbleTop = Math.max(16, Math.min(rawBubbleTop, vp - BUBBLE_H - 16))
  const bubbleLeft = rect ? Math.max(16, Math.min(rect.left, window.innerWidth - 332)) : 16

  return (
    <div className="pointer-events-none fixed inset-0 z-[9999]">
      {/* Spotlight overlay using clip-path or box-shadow cutout */}
      {rect ? (
        <svg
          className="absolute inset-0 h-full w-full"
          style={{ pointerEvents: 'auto', cursor: 'default' }}
          onClick={skip}
        >
          <defs>
            <mask id="spotlight-mask">
              <rect width="100%" height="100%" fill="white" />
              <rect
                x={rect.left}
                y={rect.top}
                width={rect.width}
                height={rect.height}
                rx={12}
                fill="black"
              />
            </mask>
          </defs>
          <rect
            width="100%"
            height="100%"
            fill="rgba(0,0,0,0.55)"
            mask="url(#spotlight-mask)"
          />
        </svg>
      ) : (
        <div
          className="absolute inset-0 bg-black/55"
          style={{ pointerEvents: 'auto' }}
          onClick={skip}
        />
      )}

      {/* Highlight ring around target */}
      {rect && (
        <motion.div
          className="pointer-events-none absolute rounded-xl ring-2 ring-white/80"
          animate={{
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
          }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        />
      )}

      {/* Bubble */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentIndex}
          className="pointer-events-auto absolute w-80 rounded-2xl border border-white/60 bg-white p-5 shadow-luma-md"
          style={{ top: bubbleTop, left: bubbleLeft }}
          initial={{ opacity: 0, y: bubbleBelow ? -8 : 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: bubbleBelow ? -8 : 8 }}
          transition={{ duration: 0.2 }}
        >
          {/* Step counter */}
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-semibold text-luma-muted">
              {currentIndex + 1} / {steps.length}
            </span>
            <button
              type="button"
              onClick={skip}
              className="text-xs text-luma-muted underline-offset-2 hover:text-luma-teal-700 hover:underline"
            >
              跳过引导
            </button>
          </div>

          <h3 className="text-base font-bold text-luma-teal-900">{step.title}</h3>
          <p className="mt-2 text-sm leading-relaxed text-luma-muted">{step.body}</p>

          <div className="mt-4 flex items-center justify-between gap-3">
            {/* Dot indicators */}
            <div className="flex gap-1">
              {steps.map((_, i) => (
                <span
                  key={i}
                  className={
                    i === currentIndex
                      ? 'size-1.5 rounded-full bg-luma-teal-500'
                      : 'size-1.5 rounded-full bg-luma-ivory-200'
                  }
                />
              ))}
            </div>

            <button
              type="button"
              onClick={next}
              className="rounded-full bg-luma-teal-500 px-4 py-1.5 text-sm font-bold text-white transition hover:bg-luma-teal-600 active:scale-95"
            >
              {isLast ? '完成' : '下一步'}
            </button>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
