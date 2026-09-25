import { expect, test, vi } from 'vitest'
import { parseSimpleDrawingRequest } from '../src/services/simpleDrawing.js'
import { generateNiloDialogue } from '../src/services/niloDialogue.js'
import {sampleProposalGeometry} from '../../shared/niloGeometry.mjs'
import {halfShape} from '../../shared/niloHalfShape.mjs'

test.each(['左上角','右上角','左下角','右下角'])('half sun stays half in the requested corner: %s',async corner=>{
 const vision=vi.fn()
 const result=await run(`只画一半的太阳，放在${corner}`,{}, {chatWithImage:vision})
 expect(result.status).toBe('ready')
 expect(result.placementLocked).toBe(true)
 const p=result.proposal
 expect(p).toMatchObject({template:'custom',subject:'太阳'})
 expect(p.width*context.canvasAspect/p.height).toBeCloseTo(2)
 expect(p.x < .5).toBe(corner.includes('左'))
 expect(p.y < .5).toBe(corner.includes('上'))
 const points=sampleProposalGeometry(p,context.canvasAspect).flatMap(s=>s.points)
 expect(Math.max(...points.map(p=>p.y))-Math.min(...points.map(p=>p.y))).toBeLessThan(.12)
 expect(vision).not.toHaveBeenCalled()
})

test.each(['top','bottom','left','right'])('clips actual sun strokes on %s',side=>{
 const original={template:'sun',x:.2,y:.2,width:.2,height:.2,color:'#123456'}
 const result=halfShape(original,side)
 expect(result).not.toBeNull()
 for(const {points} of sampleProposalGeometry(result))for(const p of points){
  if(side==='top')expect(p.y).toBeLessThanOrEqual(.300001)
  if(side==='bottom')expect(p.y).toBeGreaterThanOrEqual(.299999)
  if(side==='left')expect(p.x).toBeLessThanOrEqual(.300001)
  if(side==='right')expect(p.x).toBeGreaterThanOrEqual(.299999)
 }
 expect(original.template).toBe('sun')
})

test('half parser keeps negations and extra clauses out of the shortcut',()=>{
 expect(parseSimpleDrawingRequest('draw half a sun in the top left corner')).toMatchObject({half:'top',region:'top-left'})
 for(const text of ['不要画半个太阳，放在左上角','画一半的太阳，不要放在左上角','画一半的太阳，再画一朵花，放在左上角'])expect(parseSimpleDrawingRequest(text)).toBeNull()
})

const context = { locale: 'zh', inferDrawingIntent: true, inkGrid: Array(64).fill(0), canvasAspect: 1.5,
  lastStroke: { points: [{ x: .3, y: .4 }, { x: .5, y: .6 }], color: '#d74952', width: 7, brushKind: 'crayon' } }
const run = (utterance, extra = {}, opts = {}) => generateNiloDialogue({ imageBase64: 'synthetic', context: { ...context, utterance, ...extra }, ...opts })

test.each(['你帮我再换一个星星吧', '帮我画一颗星星', '请画一个星星好吗？', '再来个星星', '换成星星', 'can you draw a star please?'])('previews exactly one requested star for %s without a model call', async utterance => {
  const vision = vi.fn(), text = vi.fn()
  const result = await run(utterance, {}, { chatWithImage: vision, chatText: text })
  expect(result.status).toBe('ready')
  expect(result.proposal).toMatchObject({ template: 'custom', subject: '星星', brushKind: 'crayon', color: '#d74952', strokeWidth: 7 })
  expect(result.proposal.sketch.paths).toHaveLength(1)
  expect(result.proposal.sketch.paths[0]).toHaveLength(11)
  expect(result.reply).toContain('留下来')
  expect(vision).not.toHaveBeenCalled(); expect(text).not.toHaveBeenCalled()
})

test('explicit color changes preserve the child brush, while replacement needs no existing preview', async () => {
  const result = await run('你帮我换一个蓝色的太阳吧')
  expect(result.proposal).toMatchObject({ template: 'sun', color: '#4aa5d8', strokeWidth: 7, brushKind: 'crayon' })
  expect(result.proposal.width * context.canvasAspect / result.proposal.height).toBeCloseTo(1)
})

test('an explicit new request can bring back a previously dismissed subject', async () => {
  expect((await run('再来个星星', { rejectedSubjects: ['星星'] })).proposal?.subject).toBe('星星')
  expect((await run('再来个太阳', { rejectedTemplates: ['sun'] })).proposal?.template).toBe('sun')
})

