import { Outlet, useLocation } from 'react-router-dom'
import { LandscapeGuard } from '@/components/layout/LandscapeGuard'
import { SafetyDisclaimer } from '@/components/layout/SafetyDisclaimer'
import { LanguageSwitcher } from '@/i18n/LanguageSwitcher'

export function App() {
  const { pathname, search } = useLocation()
  const childView = pathname.startsWith('/child/') || (pathname === '/auth' && new URLSearchParams(search).get('role') === 'child')
  return <><LanguageSwitcher /><div className="luma-localized-app"><Outlet />{!childView && <SafetyDisclaimer />}</div>{!childView && <LandscapeGuard />}</>
}
