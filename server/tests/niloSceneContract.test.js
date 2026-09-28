import { expect, test } from 'vitest'
import { alignGeneratedSceneContract } from '../src/services/niloSceneContract.js'

const input = { rasterGeneration: true, semanticBrief: { requiredSubjects: ['湖'] }, utterance: '画一个安静的湖，不要人', context: { requestScope: 'scene' } }
const plan = { summary: '一片星形的小湖旁有树木。', request: '模型删掉了否定要求', objects: [{ id: 'lake', render: { kind: 'generated' }, essential: ['一片圆形湖泊', '隐藏的装饰'] }] }

test('the idea the child approves governs generated geometry, rather than contradictory hidden planner details', () => {
  const before = structuredClone(plan), result = alignGeneratedSceneContract(plan, input)
  expect(result.objects[0].essential).toEqual([plan.summary])
  expect(result.request).toBe(input.utterance)
  expect(plan).toEqual(before)
})

test('explicit unfamiliar child subjects remain mandatory when a short summary uses a broad description', () => {
  const result = alignGeneratedSceneContract(plan, { ...input, semanticBrief: { requiredSubjects: ['湖', '长着蝴蝶翅膀的猫'] } })
  expect(result.objects[0].essential).toContain('长着蝴蝶翅膀的猫')
})

test('existing scene edits and stock subjects retain their immutable feature contracts', () => {
  expect(alignGeneratedSceneContract(plan, { ...input, plan: structuredClone(plan) })).toBe(plan)
  const stock = { ...plan, objects: [{ ...plan.objects[0], render: { kind: 'illustration', illustrationId: 'existing' } }] }
  expect(alignGeneratedSceneContract(stock, input)).toBe(stock)
})

test('a large explicit contract is never silently truncated to fit a schema limit', () => {
  expect(alignGeneratedSceneContract(plan, { ...input, semanticBrief: { requiredSubjects: ['猫', '狗', '鲸鱼', '飞龙'] } })).toBe(plan)
})
