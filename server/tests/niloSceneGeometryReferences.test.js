import { afterEach, expect, test } from 'vitest'
import { SCENE_GEOMETRY_REFERENCE_LIMITS, sceneGeometryReferences } from '../src/services/niloSceneGeometryReferences.js'
import { drawingRecipes, getDrawingRecipe } from '../../shared/niloRecipes.mjs'
import { getMaterialCuration, isMaterialEnabled, setMaterialCuration } from '../../shared/niloCuration.mjs'
import { validateSketch } from '../../shared/niloSketch.mjs'

const initial = getMaterialCuration()
afterEach(() => setMaterialCuration(initial))
const commandCount = refs => refs.reduce((sum, ref) => sum + ref.sketch.paths.reduce((total, path) => total + path.length, 0), 0)

test('a whale town gets a genuine whale base, without adding a random town template or replacing the fused subject', () => {
  const target = { name: '鲸鱼背上的小镇', aliases: ['鲸鱼小镇'], essential: ['鲸鱼的完整身形', '背部连接着几座房子'] }
  const refs = sceneGeometryReferences(target)
  expect(refs).toHaveLength(1)
  expect(refs[0]).toMatchObject({ id: 'whale-1', subject: 'whale', name: '鲸鱼' })
  expect(refs[0].sketch).toEqual(getDrawingRecipe('whale-1').sketch)
  expect(target.essential).toContain('背部连接着几座房子')
})

test.each([
  { name: '阿古斯精灵', essential: ['完整精灵轮廓', '独特的耳朵'] },
  { name: '海马', essential: ['弯曲的海马尾巴'] },
  { name: '糖果星球', essential: ['糖果表面'] },
  { name: '火花生物', essential: ['火花形状'] },
])('unknown inventions do not acquire a fallback identity from a substring or theme: $name', target => {
  expect(sceneGeometryReferences(target)).toEqual([])
})

test('explicitly named familiar parts can each receive a base without erasing the required new attachment', () => {
  const target = { name: '长鲸鱼尾巴的兔子', aliases: ['兔子'], essential: ['兔子身体', '鲸鱼尾巴连接在兔子身上'] }
  const refs = sceneGeometryReferences(target)
  expect(new Set(refs.map(ref => ref.subject))).toEqual(new Set(['rabbit', 'whale']))
  expect(refs.find(ref => ref.subject === 'rabbit').id).toBe('rabbit-3')
  expect(target.essential).toContain('鲸鱼尾巴连接在兔子身上')
})

test('explicit pose words outrank a generic reference preference', () => {
  const refs = sceneGeometryReferences({ name: '喷水鲸鱼', essential: ['鲸鱼喷水'] })
  expect(refs[0].id).toBe('whale-0')
})

test('curation and retirement apply before returning any geometry', () => {
  const decisions = Object.fromEntries(drawingRecipes.filter(recipe => recipe.subject === 'whale').map(recipe => [recipe.id, 'reject']))
  setMaterialCuration({ ...initial, decisions: { ...initial.decisions, ...decisions } })
  expect(sceneGeometryReferences({ name: '鲸鱼背上的小镇' })).toEqual([])
  expect(sceneGeometryReferences({ name: '城堡和小房子' })).toEqual([])
})

test('many named objects cannot exceed the subject, command or serialized prompt budgets', () => {
  const refs = sceneGeometryReferences({ name: '兔子、鲸鱼、树木、花朵和云彩', aliases: ['小船', '小猫'], essential: ['小鸟', '树叶'] })
  expect(refs.length).toBeGreaterThan(0)
  expect(refs.length).toBeLessThanOrEqual(SCENE_GEOMETRY_REFERENCE_LIMITS.subjects)
  expect(new Set(refs.map(ref => ref.subject)).size).toBe(refs.length)
  expect(commandCount(refs)).toBeLessThanOrEqual(SCENE_GEOMETRY_REFERENCE_LIMITS.commands)
  expect(JSON.stringify(refs).length).toBeLessThanOrEqual(SCENE_GEOMETRY_REFERENCE_LIMITS.characters)
  for (const ref of refs) {
    expect(isMaterialEnabled(ref.id)).toBe(true)
    expect(getDrawingRecipe(ref.id).style ?? 'storybook').toBe('storybook')
    expect(validateSketch(ref.sketch)).toEqual(ref.sketch)
  }
})
