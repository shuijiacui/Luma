import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

import {
  loginChildApi,
  loginParentApi,
  logoutApi,
  registerChildApi,
  registerParentApi,
} from '@/lib/api/authApi'
import {
  DEMO_FAMILY_ID,
  getStoredSession,
  removeSession,
  saveSession,
} from './storage'
import type { AuthResult, AuthSession, UserRole } from './types'

interface ParentRegistration {
  name: string
  email: string
  password: string
}

interface ChildRegistration {
  nickname: string
  creationCode: string
  inviteCode: string
}

interface AuthContextValue {
  session: AuthSession | null
  registerParent: (details: ParentRegistration) => Promise<AuthResult>
  loginParent: (email: string, password: string) => Promise<AuthResult>
  registerChild: (details: ChildRegistration) => Promise<AuthResult>
  loginChild: (nickname: string, creationCode: string) => Promise<AuthResult>
  continueAsGuest: (role: UserRole) => void
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

async function toAuthResult(
  call: () => Promise<{ token: string; refreshToken: string; session: AuthSession }>,
  fallback: string,
): Promise<{ session?: AuthSession; result: AuthResult }> {
  try {
    const { token, refreshToken, session } = await call()
    return { session: { ...session, token, refreshToken }, result: { ok: true } }
  } catch (error) {
    return {
      result: { ok: false, message: error instanceof Error ? error.message : fallback },
    }
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(getStoredSession)

  const commitSession = useCallback((nextSession: AuthSession) => {
    saveSession(nextSession)
    setSession(nextSession)
  }, [])

  const registerParent = useCallback(
    async ({ name, email, password }: ParentRegistration): Promise<AuthResult> => {
      const { session: next, result } = await toAuthResult(
        () => registerParentApi({ name: name.trim(), email: email.trim(), password }),
        '注册失败，请稍后再试。',
      )
      if (next) commitSession(next)
      return result
    },
    [commitSession],
  )

  const loginParent = useCallback(
    async (email: string, password: string): Promise<AuthResult> => {
      const { session: next, result } = await toAuthResult(
        () => loginParentApi({ email: email.trim(), password }),
        '登录失败，请稍后再试。',
      )
      if (next) commitSession(next)
      return result
    },
    [commitSession],
  )

  const registerChild = useCallback(
    async ({ nickname, creationCode, inviteCode }: ChildRegistration): Promise<AuthResult> => {
      const { session: next, result } = await toAuthResult(
        () => registerChildApi({ nickname: nickname.trim(), creationCode, inviteCode }),
        '还差一点，再试试吧。',
      )
      if (next) commitSession(next)
      return result
    },
    [commitSession],
  )

  const loginChild = useCallback(
    async (nickname: string, creationCode: string): Promise<AuthResult> => {
      const { session: next, result } = await toAuthResult(
        () => loginChildApi({ nickname: nickname.trim(), creationCode }),
        '还差一点，再试试吧。',
      )
      if (next) commitSession(next)
      return result
    },
    [commitSession],
  )

  const continueAsGuest = useCallback(
    (role: UserRole) => {
      commitSession({
        id: `guest-${role}`,
        role,
        familyId: DEMO_FAMILY_ID,
        displayName: role === 'parent' ? '体验家长' : '小小创作者',
        isGuest: true,
      })
    },
    [commitSession],
  )

  const logout = useCallback(() => {
    if (session?.token) logoutApi(session.token).catch(() => {})
    removeSession()
    setSession(null)
  }, [session])

  const value = useMemo(
    () => ({
      session,
      registerParent,
      loginParent,
      registerChild,
      loginChild,
      continueAsGuest,
      logout,
    }),
    [
      session,
      registerParent,
      loginParent,
      registerChild,
      loginChild,
      continueAsGuest,
      logout,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// The provider and its colocated hook intentionally share this module.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}
