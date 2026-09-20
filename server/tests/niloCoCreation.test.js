import { expect, test, vi } from 'vitest'
import { attachedLeafDetail, contourDetail, groundAttachment, normalizeTurnSketch } from '../src/services/niloCoCreation.js'
import { compileTurnReply, generateNiloDialogue, turnFailureCode, validateProposal } from '../src/services/niloDialogue.js'
import { LLMParseError } from '../src/services/llmClient.js'

const points = Array.from({ length: 24 }, (_, i) => ({ x: .5 + .23 * Math.cos(i * Math.PI * 2 / 23), y: .5 + .23 * Math.sin(i * Math.PI * 2 / 23) }))
const context = { locale: 'zh', takeTurn: true, requestDrawing: true, canvasAspect: 1, lastStroke: { points }, utterance: '轮到你了' }
const review = { targetVisible: true, usesExistingDrawing: true, detailRelated: true, placementCorrect: true, alreadyPresent: false, confidence: .9 }

test('after a new separate apple, a click corrects a plan on the older heart before drawing', async () => {
  const heartPlan={sceneType:'object',grounding:{visible:'左边是心形，右边新画了苹果',confidence:.9},reply:'接一片叶子',proposal:{template:'leaf',target:'旧心形的梗',relation:'从梗上长出叶子',anchor:{x:.1,y:.1,width:.3,height:.5},placement:'right',attachment:{x:.3,y:.2}}}
  const applePlan={...heartPlan,proposal:{...heartPlan.proposal,target:'新苹果的梗',anchor:{x:.55,y:.1,width:.3,height:.5},attachment:{x:.7,y:.2}}}
  const item=(owner,bounds)=>({owner,bounds,brushKind:'round',color:'#d74952',strokeCount:1})
  const scene={recentContributions:[item('child',{x:.1,y:.1,width:.3,height:.5}),item('nilo',{x:.25,y:.6,width:.05,height:.2}),item('child',{x:.55,y:.1,width:.3,height:.5})]}
  const vision=vi.fn(async(_image,prompt,opts)=>opts.kind==='nilo_companion_review'?review:prompt.includes('DRAWING CORRECTION')?applePlan:heartPlan)
  const result=await generateNiloDialogue({imageBase64:'synthetic',context:{...context,scene},chatWithImage:vision})
  expect(result.proposal.target).toBe('新苹果的梗')
  expect(vision.mock.calls.map(call=>call[2].kind)).toEqual(['nilo_companion_vision','nilo_companion_vision','nilo_companion_review'])
})

test('a geometric label does not reject a real leaf joined to a visible stem before review', async () => {
  const raw={sceneType:'geometric',grounding:{visible:'右侧心形上方有一条短茎',confidence:.85},reply:'从茎上接叶片',proposal:{template:'leaf',target:'右侧的小梗',relation:'叶子接在梗上',anchor:{x:.55,y:.12,width:.3,height:.4},placement:'right',attachment:{x:.69,y:.15}}}
  const vision=vi.fn().mockResolvedValueOnce(raw).mockResolvedValueOnce(review)
  const result=await generateNiloDialogue({imageBase64:'synthetic',context,chatWithImage:vision})
  expect(result.status).toBe('ready')
  expect(result.proposal.template).toBe('custom')
  expect(result.proposal.attachment).toEqual({x:.69,y:.15})
  expect(vision.mock.calls.map(call=>call[2].kind)).toEqual(['nilo_companion_vision','nilo_companion_review'])
})

