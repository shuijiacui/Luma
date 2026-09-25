import { afterEach, expect, test, vi } from 'vitest'
import { PNG } from 'pngjs'
import { generateNiloDialogue } from '../src/services/niloDialogue.js'
import { getDrawingRecipe, drawingRecipes } from '../../shared/niloRecipes.mjs'
import { retrieveIdeaRecipes } from '../src/services/niloIdeaFirst.js'

afterEach(() => vi.unstubAllEnvs())

test('idea-first retrieval honors the requested style without changing the subject',()=>{
 const idea={subject:'雏菊',searchTerms:['daisy']}
 expect(retrieveIdeaRecipes(idea,['daisy-4'],'画写实风的雏菊').map(r=>r.id)).toEqual(['daisy-5','daisy-4'])
 expect(retrieveIdeaRecipes({subject:'小猫',searchTerms:['cat']},[],'画写实风的小猫')).toEqual([])
})
const png = new PNG({ width: 600, height: 600 }); png.data.fill(255)
const imageBase64 = PNG.sync.write(png).toString('base64')
const context = { locale: 'zh', takeTurn: true, requestDrawing: true, drawingProtocol: 3,
  canvasAspect: 1, canvasSize: { width: 600, height: 600 }, utterance: '轮到你了' }
const idea = { subject: '飞行茶杯', relationship: '陪着小鸟一起飞', searchTerms: ['cup', 'wing'],
  requiresCustom: true, details: ['杯身和把手', '两侧翅膀'] }
const observed = { subjects: [], idea }
const custom = { subject: idea.subject, recipeId: null, sketch: { aspect: 1.2,
  paths: [[['M', .25, .3], ['L', .65, .3], ['L', .6, .85], ['L', .3, .85], ['Z']],
    [['M', .65, .4], ['C', .95, .25, .95, .75, .65, .7]],
    [['M', .25, .45], ['Q', .01, .1, .05, .6], ['L', .25, .65]],
    [['M', .8, .45], ['Q', .99, .1, .95, .65]] ] }, at: [.7, .5], scale: .3 }
async function run(first = observed, plan = custom, extra = {}) {
  const model = vi.fn().mockResolvedValueOnce(first).mockResolvedValue(plan)
  const result = await generateNiloDialogue({ imageBase64, context, chatWithImage: model,
    creativeMode: 'idea-first', ...extra })
  return { result, model }
}

test('ideation sees the canvas and child context, with no recipe or lesson directory', async () => {
  const { result, model } = await run()
  expect(result.status).toBe('ready')
  expect(model.mock.calls.map(c => c[2].kind)).toEqual(['nilo_creative_ideate', 'nilo_creative_render'])
  const [, prompt, options] = model.mock.calls[0]
  expect(prompt).toContain(context.utterance)
  for (const recipe of drawingRecipes) expect(prompt).not.toContain(recipe.id)
  expect(prompt).not.toContain('AVAILABLE LESSONS')
  expect(options.referenceSheet).toBeUndefined()
  expect(model.mock.calls[1][2].referenceSheet).toBeUndefined()
})

test('rendering receives a locked idea and only a small relevant selection, including usable paths', async () => {
  const { result, model } = await run()
  const prompt = model.mock.calls[1][1]
  expect(prompt).toContain(idea.subject)
  expect(prompt).toContain(idea.details[1])
  expect(prompt).toContain('cup-0')
  expect(prompt).not.toContain('squirrel-2')
  expect(prompt).toContain('"paths"')
  expect(result.proposal).toMatchObject({ subject: idea.subject, relation: idea.relationship, sketch: custom.sketch })
  expect(result.drawingMetrics).toMatchObject({ creativeMode: 'idea-first', route: 'custom', candidateCount: 3 })
})

test('simple ideas can reuse a matching recipe and avoid recent variants', async () => {
  const first = { subjects: [], idea: { subject: '小花', relationship: '给花园添一朵花',
    searchTerms: ['flower'], requiresCustom: false, details: ['头、身体、翅膀'] } }
  const { result, model } = await run(first, { recipeId: 'flower-1', at: [.7, .5], scale: .2 },
    { context: { ...context, recentRecipeIds: ['flower-0'] } })
  expect(result.proposal.sketch).toEqual(getDrawingRecipe('flower-1').sketch)
  expect(result.drawingMetrics.route).toBe('recipe')
  const prompt = model.mock.calls[1][1]
  expect(prompt.indexOf('flower-1')).toBeLessThan(prompt.indexOf('flower-0'))
})

