// 画作分析历史：登录孩子的每次 analyze/report 落库，家长可查
import crypto from 'node:crypto'

export function insertAnalysis(db, { childId, familyId, features, feedbackText = null, followUp = null, image = null, submissionKey = null }) {
  // An asynchronous model call may finish after the family was deleted.
  if (!db.prepare("SELECT 1 FROM accounts WHERE id = ? AND family_id = ? AND role = 'child'").get(childId, familyId)) throw new Error('child account no longer exists')
  const id = crypto.randomUUID()
  db.prepare(`INSERT INTO analyses
    (id, child_id, family_id, features_json, feedback_json, image_path, image_mime, image_size, image_sha256, created_at, submission_key)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, childId, familyId, JSON.stringify(features), JSON.stringify({ feedbackText, followUp }),
      image?.path ?? null, image?.mime ?? null, image?.size ?? null, image?.sha256 ?? null,
      new Date().toISOString(), submissionKey)
  return id
}

// 只有同家庭家长可以写报告。
export function attachReport(db, analysisId, report, auth, audit = null) {
  const row = db.prepare('SELECT child_id, family_id FROM analyses WHERE id = ?').get(analysisId)
  if (!row) return false
  const isFamilyParent = auth.role === 'parent' && auth.familyId === row.family_id
  if (!isFamilyParent) return false
  db.prepare('UPDATE analyses SET report_json = ? WHERE id = ?').run(JSON.stringify({ ...report, audit }), analysisId)
  db.prepare('DELETE FROM period_reports WHERE child_id = ?').run(row.child_id)
  return true
}

export function listAnalyses(db, childId, auth, { limit = 50, offset = 0 } = {}) {
  const isOwner = auth.role === 'child' && auth.accountId === childId
  const child = db.prepare("SELECT family_id FROM accounts WHERE id = ? AND role = 'child'").get(childId)
  const isFamilyParent = child && auth.role === 'parent' && auth.familyId === child.family_id
  if (!isOwner && !isFamilyParent) return null
  return db.prepare('SELECT id, features_json, feedback_json, image_mime, image_size, image_sha256, report_json, created_at AS createdAt FROM analyses WHERE child_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ? OFFSET ?')
    .all(childId, limit, offset)
    .map(row => {
      const features = JSON.parse(row.features_json)
      const feedback = row.feedback_json ? JSON.parse(row.feedback_json) : null
      const report = row.report_json ? JSON.parse(row.report_json) : null
      return {
        id: row.id,
        createdAt: row.createdAt,
        imageUrl: row.image_mime ? `/api/analyses/${row.id}/image` : null,
        feedback: feedback?.feedbackText ? feedback : null,
        rawDescription: features.rawDescription ?? null,
        summary: {
          elements: features.elements ?? [],
          darkRatio: features.colors?.darkRatio ?? null,
          distortions: features.distortions ?? [],
        },
        // 与 POST /api/report 的响应保持同构。narrative / webAdvice / referenceEvidence
        // 已由 attachReport 落库，这里必须一并读出，否则家长回看历史时这些区块会凭空消失。
        // 未生成的字段为 undefined，res.json 会自然省略，与前端可选字段声明一致。
        report: report && auth.role === 'parent'
          ? {
            emotion: report.emotion,
            confidence: report.confidence,
            evidence: report.evidence,
            parentAdvice: report.parentAdvice,
            narrative: report.narrative,
            webAdvice: report.webAdvice,
            webAdviceSource: report.webAdviceSource,
            referenceEvidence: report.referenceEvidence,
            referenceEvidenceSource: report.referenceEvidenceSource,
            audit: report.audit ?? null,
          }
          : null,
      }
    })
}

// 纵向趋势（描述性聚合，不是新判定类型——v2 界限：不下诊断、不给预测，只呈现历史序列与计数）
// direction：报告不足或近期有信息不足时 insufficient；有效报告无预警为 stable；有预警为 watch。
const WATCH_EMOTIONS = ['需要关注', '焦虑倾向', '低落倾向']

export function trendSummary(db, childId, auth) {
  const child = db.prepare("SELECT family_id FROM accounts WHERE id = ? AND role = 'child'").get(childId)
  const isFamilyParent = child && auth.role === 'parent' && auth.familyId === child.family_id
  if (!isFamilyParent) return null

  const rows = db.prepare('SELECT report_json, created_at AS createdAt FROM analyses WHERE child_id = ? ORDER BY created_at DESC, rowid DESC')
    .all(childId)
  const points = rows
    .filter(r => r.report_json)
    .map(r => {
      const report = JSON.parse(r.report_json)
      return { createdAt: r.createdAt, emotion: report.emotion, confidence: report.confidence }
    })

  const counts = {}
  for (const p of points) counts[p.emotion] = (counts[p.emotion] ?? 0) + 1

  let direction = 'insufficient'
  if (points.length >= 2) {
    const recent = points.slice(0, 3)
    direction = recent.some(p => WATCH_EMOTIONS.includes(p.emotion)) ? 'watch'
      : recent.every(p => ['乐观平稳', '未见明显风险信号'].includes(p.emotion) && p.confidence > 0) ? 'stable' : 'insufficient'
  }

  return {
    total: rows.length,
    withReport: points.length,
    direction,
    counts,
    points: points.slice(0, 10).reverse(), // 时间正序，最近 10 个点
  }
}
