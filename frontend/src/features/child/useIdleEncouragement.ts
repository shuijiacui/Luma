import { useCallback, useEffect, useRef, useState } from 'react'

const idlePrompts = [
  '在想接下来画什么吗？慢慢想，我陪着你～',
  '不知道画什么也没关系，可以先试试喜欢的颜色。',
  '休息一下也很好，想画的时候再继续吧。',
  '要不要试着画一个小圆圈，看看它会变成什么？',
] as const

/** One gentle reminder per drawing pause, after a full minute of visible, quiet time. */
export function useIdleEncouragement(enabled: boolean) {
  const [message, setMessage] = useState<string | null>(null)
  const [activity, setActivity] = useState(0)
  const reminded = useRef(false)
  const resetIdle = useCallback(() => {
    reminded.current = false
    setMessage(null)
    setActivity(value => value + 1)
  }, [])

  useEffect(() => {
    if (!enabled) return
    let timer: ReturnType<typeof setTimeout> | undefined
    function schedule() {
      clearTimeout(timer)
      if (document.visibilityState !== 'visible' || reminded.current) return
      timer = setTimeout(() => {
        if (document.visibilityState !== 'visible' || reminded.current) return
        reminded.current = true
        setMessage(idlePrompts[Math.floor(Math.random() * idlePrompts.length)])
      }, 60_000)
    }
    schedule()
    document.addEventListener('visibilitychange', schedule)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', schedule)
    }
  }, [enabled, activity])

  return { message, resetIdle }
}