test.each([{placementCorrect:false}, {alreadyPresent:true}, {detailRelated:false}, {confidence:.7}])('one click repairs a rejected review %j and rechecks the new plan', async rejected => {
  const raw={sceneType:'geometric',grounding:{visible:'中央的心形轮廓',confidence:.95},reply:'接一根绳',proposal:{template:'custom',subject:'气球绳',target:'心形',relation:'原来的心形变成气球',anchor:{x:.27,y:.27,width:.46,height:.46},placement:'below',attachment:{x:.5,y:.73},sketch:{aspect:.4,paths:[[['M',.5,0],['Q',0,.5,.8,1]]]}}}
  const repaired={...raw,proposal:{...raw.proposal,subject:'重新定位的气球绳',sketch:{aspect:.4,paths:[[['M',.5,0],['Q',.9,.5,.5,1]]]}}}
  const vision=vi.fn().mockResolvedValueOnce(raw).mockResolvedValueOnce({...review,...rejected}).mockResolvedValueOnce(repaired).mockResolvedValueOnce(review)
  const result=await generateNiloDialogue({imageBase64:'synthetic',context,chatWithImage:vision})
  expect(result.status).toBe('ready')
  expect(result.proposal.subject).toBe('重新定位的气球绳')
  expect(vision.mock.calls.map(call=>call[2].kind)).toEqual(['nilo_companion_vision','nilo_companion_review','nilo_companion_vision','nilo_companion_review'])
  expect(new Set(vision.mock.calls.map(call=>call[2].signal)).size).toBe(1)
})

test('repeated rejection is bounded and explains placement instead of requiring the child to add marks', async () => {
  const raw={sceneType:'object',grounding:{visible:'中间的苹果与上方茎',confidence:.9},reply:'接叶片',proposal:{template:'leaf',target:'梗',relation:'叶片接在茎上',anchor:{x:.45,y:.08,width:.1,height:.3},placement:'right',attachment:{x:.48,y:.16}}}
  const vision=vi.fn(async (_image,_prompt,opts)=>opts.kind==='nilo_companion_review'?{...review,placementCorrect:false}:raw)
  const result=await generateNiloDialogue({imageBase64:'synthetic',context,chatWithImage:vision})
  expect(result).toMatchObject({status:'clarify',reason:'misplaced_detail'})
  expect(result.proposal).toBeUndefined()
  expect(result.reply).toContain('位置')
  expect(result.reply).not.toContain('再添一笔')
  expect(vision).toHaveBeenCalledTimes(4)
})

test('a click cannot draw a fruit stem as a detached stroke even if the model would approve it', async () => {
  const raw={sceneType:'object',grounding:{visible:'苹果轮廓上方有凹口',confidence:.95},reply:'给苹果接上梗',proposal:{template:'custom',subject:'苹果的茎',target:'苹果',relation:'接上方的梗',anchor:{x:.27,y:.27,width:.46,height:.46},placement:'above',sketch:{aspect:.4,paths:[[['M',.5,1],['Q',0,.5,.5,0]]]}}}
  const vision=vi.fn().mockResolvedValueOnce(raw).mockResolvedValueOnce(review)
  const result=await generateNiloDialogue({imageBase64:'synthetic',context,chatWithImage:vision})
  expect(result.proposal).toBeUndefined()
})

test.each(['请给苹果加一片叶子', '画一片叶子'])('voice request %s attaches a leaf to the visible stem and reviews the compiled location', async utterance => {
  const raw = { intent:'draw', confidence:.95, sceneType:'object', grounding:{visible:'苹果上方有一段梗',confidence:.95}, reply:'在梗上接叶片',
    proposal:{template:'leaf',target:'苹果梗',relation:'从梗向右生长',anchor:{x:.45,y:.08,width:.08,height:.24},placement:'right',attachment:{x:.483,y:.16}} }
  const vision = vi.fn().mockResolvedValueOnce(raw).mockResolvedValueOnce(review)
  const result = await generateNiloDialogue({imageBase64:'synthetic',context:{...context,takeTurn:false,utterance,lastStroke:{points:[{x:.48,y:.1},{x:.48,y:.2},{x:.48,y:.3}]}},chatWithImage:vision})
  expect(result.status).toBe('ready')
  const p = result.proposal
  expect(p.template).toBe('custom')
  const [,u,v] = p.sketch.paths[0][0]
  expect(p.x+u*p.width).toBeCloseTo(.48)
  expect(p.y+v*p.height).toBeCloseTo(.16)
  expect(vision.mock.calls.at(-1)[2].kind).toBe('nilo_companion_review')
})

