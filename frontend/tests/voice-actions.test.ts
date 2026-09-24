import {expect,test,afterEach} from 'vitest'
import {applyVoiceActions,simpleVoiceActions} from '@/features/child/companion/voiceActions'
import {readVoiceDiagnostics,recordVoiceEvent,setVoiceDebugContent} from '@/features/child/companion/voiceDiagnostics'
import {voiceTranscriptionError} from '@/features/child/hooks/voiceErrors'
import {ApiError} from '@/lib/api/client'
import type {DrawingProposal} from '@/features/child/companion/proposals'
const p:DrawingProposal={template:'cloud',x:.2,y:.2,width:.2,height:.1,rotation:0,color:'#123456',strokeWidth:4,target:'canvas',relation:'cloud near tree'}
afterEach(()=>setVoiceDebugContent(false))
test.each(['不要红色，要蓝色','改蓝色再小一点','不要删掉那只鸟','往树的右边挪','不是这只，是左边那只','make it blue and smaller','改成蓝色，但是不要移动','红色不是蓝色','把小鸟和小猫改成蓝色','删掉小鸟或者小猫'])('complex speech cannot execute a partial regex match: %s',text=>expect(simpleVoiceActions(text)).toBeNull())
test('unambiguous whole commands keep the local fast path',()=>{
 expect(simpleVoiceActions('把松鼠改成蓝色')).toEqual([{type:'color',value:'#459fd1'}])
 expect(simpleVoiceActions('不要那只鸟了')).toEqual([{type:'delete'}])
 expect(simpleVoiceActions('小一点')).toEqual([{type:'scale',factor:.85}])
 expect(simpleVoiceActions('刚才那个小一点')).toEqual([{type:'scale',factor:.85}])
 expect(simpleVoiceActions('把红狐狸改成蓝色')).toEqual([{type:'color',value:'#459fd1'}])
})
test('a multi-part drawing receives all actions with uniform scale and unchanged source',()=>{
 const source=[p,{...p,x:.5}],snapshot=structuredClone(source)
 const result=applyVoiceActions(source,[{type:'color',value:'#459fd1'},{type:'scale',factor:.5},{type:'move',dx:.1,dy:.1}])
 expect(result.ok).toBe(true)
 if(!result.ok)return
 expect(result.items.every(i=>i.color==='#459fd1')).toBe(true)
 expect(result.items[0].width/result.items[0].height).toBe(2)
 expect(result.items[1].x-result.items[0].x).toBeCloseTo(.15)
 expect(source).toEqual(snapshot)
})
test('unsupported and out-of-bounds actions do not publish earlier colour changes',()=>{
 expect(applyVoiceActions([p],[{type:'color',value:'#abcdef'},{type:'part',part:'tail',factor:1.2}])).toEqual({ok:false,reason:'unsupported'})
 expect(applyVoiceActions([p],[{type:'color',value:'#abcdef'},{type:'place',x:0,y:0}])).toEqual({ok:false,reason:'geometry'})
 expect(p.color).toBe('#123456')
})
test('diagnostics omit speech and plans by default and debug content is bounded and cleared',()=>{
 recordVoiceEvent({turn:'a',stage:'asr',outcome:'ok',text:'private child speech',plan:{targetId:'secret'}})
 expect(JSON.stringify(readVoiceDiagnostics())).not.toMatch(/private|secret/)
 setVoiceDebugContent(true)
 for(let i=0;i<125;i++)recordVoiceEvent({turn:String(i),stage:'understand',outcome:'ok',text:'debug'})
 expect(readVoiceDiagnostics()).toHaveLength(120)
 expect(readVoiceDiagnostics()[0].text).toBe('debug')
 setVoiceDebugContent(false)
 expect(readVoiceDiagnostics()).toEqual([])
})
test('ASR outage, decoding failure and actual no-speech have distinct explanations',()=>{
 expect(voiceTranscriptionError(new ApiError(503,'voice_provider_unavailable'),'asr')).toContain('服务暂时没连上')
 expect(voiceTranscriptionError(new ApiError(422,'voice_no_speech'),'asr')).toContain('没有听到')
 expect(voiceTranscriptionError(new Error(),'audio')).toContain('录音没能读取')
 expect(voiceTranscriptionError(new ApiError(504,'timeout'),'asr')).toContain('等得有点久')
})
