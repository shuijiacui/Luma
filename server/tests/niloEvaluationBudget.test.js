import { expect, test, vi } from 'vitest'
import { evaluationBudget } from '../scripts/nilo-evaluation-budget.mjs'
import { openSceneOptions } from '../scripts/eval-nilo-open-scenes.mjs'

test('failed HTTP attempts and retries share one hard budget while downloads remain possible', async () => {
  const provider = vi.fn().mockRejectedValueOnce(new Error('network')).mockResolvedValue(new Response('{}'))
  const { fetch, usage } = evaluationBudget(provider, { maxApiCalls: 2, maxImageCalls: 1 })
  await expect(fetch('https://example.invalid/chat', { method: 'POST' })).rejects.toThrow('network')
  await fetch(new Request('https://example.invalid/chat', { method: 'POST' }))
  await expect(fetch('https://example.invalid/chat', { method: 'POST' })).rejects.toThrow('evaluation_budget_exhausted')
  await fetch('https://example.invalid/result.png')
  expect(provider).toHaveBeenCalledTimes(3)
  expect(usage).toMatchObject({ apiCalls: 2, imageCalls: 0, blockedCalls: 1 })
})

test('images have their own cap, without exhausting remaining text or vision allowance', async () => {
  const provider = vi.fn().mockResolvedValue(new Response('{}'))
  const { fetch, usage } = evaluationBudget(provider, { maxApiCalls: 4, maxImageCalls: 1 })
  await fetch('https://example.invalid/compatible-mode/v1/images/generations', { method: 'POST' })
  await expect(fetch('https://example.invalid/compatible-mode/v1/images/generations', { method: 'POST' })).rejects.toThrow('evaluation_budget_exhausted')
  await fetch('https://example.invalid/chat', { method: 'POST' })
  expect(provider).toHaveBeenCalledTimes(2)
  expect(usage).toMatchObject({ apiCalls: 2, imageCalls: 1, blockedCalls: 1 })
})

test('CLI budgets cannot silently accept invalid or duplicated limits', () => {
  for (const args of [['--max-api-calls=0'], ['--max-image-calls=1.5'], ['--max-api-calls=Infinity'], ['--max-image-calls=1', '--max-image-calls=2']]) {
    expect(() => openSceneOptions(args)).toThrow()
  }
})
