import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

export interface OnboardingStep {
  /** CSS selector for the element to highlight */
  target: string
  /** Fallback selector used on mobile when target is hidden */
  mobileTarget?: string
  title: string
  body: string
}

interface StartOptions {
  onDismiss?: () => void
}

interface OnboardingContextValue {
  active: boolean
  steps: OnboardingStep[]
  currentIndex: number
  start: (steps: OnboardingStep[], options?: StartOptions) => void
  next: () => void
  skip: () => void
}

const OnboardingContext = createContext<OnboardingContextValue | null>(null)

const STORAGE_KEYS = {
  parent: 'luma_onboarding_parent_done',
  child: 'luma_onboarding_child_done',
} as const

const SESSION_KEYS = {
  parent: 'luma_onboarding_parent_session',
  child: 'luma_onboarding_child_session',
} as const

export type OnboardingRole = keyof typeof STORAGE_KEYS

export function isOnboardingDone(role: OnboardingRole): boolean {
  return localStorage.getItem(STORAGE_KEYS[role]) === '1'
}

export function markOnboardingDone(role: OnboardingRole): void {
  localStorage.setItem(STORAGE_KEYS[role], '1')
}

export function isOnboardingShownThisSession(role: OnboardingRole): boolean {
  return sessionStorage.getItem(SESSION_KEYS[role]) === '1'
}

export function markOnboardingShownThisSession(role: OnboardingRole): void {
  sessionStorage.setItem(SESSION_KEYS[role], '1')
}

export function clearOnboardingSession(): void {
  sessionStorage.removeItem(SESSION_KEYS.parent)
  sessionStorage.removeItem(SESSION_KEYS.child)
}

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState(false)
  const [steps, setSteps] = useState<OnboardingStep[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const onDismissRef = useRef<(() => void) | undefined>(undefined)

  const dismiss = useCallback(() => {
    setActive(false)
    onDismissRef.current?.()
    onDismissRef.current = undefined
  }, [])

  const start = useCallback((nextSteps: OnboardingStep[], options?: StartOptions) => {
    onDismissRef.current = options?.onDismiss
    setSteps(nextSteps)
    setCurrentIndex(0)
    setActive(true)
  }, [])

  const next = useCallback(() => {
    setCurrentIndex((i) => {
      if (i < steps.length - 1) return i + 1
      dismiss()
      return i
    })
  }, [steps.length, dismiss])

  const skip = useCallback(() => {
    dismiss()
  }, [dismiss])

  const value = useMemo(
    () => ({ active, steps, currentIndex, start, next, skip }),
    [active, steps, currentIndex, start, next, skip],
  )

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>
}

export function useOnboarding() {
  const ctx = useContext(OnboardingContext)
  if (!ctx) throw new Error('useOnboarding must be used inside OnboardingProvider')
  return ctx
}