test('a voice leaf missing its join gets one bounded correction and must still pass visual review', async () => {
  const raw={intent:'draw',confidence:.95,reply:'给苹果梗接叶片',proposal:{template:'leaf',target:'苹果梗',relation:'向右长出',anchor:{x:.45,y:.1,width:.1,height:.2},placement:'right'}}
  const corrected={...raw,proposal:{...raw.proposal,attachment:{x:.48,y:.16}}}
  const vision=vi.fn().mockResolvedValueOnce(raw).mockResolvedValueOnce(corrected).mockResolvedValueOnce(review)
  const result=await generateNiloDialogue({imageBase64:'synthetic',context:{...context,takeTurn:false,utterance:'给苹果梗加叶子'},chatWithImage:vision})
  expect(result.status).toBe('ready')
  expect(result.proposal.attachment).toBeDefined()
  expect(vision.mock.calls.map(call=>call[2].kind)).toEqual(['nilo_companion_vision','nilo_companion_vision','nilo_companion_review'])
  expect(vision.mock.calls[1][2].signal).toBe(vision.mock.calls[0][2].signal)
})

test.each(['leaf', 'custom'])('voice refuses a detached %s part and a wrong junction', async template => {
  const raw = { intent:'draw',confidence:.95,reply:'接在苹果上',
    proposal:{template,target:'苹果',relation:'接在苹果上',anchor:{x:.3,y:.1,width:.4,height:.6},placement:'below',x:.3,y:.72,width:.2,height:.18,rotation:0,color:'#20352f',strokeWidth:4,
      ...(template === 'custom' ? {subject:'苹果的茎',sketch:{aspect:.5,paths:[[['M',.5,1],['Q',0,.5,.5,0]]]}} : {})} }
  const vision = vi.fn().mockResolvedValue(raw)
  const result = await generateNiloDialogue({imageBase64:'synthetic',context:{...context,takeTurn:false,utterance:'给苹果接上茎和叶子'},chatWithImage:vision})
  expect(result.proposal).toBeUndefined()
  const connected = {...raw,proposal:{...raw.proposal,template:'leaf',placement:'right',attachment:{x:.5,y:.3}}}
  delete connected.proposal.subject; delete connected.proposal.sketch
  vision.mockReset().mockResolvedValueOnce(connected).mockResolvedValueOnce({...review,placementCorrect:false})
  const wrongJoin = await generateNiloDialogue({imageBase64:'synthetic',context:{...context,takeTurn:false,utterance:'给苹果接上叶子'},chatWithImage:vision})
  expect(wrongJoin.proposal).toBeUndefined()
})

test.each(['waves', 'flower', 'rain'])('standalone shapes reject %s even if a model would approve the decoration', async template => {
  const raw = { sceneType:'geometric', grounding:{visible:'中央闭合的心形线条',confidence:.95}, reply:'在旁边接一笔',
    proposal:{template,target:'心形',relation:'心形旁边的装饰',anchor:{x:.27,y:.27,width:.46,height:.46},placement:'below'} }
  // Renaming the scene on retry must not bypass the structural constraint.
  const vision = vi.fn().mockResolvedValueOnce(raw).mockResolvedValueOnce({...raw,sceneType:'object'}).mockResolvedValue(review)
  const result = await generateNiloDialogue({imageBase64:'synthetic',context,chatWithImage:vision})
  expect(result.status).toBe('clarify')
  expect(result.proposal).toBeUndefined()
  expect(vision).toHaveBeenCalledTimes(2)
  expect(vision.mock.calls[1][1]).toContain('unrelated_decoration')
})

