// 账号/家庭/会话服务：scrypt 密码哈希 + access 默认 2 小时、refresh 30 天
import crypto from 'node:crypto'

const INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const REFRESH_TTL_MS = 30 * 24 * 3600 * 1000 // refresh token 30 天
const ACCESS_TTL_MS = (parseInt(process.env.ACCESS_TOKEN_TTL_MIN ?? '', 10) || 120) * 60_000 // access token 默认 2 小时

export class AuthError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

function hashSecret(secret) {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(secret, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

function verifySecret(secret, stored) {
  const [salt, hash] = (stored ?? '').split(':')
  if (!salt || !hash) return false
  const candidate = crypto.scryptSync(secret, salt, 64)
  const expected = Buffer.from(hash, 'hex')
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected)
}

export function verifyParentPassword(db, auth, password) {
  if (auth?.role !== 'parent') return false
  const account = db.prepare("SELECT password_hash FROM accounts WHERE id = ? AND family_id = ? AND role = 'parent'").get(auth.accountId, auth.familyId)
  return !!account && typeof password === 'string' && password.length <= 1024 && verifySecret(password, account.password_hash)
}

const id = () => crypto.randomUUID()
const now = () => new Date().toISOString()

function createInviteCode(db) {
  const exists = db.prepare('SELECT 1 FROM families WHERE invite_code = ?')
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const code = Array.from(crypto.randomBytes(6), b => INVITE_ALPHABET[b % INVITE_ALPHABET.length]).join('')
    if (!exists.get(code)) return code
  }
  throw new AuthError(500, 'invite code generation failed')
}

