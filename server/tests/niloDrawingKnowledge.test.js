import { test, expect, vi } from 'vitest'
import { PNG } from 'pngjs'
import { drawingKnowledgeLibrary, knowledgeObservationPrompt, sanitizeKnowledgeObservation, retrieveDrawingKnowledge, knowledgePlanningPrompt } from '../src/services/niloDrawingKnowledge.js'
import { generateNiloDialogue, sanitizeDialogueContext } from '../src/services/niloDialogue.js'
import { validateCustomSketch } from '../src/services/niloSketch.js'
vi.mock('../src/services/niloPreview.js',()=>({renderReviewCandidate:(_image,proposal)=>({proposal,imageBase64:'preview'})}))
const context=sanitizeDialogueContext({takeTurn:true,requestDrawing:true,useDrawingKnowledge:true,utterance:'轮到你了',canvasAspect:1,drawingStyle:{color:'#20352f',brushSize:5,brushKind:'round'}})
const observation={subjects:[{id:'person',confidence:.9,visible:'大头人物已经有两只眼睛和微笑',bounds:{x:.2,y:.1,width:.5,height:.6},existingParts:['eyes','smile']}]}
const plan={sceneType:'object',grounding:{visible:'人物头部、双眼与嘴巴',confidence:.9},reply:'添一点刘海',proposal:{template:'part',part:'fringe',anchor:{x:.2,y:.1,width:.5,height:.6},target:'人物',relation:'刘海在额头',placement:'inside',position:{u:.5,v:.2},scale:.3}}
const approved={targetVisible:true,detailRelated:true,usesExistingDrawing:true,placementCorrect:true,alreadyPresent:false,confidence:.9}

