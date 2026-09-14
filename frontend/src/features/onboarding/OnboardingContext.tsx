import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'

export interface OnboardingStep {
  id: string
  target: string
  title: string
  body: string
  prepare?: () => void | Promise<void>
  interaction?: 'click' | 'stroke'
  /** Small drawing area, expressed as fractions of the target's size. */
  focusArea?: { x: number; y: number; width: number; height: number }
}
export type OnboardingResult = 'completed' | 'skipped'
interface StartOptions {
  owner?: string
  theme?: 'parent' | 'child'
  onDismiss?: (result: OnboardingResult) => void
}
interface OnboardingContextValue {
  active: boolean
  steps: OnboardingStep[]
  currentIndex: number
  theme: 'parent' | 'child'
  start: (steps: OnboardingStep[], options?: StartOptions) => void
  next: (unavailable?: boolean) => void
  previous: () => void
  skip: () => void
  cancel: (owner: string) => void
  completeInteraction: (id: string) => void
}
const OnboardingContext = createContext<OnboardingContextValue | null>(null)

/** Kept for logout; new records are scoped by account and version. */
export function clearOnboardingSession(): void {
  for (const key of Object.keys(sessionStorage)) {
    if (key.startsWith('luma_onboarding_')) sessionStorage.removeItem(key)
  }
}

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [tour, setTour] = useState<{ steps: OnboardingStep[]; index: number; theme: 'parent' | 'child' } | null>(null)
  const optionsRef = useRef<StartOptions>({})
  const tourRef = useRef(tour)
  const missedRef = useRef(false)
  const dismiss = useCallback((result?: OnboardingResult) => {
    const options = optionsRef.current
    optionsRef.current = {}
    tourRef.current = null
    setTour(null)
    if (result) options.onDismiss?.(result)
  }, [])
  const start = useCallback((steps: OnboardingStep[], options: StartOptions = {}) => {
    if (!steps.length) return
    optionsRef.current = options
    missedRef.current = false
    const value = { steps, index: 0, theme: options.theme ?? 'parent' }
    tourRef.current = value
    setTour(value)
  }, [])
  const next = useCallback((unavailable = false) => {
    const current = tourRef.current
    if (!current) return
    missedRef.current ||= unavailable
    if (current.index === current.steps.length - 1) dismiss(missedRef.current ? 'skipped' : 'completed')
    else {
      const value = { ...current, index: current.index + 1 }
      tourRef.current = value
      setTour(value)
    }
  }, [dismiss])
  const previous = useCallback(() => {
    const current = tourRef.current
    if (!current || current.index === 0) return
    const value = { ...current, index: current.index - 1 }
    tourRef.current = value
    setTour(value)
  }, [])
  const skip = useCallback(() => dismiss('skipped'), [dismiss])
  const cancel = useCallback((owner: string) => {
    if (optionsRef.current.owner === owner) dismiss()
  }, [dismiss])
  const completeInteraction = useCallback((id: string) => {
    const current = tourRef.current
    if (current?.steps[current.index]?.id === id) next()
  }, [next])
  const value = useMemo(() => ({
    active: !!tour, steps: tour?.steps ?? [], currentIndex: tour?.index ?? 0,
    theme: tour?.theme ?? 'parent', start, next, previous, skip, cancel, completeInteraction,
  }), [tour, start, next, previous, skip, cancel, completeInteraction])
  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>
}
export function useOnboarding() {
  const context = useContext(OnboardingContext)
  if (!context) throw new Error('useOnboarding must be used inside OnboardingProvider')
  return context
}
