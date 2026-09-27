import { expect, test } from 'vitest'
import { compileSceneObject, sanitizeScenePlan, sceneDrawingCapabilities } from '../../shared/niloSceneDrawing.mjs'
import { validateCustomSketch } from '../src/services/niloSketch.js'
import { recipeCatalogue } from '../../shared/niloRecipes.mjs'
import { getMaterialCuration, setMaterialCuration } from '../../shared/niloCuration.mjs'

const object = { id: 'castle_1', name: '城堡', role: 'main', essential: ['塔楼'], render: { kind: 'compose', primitive: 'castle' }, box: { x: .3, y: .2, width: .4, height: .4 }, color: '#66729b' }
const plan = { version: 1, title: '城堡', summary: '一座云上的城堡', request: '画梦幻城堡', objects: [object], preserve: ['小船'] }

test('every supported parameter combination compiles bounded valid data-only geometry', () => {
  const combinations = entries => entries.length ? entries[0][1].flatMap(value => combinations(entries.slice(1)).map(rest => ({ [entries[0][0]]: value, ...rest }))) : [{}]
  for (const [primitive, parameters] of Object.entries(sceneDrawingCapabilities)) {
    for (const values of combinations(Object.entries(parameters))) {
      const result = compileSceneObject({ render: { kind: 'compose', primitive, parameters: values } })
      expect(result, `${primitive} ${JSON.stringify(values)}`).toBeTruthy()
      expect(validateCustomSketch(result.sketch)).toEqual(result.sketch)
    }
  }
})

test('wings change the actual silhouette instead of only changing the object name', () => {
  const plain = compileSceneObject({ render: { kind: 'compose', primitive: 'castle', parameters: { wings: false } } })
  const flying = compileSceneObject({ render: { kind: 'compose', primitive: 'castle', parameters: { wings: true } } })
  expect(flying.sketch.paths).toHaveLength(plain.sketch.paths.length + 2)
  expect(flying.sketch.aspect).toBeGreaterThan(plain.sketch.aspect)
  expect(flying.sketch.paths.slice(-2).flat().some(command => command.includes(.025))).toBe(true)
})

test('unknown features, arbitrary SVG and invalid parameter values cannot silently disappear', () => {
  for (const render of [{ kind: 'compose', primitive: 'castle', parameters: { whaleTail: true } }, { kind: 'compose', primitive: 'stars', parameters: { count: 999 } }, { kind: 'compose', primitive: 'cloud', svg: '<script/>' }, { kind: 'custom', code: 'execute' }]) {
    expect(compileSceneObject({ render })).toBeNull()
    expect(sanitizeScenePlan({ ...plan, objects: [{ ...object, render }] })).toBeNull()
  }
})

test('scene validation rejects the whole invalid plan and supplies only safe defaults', () => {
  expect(sanitizeScenePlan(plan)).toMatchObject({ ...plan, palette: { ink: '#66729b' }, objects: [{ ...object, aliases: [], render: { ...object.render, parameters: {} } }] })
  for (const invalid of [{ ...plan, objects: [...plan.objects, ...plan.objects] }, { ...plan, objects: [{ ...object, box: { x: .9, y: .1, width: .3, height: .3 } }] }, { ...plan, objects: [{ ...object, essential: [] }] }, { ...plan, objects: [{ ...object, name: 'a'.repeat(61) }] }, { ...plan, objects: [{ ...object, role: 'support' }] }, { ...plan, palette: { ink: 'url(secret)' } }]) expect(sanitizeScenePlan(invalid)).toBeNull()
})

test('approved recipes compile exact geometry and enlarged saved plans survive a later curation rejection', () => {
  const recipe = recipeCatalogue()[0], previous = getMaterialCuration()
  const saved = { ...plan, objects: [{ ...object, render: { kind: 'recipe', recipeId: recipe.id }, box: { x: .05, y: .05, width: .9, height: .9 } }] }
  expect(compileSceneObject(saved.objects[0])?.recipeId).toBe(recipe.id)
  try {
    setMaterialCuration({ ...previous, decisions: { ...previous.decisions, [recipe.id]: 'reject' } })
    expect(sanitizeScenePlan(saved)).not.toBeNull()
    expect(compileSceneObject(saved.objects[0])).toBeNull()
  } finally { setMaterialCuration(previous) }
})
