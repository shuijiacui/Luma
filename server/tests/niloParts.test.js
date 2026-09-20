// Dialogue unit tests isolate rasterisation; niloPreview.test.js exercises real PNG composition.
vi.mock('../src/services/niloPreview.js', () => ({ renderReviewCandidate: (_image, proposal) => ({proposal, imageBase64:'composited-preview'}) }))
import { expect, test, vi } from 'vitest'
import { expandDrawingPart, drawingPartsPrompt } from '../src/services/niloParts.js'
import { compileTurnReply, generateNiloDialogue, sanitizeDialogueContext, validateProposal } from '../src/services/niloDialogue.js'
import { validateCustomSketch } from '../src/services/niloSketch.js'
const context = sanitizeDialogueContext({takeTurn:true,requestDrawing:true,canvasAspect:1,utterance:'轮到你了',drawingStyle:{color:'#8a4433',brushKind:'crayon',brushSize:5}})
const base = {template:'part',target:'现有主体',relation:'补一个缺少的部件',anchor:{x:.3,y:.2,width:.4,height:.5},placement:'inside'}

test('balloon_string is explicit, retains the old alias, and cannot act as an internal bark tool',()=>{
  const connected={...base,part:'balloon_string',placement:'below',attachment:{x:.5,y:.5}}
  expect(expandDrawingPart(connected).proposal.subject).toBe('气球绳')
  expect(expandDrawingPart({...connected,part:'string'}).proposal.sketch).toEqual(expandDrawingPart(connected).proposal.sketch)
  expect(expandDrawingPart({...base,part:'balloon_string'})).toBeNull()
  expect(drawingPartsPrompt()).toContain('balloon_string')
  expect(drawingPartsPrompt()).toContain('not a generic line or bark tool')
  expect(drawingPartsPrompt()).not.toContain('|string|')
})

test('missing target label reuses grounded evidence without modifying the proposed paths',()=>{
  const {target:_target,...p}=base
  const raw={sceneType:'object',grounding:{visible:'一棵树的树干',confidence:.9},reply:'添树皮',proposal:{...p,template:'custom',subject:'树皮纹',sketch:{aspect:.3,paths:[[['M',.4,0],['Q',.6,.5,.4,1]]]}}}
  const compiled=compileTurnReply(raw,context)
  expect(validateProposal(compiled.proposal,context)?.target).toBe('一棵树的树干')
  expect(raw.proposal.target).toBeUndefined()
  expect(sanitizeDialogueContext({turnScope:'scene',takeTurn:true,requestDrawing:true}).turnScope).toBe('scene')
  expect(sanitizeDialogueContext({turnScope:'scene',takeTurn:false,requestDrawing:true}).turnScope).toBe('latest')
})
test.each(['eye','eyes','smile','window','hub','fringe','hair_bow','nose','button'])('%s uses valid local geometry and retains chosen position and child style', part=>{
  const raw={sceneType:'object',grounding:{visible:'清晰的轮廓',confidence:.9},reply:'接一笔',proposal:{...base,part,position:{u:.7,v:.4},scale:.25}}
  const compiled=compileTurnReply(raw,context)
  expect(validateProposal(compiled.proposal,context)).not.toBeNull()
  const p=compiled.proposal
  expect(p.x+p.width/2).toBeCloseTo(.58)
  expect(p.y+p.height/2).toBeCloseTo(.4)
  expect(p).toMatchObject({template:'custom',color:'#8a4433',brushKind:'crayon',strokeWidth:5})
  expect(p).not.toHaveProperty('part'); expect(p).not.toHaveProperty('position')
})
test.each([['string','below'],['tail','left'],['tail','right'],['fin','above'],['fin','below'],['leg','below'],['hat','above'],['crown','above']])('%s in direction %s keeps the actual join', (part,placement)=>{
  const p={...base,part,placement,attachment:{x:.5,y:.5}}
  const expanded=expandDrawingPart(p)
  expect(validateCustomSketch(expanded.proposal.sketch)).not.toBeNull()
  const compiled=compileTurnReply({sceneType:'object',grounding:{visible:'清晰的轮廓',confidence:.9},reply:'接一笔',proposal:p},context).proposal
  const [,u,v]=compiled.sketch.paths[0][0]
  expect(compiled.x+u*compiled.width).toBeCloseTo(.5)
  expect(compiled.y+v*compiled.height).toBeCloseTo(.5)
})
test.each([
  {part:'script'}, {part:'__proto__'}, {part:'constructor'}, {part:'tail'}, {part:'eye',attachment:{x:.5,y:.5}}, {part:'eye',scale:2},
  {part:'eye',position:{u:-1,v:.5}}, {part:'eye',sketch:{}}, {part:'eye',subject:'different object'},
])('invalid or ambiguous part data stays rejected: %j', patch=>{
  expect(expandDrawingPart({...base,...patch})).toBeNull()
})
test('compiled part must pass visual review; existing details never bypass it',async()=>{
  const raw={sceneType:'object',grounding:{visible:'有一扇窗的房子',confidence:.9},reply:'再画一扇窗',structure:{kind:'house',confidence:.9,regions:{wall:{x:.2,y:.1,width:.6,height:.7},roof:{x:.2,y:.01,width:.6,height:.1}}},proposal:{...base,part:'window'}}
  const vision=vi.fn(async(_image,_prompt,options)=>options.kind==='nilo_companion_review'
    ? {targetVisible:true,usesExistingDrawing:true,placementCorrect:true,detailRelated:true,alreadyPresent:true,confidence:.9}
    : raw)
  const result=await generateNiloDialogue({imageBase64:'synthetic',context,chatWithImage:vision})
  expect(result.proposal).toBeUndefined(); expect(result.reason).toBe('duplicate_detail')
  const reviewCall=vision.mock.calls.find(call=>call[2].kind==='nilo_companion_review')
  expect(reviewCall[1]).toContain('"template":"custom"')
  expect(reviewCall[1]).toContain('"sketch"')
})