function createTokenPair(db, accountId) {
  const token = crypto.randomBytes(32).toString('hex')
  const refreshToken = crypto.randomBytes(32).toString('hex')
  db.prepare('INSERT INTO sessions (token, account_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .run(token, accountId, now(), new Date(Date.now() + ACCESS_TTL_MS).toISOString())
  // refresh token 只存哈希，库泄漏也不可冒用
  db.prepare('INSERT INTO refresh_tokens (token_hash, account_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .run(sha256(refreshToken), accountId, now(), new Date(Date.now() + REFRESH_TTL_MS).toISOString())
  return { token, refreshToken }
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

// refresh 轮换：旧 refresh 立即作废，签发新 token 对（旋转式，防重放）
export function refresh(db, refreshToken) {
  if (!refreshToken) throw new AuthError(401, 'login required')
  const hash = sha256(refreshToken)
  const row = db.prepare('SELECT account_id FROM refresh_tokens WHERE token_hash = ? AND expires_at > ?').get(hash, now())
  if (!row) throw new AuthError(401, '登录已过期，请重新登录。')
  db.prepare('DELETE FROM refresh_tokens WHERE token_hash = ?').run(hash)
  return createTokenPair(db, row.account_id)
}

function sessionOf(account) {
  return { id: account.id, role: account.role, familyId: account.family_id, displayName: account.display_name, isGuest: false }
}

export function registerParent(db, { name, email, password }) {
  if (!name?.trim() || !email?.trim() || !password) throw new AuthError(400, 'name, email, password required')
  if (password.length < 6) throw new AuthError(400, '密码至少需要 6 位')
  const normalized = email.trim().toLowerCase()
  if (db.prepare("SELECT 1 FROM accounts WHERE role = 'parent' AND email = ?").get(normalized)) {
    throw new AuthError(409, '这个邮箱已经注册过了，请直接登录。')
  }
  const familyId = id()
  const inviteCode = createInviteCode(db)
  db.prepare('INSERT INTO families (id, invite_code, created_at) VALUES (?, ?, ?)').run(familyId, inviteCode, now())
  const account = { id: id(), role: 'parent', family_id: familyId, display_name: name.trim() }
  db.prepare("INSERT INTO accounts (id, role, family_id, email, password_hash, display_name, created_at) VALUES (?, 'parent', ?, ?, ?, ?, ?)")
    .run(account.id, familyId, normalized, hashSecret(password), account.display_name, now())
  return { ...createTokenPair(db, account.id), session: sessionOf(account), family: { inviteCode } }
}

export function loginParent(db, { email, password }) {
  const account = db.prepare("SELECT * FROM accounts WHERE role = 'parent' AND email = ?").get(email?.trim().toLowerCase() ?? '')
  if (!account || !verifySecret(password ?? '', account.password_hash)) {
    throw new AuthError(401, '邮箱或密码不正确，请再试一次。')
  }
  const family = db.prepare('SELECT invite_code FROM families WHERE id = ?').get(account.family_id)
  return { ...createTokenPair(db, account.id), session: sessionOf(account), family: { inviteCode: family.invite_code } }
}

export function registerChild(db, { nickname, creationCode, inviteCode }) {
  if (!nickname?.trim() || !creationCode || !inviteCode?.trim()) throw new AuthError(400, 'nickname, creationCode, inviteCode required')
  if (!/^\d{4}$/.test(creationCode)) throw new AuthError(400, '请设置 4 个数字组成的创作码')
  const family = db.prepare('SELECT * FROM families WHERE invite_code = ?').get(inviteCode.trim().toUpperCase())
  if (!family) throw new AuthError(404, '没有找到这个家庭邀请码，请家长再确认一次。')
  const normalized = nickname.trim().toLowerCase()
  if (db.prepare("SELECT 1 FROM accounts WHERE role = 'child' AND lower(display_name) = ?").get(normalized)) {
    throw new AuthError(409, '这个昵称已经被使用，换一个试试吧。')
  }
  const account = { id: id(), role: 'child', family_id: family.id, display_name: nickname.trim() }
  db.prepare("INSERT INTO accounts (id, role, family_id, display_name, creation_code_hash, created_at) VALUES (?, 'child', ?, ?, ?, ?)")
    .run(account.id, family.id, account.display_name, hashSecret(creationCode), now())
  return { ...createTokenPair(db, account.id), session: sessionOf(account), family: { inviteCode: family.invite_code } }
}

export function loginChild(db, { nickname, creationCode }) {
  const account = db.prepare("SELECT * FROM accounts WHERE role = 'child' AND lower(display_name) = ?").get(nickname?.trim().toLowerCase() ?? '')
  if (!account || !verifySecret(creationCode ?? '', account.creation_code_hash)) {
    throw new AuthError(401, '昵称或创作码不对，再想一想吧。')
  }
  const family = db.prepare('SELECT invite_code FROM families WHERE id = ?').get(account.family_id)
  return { ...createTokenPair(db, account.id), session: sessionOf(account), family: { inviteCode: family.invite_code } }
}

// Bearer token → 账号（无效/过期返回 null，不抛错——analyze/report 允许游客匿名调用）
export function authenticate(db, token) {
  if (!token) return null
  const row = db.prepare(`
    SELECT a.* FROM sessions s JOIN accounts a ON a.id = s.account_id
    WHERE s.token = ? AND s.expires_at > ?`).get(token, now())
  if (!row) return null
  return { accountId: row.id, role: row.role, familyId: row.family_id, displayName: row.display_name }
}

export function logout(db, token) {
  if (!token) return
  const row = db.prepare('SELECT account_id FROM sessions WHERE token = ?').get(token)
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token)
  // 同时吊销该账号全部 refresh token，彻底登出
  if (row) {
    db.prepare('DELETE FROM refresh_tokens WHERE account_id = ?').run(row.account_id)
    db.prepare('DELETE FROM sessions WHERE account_id = ?').run(row.account_id)
  }
}

export function getMe(db, auth) {
  const family = db.prepare('SELECT invite_code FROM families WHERE id = ?').get(auth.familyId)
  const children = db.prepare("SELECT id, display_name AS nickname, birth_date AS birthDate, created_at AS createdAt FROM accounts WHERE role = 'child' AND family_id = ? ORDER BY created_at")
    .all(auth.familyId)
  return {
    session: { id: auth.accountId, role: auth.role, familyId: auth.familyId, displayName: auth.displayName, isGuest: false },
    family: { inviteCode: family?.invite_code },
    children,
  }
}
