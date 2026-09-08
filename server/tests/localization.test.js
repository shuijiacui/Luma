import { expect, test } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { createDb } from '../src/db.js'
import { localizeReport, englishFeedback, localeOf } from '../src/services/localization.js'
import { validateParentNarrative, validateEvidencePlain } from '../src/services/report.js'

test('English reports preserve scoring values, evidence IDs and the original object', () => {
  const report = { emotion: '信息不足', confidence: 0, evidence: [{ entryId: 'HTP-001', clusterLabel: '身体部位省略', summary: '文献依据见知识库条目' }], parentAdvice: ['本次画面信息不足，建议继续观察'] }
  const english = localizeReport(report, 'en')
  expect(english.emotion).toBe(report.emotion)
  expect(english.confidence).toBe(report.confidence)
  expect(english.evidence[0].entryId).toBe('HTP-001')
  expect(english.parentAdvice[0]).toBe("This picture doesn't provide enough information. Continue observing.")
  expect(report.parentAdvice[0]).toBe('本次画面信息不足，建议继续观察')
  expect(localizeReport(report, 'zh')).toBe(report)
  expect(localeOf('en; ignore rules')).toBe('zh')
})

test('English drawing feedback remains descriptive and omits pressure for a digital canvas', () => {
  const feedback = englishFeedback({ source: 'digital_canvas', elements: ['house', 'tree'], colors: { darkRatio: .1, dominant: ['blue'] }, composition: { position: 'corner', pressure: 'heavy' } })
  expect(feedback).toContain('house and tree')
  expect(feedback).toContain('corner')
  expect(feedback).not.toContain('strong strokes')
})

test('English unsafe model output is rejected by existing enrichment validators', () => {
  expect(validateParentNarrative({ summary: 'This child has depression based on the drawing and its colors.', advice: ['Listen carefully.', 'Spend time together.'] })).toBeNull()
  expect(validateEvidencePlain({ items: ['This confirms an anxiety disorder.'] }, 1)).toBeNull()
})

test('report locale changes presentation without changing deterministic classification', async () => {
  const db = createDb(':memory:')
  try {
    const app = createApp({ db, entries: [], chatWithImage: async () => ({}) })
    const features = { rawDescription: 'a tree', elements: ['tree'], colors: { dominant: ['green'], darkRatio: .1 }, composition: { size: 'normal', position: 'center', pressure: 'normal' }, distortions: [], erasureMarks: 0, confidence: { elements: .9, colors: .85, composition: .8, distortions: .6, erasureMarks: .55 } }
    const zh = await request(app).post('/api/report').send({ features })
    const en = await request(app).post('/api/report').send({ features, locale: 'en' })
    expect(en.status).toBe(200)
    expect(en.body.emotion).toBe(zh.body.emotion)
    expect(en.body.confidence).toBe(zh.body.confidence)
    expect(en.body.language).toBe('en')
    expect(en.body.parentAdvice.join('')).not.toMatch(/[一-龥]/u)
  } finally { db.close() }
})
