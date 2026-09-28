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
  db.exec(`CREATE TABLE IF NOT EXISTS artworks (
    id TEXT PRIMARY KEY,
    child_id TEXT NOT NULL REFERENCES accounts(id),
    image_base64 TEXT NOT NULL,
    revision INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_artworks_child ON artworks(child_id, updated_at);`)
  const artworkColumns = new Set(db.prepare('PRAGMA table_info(artworks)').all().map(c => c.name))
  if (!artworkColumns.has('document_json')) db.exec('ALTER TABLE artworks ADD COLUMN document_json TEXT')
  if (!artworkColumns.has('provenance')) db.exec("ALTER TABLE artworks ADD COLUMN provenance TEXT NOT NULL DEFAULT 'unknown'")
  db.exec(`CREATE TABLE IF NOT EXISTS parent_questionnaire_versions (
    id TEXT PRIMARY KEY,
    parent_id TEXT NOT NULL REFERENCES accounts(id),
    family_id TEXT NOT NULL REFERENCES families(id),
    revision INTEGER NOT NULL,
    child_age INTEGER NOT NULL,
    answers_json TEXT NOT NULL,
    scores_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(parent_id, revision)
  );
  CREATE INDEX IF NOT EXISTS idx_parent_questionnaire_versions
    ON parent_questionnaire_versions(parent_id, revision DESC);`)
  const questionnaireColumns = new Set(db.prepare('PRAGMA table_info(parent_questionnaire_versions)').all().map(row => row.name))
  if (!questionnaireColumns.has('child_id')) db.exec('ALTER TABLE parent_questionnaire_versions ADD COLUMN child_id TEXT REFERENCES accounts(id)')
  db.exec(`CREATE INDEX IF NOT EXISTS idx_questionnaire_child ON parent_questionnaire_versions(parent_id, child_id, revision DESC);
    CREATE TABLE IF NOT EXISTS parent_questionnaire_preferences (
      parent_id TEXT NOT NULL REFERENCES accounts(id),
      child_id TEXT NOT NULL REFERENCES accounts(id),
      enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0, 1)),
      version INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY(parent_id, child_id)
    );`)
  db.exec(`CREATE TABLE IF NOT EXISTS communication_guides (
    child_id TEXT NOT NULL REFERENCES accounts(id),
    locale TEXT NOT NULL CHECK(locale IN ('zh', 'en')),
    source_hash TEXT NOT NULL,
    response_json TEXT NOT NULL,
    PRIMARY KEY(child_id, locale)
  )`)
  db.exec(`CREATE TABLE IF NOT EXISTS parent_conversations (
    child_id TEXT NOT NULL REFERENCES accounts(id),
    parent_id TEXT NOT NULL REFERENCES accounts(id),
    revision INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY(child_id, parent_id)
  );
  CREATE TABLE IF NOT EXISTS parent_conversation_turns (
    child_id TEXT NOT NULL,
    parent_id TEXT NOT NULL,
    request_id TEXT NOT NULL,
    user_text TEXT NOT NULL,
    assistant_text TEXT NOT NULL,
    source_ids_json TEXT NOT NULL,
    selected_source_id TEXT,
    locale TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY(child_id, parent_id, request_id),
    FOREIGN KEY(child_id, parent_id) REFERENCES parent_conversations(child_id, parent_id)
  );
  CREATE INDEX IF NOT EXISTS idx_parent_conversation_time ON parent_conversation_turns(child_id, parent_id, created_at);`)
  // Add conversation identity without discarding existing single-chat history.
  const chatColumns = new Set(db.prepare('PRAGMA table_info(parent_conversations)').all().map(row => row.name))
  const turnColumns = new Set(db.prepare('PRAGMA table_info(parent_conversation_turns)').all().map(row => row.name))
  db.exec('BEGIN IMMEDIATE')
  try {
    if (!chatColumns.has('active_conversation_id')) db.exec("ALTER TABLE parent_conversations ADD COLUMN active_conversation_id TEXT NOT NULL DEFAULT 'legacy'")
    if (!turnColumns.has('conversation_id')) db.exec("ALTER TABLE parent_conversation_turns ADD COLUMN conversation_id TEXT NOT NULL DEFAULT 'legacy'")
    db.exec(`CREATE TABLE IF NOT EXISTS parent_chat_threads (
      child_id TEXT NOT NULL,
      parent_id TEXT NOT NULL,
      id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY(child_id, parent_id, id),
      FOREIGN KEY(child_id, parent_id) REFERENCES parent_conversations(child_id, parent_id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_parent_chat_thread_turns ON parent_conversation_turns(child_id, parent_id, conversation_id, created_at);`)
    if (!chatColumns.has('active_conversation_id') || !turnColumns.has('conversation_id')) {
      db.exec(`INSERT OR IGNORE INTO parent_chat_threads (child_id, parent_id, id, created_at)
        SELECT c.child_id, c.parent_id, 'legacy', COALESCE((SELECT MIN(t.created_at) FROM parent_conversation_turns t
          WHERE t.child_id = c.child_id AND t.parent_id = c.parent_id), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        FROM parent_conversations c`)
    }
    db.exec('COMMIT')
  } catch (error) { db.exec('ROLLBACK'); throw error }
  return db
}
