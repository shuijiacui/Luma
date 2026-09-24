import express from 'express'
import request from 'supertest'
import {expect,test,vi} from 'vitest'
import {interpretVoiceEdit,sanitizeVoiceEditInput} from '../src/services/niloVoiceIntent.js'
import {validateVoiceActions,validateVoicePlan} from '../../shared/niloVoiceActions.mjs'
import {createNiloRouter} from '../src/routes/nilo.js'

const input={utterance:'不要红色，改蓝色再小一点，往左挪',selectedTargetId:'bird',objects:[{id:'bird',name:'小鸟',subjects:['bird'],bounds:{x:.3,y:.3,width:.2,height:.2}}]}
test('compound instructions retain the whole utterance and use bounded private text inference',async()=>{
 const plan={status:'edit',targetId:'bird',actions:[{type:'color',value:'#459FD1'},{type:'scale',factor:.85},{type:'move',dx:-.035,dy:0}]}
 const chatText=vi.fn(async()=>plan)
 expect(await interpretVoiceEdit(input,{chatText})).toEqual({...plan,actions:[{type:'color',value:'#459fd1'},...plan.actions.slice(1)]})
 expect(chatText).toHaveBeenCalledOnce()
 expect(chatText.mock.calls[0][0]).toContain(input.utterance)
 expect(chatText.mock.calls[0][1]).toMatchObject({privateContent:true,retries:0,maxTokens:700,kind:'nilo_voice_intent'})
})
test.each([
 {status:'edit',targetId:'child-strokes',actions:[{type:'delete'}]},
 {status:'edit',targetId:'bird',actions:[{type:'color',value:'#ffffff'},{type:'execute',code:'oops'}]},
 {status:'edit',targetId:'bird',actions:[{type:'move',dx:Infinity,dy:0}]},
 {status:'edit',targetId:'bird',actions:[{type:'delete'},{type:'scale',factor:.5}]},
 {status:'edit',targetId:'bird',actions:[{type:'color',value:'#ffffff',confirm:true}]},
])('rejects invalid model plans atomically: %j',async plan=>{
 expect(await interpretVoiceEdit(input,{chatText:async()=>plan})).toEqual({status:'unavailable',reason:'invalid_response'})
})
test('target clarification exposes only known IDs; prohibited edits can be noops',()=>{
 expect(validateVoicePlan({status:'clarify',reason:'target',candidateIds:['child','bird','bird']},['bird'])).toEqual({status:'clarify',reason:'target',candidateIds:['bird']})
 expect(validateVoicePlan({status:'noop'},['bird'])).toEqual({status:'noop'})
 expect(validateVoiceActions(Array(7).fill({type:'variant'}))).toBeNull()
})
test('bad input is rejected before a model call',async()=>{
 for(const body of [{...input,utterance:''},{...input,objects:[...input.objects,...input.objects]},{...input,objects:[{...input.objects[0],bounds:{x:.9,y:.1,width:.2,height:.2}}]}]){
  const chatText=vi.fn()
  await expect(interpretVoiceEdit(body,{chatText})).rejects.toMatchObject({status:400})
  expect(chatText).not.toHaveBeenCalled()
 }
 expect(sanitizeVoiceEditInput({...input,selectedTargetId:'foreign'}).selectedTargetId).toBeNull()
})
test('timeout and cancellation release requests even if the model ignores abort',async()=>{
 const hanging=vi.fn(()=>new Promise(()=>{}))
 expect(await interpretVoiceEdit(input,{chatText:hanging,timeoutMs:5})).toEqual({status:'unavailable',reason:'timeout'})
 const controller=new AbortController(),pending=interpretVoiceEdit(input,{chatText:hanging,signal:controller.signal})
 controller.abort()
 expect(await pending).toEqual({status:'unavailable',reason:'timeout'})
})
test('route enforces child access, input checks and drawing cost limits',async()=>{
 const chatText=vi.fn(async()=>({status:'noop'}))
 const app=(role,max=10)=>express().use(express.json()).use((req,_res,next)=>{req.auth={role};next()}).use('/nilo',createNiloRouter({chatText,limits:{nilo:{windowMs:60000,max}}})).use((e,_req,res,_next)=>res.status(e.status??500).json({error:e.message}))
 expect((await request(app('parent')).post('/nilo/voice/interpret').send(input)).status).toBe(403)
 expect(chatText).not.toHaveBeenCalled()
 expect((await request(app('child')).post('/nilo/voice/interpret').send({})).status).toBe(400)
 const limited=app('child',1)
 expect((await request(limited).post('/nilo/voice/interpret').send(input)).body).toEqual({status:'noop'})
 expect((await request(limited).post('/nilo/voice/interpret').send(input)).status).toBe(429)
})


test('ASR candidates are bounded, whole-sentence context and never rewrite the primary utterance',async()=>{
 const voice={...input,utterance:'把蔡阳放到左上角，不要缩小',asrAlternatives:['把太阳放到左上角，不要缩小','a'.repeat(500),{},'ignored']}
 const chatText=vi.fn(async()=>({status:'clarify',reason:'target',candidateIds:[]}))
 await interpretVoiceEdit(voice,{chatText})
 const prompt=chatText.mock.calls[0][0]
 expect(prompt).toContain(voice.utterance)
 expect(prompt).toContain('把太阳放到左上角，不要缩小')
 expect(prompt).toContain('这个人叫蔡阳')
 expect(sanitizeVoiceEditInput(voice).asrAlternatives).toHaveLength(2)
 expect(sanitizeVoiceEditInput(voice).asrAlternatives[1]).toHaveLength(400)
 expect(chatText).toHaveBeenCalledOnce()
})
