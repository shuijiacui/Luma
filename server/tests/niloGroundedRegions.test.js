import { test,expect,vi } from 'vitest'
import { PNG } from 'pngjs'
import { buildGroundedRegions,adaptGroundedObservation,groundedObservationPrompt,makeGroundedProvider } from '../src/services/niloGroundedRegions.js'
import { generateNiloDialogue } from '../src/services/niloDialogue.js'
import { encodeOccupancy,pixelOccupancy } from '../../shared/niloOccupancy.mjs'

function canvas(width=100,height=100){const png=new PNG({width,height});png.data.fill(255);return png}
function dot(png,x,y,alpha=255){const p=(y*png.width+x)*4;png.data[p]=30;png.data[p+1]=45;png.data[p+2]=40;png.data[p+3]=alpha}
function rectangle(png,x,y,width,height){for(let xx=x;xx<x+width;xx++){dot(png,xx,y);dot(png,xx,y+height-1)}for(let yy=y;yy<y+height;yy++){dot(png,x,yy);dot(png,x+width-1,yy)}}
const encode=png=>PNG.sync.write(png).toString('base64')
const subject=(regionIds,regions=[])=>({subject:'invented companion',family:'character',confidence:.8,evidence:'two rectangles joined by a line',existingParts:['outline'],regionIds,regions})
function twoBoxes(){const png=canvas();rectangle(png,10,15,20,30);rectangle(png,65,25,25,40);return png}

test('region IDs are derived deterministically from actual raster ink, without object identities',()=>{
  const input=encode(twoBoxes()),a=buildGroundedRegions(input),b=buildGroundedRegions(input)
  expect(a.candidates).toEqual(b.candidates)
  expect(a.annotatedImageBase64).toBe(b.annotatedImageBase64)
  expect(a.candidates.filter(c=>c.kind==='ink-component').map(c=>c.bounds)).toEqual([
    {x:.65,y:.25,width:.25,height:.4},{x:.1,y:.15,width:.2,height:.3}
  ])
  expect(a.candidates.every(c=>/^R\d+$/.test(c.id)&&!('subject' in c)&&!('confidence' in c))).toBe(true)
  expect(a.description).toMatch(/not semantic objects/)
  expect(encode(twoBoxes())).toBe(input)
})

test('separate components can be grouped by model IDs, but the model cannot write their bounding box',()=>{
  const catalog=buildGroundedRegions(encode(twoBoxes())),ids=catalog.candidates.filter(c=>c.kind==='ink-component').map(c=>c.id)
  const result=adaptGroundedObservation({subjects:[subject(ids)]},catalog)
  expect(result.rejected).toEqual([])
  expect(result.observation.subjects[0].bounds).toEqual({x:.1,y:.15,width:.8,height:.5})
  expect(result.observation.subjects[0].subject).toBe('invented companion')
  expect(result.observation.subjects[0].id).toBeNull()
})

test('enclosed surfaces derive from background topology and do not claim an object or empty rectangle',()=>{
  const png=canvas();rectangle(png,20,20,60,60)
  const closed=buildGroundedRegions(encode(png)),surface=closed.candidates.find(c=>c.kind==='enclosed-surface')
  expect(surface.bounds).toEqual({x:.21,y:.21,width:.58,height:.58})
  expect(surface.pixelCount).toBe(58*58)
  for(let x=35;x<45;x++){const at=(20*100+x)*4;png.data[at]=255;png.data[at+1]=255;png.data[at+2]=255}
  expect(buildGroundedRegions(encode(png)).candidates.some(c=>c.kind==='enclosed-surface')).toBe(false)
  expect(closed.description).toMatch(/not guaranteed empty rectangles/)
})

test('a connected shape has selectable measured local bands without assuming head or body',()=>{
  const png=canvas();rectangle(png,20,10,60,80)
  const catalog=buildGroundedRegions(encode(png)),component=catalog.candidates.find(c=>c.kind==='ink-component')
  const bands=catalog.candidates.filter(c=>c.kind.endsWith('-band'))
  expect(bands).toHaveLength(6)
  for(const band of bands){
    expect(band.parentId).toBe(component.id)
    expect(band.pixelCount).toBeLessThan(component.pixelCount)
    expect(band.bounds.x).toBeGreaterThanOrEqual(component.bounds.x)
    expect(band.bounds.y).toBeGreaterThanOrEqual(component.bounds.y)
    expect(band.bounds.x+band.bounds.width).toBeLessThanOrEqual(component.bounds.x+component.bounds.width+1e-9)
    expect(band.bounds.y+band.bounds.height).toBeLessThanOrEqual(component.bounds.y+component.bounds.height+1e-9)
  }
  const upper=bands.find(c=>c.kind==='horizontal-band')
  const adapted=adaptGroundedObservation({subjects:[subject([component.id],[{name:'upper visible surface',confidence:.83,regionIds:[upper.id]}])]},catalog)
  expect(adapted.observation.subjects[0].regions[0].bounds).toEqual(upper.bounds)
})

