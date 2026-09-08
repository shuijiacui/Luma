import { Outlet, useLocation } from 'react-router-dom'

import { appMode } from '@/config/appMode'
import { LandscapeGuard } from '@/components/layout/LandscapeGuard'
import { SafetyDisclaimer } from '@/components/layout/SafetyDisclaimer'
import '@/i18n/language.css'

export function App() {
  const { pathname, search } = useLocation()
  const params = new URLSearchParams(search)
  // child App 整包都是儿童视角；portal 下按路径判断
  const childView =
    appMode === 'child' ||
    pathname.startsWith('/child/') ||
    (pathname === '/auth' && params.get('role') === 'child')
  // 家长端已改为手机竖屏布局，不再强制横屏；官网 portal 保持原有行为
  const needsLandscapeGuard = appMode === 'portal' && !childView
  const isPortalHome = appMode === 'portal' && pathname === '/'

  return (
    <>
      <div className={`luma-localized-app${isPortalHome ? ' luma-page-home' : ''}`}>
        <Outlet />
        {isPortalHome && <SafetyDisclaimer />}
      </div>
      {needsLandscapeGuard && <LandscapeGuard />}
    </>
  )
}
