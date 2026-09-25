import { afterEach, expect, test, vi } from 'vitest'
import { generateNiloDialogue, sanitizeDialogueContext } from '../src/services/niloDialogue.js'
import { buildVariationPrompt } from '../src/services/niloVariation.js'
import { drawingRecipes } from '../../shared/niloRecipes.mjs'
import { drawingIllustrations, getDrawingIllustration } from '../../shared/niloIllustrations.mjs'
import { getMaterialCuration, isMaterialEnabled, setMaterialCuration } from '../../shared/niloCuration.mjs'
import * as curationStore from '../src/services/niloCurationStore.js'

const originalCuration = getMaterialCuration()
afterEach(() => { vi.restoreAllMocks(); setMaterialCuration(originalCuration) })

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aO2kAAAAASUVORK5CYII='
const GUIDE = {
  template: 'custom', subject: '会飞的茶壶', x: .3, y: .25, width: .2, height: .24,
  color: '#e4a86a', strokeWidth: 7, brushKind: 'crayon', rotation: 13,
  target: '孩子想象的茶壶', relation: '在空白处的虚线底图', contribution: 'object', placementPolicy: 'free',
  sketch: { aspect: 1, paths: [[['M', .1, .5], ['Q', .5, .05, .9, .5], ['Q', .5, .95, .1, .5]]] },
}
const NEW_SKETCH = { aspect: 1.6, paths: [[['M', .1, .4], ['C', .1, .1, .9, .1, .9, .4], ['Q', .5, .9, .1, .4]]] }
const context = (overrides = {}) => ({ locale: 'zh', requestDrawing: true, tracingGuide: true, variantOnly: true,
  utterance: '换一种画法', currentProposal: GUIDE, canvasAspect: 1.5, ...overrides })
const candidate = (overrides = {}) => ({ ...GUIDE, sketch: NEW_SKETCH, ...overrides })
const response = proposal => ({ intent: 'edit', confidence: .95, reply: '还是你想象的茶壶，这次换种线条试试。', proposal })
const run = (ctx, model, extra = {}) => generateNiloDialogue({ imageBase64: PNG, context: ctx, chatWithImage: model, ...extra })
const promptGuide = model => JSON.parse(model.mock.calls[0][1].split('SOURCE_GUIDE: ')[1].split('\n')[0])

test('a free imagined subject receives one new same-subject sketch in its original frame and style', async () => {
  const model = vi.fn().mockResolvedValue(response(candidate({
    x: .6, y: .6, width: .12, height: .15, rotation: -5, color: '#000000', strokeWidth: 2, brushKind: 'pencil',
    target: '模型改过的目标', relation: '模型想换一个位置',
  })))
  const original = structuredClone(GUIDE)
  const result = await run(context({ rejectedSubjects: ['会飞的茶壶'] }), model)
  expect(result.status).toBe('ready')
  expect(result.placementLocked).toBe(true)
  expect(result.proposal).toMatchObject({ ...GUIDE, sketch: { aspect: GUIDE.width * 1.5 / GUIDE.height } })
  expect(result.proposal.sketch.paths).not.toEqual(GUIDE.sketch.paths)
  expect(GUIDE).toEqual(original)
  expect(model).toHaveBeenCalledOnce()
  expect(model.mock.calls[0][2]).toMatchObject({ kind: 'nilo_same_subject_variant', retries: 0 })
  expect(promptGuide(model).proposal).toEqual(GUIDE)
})

test('another way to draw a sun bypasses simple subject planning and never returns a moon', async () => {
  const sun = { ...GUIDE, subject: '太阳' }
  const model = vi.fn().mockResolvedValue(response(candidate({ subject: '月亮' })))
  const result = await run(context({ utterance: '画太阳', currentProposal: sun }), model)
  expect(result.status).toBe('unavailable')
  expect(result.proposal).toBeUndefined()
  expect(model).toHaveBeenCalledOnce()
  expect(model.mock.calls[0][1]).toContain('SAME-SUBJECT VARIATION ONLY')
})

test('a sun title cannot disguise a moon recipe, and free partial objects cannot become stock recipes', async () => {
  const sun = { ...GUIDE, subject: '太阳' }
  for (const subject of ['moon', 'sun']) {
    const recipe = drawingRecipes.find(item => item.subject === subject && isMaterialEnabled(item.id))
    expect(recipe).toBeTruthy()
    const recipeId = recipe.id
    const model = vi.fn().mockResolvedValue(response(candidate({ subject: '太阳', recipeId, sketch: recipe.sketch })))
    expect((await run(context({ currentProposal: sun }), model)).proposal).toBeUndefined()
    expect(model).toHaveBeenCalledOnce()
  }
})

