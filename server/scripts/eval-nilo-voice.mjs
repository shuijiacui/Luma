// Opt-in smoke check against the already configured text model. Synthetic text
// and object boxes only; no recordings or children's drawings are submitted.
import {writeFile,mkdir} from 'node:fs/promises'
try {process.loadEnvFile(new URL('../.env',import.meta.url))} catch { /* Environment also supported. */ }
const {interpretVoiceEdit}=await import('../src/services/niloVoiceIntent.js')
const {llmConfig}=await import('../src/services/llmClient.js')
if(!llmConfig().apiKey){console.log('SKIP: no configured text-model credential');process.exit(0)}
const objects=[
 {id:'bird-left',name:'小鸟',subjects:['bird'],bounds:{x:.15,y:.3,width:.2,height:.2}},
 {id:'bird-right',name:'小鸟',subjects:['bird'],bounds:{x:.65,y:.3,width:.2,height:.2}},
]
const cases=[
 {utterance:'把它改成蓝色，再小一点，往左挪一点',selectedTargetId:'bird-right',check:p=>p.status==='edit'&&p.targetId==='bird-right'&&p.actions.some(a=>a.type==='color')&&p.actions.some(a=>a.type==='scale'&&a.factor<1)&&p.actions.some(a=>a.type==='move'&&a.dx<0)},
 {utterance:'不要红色，要蓝色，其他都别动',selectedTargetId:'bird-right',check:p=>p.status==='edit'&&p.actions.length===1&&p.actions[0].type==='color'&&parseInt(p.actions[0].value.slice(5,7),16)>parseInt(p.actions[0].value.slice(1,3),16)},
 {utterance:'不要删掉它',selectedTargetId:'bird-right',check:p=>p.status==='noop'},
 {utterance:'不是这只，是左边那只，把它缩小一点',selectedTargetId:'bird-right',check:p=>p.status==='edit'&&p.targetId==='bird-left'&&p.actions.some(a=>a.type==='scale'&&a.factor<1)},
 {utterance:'把小鸟换成紫色',check:p=>p.status==='clarify'&&p.reason==='target'},
 {utterance:'Make it green and a little smaller, but do not move it.',selectedTargetId:'bird-left',check:p=>p.status==='edit'&&p.targetId==='bird-left'&&p.actions.some(a=>a.type==='color')&&p.actions.some(a=>a.type==='scale'&&a.factor<1)&&!p.actions.some(a=>['move','place'].includes(a.type))},
]
const results=[]
for(const {check,...input} of cases){
 const start=Date.now(),plan=await interpretVoiceEdit({...input,objects})
 const row={...input,plan,passed:check(plan),latencyMs:Date.now()-start}
 results.push(row);console.log(JSON.stringify(row))
}
const report={date:new Date().toISOString(),scope:'Synthetic text interpretation only; not ASR, drawing quality or child usability.',passed:results.filter(r=>r.passed).length,total:results.length,results}
const destination=new URL('../evals/nilo/2026-09-24-voice-intent.json',import.meta.url)
await mkdir(new URL('.',destination),{recursive:true});await writeFile(destination,JSON.stringify(report,null,2)+'\n')
console.log(`Voice intent smoke check: ${report.passed}/${report.total}`)
if(report.passed!==report.total)process.exitCode=1
