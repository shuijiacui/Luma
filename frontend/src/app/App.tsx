import { Outlet, useLocation } from 'react-router-dom'

import { appMode } from '@/config/appMode'
import { SafetyDisclaimer } from '@/components/layout/SafetyDisclaimer'
import '@/i18n/language.css'

export function App() {
  const { pathname } = useLocation()
  const isPortalHome = appMode === 'portal' && pathname === '/'

  return (
    <>
      <div className={`luma-localized-app${isPortalHome ? ' luma-page-home' : ''}`}>
        <Outlet />
        {isPortalHome && <SafetyDisclaimer />}
      </div>
    </>
  )
}
