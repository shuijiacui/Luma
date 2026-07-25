// SQLite 数据层（node:sqlite，零运维单文件）
// 默认文件 server/data.sqlite（gitignored）；测试注入 ':memory:'
import { DatabaseSync } from 'node:sqlite'

// 路径含非 ASCII 字符（如中文目录）时 URL.pathname 是 percent-encoded，必须解码
const DEFAULT_DB_PATH = decodeURIComponent(new URL('../data.sqlite', import.meta.url).pathname)

export function createDb(path = process.env.DB_PATH || DEFAULT_DB_PATH) {
  const db = new DatabaseSync(path)
  db.exec(`
    CREATE TABLE IF NOT EXISTS families (
      id TEXT PRIMARY KEY,
      invite_code TEXT UNIQUE NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      role TEXT NOT NULL CHECK(role IN ('parent','child')),
      family_id TEXT NOT NULL REFERENCES families(id),
      email TEXT UNIQUE,
      password_hash TEXT,
      display_name TEXT NOT NULL,
      creation_code_hash TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES accounts(id),
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      token_hash TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES accounts(id),
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS analyses (
      id TEXT PRIMARY KEY,
      child_id TEXT NOT NULL REFERENCES accounts(id),
      family_id TEXT NOT NULL REFERENCES families(id),
      features_json TEXT NOT NULL,
      report_json TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_analyses_child ON analyses(child_id, created_at);
  `)
  return db
}
