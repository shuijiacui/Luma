import { Outlet, useLocation } from 'react-router-dom'

import { appMode } from '@/config/appMode'
import { LandscapeGuard } from '@/components/layout/LandscapeGuard'
import { SafetyDisclaimer } from '@/components/layout/SafetyDisclaimer'
import { LanguageSwitcher } from '@/i18n/LanguageSwitcher'

export function App() {
  const { pathname, search } = useLocation()
  // child App 整包都是儿童视角；portal 下按路径判断
  const childView =
    appMode === 'child' ||
    pathname.startsWith('/child/') ||
    (pathname === '/auth' && new URLSearchParams(search).get('role') === 'child')
  // 家长端已改为手机竖屏布局，不再强制横屏；官网 portal 保持原有行为
  const needsLandscapeGuard = appMode === 'portal' && !childView

  return (
    <>
      <LanguageSwitcher />
      <div className="luma-localized-app">
        <Outlet />
        {!childView && <SafetyDisclaimer />}
      </div>
      {needsLandscapeGuard && <LandscapeGuard />}
    </>
  )
}
