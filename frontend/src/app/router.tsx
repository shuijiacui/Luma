import { createBrowserRouter, Navigate } from 'react-router-dom'

import { App } from '@/app/App'
import { appMode } from '@/config/appMode'
import { ProtectedRoute } from '@/features/auth/components/ProtectedRoute'
import { ChildDemoPage } from '@/features/auth/pages/ChildDemoPage'
import { ParentDemoPage } from '@/features/auth/pages/ParentDemoPage'
import { UnifiedAuthPage } from '@/features/auth/pages/UnifiedAuthPage'
import { ChildCreatePage } from '@/features/child/pages/ChildCreatePage'
import { HomePage } from '@/features/marketing/pages/HomePage'
import { ArchivePage } from '@/features/parents/pages/ArchivePage'

/** portal：官网首页 + 双端都在同一个网页（兼容原有直接访问） */
const portalChildren = [
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
    children: [
      { path: 'parent/demo', Component: ParentDemoPage },
      { path: 'parent/archive', Component: ArchivePage },
    ],
  },
  {
    element: <ProtectedRoute role="child" />,
    children: [
      { path: 'child/demo', Component: ChildDemoPage },
      { path: 'child/create', Component: ChildCreatePage },
    ],
  },
]

/** parent App：只有家长登录与家长页面 */
const parentChildren = [
  { index: true, element: <HomePage singleEntry /> },
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
    element: <ProtectedRoute role="parent" />,
    children: [
      { path: 'parent/demo', Component: ParentDemoPage },
      { path: 'parent/archive', Component: ArchivePage },
    ],
  },
]

/** child App：只有儿童登录与儿童页面 */
const childChildren = [
  { index: true, element: <HomePage singleEntry /> },
  { path: 'auth', Component: UnifiedAuthPage },
  {
    path: 'child/login',
    element: <Navigate to="/auth?role=child&mode=login" replace />,
  },
  {
    path: 'child/register',
    element: <Navigate to="/auth?role=child&mode=register" replace />,
  },
  {
    element: <ProtectedRoute role="child" />,
    children: [
      { path: 'child/demo', Component: ChildDemoPage },
      { path: 'child/create', Component: ChildCreatePage },
    ],
  },
]

const childrenByMode = {
  portal: portalChildren,
  parent: parentChildren,
  child: childChildren,
} as const

export const router = createBrowserRouter([
  {
    path: '/',
    Component: App,
    children: [...childrenByMode[appMode], { path: '*', element: <Navigate to="/" replace /> }],
  },
])
