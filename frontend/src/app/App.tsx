import { Outlet, useLocation } from 'react-router-dom'

import { ChildLandscapeLock } from '@/components/layout/ChildLandscapeLock'
import { appMode } from '@/config/appMode'
import { SafetyDisclaimer } from '@/components/layout/SafetyDisclaimer'
import '@/i18n/language.css'

export function App() {
  const { pathname, search } = useLocation()
  const params = new URLSearchParams(search)
  const isChildView =
    appMode === 'child' ||
    pathname.startsWith('/child/') ||
    (pathname === '/auth' && params.get('role') === 'child')
  const isPortalHome = appMode === 'portal' && pathname === '/'

  return (
    <>
      <div className={`luma-localized-app${isPortalHome ? ' luma-page-home' : ''}`}>
        <Outlet />
        {isPortalHome && <SafetyDisclaimer />}
      </div>
      {isChildView && <ChildLandscapeLock />}
    </>
  )
}