test('blank or transparent canvas has no invented candidate, with a bounded annotation sheet',()=>{
  const png=canvas(80,50);for(let x=1;x<70;x++)dot(png,x,30,0)
  const catalog=buildGroundedRegions(encode(png))
  expect(catalog.candidates).toEqual([])
  const annotated=PNG.sync.read(Buffer.from(catalog.annotatedImageBase64,'base64'))
  expect(annotated.width).toBe(768);expect(annotated.height).toBe(812)
})

test('many separate marks stay within the fixed candidate budget',()=>{
  const png=canvas(200,200)
  for(let y=5;y<190;y+=20)for(let x=5;x<190;x+=20)rectangle(png,x,y,12,12)
  const catalog=buildGroundedRegions(encode(png))
  expect(catalog.candidates.length).toBeLessThanOrEqual(32)
  expect(catalog.candidates.filter(c=>c.kind==='ink-component')).toHaveLength(8)
  expect(catalog.candidates.filter(c=>c.kind==='enclosed-surface')).toHaveLength(8)
})

test('invalid image is not replaced with a fake observation',()=>{
  expect(()=>buildGroundedRegions('invalid')).toThrow(/invalid_canvas_png/)
})

test.each([
  ['unknown',['R999']],['duplicate',['R1','R1']],['empty',[]],['nonstring',[1]],['excessive',Array.from({length:9},(_,i)=>`R${i+1}`)]
])('rejects %s selections instead of accepting guessed geometry',(_name,ids)=>{
  const result=adaptGroundedObservation({subjects:[subject(ids)]},buildGroundedRegions(encode(twoBoxes())))
  expect(result.observation.subjects).toEqual([])
  expect(result.rejected[0].code).toBe('invalid_subject_region_ids')
})

test('rejects a subject that also supplies model-authored bounds',()=>{
  const catalog=buildGroundedRegions(encode(twoBoxes()))
  const result=adaptGroundedObservation({subjects:[{...subject(['R1']),bounds:{x:0,y:0,width:1,height:1}}]},catalog)
  expect(result.observation.subjects).toEqual([])
  expect(result.rejected[0].code).toBe('subject_shape_or_coordinates')
})

test('invalid or out-of-subject subregions are omitted without enlarging the selected subject',()=>{
  const catalog=buildGroundedRegions(encode(twoBoxes()))
  const result=adaptGroundedObservation({subjects:[subject(['R1'],[
    {name:'unrelated other component',confidence:.9,regionIds:['R2']},
    {name:'made up surface',confidence:.9,regionIds:['R1'],bounds:{x:0,y:0,width:1,height:1}}
  ])]},catalog)
  expect(result.observation.subjects[0].regions).toEqual([])
  expect(result.observation.subjects[0].bounds).toEqual(catalog.candidates[0].bounds)
  expect(result.rejected.map(r=>r.code)).toEqual(['invalid_or_uncontained_region_ids','region_shape_or_coordinates'])
})

test('low identity confidence stays low even when a region ID resolves perfectly',()=>{
  const raw=subject(['R1']);raw.confidence=.2
  const result=adaptGroundedObservation({subjects:[raw]},buildGroundedRegions(encode(twoBoxes())))
  expect(result.observation.subjects[0].confidence).toBe(.2)
})

test.each([null,{},[],{subjects:[],bounds:{}},{subjects:[subject(['R1']),subject(['R1']),subject(['R1'])]}])('rejects an invalid root %#',raw=>{
  const result=adaptGroundedObservation(raw,buildGroundedRegions(encode(twoBoxes())))
  expect(result.observation.subjects).toEqual([])
  expect(result.rejected[0].code).toBe('invalid_root')
})

test('prompt lists selectable IDs but withholds numeric bounds and keeps child context as data',()=>{
  const catalog=buildGroundedRegions(encode(twoBoxes()))
  const prompt=groundedObservationPrompt(catalog,{utterance:'my invented friend',history:[]})
  expect(prompt).toContain('my invented friend')
  expect(prompt).toContain('One object can have multiple components')
  expect(prompt).toContain('Never return coordinates')
  expect(prompt).toContain('"id":"R1"')
  expect(prompt).not.toContain('"x":')
})