test('replacing an uncommitted preview keeps its center and style', async () => {
  const previous = { template: 'fish', x: .2, y: .3, width: .22, height: .18, color: '#123456', strokeWidth: 3, brushKind: 'pencil', target: '小鱼', relation: '空白处' }
  const result = await run('换一个星星吧', { currentProposal: previous })
  expect(result.proposal.color).toBe('#123456')
  expect(result.proposal.strokeWidth).toBe(3)
  expect(result.proposal.x + result.proposal.width / 2).toBeCloseTo(previous.x + previous.width / 2)
  expect(result.proposal.y + result.proposal.height / 2).toBeCloseTo(previous.y + previous.height / 2)
})

test.each(['不要画星星', '你会画星星吗', '我画了星星', '星星真好看', '画个星星再画个月亮', '画两颗星星', '画一个机器人', '画一颗星星在小船左边', '画一个星星怪兽', '别换星星', '留下来', '换一个', '可以给它一个朋友吗'])('does not shortcut ambiguous, negative or complex speech: %s', utterance => {
  expect(parseSimpleDrawingRequest(utterance)).toBeNull()
})

test('uses open space and asks about the requested subject when the canvas is full', async () => {
  const grid = Array(64).fill(0); grid.fill(1, 0, 32)
  expect((await run('画太阳', { inkGrid: grid })).proposal.y).toBeGreaterThan(.5)
  const full = await run('画星星', { inkGrid: Array(64).fill(1) })
  expect(full.status).toBe('clarify'); expect(full.proposal).toBeUndefined()
  expect(full.reply).toContain('星星想放在哪里')
})

test('shortcut respects solo mode, a missing image, cancellation and multi-element edits', async () => {
  const model = vi.fn(async () => ({ intent: 'chat', reply: '我在这里陪你。' }))
  expect((await run('画星星', { inferDrawingIntent: false }, { chatWithImage: model })).proposal).toBeUndefined()
  expect(model).toHaveBeenCalledOnce()
  expect(await generateNiloDialogue({ context: { ...context, utterance: '画星星' } })).toMatchObject({ reason: 'missing_image' })
  expect(await run('画星星', {}, { signal: AbortSignal.abort() })).toMatchObject({ reason: 'timeout' })
  const previous = { template: 'fish', x: .2, y: .3, width: .2, height: .1, color: '#123456', target: '鱼', relation: '在水里' }
  await run('换成星星', { currentProposal: previous, currentAdditions: [{ ...previous, x: .6 }] }, { chatWithImage: model })
  expect(model).toHaveBeenCalledTimes(2)
})

test.each([
 ['画一只可爱的小水豚','capybara'],['帮我画一个小仓鼠','hamster'],
 ['画一个小猫','cat'],['画一个圆圆的小蘑菇','mushroom'],['draw a cute red panda please','redpanda'],
])('tracing speech selects the matching beginner PNG: %s',async(utterance,id)=>{
 const vision=vi.fn(),text=vi.fn()
 const result=await run(utterance,{tracingGuide:true,canvasSize:{width:900,height:600}},{chatWithImage:vision,chatText:text})
 expect(result.status).toBe('ready')
 expect(result.proposal.template).toBe('illustration')
 expect(result.proposal.illustrationId).toBe(`illustration-library-${id}-beginner-01`)
 expect(result.proposal.sketch).toBeUndefined()
 expect(Math.min(result.proposal.width*900,result.proposal.height*600)).toBeGreaterThanOrEqual(143.99)
 expect(result.reply).toContain('参考图')
 expect(result.reply).not.toContain('留下来')
 expect(vision).not.toHaveBeenCalled();expect(text).not.toHaveBeenCalled()
})

test('tracing shortcut honors corners and explicit re-requests after clearing',async()=>{
 const vision=vi.fn()
 const result=await run('画一个小水豚，放在右下角',{tracingGuide:true,recentRecipeIds:['capybara-0'],rejectedSubjects:['水豚']},{chatWithImage:vision})
 expect(result.proposal?.illustrationId).toBe('illustration-library-capybara-beginner-01')
 expect(result.proposal.x+result.proposal.width).toBeCloseTo(.96);expect(result.proposal.y+result.proposal.height).toBeCloseTo(.96)
 expect(result.placementLocked).toBe(true)
 expect(vision).not.toHaveBeenCalled()
})

