import { expect, test, vi } from 'vitest'
import { PNG } from 'pngjs'
import { generateNiloDialogue } from '../src/services/niloDialogue.js'
import { getDrawingRecipe } from '../../shared/niloRecipes.mjs'
import { encodeOccupancy } from '../../shared/niloOccupancy.mjs'
import { projectionFits, proposalFootprint } from '../../shared/niloCollision.mjs'
import { creativeObjectSize, creativeSketch } from '../src/services/niloCreativeTurn.js'

const png = new PNG({ width: 900, height: 600 }); png.data.fill(255)
const imageBase64 = PNG.sync.write(png).toString('base64')
const context = { locale: 'zh', requestDrawing: true, takeTurn: true, drawingProtocol: 3, turnScope: 'scene',
  canvasAspect: 1.5, canvasSize: { width: 900, height: 600 }, utterance: '轮到你了',
  drawingStyle: { color: '#203b34', brushSize: 4, brushKind: 'round' } }
const choice = { subject: '松鼠', relationship: '树旁的小伙伴', recipeId: 'squirrel-3', backupRecipeId: 'bird-2', at: [.7, .6], scale: .3 }
async function run(observation, plan = choice, extra = {}) {
  const model = vi.fn().mockResolvedValueOnce(observation).mockResolvedValueOnce(plan)
  const result = await generateNiloDialogue({ imageBase64, context: { ...context, ...extra }, chatWithImage: model })
  return { result, model }
}

test.each([{ subjects: [] }, { subjects: [{ subject: 'maybe a tree', family: 'plant', confidence: .2, visible: 'round lines' }] }])(
  'uncertain or empty observations do not veto the model choice: %j', async observation => {
    const { result, model } = await run(observation)
    expect(result).toMatchObject({ status: 'ready', protocolVersion: 3, proposal: { recipeId: 'squirrel-3', placementPolicy: 'free' } })
    expect(result.proposal.sketch).toEqual(getDrawingRecipe('squirrel-3').sketch)
    expect(model).toHaveBeenCalledTimes(2)
    expect(model.mock.calls.map(call => call[2].kind)).toEqual(['nilo_knowledge_observe', 'nilo_companion_vision'])
    expect(model.mock.calls[1][1]).toContain('DRAWING KNOWLEDGE:')
  })

test('can invent an object beyond the recipe catalogue', async () => {
  const sketch = { aspect: 1, paths: [[['M', .1, .2], ['L', .9, .2], ['L', .5, .9], ['Z']], [['E', .5, .4, .1, .1]]] }
  const { result } = await run({}, { ...choice, recipeId: null, subject: '飞行茶杯', sketch })
  expect(result.status).toBe('ready'); expect(result.proposal.subject).toBe('飞行茶杯')
  expect(result.proposal.sketch).toEqual(sketch); expect(result.proposal.recipeId).toBeUndefined()
})

test('the planner can select a compact studio ID and cannot substitute another style',async()=>{
 const {result,model}=await run({}, {...choice,recipeId:'lamp-4'}, {tracingGuide:true,utterance:'画写实风的台灯'})
 expect(result.proposal?.recipeId).toBe('lamp-4')
 expect(result.proposal?.sketch).toEqual(getDrawingRecipe('lamp-4').sketch)
 expect(model.mock.calls[1][1]).toContain('lamp/台灯 @6')
 expect(model).toHaveBeenCalledTimes(2)
 const rejected=await run({}, {...choice,recipeId:'lamp-0',backupRecipeId:'cat-0'}, {tracingGuide:true,utterance:'画写实风的台灯'})
 expect(rejected.result.proposal).toBeUndefined()
})

test('cute recipes reach the default planner without extra calls and remain readable as guides',async()=>{
 const recipe=getDrawingRecipe('capybara-0')
 const {result,model}=await run({}, {...choice,recipeId:recipe.id,scale:.01}, {tracingGuide:true})
 expect(result.proposal.recipeId).toBe(recipe.id)
 expect(result.proposal.sketch).toEqual(recipe.sketch)
 expect(Math.min(result.proposal.width*900,result.proposal.height*600)).toBeCloseTo(recipe.minPixels)
 expect(model).toHaveBeenCalledTimes(2)
 expect(model.mock.calls[1][1]).toContain('capybara-0=团坐水豚 [cute]')
 expect(model.mock.calls[1][1]).toContain('Explicit requests for a different style or pose take priority')
})