test('storybook variants rank first for a matching idea without replacing its subject',async()=>{
 const first={subjects:[],idea:{subject:'小蘑菇',relationship:'花园里的新伙伴',searchTerms:['mushroom'],requiresCustom:false,details:['伞盖和菌柄']}}
 const {result,model}=await run(first,{recipeId:'mushroom-3',at:[.7,.5],scale:.3},{context:{...context,tracingGuide:true}})
 expect(result.proposal.recipeId).toBe('mushroom-3')
 expect(result.proposal.sketch).toEqual(getDrawingRecipe('mushroom-3').sketch)
 const prompt=model.mock.calls[1][1]
 expect(prompt.indexOf('mushroom-3')).toBeLessThan(prompt.indexOf('mushroom-0'))
 expect(prompt).toContain('"style":"storybook"')
 expect(prompt).toContain('Do not substitute a cute animal for a different requested subject')
 expect(model).toHaveBeenCalledTimes(2)
})

test('unmatched ideas get an empty selection, never arbitrary library substitutes', async () => {
  const first = { subjects: [], idea: { ...idea, subject: '会跳舞的问号', searchTerms: ['question mark'] } }
  const { result, model } = await run(first)
  expect(result.status).toBe('ready')
  expect(result.proposal.subject).toBe('会跳舞的问号')
  expect(result.drawingMetrics.candidateCount).toBe(0)
  for (const recipe of drawingRecipes) expect(model.mock.calls[1][1]).not.toContain(recipe.id)
})

test('many recognized components still expose no more than six candidate drawings', async () => {
  const { result, model } = await run({ ...observed, idea: { ...idea, searchTerms: ['cup', 'bird', 'rabbit', 'fish'] } })
  expect(result.drawingMetrics.candidateCount).toBe(6)
  expect(model.mock.calls[1][1]).not.toContain('squirrel-2')
})

test('a compound idea cannot silently fall back to a plain recipe when custom data fails', async () => {
  const { result, model } = await run(observed, { recipeId: 'cup-0', backup: { recipeId: 'flower-0' }, sketch: { paths: 'broken' } })
  expect(result.status).toBe('unavailable')
  expect(result.proposal).toBeUndefined()
  expect(model).toHaveBeenCalledTimes(3)
  expect(model.mock.calls[2][1]).toContain(idea.subject)
})

test('a valid but unretrieved recipe is rejected even for a simple idea', async () => {
  const { result } = await run({ ...observed, idea: { ...idea, requiresCustom: false } },
    { recipeId: 'squirrel-2', backupRecipeId: 'squirrel-3' })
  expect(result.status).toBe('unavailable')
})

test('missing or malformed ideation stops before any library-based drawing', async () => {
  for (const first of [{}, { idea: { subject: '小鸟' } }, { idea: { ...idea, requiresCustom: 'false' } }]) {
    const { result, model } = await run(first)
    expect(result.status).toBe('unavailable')
    expect(model).toHaveBeenCalledTimes(1)
  }
})

test('cancellation between ideation and drawing starts no second call', async () => {
  const controller = new AbortController()
  const model = vi.fn(async () => { controller.abort(); return observed })
  const { result } = await run(observed, custom, { chatWithImage: model, signal: controller.signal })
  expect(result.status).toBe('unavailable')
  expect(model).toHaveBeenCalledTimes(1)
})

test('the experiment is selectable by server configuration, not child-supplied context', async () => {
  vi.stubEnv('NILO_CREATIVE_MODE', 'idea-first')
  const enabled = await run(observed, custom, { creativeMode: undefined })
  expect(enabled.model.mock.calls[0][2].kind).toBe('nilo_creative_ideate')
  vi.stubEnv('NILO_CREATIVE_MODE', '')
  const baseline = await run({}, { recipeId: 'flower-0' }, { creativeMode: undefined, context: { ...context, creativeMode: 'idea-first' } })
  expect(baseline.model.mock.calls[0][2].kind).toBe('nilo_knowledge_observe')
  expect(baseline.result.status).toBe('ready')
})
