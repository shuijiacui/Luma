import { Router } from 'express'

const summary = row => ({ id: row.id, revision: row.revision, createdAt: row.created_at, updatedAt: row.updated_at,
  imageUrl: `/api/artworks/${row.id}/image` })

// Editable PNGs are independent of analysis: an unavailable model must never prevent saving.
export function createArtworkRouter({ db }) {
  const router = Router()
  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store')
    if (!req.auth) return res.status(401).json({ error: 'login required' })
    if (req.auth.role !== 'child') return res.status(403).json({ error: 'child account required' })
    next()
  })
  router.get('/', (req, res) => {
    const offset = Number(req.query.offset ?? 0)
    if (!Number.isSafeInteger(offset) || offset < 0) return res.status(400).json({ error: 'invalid pagination' })
    const rows = db.prepare('SELECT id, revision, created_at, updated_at FROM artworks WHERE child_id = ? ORDER BY updated_at DESC, id DESC LIMIT 25 OFFSET ?').all(req.auth.accountId, offset)
    res.json({ artworks: rows.slice(0, 24).map(summary), nextOffset: rows.length > 24 ? offset + 24 : null })
  })
  router.get('/:id', (req, res) => {
    const row = db.prepare('SELECT * FROM artworks WHERE id = ? AND child_id = ?').get(req.params.id, req.auth.accountId)
    if (!row) return res.status(404).json({ error: 'artwork not found' })
    res.json({ ...summary(row), image: `data:image/png;base64,${row.image_base64}` })
  })
  router.get('/:id/image', (req, res) => {
    const row = db.prepare('SELECT image_base64 FROM artworks WHERE id = ? AND child_id = ?').get(req.params.id, req.auth.accountId)
    if (!row) return res.status(404).json({ error: 'artwork not found' })
    res.type('png').send(Buffer.from(row.image_base64, 'base64'))
  })
  router.put('/:id', (req, res) => {
    const { image, revision } = req.body ?? {}
    if (!/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(req.params.id)
      || !Number.isSafeInteger(revision) || revision < 0
      || typeof image !== 'string' || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(image)) {
      return res.status(400).json({ error: 'invalid artwork' })
    }
    const encoded = image.slice('data:image/png;base64,'.length)
    const buffer = Buffer.from(encoded, 'base64')
    if (buffer.length > 10 * 1024 * 1024 || buffer.length < 24 || encoded !== buffer.toString('base64')
      || buffer.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a'
      || buffer.toString('ascii', 12, 16) !== 'IHDR'
      || buffer.readUInt32BE(16) < 1 || buffer.readUInt32BE(20) < 1
      || buffer.readUInt32BE(16) * buffer.readUInt32BE(20) > 32_000_000) {
      return res.status(400).json({ error: 'invalid PNG image' })
    }
    const previous = db.prepare('SELECT * FROM artworks WHERE id = ?').get(req.params.id)
    if (previous && previous.child_id !== req.auth.accountId) return res.status(404).json({ error: 'artwork not found' })
    // A retried successful request is harmless; stale edits from another tab never overwrite newer work.
    if (previous?.image_base64 === encoded) return res.json(summary(previous))
    if ((previous?.revision ?? 0) !== revision) return res.status(409).json({ error: '这幅画已在其他页面更新，请先下载当前画作，再从历史图画重新打开。' })
    const now = new Date().toISOString()
    db.prepare(`INSERT INTO artworks (id, child_id, image_base64, revision, created_at, updated_at)
      VALUES (?, ?, ?, 1, ?, ?) ON CONFLICT(id) DO UPDATE SET image_base64 = excluded.image_base64,
      revision = artworks.revision + 1, updated_at = excluded.updated_at`).run(req.params.id, req.auth.accountId, encoded, now, now)
    res.json(summary(db.prepare('SELECT * FROM artworks WHERE id = ?').get(req.params.id)))
  })
  return router
}
