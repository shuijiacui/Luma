export type UserRole = 'parent' | 'child'

export interface ParentAccount {
  id: string
  role: 'parent'
  familyId: string
  name: string
  email: string
  password: string
  createdAt: string
}

export interface ChildAccount {
  id: string
  role: 'child'
  familyId: string
  nickname: string
  creationCode: string
  createdAt: string
}

export type StoredAccount = ParentAccount | ChildAccount

export interface Family {
  id: string
  inviteCode: string
  createdAt: string
}

export interface AuthSession {
  id: string
  role: UserRole
  familyId: string
  displayName: string
  isGuest: boolean
}

export interface AuthResult {
  ok: boolean
  message?: string
}