test.each([{width:900,height:600},{width:320,height:600},{width:180,height:180}])('tracing minimum preserves proportions within small canvas bounds: %j',canvasSize=>{
 const recipe=getDrawingRecipe('jellyfish-0'),aspect=canvasSize.width/canvasSize.height
 const size=creativeObjectSize({scale:.001},recipe.sketch,{...context,tracingGuide:true,canvasSize,canvasAspect:aspect},{subjects:[]},recipe)
 expect(size.width).toBeLessThanOrEqual(.440001);expect(size.height).toBeLessThanOrEqual(.440001)
 expect(size.width*aspect/size.height).toBeCloseTo(recipe.sketch.aspect)
 if(canvasSize.width===900)expect(Math.min(size.width*canvasSize.width,size.height*canvasSize.height)).toBeCloseTo(recipe.minPixels)
})

test('creative drawing returns natural guide speech from the same generation call', async () => {
  const text = '松鼠的虚线底图来啦，想给它穿什么颜色的衣服都可以。'
  const { result, model } = await run({}, { ...choice, reply: text }, { tracingGuide: true, recentReplies: ['上次的小主意'] })
  expect(result.reply).toBe(text)
  expect(model).toHaveBeenCalledTimes(2)
  expect(model.mock.calls[1][1]).toContain('RECENT NILO WORDING')
  expect(model.mock.calls[1][1]).toContain('上次的小主意')
  expect(model.mock.calls[1][1]).toContain('ONLY tracing guides')
})

test('malformed custom paths use the MODEL-selected related recipe, with its actual name', async () => {
  const { result, model } = await run({}, { ...choice, recipeId: null, subject: '飞行茶杯', sketch: { paths: 'broken' } })
  expect(result.proposal.recipeId).toBe('bird-2'); expect(result.proposal.subject).toBe('小鸟')
  expect(result.reply).toContain('小鸟'); expect(model).toHaveBeenCalledTimes(2)
})

test('crowding is not a rejection; out-of-range layout is clamped and retains complete proportions', async () => {
  const occupancy = Array(65536).fill(1)
  const { result } = await run({}, { ...choice, at: [-10, 100], scale: 100 }, { collisionMap: encodeOccupancy(occupancy) })
  const p = result.proposal
  expect(result.status).toBe('ready')
  expect(p.x).toBeGreaterThanOrEqual(0); expect(p.y + p.height).toBeLessThanOrEqual(1)
  expect(p.width * 1.5 / p.height).toBeCloseTo(p.sketch.aspect)
  expect(projectionFits(p, occupancy, 1.5, context.canvasSize)).toBe(true)
  expect(projectionFits({ ...p, placementPolicy: undefined }, occupancy, 1.5, context.canvasSize)).toBe(false)
  expect(projectionFits({ ...p, x: -1 }, occupancy, 1.5, context.canvasSize)).toBe(false)
})

test('placement still prefers free space instead of covering a drawing unnecessarily', async () => {
  const occupancy = Array.from({ length: 65536 }, (_, i) => i % 256 > 140 ? 1 : 0)
  const { result } = await run({}, choice, { collisionMap: encodeOccupancy(occupancy) })
  const cells = proposalFootprint(result.proposal, 256, 1.5, context.canvasSize)
  expect([...cells].filter(cell => occupancy[cell]).length / cells.size).toBeLessThan(.75)
})

test('one bounded format repair asks the model to choose again, without a child menu or review call', async () => {
  const model = vi.fn().mockResolvedValueOnce({}).mockResolvedValueOnce({}).mockResolvedValueOnce(choice)
  const result = await generateNiloDialogue({ imageBase64, context, chatWithImage: model })
  expect(result.status).toBe('ready'); expect(model).toHaveBeenCalledTimes(3)
  expect(model.mock.calls[2][1]).toContain('Choose the most related recipe')
  expect(result.drawingMetrics.reviews).toBe(0)
})