test('renaming water lines to a ribbon cannot bypass attachment; a corrected string still needs review', async () => {
  const raw = {sceneType:'geometric',grounding:{visible:'中央的心形轮廓',confidence:.95},reply:'接一笔',proposal:{
    template:'custom',subject:'飘带',target:'心形',relation:'心形旁的两条曲线',anchor:{x:.27,y:.27,width:.46,height:.46},placement:'below',
    sketch:{aspect:.4,paths:[[['M',.5,0],['Q',0,.5,.8,1]]]}}}
  const corrected = {...raw,proposal:{...raw.proposal,subject:'气球绳',attachment:{x:.5,y:.73},relation:'原有心形作为气球，接上一根绳子'}}
  const vision = vi.fn().mockResolvedValueOnce(raw).mockResolvedValueOnce(corrected).mockResolvedValueOnce(review)
  const result = await generateNiloDialogue({imageBase64:'synthetic',context,chatWithImage:vision})
  expect(result.status).toBe('ready')
  expect(result.proposal.subject).toBe('气球绳')
  expect(result.proposal.attachment).toBeDefined()
  expect(vision.mock.calls[1][1]).toContain('detached_continuation')
  expect(vision.mock.calls[2][2].kind).toBe('nilo_companion_review')
})

test.each([.65, 1, 2.4])('refines a near-stem leaf against stroke samples before sizing and review, at aspect %s', canvasAspect => {
  const ctx = { ...context, canvasAspect, lastStroke: { points: [{x:.48,y:.1},{x:.48,y:.2},{x:.48,y:.3}] } }
  const raw = { sceneType:'object',grounding:{confidence:.9},reply:'接一片叶子',proposal:{
    template:'leaf',target:'梗',relation:'从梗上长出叶片',anchor:{x:.45,y:.08,width:.08,height:.24},placement:'right',
    attachment:{x:.483,y:.16}} }
  const compiled = compileTurnReply(raw,ctx)
  expect(validateProposal(compiled.proposal,ctx)).not.toBeNull()
  const p = compiled.proposal
  expect(p.attachment.x).toBeCloseTo(.48)
  expect(p.attachment.y).toBeCloseTo(.16)
  const [,u,v] = p.sketch.paths[0][0]
  expect(p.x+u*p.width).toBeCloseTo(.48)
  expect(p.y+v*p.height).toBeCloseTo(.16)
  expect(raw.proposal.attachment.x).toBe(.483)
})

test('junction refinement cannot jump to another object, cross the target anchor, or bridge sparse samples', () => {
  const anchor = {x:.4,y:.1,width:.2,height:.3}
  const ctx = {canvasAspect:1,lastStroke:{points:[{x:.48,y:.1},{x:.48,y:.2}]}}
  for (const a of [{x:.52,y:.15},{x:.399,y:.15},{x:NaN,y:.15}]) {
    expect(groundAttachment(a,anchor,ctx)).toBe(a)
  }
  const a = {x:.483,y:.15}
  expect(groundAttachment(a,{...anchor,x:.481,width:.1},ctx)).toBe(a)
  expect(groundAttachment(a,anchor,{...ctx,lastStroke:{points:[{x:.48,y:0},{x:.48,y:.9}]}})).toBe(a)
  expect(groundAttachment(a,anchor,{...ctx,lastStroke:null})).toBe(a)
  expect(groundAttachment({...a,unknown:'reject me'},anchor,ctx)).toHaveProperty('unknown')
})

test.each([.65, 1, 2.4])('attached parts fit near each canvas edge before validation, at aspect %s', canvasAspect => {
  for (const [placement, x, y] of [['right',.5,.07],['left',.09,.5],['above',.5,.14],['below',.5,.86]]) {
    const request = { sceneType:'object', grounding:{confidence:.9},reply:'接一片叶子',proposal:{template:'leaf',target:'梗',relation:'从梗上长出叶片',
      anchor:{x:.03,y:.03,width:.94,height:.94},placement,attachment:{x,y}} }
    const p = compileTurnReply(request,{...context,canvasAspect}).proposal
    expect(validateProposal(p,{...context,canvasAspect})).not.toBeNull()
    expect(p.x).toBeGreaterThanOrEqual(.02 - 1e-9)
    expect(p.y).toBeGreaterThanOrEqual(.02 - 1e-9)
    expect(p.x+p.width).toBeLessThanOrEqual(.98 + 1e-9)
    expect(p.y+p.height).toBeLessThanOrEqual(.98 + 1e-9)
    const [,u,v] = p.sketch.paths[0][0]
    expect(p.x+u*p.width).toBeCloseTo(x)
    expect(p.y+v*p.height).toBeCloseTo(y)
    expect(p.width*canvasAspect/p.height).toBeCloseTo(p.sketch.aspect)
  }
})

