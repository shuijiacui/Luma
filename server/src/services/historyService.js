// 画作分析历史：登录孩子的每次 analyze/report 落库，家长可查
import crypto from 'node:crypto'

export function insertAnalysis(db, { childId, familyId, features }) {
  const id = crypto.randomUUID()
  db.prepare('INSERT INTO analyses (id, child_id, family_id, features_json, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(id, childId, familyId, JSON.stringify(features), new Date().toISOString())
  return id
}

// 归属校验：本人（孩子）或同家庭家长才能写报告
export function attachReport(db, analysisId, report, auth) {
  const row = db.prepare('SELECT child_id, family_id FROM analyses WHERE id = ?').get(analysisId)
  if (!row) return false
  const isOwner = auth.role === 'child' && auth.accountId === row.child_id
  const isFamilyParent = auth.role === 'parent' && auth.familyId === row.family_id
  if (!isOwner && !isFamilyParent) return false
  db.prepare('UPDATE analyses SET report_json = ? WHERE id = ?').run(JSON.stringify(report), analysisId)
  return true
}

export function listAnalyses(db, childId, auth) {
  const isOwner = auth.role === 'child' && auth.accountId === childId
  const child = db.prepare("SELECT family_id FROM accounts WHERE id = ? AND role = 'child'").get(childId)
  const isFamilyParent = child && auth.role === 'parent' && auth.familyId === child.family_id
  if (!isOwner && !isFamilyParent) return null
  return db.prepare('SELECT id, features_json, report_json, created_at AS createdAt FROM analyses WHERE child_id = ? ORDER BY created_at DESC LIMIT 50')
    .all(childId)
    .map(row => {
      const features = JSON.parse(row.features_json)
      const report = row.report_json ? JSON.parse(row.report_json) : null
      return {
        id: row.id,
        createdAt: row.createdAt,
        summary: {
          elements: features.elements ?? [],
          darkRatio: features.colors?.darkRatio ?? null,
          distortions: features.distortions ?? [],
        },
        report: report
          ? { emotion: report.emotion, confidence: report.confidence, evidence: report.evidence, parentAdvice: report.parentAdvice }
          : null,
      }
    })
}
