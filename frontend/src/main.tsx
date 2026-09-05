import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'

import { router } from '@/app/router'
import { AuthProvider } from '@/features/auth/AuthContext'
import { OnboardingOverlay } from '@/features/onboarding/OnboardingOverlay'
import { OnboardingProvider } from '@/features/onboarding/OnboardingContext'
import '@/styles/globals.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <OnboardingProvider>
        <RouterProvider router={router} />
        <OnboardingOverlay />
      </OnboardingProvider>
    </AuthProvider>
  </StrictMode>,
)
