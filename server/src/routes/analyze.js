// POST /api/analyze + POST /api/report（docs/API契约.md）
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { Router } from 'express'
import { extractFeatures, validateFeatures, gateFeatures } from '../services/extractFeatures.js'
import { asyncRoute } from '../services/http.js'
import { managedImagePath } from '../services/media.js'
import { buildFeedback, FOLLOW_UP } from '../services/report.js'
import { insertAnalysis, attachReport } from '../services/historyService.js'
import { log } from '../services/logger.js'
import { traceNode } from '../services/tracing.js'
import { localeOf, englishFeedback, ENGLISH_FOLLOW_UP } from '../services/localization.js'
import { buildObservationReport } from '../services/observationReport.js'
import { buildLiteratureContext } from '../services/literatureContext.js'

function displayPng(value) {
  if (typeof value !== 'string') return null
  const encoded = value.replace(/^data:image\/png;base64,/i, '')
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) return null
  const buffer = Buffer.from(encoded, 'base64')
  if (buffer.length < 24 || buffer.length > 10 * 1024 * 1024 || buffer.toString('base64') !== encoded
    || buffer.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || buffer.toString('ascii', 12, 16) !== 'IHDR'
    || buffer.readUInt32BE(16) < 1 || buffer.readUInt32BE(20) < 1 || buffer.readUInt32BE(16) * buffer.readUInt32BE(20) > 32_000_000) return null
  return buffer
}

