// Optional live-model check using synthetic text and bounding boxes only.
// No children's recordings, images or account data are submitted.
import {writeFile,mkdir} from 'node:fs/promises'
try{process.loadEnvFile(new URL('../.env',import.meta.url))}catch{/* Environment is also supported. */}
const {interpretVoiceEdit}=await import('../src/services/niloVoiceIntent.js')
const {llmConfig}=await import('../src/services/llmClient.js')
if(!llmConfig().apiKey){console.log('SKIP: no configured text-model credential');process.exit(0)}
const target={id:'child-sun',name:'太阳',source:'child',subjects:['sun'],bounds:{x:.3,y:.3,width:.24,height:.2}}
const blue=a=>a.type==='color'&&parseInt(a.value.slice(5,7),16)>parseInt(a.value.slice(1,3),16)
const cases=[
 {utterance:'把这个改成红色，哦，不，换成蓝色，再小一点',check:p=>p.status==='edit'&&p.actions.filter(a=>a.type==='color').length===1&&p.actions.some(blue)&&p.actions.some(a=>a.type==='scale'&&a.factor<1)},
 {utterance:'把它缩小一点，放到左上角',check:p=>{
   if(p.status!=='edit')return false
   let width=target.bounds.width,height=target.bounds.height,x=target.bounds.x+width/2,y=target.bounds.y+height/2,placed=false
   for(const a of p.actions){
    if(a.type==='scale'){width*=a.factor;height*=a.factor}
    if(a.type==='place'){placed=true;x=a.x;y=a.y}
    if(a.type==='move'){x+=a.dx;y+=a.dy}
   }
   return placed&&x>=width/2&&y>=height/2&&x+width/2<=1&&y+height/2<=1&&x<.3&&y<.3&&p.actions.some(a=>a.type==='scale'&&a.factor<1)
 }},
 {utterance:'蓝色会不会更好？',check:p=>p.status==='unhandled'||p.status==='noop'},
 {utterance:'把这个缩小一点',selectedTargetId:null,objects:[{...target,name:'选中的画',subjects:[]}],check:p=>p.status==='clarify'&&p.reason==='target'},
 {utterance:'给这个人加个帽子',objects:[{...target,name:'小人',subjects:['person']}],check:p=>p.status==='redraw'},
 {utterance:'把这个换成红色哦哦哦，不换成蓝色',check:p=>p.status==='clarify'&&p.reason==='instruction'},
]
const results=[]
for(const {check,...input}of cases){
 const started=Date.now(),plan=await interpretVoiceEdit({editingMode:'assisted',selectedTargetId:target.id,objects:[target],...input})
 const row={utterance:input.utterance,plan,passed:check(plan),latencyMs:Date.now()-started}
 results.push(row);console.log(JSON.stringify(row))
}
const report={date:new Date().toISOString(),scope:'Synthetic text intent only; not microphone recognition, drawing quality or child usability.',passed:results.filter(r=>r.passed).length,total:results.length,results}
const destination=new URL('../evals/nilo/2026-09-25-assisted-voice-intent.json',import.meta.url)
await mkdir(new URL('.',destination),{recursive:true});await writeFile(destination,JSON.stringify(report,null,2)+'\n')
console.log(`Assisted voice intent: ${report.passed}/${report.total}`)
if(report.passed!==report.total)process.exitCode=1
