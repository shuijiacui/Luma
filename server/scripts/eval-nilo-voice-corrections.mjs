// Synthetic text only; uses the configured text model, never microphone data.
import {mkdir, writeFile} from 'node:fs/promises'
try { process.loadEnvFile(new URL('../.env', import.meta.url)) } catch { /* env is optional */ }
const {interpretVoiceEdit} = await import('../src/services/niloVoiceIntent.js')
const {llmConfig} = await import('../src/services/llmClient.js')
if (!llmConfig().apiKey) { console.log('SKIP: no configured text-model credential'); process.exit(0) }
const objects = [{id:'fox', name:'红狐狸', subjects:['fox'], bounds:{x:.3,y:.3,width:.2,height:.2}}]
const cases = [
 ['我想把这个换成红色，哦，不，换成蓝色', 'blue'],
 ['先把这个换成红色哦哦哦哦，不换成蓝色。', 'clarify'],
 ['我想把这个换成红色哦哦哦不换成蓝色', 'clarify'],
 ['换成红色，不要换成蓝色', 'red'],
 ['不是蓝色，换成红色', 'red'],
 ['不要换成蓝色', 'noop'],
 ['换成蓝色，不，还是保持原样', 'noop'],
 ['换成红色，哦不，换成蓝色，再小一点', 'blue-small'],
 ['Make it red. Oh no, make it blue.', 'blue'],
 ['把红狐狸换成蓝色', 'blue'],
]
const results=[]
for (const [utterance,expected] of cases) {
 const start=Date.now()
 const plan=await interpretVoiceEdit({utterance,objects,selectedTargetId:'fox'})
 const color=plan.actions?.find(a=>a.type==='color')?.value
 const rgb=color ? [1,3,5].map(i=>parseInt(color.slice(i,i+2),16)) : null
 const blue=rgb && rgb[2]>rgb[0] && rgb[2]>=rgb[1]
 const red=rgb && rgb[0]>rgb[1] && rgb[0]>rgb[2]
 const allowed=expected==='blue-small'?['color','scale']:['color']
 const passed=expected==='noop'?plan.status==='noop':expected==='clarify'?plan.status==='clarify'&&plan.reason==='instruction':
   plan.status==='edit'&&plan.targetId==='fox'&&plan.actions.every(a=>allowed.includes(a.type))&&
   (expected==='red'?red:blue)&&(expected!=='blue-small'||plan.actions.some(a=>a.type==='scale'&&a.factor<1))
 const row={utterance,expected,plan,passed:!!passed,latencyMs:Date.now()-start}
 results.push(row); console.log(JSON.stringify(row))
}
const label=process.argv.includes('--baseline')?'baseline':'updated'
const report={date:new Date().toISOString(),scope:'Synthetic text intent only; does not test ASR or drawing edits.',passed:results.filter(r=>r.passed).length,total:results.length,results}
const destination=new URL(`../evals/nilo/2026-09-25-voice-corrections-${label}.json`,import.meta.url)
await mkdir(new URL('.',destination),{recursive:true})
await writeFile(destination,JSON.stringify(report,null,2)+'\n')
console.log(`${label}: ${report.passed}/${report.total}`)
if(report.passed!==report.total)process.exitCode=1