test('existing companions remain identical, including independent colors and brush settings', async () => {
  const additions = [{ ...GUIDE, subject: '星星小灯', x: .65, y: .2, width: .1, height: .1,
    color: '#112233', strokeWidth: 3, brushKind: 'marker', rotation: 0 }]
  const model = vi.fn().mockResolvedValue(response(candidate()))
  const result = await run(context({ currentAdditions: additions, drawingStyle: { color: '#ffffff', brushSize: 9, brushKind: 'pencil' } }), model)
  expect(result.additions).toEqual(additions)
  expect(model.mock.calls[0][1]).toContain('Change ONLY SOURCE_GUIDE.proposal')
  expect(promptGuide(model).additions).toEqual(additions)
})

test.each(['additions', 'alternatives', 'commit'])('a variant cannot edit the group or invent %s', async key => {
  const model = vi.fn().mockResolvedValue({ ...response(candidate()), [key]: [candidate({ subject: '月亮' })] })
  const result = await run(context(), model)
  expect(result.status).toBe('unavailable')
  expect(result.proposal).toBeUndefined()
  expect(model).toHaveBeenCalledOnce()
})

test('malformed and unchanged variants never replace the current guide or trigger a retry', async () => {
  for (const proposal of [GUIDE, candidate({ sketch: { aspect: 1, paths: [[['M', 0, 0]]] } }), candidate({ width: .9 })]) {
    const model = vi.fn().mockResolvedValue(response(proposal))
    const result = await run(context(), model)
    expect(result.status).toBe('unavailable')
    expect(result.proposal).toBeUndefined()
    expect(model).toHaveBeenCalledOnce()
  }
})

test('variant context requires explicit drawing permission, a valid source, and a valid whole group', async () => {
  expect(sanitizeDialogueContext(context()).variantOnly).toBe(true)
  const invalid = [
    { requestDrawing: false }, { takeTurn: true }, { currentProposal: null },
    { currentAdditions: [candidate({ width: 3 })] }, { currentAdditions: 'invalid' },
    { currentAdditions: Array(4).fill(GUIDE) },
  ]
  for (const override of invalid) {
    const ctx = context(override), model = vi.fn()
    expect(sanitizeDialogueContext(ctx).variantOnly).toBe(false)
    expect((await run(ctx, model)).proposal).toBeUndefined()
    expect(model).not.toHaveBeenCalled()
  }
})

test('half drawings and unusual features are part of the variation source contract', () => {
  const half = { ...GUIDE, subject: '太阳', sketch: { aspect: 2, paths: [[['M', .05, 1], ['Q', .5, 0, .95, 1]]] } }
  const prompt = buildVariationPrompt(sanitizeDialogueContext(context({ currentProposal: half,
    history: [{ role: 'user', text: '只画一半的太阳，放在左上角' }] })))
  expect(prompt).toContain('half objects stay the same half')
  expect(prompt).toContain(JSON.stringify(half.sketch))
  expect(prompt).toContain('只画一半的太阳，放在左上角')
})

test('a slow variant shares the dialogue deadline and never falls back to a new object', async () => {
  const model = vi.fn(() => new Promise(() => {}))
  const result = await run(context(), model, { timeoutMs: 15 })
  expect(result.status).toBe('unavailable')
  expect(result.reason).toBe('timeout')
  expect(result.proposal).toBeUndefined()
  expect(model).toHaveBeenCalledOnce()
  expect(model.mock.calls[0][2].signal.aborted).toBe(true)
})

const joinedGuide = () => {
  const source = { ...GUIDE, rotation: 0, x: .3, y: .3, width: .2, height: .2,
    anchor: { x: .2, y: .3, width: .1, height: .2 }, placement: 'right', attachment: { x: .3, y: .4 },
    sketch: { aspect: 1.5, paths: [[['M', 0, .5], ['Q', .5, 0, 1, .5]]] } }
  delete source.contribution
  delete source.placementPolicy
  return source
}

test('an attached variant keeps its original first-point junction', async () => {
  const source = joinedGuide()
  const changed = { ...source, sketch: { aspect: 1.5, paths: [[['M', 0, .5], ['Q', .5, .2, 1, .5]]] } }
  const model = vi.fn().mockResolvedValue(response(changed))
  const result = await run(context({ currentProposal: source }), model)
  expect(result.status).toBe('ready')
  expect(result.proposal.attachment).toEqual(source.attachment)
  expect(result.proposal.anchor).toEqual(source.anchor)
  expect(model).toHaveBeenCalledOnce()
})

