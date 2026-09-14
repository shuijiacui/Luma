import { t, useLocale } from '@/i18n'
import { useReducedMotion } from 'framer-motion'
import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { niloCompanion } from '@/assets/avatars'
import { useOnboarding } from './OnboardingContext'
import { findVisibleTarget, intersect, placeCard, visibleRect, type Rect, type Viewport } from './geometry'
import './onboarding.css'

const FOCUSABLE = 'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]'
function viewport(): Viewport {
  const v = window.visualViewport
  const root = document.querySelector('.luma-tour')
  const style = root ? getComputedStyle(root) : null
  const top = parseFloat(style?.paddingTop ?? '') || 0, left = parseFloat(style?.paddingLeft ?? '') || 0
  const bottom = parseFloat(style?.paddingBottom ?? '') || 0, right = parseFloat(style?.paddingRight ?? '') || 0
  return { left: (v?.offsetLeft ?? 0) + left, top: (v?.offsetTop ?? 0) + top, width: (v?.width ?? window.innerWidth) - left - right, height: (v?.height ?? window.innerHeight) - top - bottom }
}
interface Layout { rect: Rect; viewport: Viewport; placement: ReturnType<typeof placeCard> }

export function OnboardingOverlay() {
  const locale = useLocale()
  const reduceMotion = useReducedMotion()
  const { active, steps, currentIndex, theme, next, previous, skip, completeInteraction } = useOnboarding()
  const step = steps[currentIndex]
  const id = useId()
  const card = useRef<HTMLDivElement>(null)
  const waiting = useRef<HTMLDivElement>(null)
  const target = useRef<HTMLElement | null>(null)
  const [layout, setLayout] = useState<{ step: typeof step; value: Layout } | null>(null)
  const current = layout && layout.step === step ? layout.value : null

  useLayoutEffect(() => {
    if (!active || !step) return
    let disposed = false, ready = false, frame = 0
    let missingSince = Date.now()
    let scrolled: HTMLElement | null = null
    target.current = null
    const measure = () => {
      if (disposed || !ready) return
      const element = findVisibleTarget(step.target)
      const v = viewport()
      if (element && element !== scrolled) {
        // Instant scroll avoids measuring an intermediate smooth-scroll frame.
        element.scrollIntoView?.({ behavior: 'instant', block: 'nearest', inline: 'nearest' })
        scrolled = element
      }
      const rect = element && visibleRect(element, v, step.focusArea)
      target.current = rect ? element : null
      if (!rect) {
        setLayout(old => old === null ? old : null)
        if (Date.now() - missingSince >= 3000) next(true)
        return
      }
      missingSince = Date.now()
      const size = { width: Math.min(theme === 'child' ? 320 : 336, v.width - 32), height: (card.current?.firstElementChild?.scrollHeight || 230) + 2 }
      const placement = placeCard(rect, size, v)
      const value = { rect, viewport: v, placement }
      setLayout(old => old?.step === step && JSON.stringify(old.value) === JSON.stringify(value) ? old : { step, value })
    }
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure) }
    const observer = new ResizeObserver(schedule)
    observer.observe(document.body)
    if (card.current) observer.observe(card.current)
    // Also catches delayed data, responsive swaps and transform-based entrance animations.
    const timer = window.setInterval(measure, 100)
    const preparationTimeout = window.setTimeout(() => { if (!ready && !disposed) next(true) }, 3000)
    Promise.resolve().then(() => { if (!disposed) return step.prepare?.() }).then(() => {
      if (disposed) return
      ready = true
      window.clearTimeout(preparationTimeout)
      measure()
    }).catch(() => { if (!disposed) next(true) })
    window.addEventListener('resize', schedule)
    window.addEventListener('scroll', schedule, true)
    window.visualViewport?.addEventListener('resize', schedule)
    window.visualViewport?.addEventListener('scroll', schedule)
    return () => {
      disposed = true
      observer.disconnect()
      window.clearInterval(timer)
      window.clearTimeout(preparationTimeout)
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', schedule)
      window.removeEventListener('scroll', schedule, true)
      window.visualViewport?.removeEventListener('resize', schedule)
      window.visualViewport?.removeEventListener('scroll', schedule)
    }
  }, [active, step, theme, locale, next])

  useEffect(() => {
    if (!active) return
    const original = document.activeElement as HTMLElement | null
    return () => { if (original?.isConnected) original.focus({ preventScroll: true }) }
  }, [active])

  const positioned = !!current
  useEffect(() => {
    if (!active || !step) return
    const panel = positioned ? card.current : waiting.current
    panel?.focus({ preventScroll: true })
    function allowed() {
      const controls = Array.from(panel?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])
      if (step.interaction && target.current) {
        if (target.current.matches(FOCUSABLE)) controls.unshift(target.current)
        controls.unshift(...target.current.querySelectorAll<HTMLElement>(FOCUSABLE))
      }
      return controls.filter(el => !!el.getClientRects().length)
    }
    function keydown(event: KeyboardEvent) {
      if (event.key === 'Escape') { event.preventDefault(); skip() }
      if (event.key !== 'Tab') return
      const controls = allowed()
      if (!controls.length) { event.preventDefault(); panel?.focus(); return }
      const index = controls.indexOf(document.activeElement as HTMLElement)
      event.preventDefault()
      // Allow the card's own scroller to reveal a focused control on short screens.
      controls[(index + (event.shiftKey ? -1 : 1) + controls.length) % controls.length].focus()
    }
    function focusin(event: FocusEvent) {
      const element = event.target as Node
      if (!panel?.contains(element) && !(step.interaction && target.current?.contains(element))) panel?.focus({ preventScroll: true })
    }
    let clicked = false
    function click(event: MouseEvent) {
      const button = event.target instanceof Element ? event.target.closest('button') : null
      if (!clicked && button && !button.disabled && step.interaction === 'click' && target.current?.contains(button)) {
        clicked = true
        // Let the real button's React handler run before changing the step.
        queueMicrotask(() => completeInteraction(step.id))
      }
    }
    document.addEventListener('keydown', keydown)
    document.addEventListener('focusin', focusin)
    document.addEventListener('click', click)
    return () => {
      document.removeEventListener('keydown', keydown)
      document.removeEventListener('focusin', focusin)
      document.removeEventListener('click', click)
    }
  }, [active, step, positioned, completeInteraction, skip])

  if (!active || !step) return null
  const v = current?.viewport ?? viewport()
  const rect = current?.rect
  const highlight = rect && intersect({ left: rect.left - 6, top: rect.top - 6, width: rect.width + 12, height: rect.height + 12 }, v)
  const placement = current?.placement
  const blocker = (key: string, bounds: Rect) => <div key={key} className="luma-tour-blocker" style={bounds} aria-hidden="true" />
  const hole = step.interaction && rect
  return createPortal(
    <div className={`luma-tour luma-tour-${theme}${reduceMotion ? ' luma-tour-still' : ''}`}>
      <svg className="luma-tour-shade" aria-hidden="true">
        <defs><mask id={`${id}-mask`}><rect width="100%" height="100%" fill="white" />{highlight && <rect x={highlight.left} y={highlight.top} width={highlight.width} height={highlight.height} rx="16" fill="black" />}</mask></defs>
        <rect width="100%" height="100%" fill="rgba(39, 53, 44, .36)" mask={`url(#${id}-mask)`} />
      </svg>
      {hole ? <>
        {blocker('top', { left: v.left, top: v.top, width: v.width, height: Math.max(0, hole.top - v.top) })}
        {blocker('bottom', { left: v.left, top: hole.top + hole.height, width: v.width, height: Math.max(0, v.top + v.height - hole.top - hole.height) })}
        {blocker('left', { left: v.left, top: hole.top, width: Math.max(0, hole.left - v.left), height: hole.height })}
        {blocker('right', { left: hole.left + hole.width, top: hole.top, width: Math.max(0, v.left + v.width - hole.left - hole.width), height: hole.height })}
      </> : blocker('all', v)}
      {highlight && <div className="luma-tour-ring" style={highlight} />}
      <div ref={card} tabIndex={-1} role={current ? 'dialog' : undefined} aria-modal={current ? true : undefined} aria-labelledby={`${id}-title`} aria-describedby={`${id}-body`}
        className="luma-tour-card" data-side={placement?.side}
        style={placement ? { left: placement.left, top: placement.top, width: placement.width, maxHeight: placement.maxHeight, '--tour-arrow': `${placement.arrow}px` } as CSSProperties : { visibility: 'hidden', width: Math.min(theme === 'child' ? 320 : 336, v.width - 32) }}>
        <div className="luma-tour-card-scroll">
          <div className="luma-tour-topline"><span>{theme === 'child' ? 'Nilo' : 'Luma'} · {t('新手指引')}</span><button type="button" onClick={skip}>{t('以后再看')}</button></div>
          <div className="luma-tour-message">
            {theme === 'child' && <img src={niloCompanion} alt="" className="luma-tour-nilo" />}
            <div><h2 id={`${id}-title`}>{t(step.title)}</h2><p id={`${id}-body`}>{t(step.body)}</p></div>
          </div>
          {step.interaction && <p className="luma-tour-hint">{t(step.interaction === 'stroke' ? '在亮起的地方画一笔，也可以点下一步。' : '试试亮起的按钮，也可以点下一步。')}</p>}
          <div className="luma-tour-footer"><span className="luma-tour-progress" aria-label={t(`第 ${currentIndex + 1} 步，共 ${steps.length} 步`)}>{currentIndex + 1}<span> / {steps.length}</span></span><div>
            {currentIndex > 0 && <button type="button" className="luma-tour-previous" onClick={previous}>{t('上一步')}</button>}
            <button type="button" className="luma-tour-next" onClick={() => next()}>{t(currentIndex === steps.length - 1 ? '知道啦' : '下一步')}<span aria-hidden="true"> →</span></button>
          </div></div>
        </div>
      </div>
      {!current && <div ref={waiting} tabIndex={-1} className="luma-tour-wait" role="dialog" aria-modal="true" aria-label={t('正在找到这个位置…')}>{t('正在找到这个位置…')}<button type="button" onClick={skip}>{t('以后再看')}</button></div>}
    </div>, document.body,
  )
}
