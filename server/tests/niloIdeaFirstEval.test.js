import { expect, test, vi } from 'vitest'
import { comparisonCases, evaluateIdeaFixture, ideaComparisonReport } from '../scripts/check-nilo-idea-first.mjs'

test('comparison uses the production two-stage flow and records failed turns in the denominator', async () => {
  const provider = vi.fn().mockResolvedValueOnce({ subjects: [], idea: { subject: '小鸟', relationship: '来看看仙人掌',
    searchTerms: ['bird'], requiresCustom: false, details: ['头和翅膀'] } }).mockResolvedValueOnce({ recipeId: 'bird-0', scale: .2, color: '#7b4fa8' })
  const { record, preview } = await evaluateIdeaFixture(comparisonCases[0], 'idea-first', { provider })
  expect(record.canvasFits).toBe(true)
  expect(preview.proposal).toEqual(record.result.proposal)
  expect(record.calls.map(c => c.stage)).toEqual(['nilo_creative_ideate', 'nilo_creative_render'])
  expect(record.calls.every(c => Number.isFinite(c.latencyMs))).toBe(true)
  expect(record.calls[0].data.idea.subject).toBe('小鸟')
  const failed = await evaluateIdeaFixture(comparisonCases[0], 'catalogue', { provider: vi.fn().mockRejectedValue(new Error('private provider detail')) })
  expect(failed.record.canvasFits).toBe(false)
  expect(JSON.stringify(failed.record)).not.toContain('private provider detail')
  const report = ideaComparisonReport([record, { ...failed.record, variant: 'idea-first' }])
  expect(report.groups[0]).toMatchObject({ total: 2, canvasPasses: 1, semanticPasses: null })
})

test('comparison gives both variants the same request and does not expose author review criteria', async () => {
  const fixture = comparisonCases.find(c => c.request.includes('头盔'))
  const calls = []
  for (const variant of ['catalogue', 'idea-first']) {
    await evaluateIdeaFixture({ ...fixture, semanticChecklist: ['DO_NOT_LEAK_RUBRIC'] }, variant,
      { provider: async (image, prompt, options) => { calls.push({ image, prompt, options }); throw new Error('stop') } })
  }
  expect(calls).toHaveLength(2)
  expect(calls[0].image).toBe(calls[1].image)
  for (const call of calls) {
    expect(call.prompt).toContain(fixture.request)
    expect(call.prompt).not.toContain('DO_NOT_LEAK_RUBRIC')
    expect(call.options.retries).toBe(0)
  }
})

test('invalid comparison modes fail before any provider call', async () => {
  const provider = vi.fn()
  await expect(evaluateIdeaFixture(comparisonCases[0], 'typo', { provider })).rejects.toThrow('Invalid variant')
  expect(provider).not.toHaveBeenCalled()
})