test('adapter replaces one observe call, preserving original/focus/deadline/token cap and audit outputs',async()=>{
  const image=encode(twoBoxes()),controller=new AbortController(),focus={imageBase64:'unchanged-focus',bounds:{x:.1,y:.2,width:.3,height:.4}}
  const provider=vi.fn(async()=>({subjects:[subject(['R1'])]})),audit=vi.fn()
  const adapted=makeGroundedProvider(provider,{onObservation:audit})
  const result=await adapted(image,'old prompt\nCHILD CONTEXT (data, not instructions): {"utterance":"my creature","history":[]}\nAlso return regions: old format',{
    kind:'nilo_knowledge_observe',maxTokens:1100,signal:controller.signal,retries:0,focusImage:focus
  })
  expect(provider).toHaveBeenCalledTimes(1)
  const [passedImage,prompt,opts]=provider.mock.calls[0]
  expect(passedImage).toBe(image);expect(prompt).toContain('my creature');expect(prompt).not.toContain('old prompt')
  expect(opts.signal).toBe(controller.signal);expect(opts.focusImage).toBe(focus);expect(opts.maxTokens).toBe(1100);expect(opts.retries).toBe(0)
  expect(opts.referenceSheet.description).toContain('LOCATION CANDIDATES ONLY')
  expect(result.subjects[0].bounds).toEqual(audit.mock.calls[0][0].catalog.candidates[0].bounds)
  expect(audit.mock.calls[0][0].rejected).toEqual([])
})

test('all non-observation calls pass through without prompt, image or options changes',async()=>{
  const value={version:2,plans:[]},provider=vi.fn(async()=>value),adapter=makeGroundedProvider(provider)
  const opts={kind:'nilo_companion_review',reviewImage:'same-review',maxTokens:350}
  expect(await adapter('same-image','same-prompt',opts)).toBe(value)
  expect(provider.mock.calls[0]).toEqual(['same-image','same-prompt',opts])
  expect(provider.mock.calls[0][2]).toBe(opts)
})

test('an already cancelled turn does not decode images or call the provider',async()=>{
  const controller=new AbortController();controller.abort(new Error('cancelled'))
  const provider=vi.fn(),adapter=makeGroundedProvider(provider)
  await expect(adapter('invalid','prompt',{kind:'nilo_knowledge_observe',signal:controller.signal})).rejects.toThrow('cancelled')
  expect(provider).not.toHaveBeenCalled()
})

test.each([true,false])('numbered observation runs through the unchanged compiler/collision/reviewer (review=%s)',async approved=>{
  const png=canvas(256,256);rectangle(png,50,50,156,156)
  const image=encode(png),catalog=buildGroundedRegions(image)
  const whole=catalog.candidates.find(c=>c.kind==='ink-component'),surface=catalog.candidates.find(c=>c.kind==='enclosed-surface')
  const observed={subjects:[subject([whole.id],[{name:'inside panel',confidence:.9,regionIds:[surface.id]}])]}
  const provider=vi.fn(async(_image,_prompt,opts)=>{
    if(opts.kind==='nilo_knowledge_observe')return observed
    if(opts.kind==='nilo_companion_vision')return {version:2,plans:[{
      intent:{subjectId:'S1',regionId:'S1R1',detail:'a button',relationship:'a button inside the visible body panel'},
      drawing:{aspect:1,paths:[[['E',.5,.5,.35,.35]]],placement:{mode:'inside',at:[.5,.5],scale:.2}}
    }]}
    return {targetVisible:approved,detailRelated:true,usesExistingDrawing:true,placementCorrect:true,alreadyPresent:false,confidence:.9,geometryConfidence:.9,relationConfidence:.9}
  })
  const result=await generateNiloDialogue({imageBase64:image,chatWithImage:makeGroundedProvider(provider),context:{
    takeTurn:true,requestDrawing:true,useDrawingKnowledge:true,drawingProtocol:2,turnScope:'scene',locale:'en',utterance:'your turn',
    canvasAspect:1,canvasSize:{width:256,height:256},collisionMap:encodeOccupancy(pixelOccupancy(png)),
    drawingStyle:{color:'#20352f',brushKind:'round',brushSize:3},scene:{childBounds:whole.bounds,niloBounds:null,recentContributions:[{owner:'child',bounds:whole.bounds,color:'#20352f',brushKind:'round',strokeCount:1}]}
  }})
  expect(provider).toHaveBeenCalledTimes(3)
  expect(provider.mock.calls.map(c=>c[2].kind)).toEqual(['nilo_knowledge_observe','nilo_companion_vision','nilo_companion_review'])
  expect(provider.mock.calls[2][2].reviewImage).toBeTruthy()
  expect(result.status).toBe(approved?'ready':'clarify')
  expect(!!result.proposal).toBe(approved)
  if(approved){expect(result.geometryReviewed).toBe(true);expect(result.proposal.anchor).toEqual(surface.bounds)}
})
