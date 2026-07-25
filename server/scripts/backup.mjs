#!/usr/bin/env node
// SQLite 备份：VACUUM INTO（在线一致性快照）+ 14 天滚动保留
// 用法：node scripts/backup.mjs   （建议 cron 每日执行，见 deploy/backup.cron）
import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const SERVER_DIR = decodeURIComponent(new URL('..', import.meta.url).pathname)
const DB_PATH = process.env.DB_PATH || path.join(SERVER_DIR, 'data.sqlite')
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(SERVER_DIR, 'backups')
const RETENTION_DAYS = parseInt(process.env.BACKUP_RETENTION_DAYS ?? '', 10) || 14

export function backupDb({ dbPath = DB_PATH, backupDir = BACKUP_DIR, retentionDays = RETENTION_DAYS } = {}) {
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
  db.exec(`VACUUM INTO '${target.replaceAll("'", "''")}'`)
  db.close()

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

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const { target, removed } = backupDb()
  console.log(`backup written: ${target}`)
  if (removed.length) console.log(`pruned ${removed.length} old backup(s): ${removed.join(', ')}`)
}
