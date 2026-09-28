import { expect, test } from 'vitest'
import { sanitizeScenePlan } from '../../shared/niloSceneDrawing.mjs'
import { openScenePlanningPrompt } from '../src/services/niloOpenScenePrompt.js'
import { compilePlannedScene } from '../src/services/niloSceneCompiler.js'

function input(overrides = {}) {
  return {
    utterance: '一个上下颠倒的奇妙地方，不要增加小人',
    locale: 'zh', rasterGeneration: true,
    context: { requestScope: 'scene', canvasAspect: 1, canvasSize: { width: 720, height: 720 }, scene: {}, history: [] },
    ...overrides,
  }
}
const materials = { illustrations: [], recipes: [], preservedSubjects: ['孩子原来的笔迹'] }
const brief = { requiredSubjects: ['奇妙地方'], excludedSubjects: ['小人'] }
const promptFor = (overrides) => openScenePlanningPrompt(input(overrides), materials, brief)

test('normal example starts from stock and optional generated inversion fields match the shared schema', () => {
  const prompt = promptFor()
  const example = JSON.parse(prompt.match(/SCHEMA \(choose renderer as above\): (.*)\. Stock render is /)[1])
  expect(example.plan.objects[0].render.kind).toBe('illustration')
  example.plan.objects[0].render.illustrationId = 'illustration-library-rabbit-beginner-01'
  const normal = sanitizeScenePlan(compilePlannedScene(example.plan, { context: input().context }).plan)
  expect(normal).not.toBeNull()
  expect(normal.objects).toHaveLength(1)
  expect(normal.objects[0].render).toEqual({ kind: 'illustration', illustrationId: 'illustration-library-rabbit-beginner-01' })
  expect(normal.objects[0].render).not.toHaveProperty('sourceDescription')

  const optional = JSON.parse(prompt.match(/OPTIONAL INVERSION FIELDS \(on that same generated object only\): (.*)\. sourceDescription is /)[1])
  const inverted = sanitizeScenePlan(compilePlannedScene({ ...example.plan, objects: [{ ...example.plan.objects[0], ...optional }] }, { context: input().context }).plan)
  expect(inverted).not.toBeNull()
  expect(inverted.objects[0].rotation).toBe(180)
  expect(inverted.objects[0].render.sourceDescription).toBe(optional.render.sourceDescription)
  expect(inverted.summary).toBe(normal.summary)
  expect(inverted.objects[0].essential).toEqual(normal.objects[0].essential)
  expect(sanitizeScenePlan({ ...normal, objects: [{ ...normal.objects[0], ...optional, rotation: 0 }] })).toBeNull()
})

test('inversion guidance preserves the full final contract with a half-turn rather than a vertical reflection', () => {
  const prompt = promptFor()
  const inversion = prompt.split('WHOLE-IMAGE INVERSION: ')[1].split('\n\nEDITS:')[0]
  expect(inversion).toContain('(u,v)->(1-u,1-v)')
  expect(inversion).toContain('BOTH up/down and left/right')
  expect(inversion).toContain('not a vertical mirror')
  expect(inversion).toContain('subjects, functions, explicit counts, sizes, exclusions, containment and contact relationships')
  expect(inversion).toContain('different subjects need conflicting orientations')
  expect(inversion).toContain('never rotate or redraw existing child ink or unrelated objects')
  expect(inversion).toContain('For rotation omitted or0, omit sourceDescription')
  expect(inversion).toContain("Do not mention source images, coordinates, rotation or rendering mechanics in the child's summary")
  expect(inversion).not.toMatch(/forest|森林|魔法世界|upside_forest/)
})

test('source-image guidance does not rewrite original requests, preserved subjects or an existing edit plan', () => {
  const plan = { version: 1, summary: '原来的图', objects: [{ id: 'existing', rotation: 180, render: { kind: 'generated', sourceDescription: '原来正常朝向的完整图' } }] }
  const current = input({ plan })
  const snapshot = structuredClone({ current, materials, brief })
  const prompt = openScenePlanningPrompt(current, materials, brief)
  expect(prompt).toContain(`ORIGINAL CHILD REQUEST: ${JSON.stringify(current.utterance)}`)
  expect(prompt).toContain(`PREVIOUS PLAN: ${JSON.stringify(plan)}`)
  expect(prompt).toContain('孩子原来的笔迹')
  expect(prompt).not.toContain('This is a NEW WHOLE-SETTING request')
  expect({ current, materials, brief }).toEqual(snapshot)
})

test('the inverse-source contract is only offered with the generated-image capability', () => {
  expect(promptFor({ rasterGeneration: false })).not.toContain('sourceDescription')
  expect(promptFor()).toContain('generationPolicy is binding')
  expect(promptFor()).not.toContain('Return exactly one main object')
  expect(promptFor()).not.toContain('application uses ONE integrated generated reference')
  expect(promptFor()).toContain('Generate ONLY the smallest focal subject')
  expect(promptFor()).toContain('A complete illustration cannot be cut apart')
})