test.each(['不要画小水豚','画一个小水豚再画一只猫','画一个水豚怪兽','画一个站着的小仓鼠','draw a red panda with wings'])('new recipes keep complex requests out of the shortcut: %s',text=>{
 expect(parseSimpleDrawingRequest(text,true)).toBeNull()
})

test.each([{width:180,height:180},{width:320,height:600},{width:600,height:320}])('PNG guides remain valid on a small canvas: %j',async canvasSize=>{
 const model=vi.fn()
 const result=await run('画一个小水母',{tracingGuide:true,canvasSize,canvasAspect:canvasSize.width/canvasSize.height},{chatWithImage:model})
 expect(result.proposal?.illustrationId).toBe('illustration-library-jellyfish-beginner-01')
 expect(result.proposal.width).toBeLessThanOrEqual(.9)
 expect(result.proposal.height).toBeLessThanOrEqual(.9)
 expect(result.proposal.width*result.proposal.height).toBeLessThanOrEqual(.810001)
 expect(result.proposal.width*canvasSize.width/result.proposal.height/canvasSize.height).toBeCloseTo(1)
 expect(model).not.toHaveBeenCalled()
})

test.each([
 ['画一个写实风的学校','illustration-school'],['画一个精美风的花瓶','illustration-library-vase-medium-01'],['画一个可爱的消防员','illustration-library-firefighter-beginner-01'],
 ['draw a realistic railway station','illustration-library-railwaystation-medium-01'],['画一个精致的奶奶','illustration-library-grandmother-medium-01'],
 ['画一朵写实风的牡丹','illustration-library-peony-medium-01'],['画一个精美风的书架','illustration-library-bookshelf-medium-01'],
])('explicit subject and style select the exact authored variant without a model call: %s',async(utterance,id)=>{
 const model=vi.fn()
 const result=await run(utterance,{tracingGuide:true,canvasSize:{width:900,height:600}},{chatWithImage:model})
 expect(result.proposal?.illustrationId??result.proposal?.recipeId).toBe(id)
 expect(model).not.toHaveBeenCalled()
})

test('explicit style never silently falls back to cute, including after both variants were used',async()=>{
 expect(parseSimpleDrawingRequest('画一个写实风的小水豚',true)).toBeNull()
 for(const text of ['不要画写实风的学校','画一个写实风的学校再画一个精美风的花瓶','draw a realistic school with wings'])expect(parseSimpleDrawingRequest(text,true)).toBeNull()
 const result=await run('画一个写实风的学校',{tracingGuide:true,recentRecipeIds:['school-4','school-5']})
 expect(result.proposal?.illustrationId??result.proposal?.recipeId).toBe('illustration-school')
})

test.each([['画一座学校','illustration-library-school-beginner-01'],['画一个奶奶','illustration-library-grandmother-beginner-01'],['画一朵牡丹','illustration-library-peony-beginner-01'],['画一座学校，像真的一样','illustration-school'],['画一个圆圆的小蘑菇','illustration-library-mushroom-beginner-01']])('children can name a subject or ordinary detail preference: %s',async(utterance,id)=>{
 const model=vi.fn()
 const result=await run(utterance,{tracingGuide:true,canvasSize:{width:900,height:600}},{chatWithImage:model})
 expect(result.proposal?.illustrationId??result.proposal?.recipeId).toBe(id)
 expect(result.reply).not.toMatch(/精美|写实|风格|storybook|realistic|illustrated/)
 expect(model).not.toHaveBeenCalled()
})

test('ordinary feedback preserves the guide subject, pose and placement over the child tracing',async()=>{
 const first=await run('画一个精美风的火车站',{tracingGuide:true,canvasSize:{width:900,height:600},recentRecipeIds:['railwaystation-2']})
 const previous={...first.proposal,x:.24,y:.3,width:.24,height:.31,rotation:12}
 const model=vi.fn()
 const result=await run('像真的一样',{tracingGuide:true,currentProposal:previous,canvasSize:{width:900,height:600},inkGrid:Array(64).fill(1)},{chatWithImage:model})
 expect(result.proposal?.illustrationId).toBe('illustration-library-railwaystation-medium-01')
 expect(result.proposal.x+result.proposal.width/2).toBeCloseTo(previous.x+previous.width/2)
 expect(result.proposal.y+result.proposal.height/2).toBeCloseTo(previous.y+previous.height/2)
 expect(result.proposal.rotation).toBe(12)
 expect(result.placementLocked).toBe(true)
 expect(model).not.toHaveBeenCalled()
})
