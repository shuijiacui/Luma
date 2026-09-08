import { lt, t, useLocale } from '@/i18n'
import { useEffect, useState } from 'react'

function isPortraitMobile(): boolean {
  return window.innerWidth < 640 && window.innerHeight > window.innerWidth
}

export function LandscapeGuard() {
  useLocale()
  const [show, setShow] = useState(isPortraitMobile)

  useEffect(() => {
    const update = () => setShow(isPortraitMobile())
    window.addEventListener('resize', update)
    window.addEventListener('orientationchange', update)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('orientationchange', update)
    }
  }, [])

  if (!show) return null

  return (
    <div className="fixed inset-0 z-[99999] flex flex-col items-center justify-center gap-6 bg-luma-teal-900 px-8 text-center">
      <div className="text-6xl" style={{ animation: 'spin-once 1.2s ease-in-out forwards' }}>
        📱
      </div>
      <h2 className="font-display text-2xl font-bold text-white">{t("请旋转屏幕")}</h2>
      <p className="text-sm leading-relaxed text-luma-teal-200">
        {t("横屏体验更好，请将手机旋转为横屏后继续。")}</p>
      <style>{lt(`
        @keyframes spin-once {
          0%   { transform: rotate(0deg); }
          60%  { transform: rotate(90deg); }
          100% { transform: rotate(90deg); }
        }
      `)}</style>
    </div>
  )
}