test.each(['first-point', 'letterbox', 'stale-source'])('a %s attachment gap retains the old guide', async failure => {
  const source = joinedGuide()
  const changed = { ...source, sketch: { aspect: failure === 'letterbox' ? .75 : 1.5,
    paths: [[['M', failure === 'first-point' ? .1 : 0, .5], ['Q', .5, .2, 1, .5]]] } }
  if (failure === 'stale-source') source.sketch = { aspect: 1.5, paths: [[['M', .2, .5], ['Q', .5, 0, 1, .5]]] }
  const model = vi.fn().mockResolvedValue(response(changed))
  const result = await run(context({ currentProposal: source }), model)
  expect(result.status).toBe('unavailable')
  expect(result.proposal).toBeUndefined()
  expect(model).toHaveBeenCalledOnce()
})

const contactGuide = kind => {
  const source = joinedGuide()
  delete source.attachment
  source.anchor = { x: .28, y: .48, width: .24, height: .04 }
  source.contact = { kind, points: kind === 'points'
    ? [{ x: .3, y: .5 }, { x: .5, y: .5 }]
    : [.3, .35, .4, .45, .5].map(x => ({ x, y: .5 })) }
  source.sketch = { aspect: 1.5, paths: [[['M', 0, 1], ['L', 1, 1], ['Q', .5, 0, 0, 1]]] }
  return source
}

test.each(['points', 'contour'])('a %s contact remains covered by the changed geometry', async kind => {
  const source = contactGuide(kind)
  const changed = { ...source, sketch: { aspect: 1.5, paths: [[['M', 0, 1], ['L', 1, 1], ['Q', .5, .2, 0, 1]]] } }
  const model = vi.fn().mockResolvedValue(response(changed))
  const result = await run(context({ currentProposal: source }), model)
  expect(result.status).toBe('ready')
  expect(result.proposal.contact).toEqual(source.contact)
  expect(model).toHaveBeenCalledOnce()
})

test.each(['missing-point', 'missing-contour'])('a variant with %s is rejected without another subject or retry', async failure => {
  const source = contactGuide(failure === 'missing-point' ? 'points' : 'contour')
  const changed = { ...source, sketch: { aspect: 1.5, paths: failure === 'missing-point'
    ? [[['M', .2, 1], ['L', 1, 1], ['Q', .5, .2, .2, 1]]]
    : [[['M', 0, 1], ['Q', .5, .4, 1, 1], ['Q', .5, .2, 0, 1]]] } }
  const model = vi.fn().mockResolvedValue(response(changed))
  const result = await run(context({ currentProposal: source }), model)
  expect(result.status).toBe('unavailable')
  expect(result.proposal).toBeUndefined()
  expect(model).toHaveBeenCalledOnce()
})

test('a raster guide never falls through to generated vector geometry', async () => {
  const model=vi.fn().mockResolvedValue(response(candidate({subject:'面包师'})))
  const single={template:'illustration',illustrationId:'illustration-medium-baker',subject:'面包师',
    x:.2,y:.2,width:.3,height:.45,color:'#123456',rotation:0,target:'面包师',relation:'参考图'}
  setMaterialCuration({version:1,decisions:{...originalCuration.decisions,...Object.fromEntries(drawingIllustrations
    .filter(item=>item.subject==='baker'&&item.id!==single.illustrationId).map(item=>[item.id,'reject']))}})
  vi.spyOn(curationStore,'refreshMaterialCuration').mockImplementation(()=>getMaterialCuration())
  const missing=await run(context({currentProposal:single}),model)
  expect(missing.proposal).toBeUndefined()
  expect(model).not.toHaveBeenCalled()
  const pair={...single,illustrationId:'illustration-reading-child',subject:'读书的孩子',target:'读书的孩子'}
  const next=await run(context({currentProposal:pair}),model)
  expect(next.proposal).toMatchObject({...pair,illustrationId:expect.any(String)})
  expect(next.proposal.illustrationId).not.toBe(pair.illustrationId)
  expect(getDrawingIllustration(next.proposal.illustrationId).subject).toBe('readingchild')
  expect(next.proposal.sketch).toBeUndefined()
  expect(model).not.toHaveBeenCalled()
})
