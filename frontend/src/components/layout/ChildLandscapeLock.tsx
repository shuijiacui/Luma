import { useEffect } from 'react'

const PHONE_MAX_SHORT_SIDE = 639

type LockableOrientation = ScreenOrientation & {
  lock?: (orientation: 'landscape') => Promise<void>
  unlock?: () => void
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
    const lockLandscape = async () => {
      if (!active) return
      try {
        await orientation.lock?.('landscape')
      } catch {
        // 普通浏览器可能要求一次用户操作；首次点击时会静默重试。
      }
    }

    void lockLandscape()
    window.addEventListener('pointerdown', lockLandscape, { once: true })

    return () => {
      active = false
      window.removeEventListener('pointerdown', lockLandscape)
      orientation.unlock?.()
    }
  }, [])

  return null
}