test('a top-edge leaf reaches visual review without asking the model to repair valid data', async () => {
  const raw = { sceneType:'object',grounding:{visible:'画布上沿附近一条梗',confidence:.9},reply:'给梗接上叶片',proposal:{
    template:'leaf',target:'上方的梗',relation:'从梗向右长出叶片',anchor:{x:.45,y:.06,width:.1,height:.2},placement:'right',attachment:{x:.5,y:.07}} }
  const model = vi.fn().mockResolvedValueOnce(raw).mockResolvedValueOnce(review)
  const result = await generateNiloDialogue({imageBase64:'synthetic',context,chatWithImage:model})
  expect(result.status).toBe('ready')
  expect(model).toHaveBeenCalledTimes(2)
  expect(model.mock.calls[1][2].kind).toBe('nilo_companion_review')
})

test('invalid-plan diagnostics contain reason codes rather than child content', () => {
  const secret = 'PRIVATE_CHILD_STORY'
  expect(turnFailureCode({reply:secret},{proposal:{template:'leaf'}},context)).toBe('missing_attachment')
  expect(turnFailureCode({reply:secret},{proposal:{template:'custom',anchor:{x:.2,y:.2,width:.2,height:.2},placement:'near',sketch:{paths:[]}}},context)).toBe('invalid_sketch')
  expect(turnFailureCode(null,null,context)).toBe('missing_reply')
})

test.each(['right', 'left', 'above', 'below'])('the attached leaf grows %s with a connected petiole and valid paths', direction => {
  const p = { template:'leaf', target:'梗', relation:'从梗生长的叶片', anchor:{x:.2,y:.1,width:.6,height:.7},
    placement:direction, attachment:{x:.5,y:.4} }
  const compiled = compileTurnReply({sceneType:'object', grounding:{confidence:.9},reply:'接一片叶子',proposal:p},context).proposal
  const validated = validateProposal(compiled,context)
  expect(validated).not.toBeNull()
  expect(validated.sketch.paths).toHaveLength(3)
  const [petiole, outline] = validated.sketch.paths
  expect(petiole.at(-1).slice(1)).toEqual(outline[0].slice(1))
  expect(validated.x + petiole[0][1]*validated.width).toBeCloseTo(.5)
  expect(validated.y + petiole[0][2]*validated.height).toBeCloseTo(.4)
  expect(attachedLeafDetail('near','zh')).toBeNull()
})

test('a detached stock leaf is corrected into a custom part joined to the stem before review', async () => {
  const raw = { sceneType: 'object', grounding: { visible: '中央圆形轮廓上方有一条弯曲的梗', confidence: .9 }, reply: '给梗接一片叶子。',
    proposal: { template: 'leaf', target: '上方的梗', relation: '梗上生长的叶片', anchor: { x: .3, y: .1, width: .4, height: .6 }, placement: 'below' } }
  const corrected = { ...raw, proposal: { ...raw.proposal, template: 'custom', subject: '梗上的叶片', placement: 'near',
    attachment: { x: .5, y: .3 }, sketch: { aspect: 1, paths: [[['M', 0, 1], ['Q', 0, .15, 1, 0], ['Q', 1, .8, 0, 1], ['Z']]] } } }
  const vision = vi.fn().mockResolvedValueOnce(raw).mockResolvedValueOnce(corrected).mockResolvedValueOnce(review)
  const result = await generateNiloDialogue({ imageBase64: 'synthetic', context, chatWithImage: vision })
  expect(vision).toHaveBeenCalledTimes(3)
  expect(result.proposal).toMatchObject({ template: 'custom', subject: '梗上的叶片', attachment: { x: .5, y: .3 } })
  expect(vision.mock.calls[2][1]).toContain('VISIBLE junction')
  expect(validateProposal({ ...result.proposal, attachment: undefined }, context)).toBeNull()
  // Deliberately requesting a separate leaf by voice still produces its preview.
  const { subject, sketch, attachment, ...box } = result.proposal
  expect(validateProposal({ ...box, template: 'leaf' }, { ...context, takeTurn: false })).not.toBeNull()
})

