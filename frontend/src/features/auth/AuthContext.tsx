import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

import {
  DEMO_FAMILY_ID,
  findChild,
  findFamilyByInviteCode,
  findParent,
  getFamilies,
  getStoredSession,
  removeSession,
  saveAccount,
  saveFamily,
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
  registerParent: (details: ParentRegistration) => AuthResult
  loginParent: (email: string, password: string) => AuthResult
  registerChild: (details: ChildRegistration) => AuthResult
  loginChild: (nickname: string, creationCode: string) => AuthResult
  continueAsGuest: (role: UserRole) => void
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

function createId() {
  return crypto.randomUUID()
}

function createInviteCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const existingCodes = new Set(
    getFamilies().map((family) => family.inviteCode),
  )

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const values = crypto.getRandomValues(new Uint8Array(6))
    const code = Array.from(
      values,
      (value) => alphabet[value % alphabet.length],
    ).join('')
    if (!existingCodes.has(code)) return code
  }

  throw new Error('Unable to create a unique family invite code')
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(getStoredSession)

  const commitSession = useCallback((nextSession: AuthSession) => {
    saveSession(nextSession)
    setSession(nextSession)
  }, [])

  const registerParent = useCallback(
    ({ name, email, password }: ParentRegistration): AuthResult => {
      if (findParent(email)) {
        return { ok: false, message: '这个邮箱已经注册过了，请直接登录。' }
      }

      const id = createId()
      const familyId = createId()
      const inviteCode = createInviteCode()
      saveFamily({
        id: familyId,
        inviteCode,
        createdAt: new Date().toISOString(),
      })
      saveAccount({
        id,
        role: 'parent',
        familyId,
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password,
        createdAt: new Date().toISOString(),
      })
      commitSession({
        id,
        role: 'parent',
        familyId,
        displayName: name.trim(),
        isGuest: false,
      })
      return { ok: true }
    },
    [commitSession],
  )

  const loginParent = useCallback(
    (email: string, password: string): AuthResult => {
      const account = findParent(email.trim())
      if (!account || account.password !== password) {
        return { ok: false, message: '邮箱或密码不正确，请再试一次。' }
      }
      commitSession({
        id: account.id,
        role: 'parent',
        familyId: account.familyId,
        displayName: account.name,
        isGuest: false,
      })
      return { ok: true }
    },
    [commitSession],
  )

  const registerChild = useCallback(
    ({
      nickname,
      creationCode,
      inviteCode,
    }: ChildRegistration): AuthResult => {
      if (findChild(nickname)) {
        return { ok: false, message: '这个昵称已经被使用，换一个试试吧。' }
      }

      const family = findFamilyByInviteCode(inviteCode)
      if (!family || family.id === DEMO_FAMILY_ID) {
        return {
          ok: false,
          message: '没有找到这个家庭邀请码，请家长再确认一次。',
        }
      }

      const id = createId()
      saveAccount({
        id,
        role: 'child',
        familyId: family.id,
        nickname: nickname.trim(),
        creationCode,
        createdAt: new Date().toISOString(),
      })
      commitSession({
        id,
        role: 'child',
        familyId: family.id,
        displayName: nickname.trim(),
        isGuest: false,
      })
      return { ok: true }
    },
    [commitSession],
  )

  const loginChild = useCallback(
    (nickname: string, creationCode: string): AuthResult => {
      const account = findChild(nickname.trim())
      if (!account || account.creationCode !== creationCode) {
        return { ok: false, message: '昵称或创作码不对，再想一想吧。' }
      }
      commitSession({
        id: account.id,
        role: 'child',
        familyId: account.familyId,
        displayName: account.nickname,
        isGuest: false,
      })
      return { ok: true }
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
    removeSession()
    setSession(null)
  }, [])

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
