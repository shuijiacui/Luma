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
  /** 后端 access token（2h）；游客模式无 token */
  token?: string
  /** refresh token（30d，旋转式轮换）；游客模式无 */
  refreshToken?: string
}

export interface AuthResult {
  ok: boolean
  message?: string
}
