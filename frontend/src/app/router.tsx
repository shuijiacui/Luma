import { createBrowserRouter, Navigate } from 'react-router-dom'

import { App } from '@/app/App'
import { ProtectedRoute } from '@/features/auth/components/ProtectedRoute'
import { ChildDemoPage } from '@/features/auth/pages/ChildDemoPage'
import { ParentDemoPage } from '@/features/auth/pages/ParentDemoPage'
import { UnifiedAuthPage } from '@/features/auth/pages/UnifiedAuthPage'
import { ChildCreatePage } from '@/features/child/pages/ChildCreatePage'
import { HomePage } from '@/features/marketing/pages/HomePage'

export const router = createBrowserRouter([
  {
    path: '/',
    Component: App,
    children: [
      { index: true, Component: HomePage },
      { path: 'auth', Component: UnifiedAuthPage },
      {
        path: 'parent/login',
        element: <Navigate to="/auth?role=parent&mode=login" replace />,
      },
      {
        path: 'parent/register',
        element: <Navigate to="/auth?role=parent&mode=register" replace />,
      },
      {
        path: 'child/login',
        element: <Navigate to="/auth?role=child&mode=login" replace />,
      },
      {
        path: 'child/register',
        element: <Navigate to="/auth?role=child&mode=register" replace />,
      },
      {
        element: <ProtectedRoute role="parent" />,
        children: [{ path: 'parent/demo', Component: ParentDemoPage }],
      },
      {
        element: <ProtectedRoute role="child" />,
        children: [
          { path: 'child/demo', Component: ChildDemoPage },
          { path: 'child/create', Component: ChildCreatePage },
        ],
      },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
])
