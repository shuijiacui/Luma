import {beforeEach,expect,test,vi} from 'vitest'
import {startVoiceVad} from '@/features/child/hooks/voiceVad'
const mocks=vi.hoisted(()=>({create:vi.fn(),start:vi.fn(),destroy:vi.fn()}))
vi.mock('@ricky0123/vad-web',()=>({MicVAD:{new:mocks.create}}))
beforeEach(()=>{
 vi.resetAllMocks()
 mocks.start.mockResolvedValue(undefined);mocks.destroy.mockResolvedValue(undefined)
 mocks.create.mockResolvedValue({start:mocks.start,destroy:mocks.destroy})
})
test('VAD reuses the owned microphone and suppresses callbacks after cancellation',async()=>{
 const controller=new AbortController(),stream={} as MediaStream,end=vi.fn(),speech=vi.fn()
 const close=await startVoiceVad(stream,controller.signal,end,speech)
 const options=mocks.create.mock.calls[0][0]
 expect(await options.getStream()).toBe(stream)
 expect(options).toMatchObject({model:'v5',startOnLoad:false,redemptionMs:2200,baseAssetPath:'/voice-vad/'})
 options.onSpeechRealStart();options.onSpeechEnd()
 expect(end).toHaveBeenCalledOnce();expect(speech).toHaveBeenCalledOnce()
 controller.abort();close();options.onSpeechEnd()
 expect(mocks.destroy).toHaveBeenCalledOnce();expect(end).toHaveBeenCalledOnce()
})
test('late model loading after cancel destroys resources without starting',async()=>{
 let resolve!:(value:unknown)=>void
 mocks.create.mockImplementation(()=>new Promise(r=>{resolve=r}))
 const controller=new AbortController()
 const promise=startVoiceVad({} as MediaStream,controller.signal,vi.fn(),vi.fn())
 await vi.waitFor(()=>expect(mocks.create).toHaveBeenCalledOnce())
 controller.abort();resolve({start:mocks.start,destroy:mocks.destroy})
 await expect(promise).rejects.toMatchObject({name:'AbortError'})
 expect(mocks.start).not.toHaveBeenCalled();expect(mocks.destroy).toHaveBeenCalledOnce()
})
