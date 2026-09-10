import fs from 'node:fs'
import crypto from 'node:crypto'
import { managedImagePath } from './media.js'

// Stage all media before committing relational deletion. Roll back moves on any failure.
export function deleteFamily(db, familyId, uploadDir) {
  const staged = []
  const images = db.prepare('SELECT image_path FROM analyses WHERE family_id = ? AND image_path IS NOT NULL').all(familyId)
  db.exec('BEGIN IMMEDIATE')
  try {
    for (const value of new Set(images.map(row => row.image_path))) {
      const original = managedImagePath(uploadDir, value)
      if (!fs.existsSync(original)) continue
      const temporary = `${original}.${crypto.randomUUID()}.deleting`
      fs.renameSync(original, temporary)
      staged.push({ original, temporary })
    }
    db.prepare('DELETE FROM period_reports WHERE child_id IN (SELECT id FROM accounts WHERE family_id = ?)').run(familyId)
    db.prepare('DELETE FROM analyses WHERE family_id = ?').run(familyId)
    db.prepare('DELETE FROM artworks WHERE child_id IN (SELECT id FROM accounts WHERE family_id = ?)').run(familyId)
    for (const table of ['sessions', 'refresh_tokens']) db.prepare(`DELETE FROM ${table} WHERE account_id IN (SELECT id FROM accounts WHERE family_id = ?)`).run(familyId)
    db.prepare('DELETE FROM accounts WHERE family_id = ?').run(familyId)
    db.prepare('DELETE FROM families WHERE id = ?').run(familyId)
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    for (const { original, temporary } of staged.reverse()) fs.renameSync(temporary, original)
    throw error
  }
  let pendingMedia = 0
  for (const { temporary } of staged) {
    try { fs.rmSync(temporary) } catch (error) { pendingMedia++; console.error('[family-media-cleanup]', error.message) }
  }
  return { ok: true, pendingMedia }
}
