import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'

import { appMode } from '@/config/appMode'
import { LandscapeGuard } from '@/components/layout/LandscapeGuard'
import { SafetyDisclaimer } from '@/components/layout/SafetyDisclaimer'
import { LanguageSwitcher } from '@/i18n/LanguageSwitcher'

/** 超过该窗口宽度时，桌面浏览器用 iPhone 竖屏框预览；手机/模拟器直接全屏 */
const FRAME_BREAKPOINT = 520

function isWideViewport() {
  return typeof window !== 'undefined' && window.innerWidth > FRAME_BREAKPOINT
}

export function App() {
  const { pathname, search } = useLocation()
  const [wide, setWide] = useState(isWideViewport)

  useEffect(() => {
    const update = () => setWide(isWideViewport())
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  const params = new URLSearchParams(search)
  // child App 整包都是儿童视角；portal 下按路径判断
  const childView =
    appMode === 'child' ||
    pathname.startsWith('/child/') ||
    (pathname === '/auth' && params.get('role') === 'child')
  // 家长端已改为手机竖屏布局，不再强制横屏；官网 portal 保持原有行为
  const needsLandscapeGuard = appMode === 'portal' && !childView

  // 家长端 App：桌面宽窗口下套 iPhone 16 竖屏预览框，让里面始终按手机宽度渲染
  const isParentApp = appMode === 'parent'
  const alreadyFramed = params.get('frame') === '1'
  if (isParentApp && wide && !alreadyFramed) {
    const src = `${pathname}${search}${search ? '&' : '?'}frame=1`
    return (
      <div className="luma-phone-preview">
        <p className="luma-phone-preview-label">家长端 · iPhone 16 竖屏预览（393 × 852）</p>
        <div className="luma-phone-device">
          <iframe src={src} title="家长端竖屏预览" />
        </div>
      </div>
    )
  }

  return (
    <>
      <LanguageSwitcher />
      <div className="luma-localized-app">
        <Outlet />
        {pathname === '/' && !childView && <SafetyDisclaimer />}
      </div>
      {needsLandscapeGuard && <LandscapeGuard />}
    </>
  )
}
