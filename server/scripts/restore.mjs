#!/usr/bin/env node
// 恢复到一个尚不存在的新目录，不覆盖正在使用的数据库或图片。
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { pathToFileURL } from 'node:url'

export function restoreBackup({ backupPath, destination }) {
  const root = path.resolve(destination)
  if (fs.existsSync(root)) throw new Error('restore destination must not exist')
  const db = new DatabaseSync(backupPath, { readOnly: true })
  let media
  try {
    if (db.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') throw new Error('invalid backup database')
    media = db.prepare('SELECT filename, sha256, data FROM backup_media').all()
    if (db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'analyses'").get()) {
      const names = new Set(media.map(item => item.filename))
      for (const row of db.prepare('SELECT image_path FROM analyses WHERE image_path IS NOT NULL').all()) {
        if (!names.has(row.image_path)) throw new Error('backup is missing a referenced image')
      }
    }
    for (const item of media) {
      if (!/^[a-zA-Z0-9-]+\.bin$/.test(item.filename)) throw new Error('invalid media filename')
      if (crypto.createHash('sha256').update(item.data).digest('hex') !== item.sha256) throw new Error('backup image checksum mismatch')
    }
  } finally { db.close() }
  fs.mkdirSync(path.join(root, 'uploads'), { recursive: true })
  for (const item of media) fs.writeFileSync(path.join(root, 'uploads', item.filename), item.data, { flag: 'wx' })
  const dbPath = path.join(root, 'data.sqlite')
  fs.copyFileSync(backupPath, dbPath, fs.constants.COPYFILE_EXCL)
  const restored = new DatabaseSync(dbPath)
  try { restored.exec('DROP TABLE backup_media; VACUUM;') } finally { restored.close() }
  return { dbPath, uploadDir: path.join(root, 'uploads'), images: media.length }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length !== 4) throw new Error('usage: node scripts/restore.mjs BACKUP.sqlite NEW_DIRECTORY')
  console.log(JSON.stringify(restoreBackup({ backupPath: process.argv[2], destination: process.argv[3] })))
}
