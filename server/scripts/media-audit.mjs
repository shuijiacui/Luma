#!/usr/bin/env node
// 默认只检查；--remove-orphans 仅删除受控目录内一天前、无引用的普通 .bin 文件。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
const serverDir = fileURLToPath(new URL('..', import.meta.url))
try { process.loadEnvFile(path.join(serverDir, '.env')) } catch (error) { if (error.code !== 'ENOENT') throw error }
const root = path.resolve(process.env.UPLOAD_DIR || path.join(serverDir, 'uploads'))
const db = new DatabaseSync(process.env.DB_PATH || path.join(serverDir, 'data.sqlite'), { readOnly: true })
let rows
try { rows = db.prepare('SELECT image_path FROM analyses WHERE image_path IS NOT NULL').all() } finally { db.close() }
const referenced = new Set(rows.map(row => path.resolve(root, row.image_path)))
const missing = [...referenced].filter(file => !fs.existsSync(file))
const orphans = fs.existsSync(root) ? fs.readdirSync(root).filter(name => /^[a-f0-9-]+\.bin(?:(?:\.[a-f0-9-]+)?\.deleting)?$/.test(name)).map(name => path.join(root, name)).filter(file => {
  const stat = fs.lstatSync(file)
  return !referenced.has(file) && !referenced.has(file.replace(/(?:\.[a-f0-9-]+)?\.deleting$/, '')) && stat.isFile() && !stat.isSymbolicLink() && stat.mtimeMs < Date.now() - 86400000
}) : []
if (process.argv.includes('--remove-orphans')) for (const file of orphans) {
  const relative = path.relative(root, path.resolve(file))
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('refusing cleanup outside upload directory')
  fs.rmSync(file)
}
console.log(JSON.stringify({ missing, orphans, removed: process.argv.includes('--remove-orphans') ? orphans.length : 0 }, null, 2))
if (missing.length) process.exitCode = 1