test('transport failures are reported honestly and do not fabricate a model choice', async () => {
  const model = vi.fn().mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('offline'))
  const result = await generateNiloDialogue({ imageBase64, context, chatWithImage: model })
  expect(result.status).toBe('unavailable'); expect(result.proposal).toBeUndefined()
})

test('isolated slashes cannot masquerade as a complete new object', async () => {
  const { result } = await run({}, { ...choice, recipeId: null, subject: '机器人',
    sketch: { aspect: 1, paths: [[['M', .1, .1], ['L', .9, .9]]] } })
  expect(result.proposal.recipeId).toBe('bird-2')
  expect(result.proposal.sketch.paths.length).toBeGreaterThan(3)
})

test('model scale varies with composition rather than a fixed icon size', async () => {
  const small = await run({}, { ...choice, scale: .09 })
  const large = await run({}, { ...choice, scale: .4 })
  expect(large.result.proposal.height).toBeGreaterThan(small.result.proposal.height * 3)
  for (const { result } of [small, large]) expect(result.proposal.width * 1.5 / result.proposal.height).toBeCloseTo(getDrawingRecipe('squirrel-3').sketch.aspect)
})

test('missing scale follows observed subject size; explicit scale wins, proportions remain stable on a portrait canvas', () => {
  const sketch = getDrawingRecipe('bird-2').sketch
  const small = { subjects: [{ bounds: { x: .1, y: .1, width: .15, height: .15 } }] }
  const large = { subjects: [{ bounds: { x: .1, y: .1, width: .7, height: .7 } }] }
  expect(creativeObjectSize({}, sketch, context, large).height).toBeGreaterThan(creativeObjectSize({}, sketch, context, small).height)
  expect(creativeObjectSize({ scale: .2 }, sketch, context, large)).toEqual(creativeObjectSize({ scale: .2 }, sketch, context, small))
  const size = creativeObjectSize({ scale: .2 }, sketch, { ...context, canvasAspect: .6, canvasSize: { width: 360, height: 600 } }, large)
  expect(size.width * .6 / size.height).toBeCloseTo(sketch.aspect)
})

test('provider path strings and flat commands compile without inventing geometry or executing content', () => {
  const bubble = creativeSketch({ aspect: 1, paths: ['E 0.5 0.45 0.34 0.34', ['E', .82, .18, .11, .11]] })
  expect(bubble.paths).toEqual([[['E', .5, .45, .34, .34]], [['E', .82, .18, .11, .11]]])
  expect(creativeSketch({ aspect: 1, paths: ['M .1 .2 L .9 .2 L .5 .9 Z'] })).toBeTruthy()
  for (const path of ['M 0 0 L', 'M 0 0 script()', 'E -1 .5 .1 .1', 'M 0 0 L Infinity 1']) {
    expect(creativeSketch({ aspect: 1, paths: [path] })).toBeNull()
  }
})

test('Nilo-selected color survives validation while retaining the child brush texture and width', async () => {
  const { result, model } = await run({}, { ...choice, recipeId:'flower-1', color:'#CE557D' })
  expect(result.proposal).toMatchObject({ color:'#ce557d', strokeWidth:4, brushKind:'round', recipeId:'flower-1' })
  expect(result.proposal.color).not.toBe(context.drawingStyle.color)
  expect(model.mock.calls[1][1]).toContain('Choose your OWN #RRGGBB')
  expect(model.mock.calls[1][1]).toContain('robot-2')
  expect(model.mock.calls[1][1]).toContain('umbrella-1')
})

test('a backup recipe keeps its own color and invalid colors still produce a complete drawing', async () => {
  const { result } = await run({}, { ...choice, recipeId:null, sketch:null, color:'#ff0000',
    backup:{recipeId:'turtle-2',color:'#3b8e80',relationship:'pond companion',at:[.6,.7],scale:.2} })
  expect(result.proposal).toMatchObject({color:'#3b8e80',recipeId:'turtle-2'})
  const invalid = await run({}, {...choice,recipeId:'rocket-0',color:'not-a-color'})
  expect(invalid.result.proposal.color).toBe(getDrawingRecipe('rocket-0').colors[0])
})