export function createApiRouter({ chatWithImage, db, uploadDir = path.resolve('uploads') }) {
  uploadDir = path.resolve(uploadDir)
  const router = Router()

  router.post('/analyses/:analysisId/delete', asyncRoute(async (req, res) => {
    if (!req.auth) return res.status(401).json({ error: 'login required' })
    const row = db.prepare('SELECT child_id, family_id, image_path FROM analyses WHERE id = ?').get(req.params.analysisId)
    if (!row) return res.status(404).json({ error: 'analysis not found' })
    if (req.auth.role !== 'parent' || req.auth.familyId !== row.family_id) return res.status(403).json({ error: 'forbidden' })
    const original = row.image_path ? managedImagePath(uploadDir, row.image_path) : null
    const staged = original && fs.existsSync(original) ? `${original}.deleting` : null
    if (staged) fs.renameSync(original, staged)
    db.exec('BEGIN IMMEDIATE')
    try {
      db.prepare('DELETE FROM period_reports WHERE child_id = ?').run(row.child_id)
      db.prepare('DELETE FROM communication_guides WHERE child_id = ?').run(row.child_id)
      db.prepare(`DELETE FROM parent_conversation_turns WHERE child_id = ? AND (selected_source_id = ?
        OR EXISTS (SELECT 1 FROM json_each(source_ids_json) WHERE value = ?))`).run(row.child_id, req.params.analysisId, req.params.analysisId)
      db.prepare('UPDATE parent_conversations SET revision = revision + 1 WHERE child_id = ?').run(row.child_id)
      db.prepare('DELETE FROM analyses WHERE id = ?').run(req.params.analysisId)
      db.exec('COMMIT')
    } catch (error) { db.exec('ROLLBACK'); if (staged) fs.renameSync(staged, original); throw error }
    if (staged) { try { fs.rmSync(staged) } catch (error) { log.error('media_cleanup', { msg: error.message }) } }
    res.json({ ok: true })
  }))

  router.get('/analyses/:analysisId/image', (req, res) => {
    if (!req.auth) return res.status(401).json({ error: 'login required' })
    const row = db.prepare('SELECT child_id, family_id, image_path, image_mime FROM analyses WHERE id = ?').get(req.params.analysisId)
    if (!row?.image_path) return res.status(404).json({ error: 'image not found' })
    const allowed = (req.auth.role === 'child' && req.auth.accountId === row.child_id)
      || (req.auth.role === 'parent' && req.auth.familyId === row.family_id)
    if (!allowed) return res.status(403).json({ error: 'forbidden' })
    // 兼容旧绝对路径与新相对文件名，保证数据库可跨机器移植
    const imagePath = managedImagePath(uploadDir, row.image_path)
    if (!fs.existsSync(imagePath)) return res.status(404).json({ error: 'image not found' })
    res.type(row.image_mime || 'image/png').sendFile(imagePath)
  })

  router.post('/analyze', asyncRoute(async (req, res) => {
    const { imageBase64, submissionKey = null, source = null, provenance = 'child', artworkId, artworkRevision, displayImageBase64 } = req.body ?? {}
    if (!['child', 'co-created', 'unknown'].includes(provenance)) return res.status(400).json({ error: 'invalid provenance' })
    if (provenance === 'unknown') return res.status(422).json({ error: 'unknown_artwork_authorship', message: '无法区分旧画作中孩子与 AI 的笔迹，已保留作品，不进行儿童特征分析。' })
    if (typeof imageBase64 !== 'string' || !imageBase64.trim()) {
      return res.status(400).json({ error: 'imageBase64 required' })
    }
    if (submissionKey !== null && (typeof submissionKey !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(submissionKey))) {
      return res.status(400).json({ error: 'invalid submissionKey' })
    }
    if (req.auth && req.auth.role !== 'child') return res.status(403).json({ error: 'child account required' })
    const encoded = imageBase64.replace(/^data:image\/(?:png|jpeg|jpg|webp);base64,/i, '')
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length % 4 !== 0) return res.status(400).json({ error: 'invalid imageBase64' })
    const buffer = Buffer.from(encoded, 'base64')
    if (!buffer.length || buffer.length > 10 * 1024 * 1024) return res.status(400).json({ error: 'invalid image size' })
    const sha = crypto.createHash('sha256').update(buffer).digest('hex')
    let displayBuffer = buffer
    let displayMime = imageBase64.match(/^data:(image\/(?:png|jpeg|jpg|webp));base64,/i)?.[1]?.toLowerCase() ?? 'image/png'
    if (artworkId !== undefined || artworkRevision !== undefined) {
      if (displayImageBase64 !== undefined || typeof artworkId !== 'string' || !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(artworkId)
        || !Number.isSafeInteger(artworkRevision) || artworkRevision < 1) return res.status(400).json({ error: 'invalid artwork reference' })
      if (!db || req.auth?.role !== 'child') return res.status(401).json({ error: 'login required for artwork reference' })
      const saved = db.prepare('SELECT image_base64, revision, provenance, document_json FROM artworks WHERE id = ? AND child_id = ?').get(artworkId, req.auth.accountId)
      if (!saved) return res.status(404).json({ error: 'artwork not found' })
      if (saved.revision !== artworkRevision || saved.provenance !== provenance) return res.status(409).json({ error: 'artwork version or provenance changed' })
      const drawing = saved.document_json ? JSON.parse(saved.document_json) : null
      if (drawing?.operations?.some(op => op.type === 'assist')) return res.status(422).json({
        error: 'assisted_artwork_requires_process_review',
        message: '作品和修改过程已保存。共同修改后的画面不作为孩子自主表达的特征分析。',
      })
      displayBuffer = displayPng(saved.image_base64)
      if (!displayBuffer) return res.status(400).json({ error: 'invalid saved artwork image' })
      displayMime = 'image/png'
    } else if (displayImageBase64 !== undefined) {
      if (req.auth) return res.status(400).json({ error: 'use a saved artwork reference for the display image' })
      displayBuffer = displayPng(displayImageBase64)
      if (!displayBuffer) return res.status(400).json({ error: 'invalid display image' })
      displayMime = 'image/png'
    }
    const displaySha = crypto.createHash('sha256').update(displayBuffer).digest('hex')
    const existing = () => db && req.auth && submissionKey
      ? db.prepare('SELECT * FROM analyses WHERE child_id = ? AND submission_key = ?').get(req.auth.accountId, submissionKey) : null
    const returnExisting = row => {
      const stored = JSON.parse(row.features_json)
      if ((stored.analysisImageSha256 ?? row.image_sha256) !== sha) return res.status(409).json({ error: 'submission key belongs to another image' })
      if ((stored.provenance ?? 'child') !== provenance) return res.status(409).json({ error: 'submission key belongs to another provenance' })
      if ((stored.displayImageSha256 ?? row.image_sha256) !== displaySha
        || (stored.artworkId ?? null) !== (artworkId ?? null)
        || (stored.artworkRevision ?? null) !== (artworkRevision ?? null)) return res.status(409).json({ error: 'submission key belongs to another artwork display' })
      return res.json({ features: stored, feedbackText: buildFeedback(stored), followUp: FOLLOW_UP, feedbackTextEn: englishFeedback(stored), followUpEn: ENGLISH_FOLLOW_UP, analysisId: row.id })
    }
    const previous = existing()
    if (previous) return returnExisting(previous)
    let features
    try {
      features = await extractFeatures(encoded, { chatWithImage })
      features.provenance = provenance
      features.analysisScope = 'child-only'
      features.analysisImageSha256 = sha
      features.displayImageSha256 = displaySha
      features.displayScope = artworkId !== undefined || displayImageBase64 !== undefined ? 'composite' : 'child-only'
      if (artworkId !== undefined) { features.artworkId = artworkId; features.artworkRevision = artworkRevision }
      if (source === 'digital_canvas') features.source = 'digital_canvas'
    } catch (err) {
      log.error('analyze', { msg: `feature extraction failed: ${err.message}` })
      return res.status(502).json({ error: 'feature_extraction_failed' })
    }
    // 登录孩子：分析落库，保存受控图片副本供家长端查看
    let analysisId = null
    if (db && req.auth?.role === 'child') {
      if (!db.prepare("SELECT 1 FROM accounts WHERE id = ? AND family_id = ? AND role = 'child'").get(req.auth.accountId, req.auth.familyId)) {
        return res.status(401).json({ error: 'account no longer exists' })
      }
      if (artworkId !== undefined) {
        const latest = db.prepare('SELECT revision, provenance FROM artworks WHERE id = ? AND child_id = ?').get(artworkId, req.auth.accountId)
        if (!latest || latest.revision !== artworkRevision || latest.provenance !== provenance) return res.status(409).json({ error: 'artwork changed during analysis' })
      }
      let writtenFile = null
      try {
        const concurrent = existing()
        if (concurrent) return returnExisting(concurrent)
        fs.mkdirSync(uploadDir, { recursive: true })
        const fileName = `${crypto.randomUUID()}.bin`
        fs.writeFileSync(path.join(uploadDir, fileName), displayBuffer, { flag: 'wx' })
        writtenFile = path.join(uploadDir, fileName)
        analysisId = insertAnalysis(db, {
          childId: req.auth.accountId, familyId: req.auth.familyId, features,
          submissionKey,
          feedbackText: buildFeedback(features), followUp: FOLLOW_UP,
          // The media checksum matches retained bytes for backups; analysisImageSha256 deduplicates the child-only input.
          image: { path: fileName, mime: displayMime, size: displayBuffer.length, sha256: displaySha },
        })
      } catch (err) {
        if (writtenFile) fs.rmSync(writtenFile, { force: true })
        log.error('analyze', { msg: `analysis persistence failed: ${err.message}` })
        return res.status(500).json({ error: 'analysis_persistence_failed' })
      }
    }
    traceNode('analyze_features', { elements: features.elements ?? [], darkRatio: features.colors?.darkRatio ?? null, dropped: features.droppedDimensions ?? [] })
    res.json({ features, feedbackText: buildFeedback(features), followUp: FOLLOW_UP, feedbackTextEn: englishFeedback(features), followUpEn: ENGLISH_FOLLOW_UP, ...(analysisId && { analysisId }) })
  }))

  router.post('/report', asyncRoute(async (req, res) => {
    const { features: clientFeatures, analysisId = null, childAge = null } = req.body ?? {}
    const locale = localeOf(req.body?.locale)
    if (req.auth?.role === 'child') return res.status(403).json({ error: 'parent account required' })
    if (analysisId !== null && (typeof analysisId !== 'string' || analysisId.length > 100)) return res.status(400).json({ error: 'invalid analysisId' })
    if (analysisId && !req.auth) return res.status(401).json({ error: 'login required' })
    if (req.auth && !analysisId) return res.status(400).json({ error: 'analysisId required' })
    if (!analysisId && !clientFeatures) {
      return res.status(400).json({ error: 'features required' })
    }
    let features = clientFeatures
    let age = Number.isInteger(childAge) && childAge >= 0 && childAge <= 18 ? childAge : null
    if (analysisId && req.auth) {
      const saved = db.prepare('SELECT a.child_id, a.family_id, a.features_json, c.birth_date FROM analyses a JOIN accounts c ON c.id = a.child_id WHERE a.id = ?').get(analysisId)
      if (!saved) return res.status(404).json({ error: 'analysis not found' })
      const allowed = (req.auth.role === 'child' && req.auth.accountId === saved.child_id)
        || (req.auth.role === 'parent' && req.auth.familyId === saved.family_id)
      if (!allowed) return res.status(403).json({ error: 'forbidden' })
      features = JSON.parse(saved.features_json)
      if (saved.birth_date) {
        const birth = new Date(saved.birth_date)
        const now = new Date()
        age = now.getUTCFullYear() - birth.getUTCFullYear()
        if (now.getUTCMonth() < birth.getUTCMonth() || (now.getUTCMonth() === birth.getUTCMonth() && now.getUTCDate() < birth.getUTCDate())) age--
      } else age = null
    }
    if (age !== null && (age < 5 || age > 12)) {
      return res.status(422).json({ error: 'age_out_of_scope', message: '画面观察目前面向 5–12 岁儿童。' })
    }
    try { validateFeatures(features, { gated: true }) } catch { return res.status(400).json({ error: 'invalid features' }) }
    features = gateFeatures(features).features

    // New reports describe the child's visible marks only. The historical HTP
    // score and unreviewed rule notes are not evidence about an individual child.
    const observation = buildObservationReport(features, { locale, childAge: age })
    traceNode('report_observation', { status: observation.observationStatus, ids: observation.evidence.map(e => e.entryId), provenance: features.provenance ?? 'unknown' })
    log.audit({ kind: observation.kind, status: observation.observationStatus, ids: observation.evidence.map(e => e.entryId), knowledgeVersion: 'observation-v1' },
      { accountId: req.auth?.accountId ?? null, analysisId })
    const enrichedObservation = {
      ...observation,
      referenceEvidence: buildLiteratureContext(locale),
      referenceEvidenceSource: locale === 'en' ? 'Research background, not a reading of this picture' : '研究背景，不是对这幅画的判断',
      provenance: features.provenance ?? 'unknown',
      analysisScope: features.analysisScope ?? 'legacy',
    }
    if (features.provenance === 'co-created') {
      enrichedObservation.provenanceNote = locale === 'en'
        ? 'This observation uses only the child’s marks. Their choices may still reflect the shared activity with Nilo.'
        : '本次观察只使用孩子自己的笔迹；创作选择仍可能受到与 Nilo 共创过程的影响。'
      enrichedObservation.parentAdvice = [enrichedObservation.provenanceNote, ...enrichedObservation.parentAdvice]
    }
    if (db && req.auth && analysisId) {
      const saved = attachReport(db, analysisId, enrichedObservation, req.auth, {
        knowledgeVersion: 'observation-v1', matchedEntryIds: observation.evidence.map(e => e.entryId),
        conflicts: [], dropped: [], reason: observation.observationStatus,
      })
      if (!saved) return res.status(404).json({ error: 'analysis no longer exists' })
    }
    res.json(enrichedObservation)


  }))

  return router
}
