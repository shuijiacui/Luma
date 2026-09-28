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

test('generated source coordinates preserve the final request and features through plan validation and restore', () => {
  const raw = { ...plan, request: '让整张图片倒过来', summary: '完整图案绕图片中心旋转半圈。', objects: [{ ...object,
    name: '倒置图案', essential: ['上下和左右都翻转'], rotation: 180,
    render: { kind: 'generated', sourceDescription: '  一幅正常朝向、保持完整结构的图案。  ' },
  }] }
  const before = structuredClone(raw), clean = sanitizeScenePlan(raw)
  expect(clean).toMatchObject({ request: raw.request, summary: raw.summary, objects: [{
    essential: raw.objects[0].essential, rotation: 180,
    render: { kind: 'generated', sourceDescription: raw.objects[0].render.sourceDescription.trim() },
    box: object.box,
  }] })
  expect(sanitizeScenePlan(JSON.parse(JSON.stringify(clean)))).toEqual(clean)
  expect(raw).toEqual(before)
  expect(sanitizeScenePlan({ ...raw, objects: [{ ...raw.objects[0], render: { kind: 'generated', sourceDescription: 'a'.repeat(1000) } }] })).not.toBeNull()
})

test('bare generated plans remain valid without source coordinates at either supported orientation', () => {
  for (const rotation of [undefined, 0, 180]) {
    const clean = sanitizeScenePlan({ ...plan, objects: [{ ...object, rotation, render: { kind: 'generated' } }] })
    expect(clean?.objects[0].render).toEqual({ kind: 'generated' })
    expect(clean?.objects[0].rotation).toBe(rotation)
  }
})

test('source coordinates reject missing inversion, other render kinds and every malformed description', () => {
  const inverted = { ...object, rotation: 180, render: { kind: 'generated', sourceDescription: '正常朝向的原图。' } }
  for (const rotation of [undefined, 0, 90, '180']) {
    expect(sanitizeScenePlan({ ...plan, objects: [{ ...inverted, rotation }] })).toBeNull()
  }
  for (const sourceDescription of [undefined, null, false, 180, {}, [], '', '  ', 'a'.repeat(1001),
    'a\u0000b', 'a\nb', 'a\tb', 'a\u007fb', 'a\u0085b', 'a\u009fb']) {
    expect(sanitizeScenePlan({ ...plan, objects: [{ ...inverted, render: { kind: 'generated', sourceDescription } }] })).toBeNull()
  }
  for (const render of [{ kind: 'custom' }, { kind: 'compose', primitive: 'cloud' },
    { kind: 'recipe', recipeId: recipeCatalogue()[0].id }, { kind: 'illustration', illustrationId: 'illustration-library-cloud-beginner-01' }]) {
    expect(sanitizeScenePlan({ ...plan, objects: [{ ...inverted, render: { ...render, sourceDescription: '正常朝向的原图。' } }] })).toBeNull()
  }
  expect(sanitizeScenePlan({ ...plan, objects: [{ ...inverted, render: { ...inverted.render, parameters: {} } }] })).toBeNull()
})