test('a malformed click plan gets one bounded format correction and still requires visual review', async () => {
  const corrected = { sceneType: 'geometric', grounding: { visible: '闭合圆圈', confidence: .9 }, reply: '接一小段轮廓。',
    proposal: { template: 'contour', target: '圆圈', relation: '内部呼应', anchor: { x: .27, y: .27, width: .46, height: .46 }, placement: 'inside' } }
  const vision = vi.fn().mockRejectedValueOnce(new LLMParseError('truncated', '{"reply":'))
    .mockResolvedValueOnce(corrected).mockResolvedValueOnce(review)
  expect((await generateNiloDialogue({ imageBase64: 'synthetic', context, chatWithImage: vision })).proposal).toBeTruthy()
  expect(vision).toHaveBeenCalledTimes(3)
  expect(vision.mock.calls[1][1]).toContain('FORMAT CORRECTION')
  expect(new Set(vision.mock.calls.map(call => call[2].signal)).size).toBe(1)
  const broken = vi.fn().mockRejectedValue(new LLMParseError('truncated', '{'))
  expect(await generateNiloDialogue({ imageBase64: 'synthetic', context, chatWithImage: broken })).toMatchObject({ status: 'unavailable', reason: 'invalid_response' })
  expect(broken).toHaveBeenCalledTimes(2)
})

test('a contour retains the actual child geometry as a short inset stroke', () => {
  const result = contourDetail(context)
  expect(result.template).toBe('custom')
  expect(result.sketch.paths).toHaveLength(1)
  const commands = result.sketch.paths[0]
  expect(commands.length).toBeGreaterThanOrEqual(3)
  expect(commands.length).toBeLessThan(points.length / 2)
  const cx = result.anchor.x + result.anchor.width / 2, cy = result.anchor.y + result.anchor.height / 2
  for (const [i, [, x, y]] of commands.entries()) {
    const source = points[Math.floor(points.length * .12) + i]
    expect(result.x + x * result.width).toBeCloseTo(cx + (source.x - cx) * .65)
    expect(result.y + y * result.height).toBeCloseTo(cy + (source.y - cy) * .65)
  }
})

test('open, tiny and missing strokes never receive a guessed contour', () => {
  expect(contourDetail({})).toBeNull()
  expect(contourDetail({ ...context, lastStroke: { points: points.slice(0, 12) } })).toBeNull()
  expect(contourDetail({ ...context, lastStroke: { points: points.map(p => ({ x: .5 + p.x * .01, y: .5 + p.y * .01 })) } })).toBeNull()
})

test('an explicitly chosen contour uses real child data and is still independently reviewed', async () => {
  const raw = { sceneType: 'geometric', grounding: { visible: '画布中央是一个闭合圆圈', confidence: .95 }, reply: '接一段内轮廓',
    proposal: { template: 'contour', target: '圆圈', relation: '呼应轮廓', anchor: { x: .2, y: .2, width: .6, height: .6 }, placement: 'inside' } }
  const vision = vi.fn().mockResolvedValueOnce(raw).mockResolvedValueOnce(review)
  const result = await generateNiloDialogue({ imageBase64: 'synthetic', context, chatWithImage: vision })
  expect(result.proposal).toMatchObject({ template: 'custom', placement: 'inside', subject: '轮廓呼应' })
  expect(result.reply).not.toContain('花')
  expect(vision.mock.calls[1][1]).toContain('轮廓呼应')
  expect(vision.mock.calls[1][1]).not.toContain('无关装饰')
  const reject = vi.fn().mockResolvedValueOnce(raw).mockResolvedValueOnce({ ...review, targetVisible: false })
  expect((await generateNiloDialogue({ imageBase64: 'synthetic', context, chatWithImage: reject })).proposal).toBeUndefined()
})

