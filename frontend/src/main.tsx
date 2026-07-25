import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'

import { router } from '@/app/router'
import { AuthProvider, useAuth } from '@/features/auth/AuthContext'
import '@/styles/globals.css'

function AppWithAuth() {
  const { loading } = useAuth()
  if (loading) return null
  return <RouterProvider router={router} />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <AppWithAuth />
    </AuthProvider>
  </StrictMode>,
)