test('an invalid hat plan receives one format correction instead of silently stopping',async()=>{
  const raw={sceneType:'object',grounding:{visible:'一个有眼睛和笑脸的人物',confidence:.9},reply:'加一个帽子',proposal:{...base,part:'hat'}}
  const fixed={...raw,reply:'添一点刘海',proposal:{...base,part:'fringe',position:{u:.5,v:.2},scale:.3}}
  const review={targetVisible:true,usesExistingDrawing:true,placementCorrect:true,detailRelated:true,alreadyPresent:false,confidence:.9}
  const vision=vi.fn().mockResolvedValueOnce(raw).mockResolvedValueOnce(fixed).mockResolvedValueOnce(review)
  const scene={recentContributions:[{owner:'child',bounds:base.anchor,strokeCount:5,brushKind:'crayon',color:'#8a4433'}]}
  const result=await generateNiloDialogue({imageBase64:'synthetic',context:{...context,scene},chatWithImage:vision})
  expect(result).toMatchObject({status:'ready',proposal:{template:'custom',subject:'弯弯的刘海'}})
  expect(vision.mock.calls.map(call=>call[2].kind)).toEqual(['nilo_companion_vision','nilo_companion_vision','nilo_companion_review'])
  expect(vision.mock.calls[1][1]).toContain('hat/crown')
  expect(vision.mock.calls[0][2].referenceSheet.imageBase64).toBeTruthy()
  expect(vision.mock.calls[2][2].referenceSheet).toBeUndefined()
})

test.each([1,2])('novel internal custom details preserve requested position and physical scale at aspect %s',canvasAspect=>{
  const raw={sceneType:'object',grounding:{visible:'一个自创机器人',confidence:.9},reply:'添一个按钮',proposal:{...base,template:'custom',subject:'三角按钮',position:{u:.7,v:.3},scale:.2,
    sketch:{aspect:1,paths:[[['M',.1,.9],['L',.5,.1],['L',.9,.9],['Z']]]}}}
  const p=compileTurnReply(raw,{...context,canvasAspect}).proposal
  expect(validateProposal(p,{...context,canvasAspect})).not.toBeNull()
  expect(p.x+p.width/2).toBeCloseTo(base.anchor.x+base.anchor.width*.7)
  expect(p.y+p.height/2).toBeCloseTo(base.anchor.y+base.anchor.height*.3)
  expect(p.width*canvasAspect/p.height).toBeCloseTo(1)
  expect(p.width*canvasAspect).toBeCloseTo(Math.max(base.anchor.width*canvasAspect,base.anchor.height)*.2)
  expect(p).not.toHaveProperty('position');expect(p).not.toHaveProperty('scale')
})

test('custom layout changes scale without moving the actual attachment',()=>{
  const raw={sceneType:'object',grounding:{visible:'侧面有轮廓的动物',confidence:.9},reply:'添胡须',proposal:{...base,template:'custom',subject:'胡须',placement:'right',attachment:{x:.7,y:.4},scale:.2,
    sketch:{aspect:2,paths:[[['M',0,.5],['Q',.5,.1,1,.2]]]}}}
  const p=compileTurnReply(raw,context).proposal
  expect(p.x).toBeCloseTo(.7);expect(p.y+p.height*.5).toBeCloseTo(.4)
  expect(validateProposal(p,context)).not.toBeNull()
  for(const patch of [{position:{u:2,v:.3}},{scale:4},{position:{u:.5,v:.5}}]){
    expect(compileTurnReply({...raw,proposal:{...raw.proposal,...patch}},context).proposal).toBeUndefined()
  }
})