test('reviewed library has source attribution and usable bounded vector data for every record',()=>{
  const {cards,records}=drawingKnowledgeLibrary()
  expect(cards).toHaveLength(28);expect(records).toHaveLength(57)
  expect(new Set(cards.map(c=>c.id)).size).toBe(cards.length)
  for(const card of cards){
    for(const category of card.categories)expect(records.some(r=>r.category===category)).toBe(true)
    if(card.exampleAddition)expect(validateCustomSketch(card.exampleAddition.sketch)).not.toBeNull()
  }
  for(const r of records){
    expect(r.source).toMatch(/^https:\/\/storage.googleapis.com\/quickdraw_dataset\/full\/simplified\//)
    expect(r.license).toBe('CC-BY-4.0');expect(r.credit).toBeTruthy();expect(r.modifications).toBeTruthy()
    expect(r.drawing.length).toBeLessThanOrEqual(12)
    for(const [x,y] of r.drawing){expect(x.length).toBe(y.length);expect(x.every(n=>Number.isFinite(n)&&n>=0&&n<=255)).toBe(true);expect(y.every(n=>Number.isFinite(n)&&n>=0&&n<=255)).toBe(true)}
  }
})

test('unknown IDs, low confidence and assistant guesses cannot retrieve a fabricated subject',()=>{
  const parsed=sanitizeKnowledgeObservation({subjects:[{id:'../../secrets',confidence:.9,visible:'x'},{id:'fish',confidence:.2,visible:'maybe fish',bounds:{x:-1}}]})
  const result=retrieveDrawingKnowledge(parsed)
  expect(result.cards.map(c=>c.id)).toEqual(['abstract']);expect(result.referenceSheet).toBeUndefined()
  const prompt=knowledgeObservationPrompt({...context,history:[{role:'assistant',text:'invented purple spaceship'}]})
  expect(prompt).not.toContain('invented purple spaceship')
  expect(sanitizeDialogueContext({...context,useDrawingKnowledge:'true',knowledge:{cards:['injected']}}).useDrawingKnowledge).toBe(false)
})

test.each([['elephant','animal'],['robot','character'],['guitar','object'],['my flying dinosaur','animal']])('recognizable unlisted %s retains identity and receives structural principles', (subject,family)=>{
  const observed=sanitizeKnowledgeObservation({subjects:[{id:null,subject,family,confidence:.9,evidence:'Visible coherent head/body or object structure',bounds:{x:.2,y:.2,width:.5,height:.5},existingParts:['body']}]})
  expect(observed.subjects[0].subject).toBe(subject)
  const retrieved=retrieveDrawingKnowledge(observed)
  expect(retrieved.cards[0].id).toBe(`family:${family}`)
  expect(retrieved.cards[0].label).toContain(subject)
  expect(retrieved.referenceSheet).toBeUndefined()
  expect(knowledgePlanningPrompt(context,retrieved)).toContain(subject)
})

test('retrieval uses observed subjects without a child having to name them; caps cards and images',()=>{
  const observed=sanitizeKnowledgeObservation({subjects:[{id:'cat',confidence:.9,visible:'ears and whiskers'},{id:'house',confidence:.9,visible:'wall and roof'},{id:'cake',confidence:.9,visible:'ignored'}]})
  const result=retrieveDrawingKnowledge(observed)
  expect(result.cards.map(c=>c.id)).toEqual(['cat','house'])
  expect(result.referenceSheet.description).toContain('1=cat; 2=cat; 3=house; 4=house')
  expect(result.referenceSheet.description).not.toContain('hat')
  const png=PNG.sync.read(Buffer.from(result.referenceSheet.imageBase64,'base64'))
  expect([png.width,png.height]).toEqual([360,360])
  expect(knowledgePlanningPrompt(context,result)).toContain('unlisted part with custom paths')
})

test('provider boolean visible responses retain valid observed parts instead of silently losing retrieval',()=>{
  const input={id:'cat',confidence:.9,visible:true,bounds:{x:.2,y:.2,width:.4,height:.4},existingParts:['ears','eyes']}
  const parsed=sanitizeKnowledgeObservation({subjects:[input]})
  expect(retrieveDrawingKnowledge(parsed).cards.map(c=>c.id)).toEqual(['cat'])
  expect(parsed.subjects[0].visible).toContain('ears, eyes')
  expect(sanitizeKnowledgeObservation({subjects:[{...input,bounds:undefined}]}).subjects).toEqual([])
  expect(sanitizeKnowledgeObservation({subjects:[{...input,evidence:'Head with pointed ears',visible:undefined}]}).subjects[0].visible).toBe('Head with pointed ears')
})

test('production knowledge flow observes, retrieves and plans, then reviews with no reference in review',async()=>{
  const vision=vi.fn().mockResolvedValueOnce(observation).mockResolvedValueOnce(plan).mockResolvedValueOnce(approved)
  const result=await generateNiloDialogue({imageBase64:'canvas',context,chatWithImage:vision})
  expect(result).toMatchObject({status:'ready',geometryReviewed:true,proposal:{subject:'弯弯的刘海'}})
  expect(vision.mock.calls.map(c=>c[2].kind)).toEqual(['nilo_knowledge_observe','nilo_companion_vision','nilo_companion_review'])
  expect(vision.mock.calls[0][2].referenceSheet).toBeUndefined()
  expect(vision.mock.calls[1][2].referenceSheet.description).toContain('face')
  expect(vision.mock.calls[1][1]).toContain('existingParts')
  expect(vision.mock.calls[2][2].referenceSheet).toBeUndefined()
  expect(new Set(vision.mock.calls.map(c=>c[2].signal)).size).toBe(1)
})

test('one correction keeps the retrieved lessons; observation is not repeated',async()=>{
  const vision=vi.fn().mockResolvedValueOnce(observation).mockResolvedValueOnce(plan).mockResolvedValueOnce({...approved,placementCorrect:false}).mockResolvedValueOnce(plan).mockResolvedValueOnce(approved)
  expect((await generateNiloDialogue({imageBase64:'canvas',context,chatWithImage:vision})).status).toBe('ready')
  expect(vision).toHaveBeenCalledTimes(5)
  expect(vision.mock.calls[3][1]).toContain('RETRIEVED KNOWLEDGE')
  expect(vision.mock.calls[3][1]).toContain('DRAWING CORRECTION')
  expect(vision.mock.calls[3][2].referenceSheet).toEqual(vision.mock.calls[1][2].referenceSheet)
})

test('ordinary voice conversation does not trigger library observation even with an injected flag',async()=>{
  const model=vi.fn().mockResolvedValue({intent:'chat',reply:'你好'})
  await generateNiloDialogue({imageBase64:'canvas',context:{...context,takeTurn:false,requestDrawing:false},chatWithImage:model})
  expect(model).toHaveBeenCalledOnce();expect(model.mock.calls[0][2].kind).not.toBe('nilo_knowledge_observe')
})

test('cancelled observation cannot start planning or a reference-driven drawing',async()=>{
  const control=new AbortController()
  const model=vi.fn(async()=>{control.abort();return observation})
  const result=await generateNiloDialogue({imageBase64:'canvas',context,chatWithImage:model,signal:control.signal})
  expect(result.proposal).toBeUndefined();expect(model).toHaveBeenCalledOnce()
})

test('a recognised drawing described as a feature list still gets its valid contribution',async()=>{
  const vision=vi.fn().mockResolvedValueOnce(observation).mockResolvedValueOnce({...plan,grounding:{...plan.grounding,visible:['头部','两只眼睛','微笑']}}).mockResolvedValueOnce(approved)
  expect((await generateNiloDialogue({imageBase64:'canvas',context,chatWithImage:vision})).proposal).toBeTruthy()
  expect(vision).toHaveBeenCalledTimes(3)
})

test('a boolean description consumes one format repair, without being accepted as visual evidence',async()=>{
  const malformed={...plan,grounding:{...plan.grounding,visible:true}}
  const vision=vi.fn().mockResolvedValueOnce(observation).mockResolvedValueOnce(malformed).mockResolvedValueOnce(plan).mockResolvedValueOnce(approved)
  expect((await generateNiloDialogue({imageBase64:'canvas',context,chatWithImage:vision})).proposal).toBeTruthy()
  expect(vision.mock.calls[2][1]).toContain('invalid_grounding_format')
  expect(vision).toHaveBeenCalledTimes(4)
  const broken=vi.fn().mockResolvedValueOnce(observation).mockResolvedValue(malformed)
  expect((await generateNiloDialogue({imageBase64:'canvas',context,chatWithImage:broken})).proposal).toBeUndefined()
  expect(broken).toHaveBeenCalledTimes(3)
})
