import { Outlet, useLocation } from 'react-router-dom'
import { LandscapeGuard } from '@/components/layout/LandscapeGuard'

export function App() {
  const { pathname, search } = useLocation()
  const childView = pathname.startsWith('/child/') || (pathname === '/auth' && new URLSearchParams(search).get('role') === 'child')
  return <><Outlet />{!childView && <LandscapeGuard />}</>
}
