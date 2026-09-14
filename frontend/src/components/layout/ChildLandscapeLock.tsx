import { useEffect } from 'react'

const PHONE_MAX_SHORT_SIDE = 639

type LockableOrientation = ScreenOrientation & {
  lock?: (orientation: 'landscape') => Promise<void>
  unlock?: () => void
}

type FullscreenDocumentElement = HTMLElement & {
  requestFullscreen?: (options?: FullscreenOptions) => Promise<void>
}

function isPhoneScreen() {
  if (typeof window === 'undefined') return false
  return Math.min(window.screen.width, window.screen.height) <= PHONE_MAX_SHORT_SIDE
}

/** 儿童端手机静默请求横屏；平板与网页端不执行方向锁定。 */
export function ChildLandscapeLock() {
  useEffect(() => {
    if (!isPhoneScreen()) return

    const orientation = window.screen.orientation as LockableOrientation | undefined
    if (!orientation?.lock) return

    let active = true
    const lockLandscape = async (enterFullscreen = false) => {
      if (!active) return
      try {
        if (enterFullscreen && !document.fullscreenElement) {
          const root = document.documentElement as FullscreenDocumentElement
          await root.requestFullscreen?.({ navigationUI: 'hide' })
        }
        await orientation.lock?.('landscape')
      } catch {
        // 浏览器可能禁用全屏或方向锁定；保持页面可用，不显示阻断界面。
      }
    }

    const retryAfterInteraction = () => void lockLandscape(true)

    void lockLandscape(false)
    window.addEventListener('pointerdown', retryAfterInteraction, { once: true, capture: true })

    return () => {
      active = false
      window.removeEventListener('pointerdown', retryAfterInteraction, { capture: true })
      orientation.unlock?.()
      if (document.fullscreenElement) void document.exitFullscreen?.()
    }
  }, [])

  return null
}
