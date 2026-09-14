import { useCallback, useEffect, useRef } from 'react'
import { useAuth } from '@/features/auth/AuthContext'
import { useOnboarding, type OnboardingResult, type OnboardingStep } from './OnboardingContext'

const VERSION = 'v2'
export function tourStorageKey(role: string, userId: string, tourId: string) {
  return `luma_onboarding_${VERSION}:${role}:${encodeURIComponent(userId)}:${tourId}`
}
export function readTourStatus(key: string): OnboardingResult | null {
  try {
    const value = localStorage.getItem(key)
    return value === 'completed' || value === 'skipped' ? value : null
  } catch { return null }
}

/** Page-owned tours cannot outlive their page or the signed-in account. */
export function useOnboardingTour(tourId: string, theme: 'parent' | 'child') {
  const { session } = useAuth()
  const { start, cancel, active } = useOnboarding()
  const activeRef = useRef(active)
  useEffect(() => { activeRef.current = active }, [active])
  const guest = !session || session.isGuest
  const key = tourStorageKey(theme, session?.id ?? 'guest', tourId)
  const launch = useCallback((steps: OnboardingStep[], replay = false) => {
    if (activeRef.current && !replay) return
    try {
      if (!replay && (sessionStorage.getItem(key) || (!guest && readTourStatus(key)))) return
      sessionStorage.setItem(key, 'shown')
    } catch { /* Storage may be disabled; the guide still works. */ }
    start(steps, { owner: key, theme, onDismiss: result => {
      try { if (!guest) localStorage.setItem(key, result) } catch { /* Best effort. */ }
    } })
  }, [guest, key, start, theme])
  useEffect(() => () => cancel(key), [cancel, key])
  return launch
}
