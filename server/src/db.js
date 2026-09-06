// SQLite 数据层（node:sqlite，零运维单文件）
// 默认文件 server/data.sqlite（gitignored）；测试注入 ':memory:'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'

// 路径含非 ASCII 字符（如中文目录）时 URL.pathname 是 percent-encoded，必须解码
const DEFAULT_DB_PATH = fileURLToPath(new URL('../data.sqlite', import.meta.url))

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
      feedback_json TEXT,
      image_path TEXT,
      image_mime TEXT,
      image_size INTEGER,
      image_sha256 TEXT,
      report_json TEXT,
      created_at TEXT NOT NULL
    );
  `)
  for (const column of [
    ['feedback_json', 'TEXT'], ['image_path', 'TEXT'], ['image_mime', 'TEXT'],
    ['image_size', 'INTEGER'], ['image_sha256', 'TEXT'],
  ]) {
    try { db.exec(`ALTER TABLE analyses ADD COLUMN ${column[0]} ${column[1]}`) } catch { /* 已存在 */ }
  }
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_analyses_child ON analyses(child_id, created_at);
  `)
  const accountColumns = new Set(db.prepare('PRAGMA table_info(accounts)').all().map(c => c.name))
  if (!accountColumns.has('birth_date')) db.exec('ALTER TABLE accounts ADD COLUMN birth_date TEXT')
  const analysisColumns = new Set(db.prepare('PRAGMA table_info(analyses)').all().map(c => c.name))
  if (!analysisColumns.has('submission_key')) db.exec('ALTER TABLE analyses ADD COLUMN submission_key TEXT')
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_analysis_submission ON analyses(child_id, submission_key)')
  db.exec(`CREATE TABLE IF NOT EXISTS period_reports (
    id TEXT PRIMARY KEY,
    child_id TEXT NOT NULL REFERENCES accounts(id),
    kind TEXT NOT NULL CHECK(kind IN ('weekly', 'monthly')),
    period_start TEXT NOT NULL,
    period_end TEXT NOT NULL,
    summary_json TEXT NOT NULL,
    source_hash TEXT NOT NULL,
    generated_at TEXT NOT NULL,
    UNIQUE(child_id, kind, period_start)
  )`)
  return db
}
