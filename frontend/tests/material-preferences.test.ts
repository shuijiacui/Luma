import { beforeEach, expect, test, vi } from 'vitest'
import { getMaterial, rankMaterials, getMaterialChoices } from '../../shared/niloMaterialLibrary.mjs'
import { appendMaterialChoice, MATERIAL_CHOICE_LIMIT, preferredMaterials, readMaterialChoices, saveMaterialChoices } from '@/features/child/companion/materialPreferences'

beforeEach(() => localStorage.clear())

test('choices belong to the real child, survive reopening and contain no artwork or family identity', () => {
  const material = getMaterial('illustration-medium-school')!
  const choices = appendMaterialChoice([], material, 1234)
  saveMaterialChoices('child-a', choices)
  expect(readMaterialChoices('child-a')).toEqual([{ subject: 'school', materialId: material.id,
    style: 'storybook', difficulty: 'medium', chosenAt: 1234 }])
  expect(readMaterialChoices('child-b')).toEqual([])
  expect(localStorage.length).toBe(1)
})

test('guests do not read or write a shared local preference profile', () => {
  saveMaterialChoices(undefined, appendMaterialChoice([], getMaterial('cat-0')!, 1234))
  expect(readMaterialChoices()).toEqual([])
  expect(localStorage.length).toBe(0)
})

test('bounded choice history keeps the most recent explicit actions and ranks only that subject', () => {
  let choices: ReturnType<typeof readMaterialChoices> = []
  for (let i = 1; i <= 50; i++) choices = appendMaterialChoice(choices, getMaterial(i % 2 ? 'cat-0' : 'cat-2')!, i)
  expect(choices).toHaveLength(MATERIAL_CHOICE_LIMIT)
  expect(choices[0].chosenAt).toBe(19)
  const before = getMaterialChoices('cat')
  const sorted = rankMaterials(before, preferredMaterials(choices, 'cat'))
  expect(sorted[0].id).toBe('cat-2')
  expect(new Set(sorted.map(item => item.id))).toEqual(new Set(before.map(item => item.id)))
  expect(preferredMaterials(choices, 'school')).toEqual({ recentIds: [], preferredStyle: undefined, preferredDifficulty: undefined })
})

test('malformed storage and disabled storage cannot interrupt drawing', () => {
  localStorage.setItem('luma_material_choices:v1:child-a', '{broken')
  expect(readMaterialChoices('child-a')).toEqual([])
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('full') })
  expect(() => saveMaterialChoices('child-a', appendMaterialChoice([], getMaterial('cat-0')!, 1000))).not.toThrow()
})
