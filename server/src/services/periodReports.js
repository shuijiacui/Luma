import crypto from 'node:crypto'

const DAY = 86400000
const OFFSET = 8 * 3600000
export const REPORT_TIME_ZONE = 'Asia/Shanghai'

// Calendar arithmetic uses UTC on a shifted date, independent of the host timezone.
export function periodBounds(value, kind) {
  if (!['weekly', 'monthly'].includes(kind)) throw new Error('invalid period kind')
  const date = new Date(new Date(value).getTime() + OFFSET)
  if (!Number.isFinite(date.getTime())) throw new Error('invalid period date')
  date.setUTCHours(0, 0, 0, 0)
  if (kind === 'weekly') date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7)
  else date.setUTCDate(1)
  const start = date.getTime() - OFFSET
  if (kind === 'weekly') date.setUTCDate(date.getUTCDate() + 7)
  else date.setUTCMonth(date.getUTCMonth() + 1)
  return { start: new Date(start).toISOString(), end: new Date(date.getTime() - OFFSET).toISOString() }
}

function localDay(value) { return new Date(new Date(value).getTime() + OFFSET).toISOString().slice(0, 10) }

function summarize(rows, previousCount, bounds) {
  const elements = new Map()
  const advice = new Set()
  let withReport = 0
  let insufficientReports = 0
  for (const row of rows) {
    const features = JSON.parse(row.features_json)
    for (const element of new Set(features.elements ?? [])) elements.set(element, (elements.get(element) ?? 0) + 1)
    if (row.report_json) {
      const report = JSON.parse(row.report_json)
      withReport++
      if (report.emotion === '信息不足' || !(report.confidence > 0)) insufficientReports++
      for (const item of report.parentAdvice ?? []) if (typeof item === 'string') advice.add(item)
    }
  }
  return {
    periodLabel: `${localDay(bounds.start)} — ${localDay(new Date(new Date(bounds.end).getTime() - DAY))}`,
    artworkCount: rows.length,
    activeDays: new Set(rows.map(row => localDay(row.created_at))).size,
    previousArtworkCount: previousCount,
    artworkCountChange: rows.length - previousCount,
    withReport, insufficientReports,
    elements: [...elements].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 12).map(([name, count]) => ({ name, count })),
    parentAdvice: [...advice].slice(0, 6),
    sources: rows.map(row => ({ analysisId: row.id, createdAt: row.created_at, hasReport: !!row.report_json })),
    note: '仅汇总已保存的创作与已有报告；数量变化不代表心理状态变化。元素由 AI 识别，可能存在误差。',
  }
}

// Rebuild from authoritative rows; changed/deleted source data never survives in a digest.
export function generateChildReports(db, childId, now = new Date()) {
  const rows = db.prepare('SELECT id, features_json, report_json, created_at FROM analyses WHERE child_id = ? ORDER BY created_at, id').all(childId)
  const reports = []
  for (const kind of ['weekly', 'monthly']) {
    const groups = new Map()
    for (const row of rows) {
      const bounds = periodBounds(row.created_at, kind)
      if (new Date(bounds.end) > now) continue
      const group = groups.get(bounds.start) ?? { ...bounds, rows: [] }
      group.rows.push(row)
      groups.set(bounds.start, group)
    }
    for (const group of groups.values()) {
      const previous = periodBounds(new Date(new Date(group.start).getTime() - 1), kind)
      const summary = summarize(group.rows, groups.get(previous.start)?.rows.length ?? 0, group)
      const summaryJson = JSON.stringify(summary)
      // Include sources' report content so an edited report updates generatedAt even if counts match.
      const sourceHash = crypto.createHash('sha256').update(JSON.stringify([group.rows, summary])).digest('hex')
      reports.push({ kind, ...group, summaryJson, sourceHash })
    }
  }
  db.exec('BEGIN IMMEDIATE')
  try {
    const keys = new Set(reports.map(r => `${r.kind}:${r.start}`))
    for (const old of db.prepare('SELECT id, kind, period_start FROM period_reports WHERE child_id = ?').all(childId)) {
      if (!keys.has(`${old.kind}:${old.period_start}`)) db.prepare('DELETE FROM period_reports WHERE id = ?').run(old.id)
    }
    const upsert = db.prepare(`INSERT INTO period_reports (id, child_id, kind, period_start, period_end, summary_json, source_hash, generated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(child_id, kind, period_start) DO UPDATE SET summary_json = excluded.summary_json, source_hash = excluded.source_hash, generated_at = excluded.generated_at
      WHERE period_reports.source_hash != excluded.source_hash`)
    for (const r of reports) upsert.run(crypto.randomUUID(), childId, r.kind, r.start, r.end, r.summaryJson, r.sourceHash, now.toISOString())
    db.exec('COMMIT')
  } catch (error) { db.exec('ROLLBACK'); throw error }
  return reports.length
}

export function generateAllReports(db, now = new Date()) {
  let count = 0
  for (const child of db.prepare("SELECT id FROM accounts WHERE role = 'child'").all()) count += generateChildReports(db, child.id, now)
  return count
}

export function startReportScheduler(db, { enabled = true } = {}) {
  if (!enabled) return () => {}
  const run = () => { try { generateAllReports(db) } catch (error) { console.error('[period-reports]', error.message) } }
  run()
  const timer = setInterval(run, 3600000)
  timer.unref()
  return () => clearInterval(timer)
}