test('compact single paths retain topology and proportions while becoming visible', () => {
  const raw = { aspect: 1.5, paths: [['M', .3, .3], ['Q', .35, .35, .4, .3]] }
  const result = normalizeTurnSketch(raw)
  expect(result.paths).toHaveLength(1)
  expect(result.paths[0].map(command => command[0])).toEqual(['M', 'Q'])
  expect(result.aspect).toBe(1.5)
  expect(result.paths[0][1][3] - result.paths[0][0][1]).toBeCloseTo(.8)
  expect(raw.paths[0]).toEqual(['M', .3, .3])
})

test('path normalization never repairs unsafe commands, empty paths or oversized contributions', () => {
  for (const paths of [[], [['M', .5, .5], ['Q', .5, .5, .5, .5]], [['RUN', 'code']],
    Array.from({ length: 5 }, () => [['M', 0, 0], ['L', 1, 1]]), [['M', 0, 0], ['L', 2, 2]],
  ]) expect(normalizeTurnSketch({ aspect: 1, paths })).toBeNull()
  expect(normalizeTurnSketch({ aspect: 1, paths: [[['M', 0, 0], ['L', 1, 1]]], script: 'x' })).toBeNull()
})

test('a circle can develop into a balloon without being replaced by an inset contour', async () => {
  const raw = { sceneType: 'geometric', grounding: { visible: '中央的闭合圆形', confidence: .95 }, reply: '给圆接上一根气球绳。',
    proposal: { template: 'custom', subject: '气球绳', target: '圆形', relation: '接上绳子让圆变成气球',
      anchor: { x: .27, y: .27, width: .46, height: .46 }, placement: 'below', attachment: { x: .5, y: .73 },
      sketch: { aspect: .4, paths: [[['M', .5, 0], ['Q', 0, .5, .8, 1]]] } } }
  const vision = vi.fn().mockResolvedValueOnce(raw).mockResolvedValueOnce(review)
  const result = await generateNiloDialogue({ imageBase64: 'synthetic', context, chatWithImage: vision })
  expect(result.proposal).toMatchObject({ template: 'custom', subject: '气球绳', placement: 'below' })
  const p = result.proposal, start = p.sketch.paths[0][0]
  expect(p.attachment.x).toBeCloseTo(.5, 2)
  expect(p.attachment.y).toBeCloseTo(.73, 2)
  expect(p.x + start[1] * p.width).toBeCloseTo(p.attachment.x, 8)
  expect(p.y + start[2] * p.height).toBeCloseTo(p.attachment.y, 8)
  expect(p.x + start[1] * p.width).toBeCloseTo(.5)
  expect(p.y + start[2] * p.height).toBeCloseTo(.73)
  expect(vision).toHaveBeenCalledTimes(2)
})

test('up to four paths retain their layout as one new part', () => {
  const paths = [[['M', .2, .2], ['L', .4, .4]], [['M', .6, .2], ['L', .8, .4]]]
  const result = normalizeTurnSketch({ aspect: 2, paths })
  expect(result.paths).toHaveLength(2)
  expect(result.paths[1][0][1] - result.paths[0][0][1]).toBeCloseTo(.4)
  expect(result.paths[1][0][2]).toBe(result.paths[0][0][2])
})

test('two separate moves become two strokes without inserting a connecting line', () => {
  const first = [['M', 1, .5], ['Q', .6, .5, 0, .62]]
  const second = [['M', 1, .5], ['Q', .55, .5, 0, .38]]
  expect(normalizeTurnSketch({ aspect: 1.6, paths: [[...first, ...second]] })).toEqual({ aspect: 1.6, paths: [first, second] })
  expect(normalizeTurnSketch({ aspect: 1.6, paths: [[...first, ['RUN', 'unsafe'], ...second]] })).toBeNull()
  expect(normalizeTurnSketch({ aspect: 1, paths: [Array.from({ length: 5 }, () => first).flat()] })).toBeNull()
})
