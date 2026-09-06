#!/usr/bin/env node
// SQLite 与原图完整备份：一致性数据库快照 + 内嵌图片/校验值 + 14 天滚动保留
// 用法：node scripts/backup.mjs   （建议 cron 每日执行，见 deploy/backup.cron）
// 注意：本文件必须保持 LF 换行。CRLF + shebang 会让 vitest 的转换留下 \r，
// 导致 import 抛 SyntaxError（见 .gitattributes）。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import crypto from 'node:crypto'

// fileURLToPath 负责跨平台还原路径；URL.pathname 在 Windows 上会带前导斜杠（/D:/...）
const SERVER_DIR = fileURLToPath(new URL('..', import.meta.url))
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { process.loadEnvFile(path.join(SERVER_DIR, '.env')) } catch (error) { if (error.code !== 'ENOENT') throw error }
}
const DB_PATH = process.env.DB_PATH || path.join(SERVER_DIR, 'data.sqlite')
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(SERVER_DIR, 'backups')
const RETENTION_DAYS = parseInt(process.env.BACKUP_RETENTION_DAYS ?? '', 10) || 14

export function backupDb({ dbPath = DB_PATH, backupDir = BACKUP_DIR, retentionDays = RETENTION_DAYS, uploadDir = process.env.UPLOAD_DIR || path.join(SERVER_DIR, 'uploads') } = {}) {
  if (!fs.existsSync(dbPath)) throw new Error(`database not found: ${dbPath}`)
  fs.mkdirSync(backupDir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  // 同一秒内重复执行时追加序号，避免文件名冲突
  let target = path.join(backupDir, `luma-${stamp}.sqlite`)
  for (let n = 2; fs.existsSync(target); n += 1) {
    target = path.join(backupDir, `luma-${stamp}-${n}.sqlite`)
  }
  const db = new DatabaseSync(dbPath, { readOnly: true })
  // VACUUM INTO 生成一致性压缩快照（路径由本脚本生成，无注入面）
  const pending = `${target}.pending`
  try { db.exec(`VACUUM INTO '${pending.replaceAll("'", "''")}'`) } finally { db.close() }
  const snapshot = new DatabaseSync(pending)
  try {
    snapshot.exec('CREATE TABLE IF NOT EXISTS backup_media (filename TEXT PRIMARY KEY, sha256 TEXT NOT NULL, data BLOB NOT NULL)')
    const hasAnalyses = snapshot.prepare("SELECT 1 FROM sqlite_master WHERE name = 'analyses'").get()
    if (hasAnalyses) {
      const rows = snapshot.prepare('SELECT id, image_path, image_sha256 FROM analyses WHERE image_path IS NOT NULL').all()
      for (const row of rows) {
        const source = path.isAbsolute(row.image_path) ? row.image_path : path.join(uploadDir, row.image_path)
        const bytes = fs.readFileSync(source)
        const sha = crypto.createHash('sha256').update(bytes).digest('hex')
        if (row.image_sha256 && row.image_sha256 !== sha) throw new Error(`image checksum mismatch: ${row.id}`)
        const filename = `${crypto.randomUUID()}.bin`
        snapshot.prepare('INSERT INTO backup_media VALUES (?, ?, ?)').run(filename, sha, bytes)
        snapshot.prepare('UPDATE analyses SET image_path = ? WHERE id = ?').run(filename, row.id)
      }
    }
    snapshot.close()
    fs.renameSync(pending, target)
  } catch (error) {
    try { snapshot.close() } catch { /* already closed */ }
    fs.rmSync(pending, { force: true })
    throw error
  }

  // 滚动保留：删除超龄备份
  const cutoff = Date.now() - retentionDays * 24 * 3600 * 1000
  const removed = []
  for (const file of fs.readdirSync(backupDir)) {
    if (!file.startsWith('luma-') || !file.endsWith('.sqlite')) continue
    const full = path.join(backupDir, file)
    if (fs.statSync(full).mtimeMs < cutoff) {
      fs.rmSync(full)
      removed.push(file)
    }
  }
  return { target, removed }
}

// pathToFileURL 负责转义反斜杠与特殊字符；'file://' + argv[1] 在 Windows 上会抛 Invalid URL
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { target, removed } = backupDb()
  console.log(`backup written: ${target}`)
  if (removed.length) console.log(`pruned ${removed.length} old backup(s): ${removed.join(', ')}`)
}
