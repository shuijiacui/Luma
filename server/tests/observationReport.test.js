import { expect, test } from 'vitest'
import { buildObservationReport } from '../src/services/observationReport.js'
import { buildLiteratureContext } from '../src/services/literatureContext.js'

const features = {
  elements: ['tree', 'person'],
  objects: [{ label: 'tree', visibility: 'visible', bbox: { x: .1, y: .2, width: .3, height: .6 }, confidence: .9 }],
  colors: { dominant: ['green', 'black'], darkRatio: .7 },
  confidence: { elements: .9, colors: .8 },
}

test('a dark tree stays a visible observation, never an individual mood claim', () => {
  const report = buildObservationReport(features, { childAge: 6 })
  expect(report).toMatchObject({ kind: 'observation-v1', emotion: '画面观察', confidence: 0, childAgeBand: '5-7' })
  expect(report.evidence.map(e => e.entryId)).toEqual(['OBS-elements', 'OBS-colors', 'OBS-position'])
  expect(JSON.stringify(report)).not.toMatch(/低落倾向|焦虑倾向|风险信号|HTP-/)
})

test('unclear or unknown marks are not renamed as a familiar object', () => {
  const report = buildObservationReport({
    ...features, elements: ['unfamiliar-creature'],
    objects: [{ label: 'unfamiliar-creature', visibility: 'unclear', bbox: null, confidence: .3 }],
    colors: null, confidence: { elements: .3, colors: .2 },
  }, { locale: 'en', childAge: 10 })
  expect(report).toMatchObject({ observationStatus: 'insufficient', childAgeBand: '10-12', evidence: [] })
  expect(report.parentAdvice[0]).toContain('which part')
})

test('5–12 age bands change conversation prompts, not visible evidence or psychological meaning', () => {
  const younger = buildObservationReport(features, { childAge: 6 })
  const middle = buildObservationReport(features, { childAge: 8 })
  const older = buildObservationReport(features, { childAge: 12 })
  const unknown = buildObservationReport(features)
  expect([younger.childAgeBand, middle.childAgeBand, older.childAgeBand, unknown.childAgeBand])
    .toEqual(['5-7', '8-9', '10-12', null])
  expect(new Set([younger.parentAdvice[0], middle.parentAdvice[0], older.parentAdvice[0]]).size).toBe(3)
  expect(unknown.ageContext).toBeNull()
  for (const report of [middle, older, unknown]) expect(report.evidence).toEqual(younger.evidence)
  expect(older.ageContext).toContain('不替孩子定义主题')
})

test("research context is source-linked, general, and independent of the child's marks", () => {
  const context = buildLiteratureContext('en')
  expect(context).toHaveLength(3)
  expect(context.every(item => item.role === 'reference_only' && item.sourceUrl.startsWith('https://'))).toBe(true)
  expect(context.map(item => item.sourceId)).toEqual(buildLiteratureContext('zh').map(item => item.sourceId))
  expect(JSON.stringify(context)).not.toContain('OBS-elements')
})
