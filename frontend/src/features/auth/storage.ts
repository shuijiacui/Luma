import type {
  AuthSession,
  ChildAccount,
  Family,
  ParentAccount,
  StoredAccount,
} from './types'

const ACCOUNTS_KEY = 'luma_demo_accounts_v2'
const FAMILIES_KEY = 'luma_demo_families_v2'
const SESSION_KEY = 'luma_demo_session_v2'

export const DEMO_FAMILY_ID = 'family-luma-demo'
export const DEMO_INVITE_CODE = 'LUMA-DEMO'

function readJson<T>(key: string, fallback: T): T {
  try {
    const value = window.localStorage.getItem(key)
    return value ? (JSON.parse(value) as T) : fallback
  } catch {
    return fallback
  }
}

export function getAccounts(): StoredAccount[] {
  return readJson<StoredAccount[]>(ACCOUNTS_KEY, [])
}

export function saveAccount(account: StoredAccount) {
  window.localStorage.setItem(
    ACCOUNTS_KEY,
    JSON.stringify([...getAccounts(), account]),
  )
}

export function getFamilies(): Family[] {
  return readJson<Family[]>(FAMILIES_KEY, [])
}

export function saveFamily(family: Family) {
  window.localStorage.setItem(
    FAMILIES_KEY,
    JSON.stringify([...getFamilies(), family]),
  )
}

export function findFamilyByInviteCode(
  inviteCode: string,
): Family | undefined {
  const normalizedCode = inviteCode.trim().toUpperCase()
  if (normalizedCode === DEMO_INVITE_CODE) {
    return {
      id: DEMO_FAMILY_ID,
      inviteCode: DEMO_INVITE_CODE,
      createdAt: new Date(0).toISOString(),
    }
  }
  return getFamilies().find(
    (family) => family.inviteCode === normalizedCode,
  )
}

export function findFamilyById(familyId: string): Family | undefined {
  if (familyId === DEMO_FAMILY_ID) {
    return {
      id: DEMO_FAMILY_ID,
      inviteCode: DEMO_INVITE_CODE,
      createdAt: new Date(0).toISOString(),
    }
  }
  return getFamilies().find((family) => family.id === familyId)
}

export function getChildrenForFamily(familyId: string): ChildAccount[] {
  if (familyId === DEMO_FAMILY_ID) {
    return [
      {
        id: 'guest-child',
        role: 'child',
        familyId: DEMO_FAMILY_ID,
        nickname: '小小创作者',
        creationCode: '0000',
        createdAt: new Date(0).toISOString(),
      },
    ]
  }
  return getAccounts().filter(
    (account): account is ChildAccount =>
      account.role === 'child' && account.familyId === familyId,
  )
}

export function findParent(email: string): ParentAccount | undefined {
  return getAccounts().find(
    (account): account is ParentAccount =>
      account.role === 'parent' &&
      account.email.toLowerCase() === email.toLowerCase(),
  )
}

export function findChild(nickname: string): ChildAccount | undefined {
  return getAccounts().find(
    (account): account is ChildAccount =>
      account.role === 'child' &&
      account.nickname.toLowerCase() === nickname.toLowerCase(),
  )
}

export function getStoredSession(): AuthSession | null {
  const session = readJson<AuthSession | null>(SESSION_KEY, null)
  return session?.familyId ? session : null
}

export function saveSession(session: AuthSession) {
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session))
}

export function removeSession() {
  window.localStorage.removeItem(SESSION_KEY)
}
