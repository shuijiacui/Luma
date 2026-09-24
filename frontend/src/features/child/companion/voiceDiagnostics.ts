// Memory only: no audio, images, account IDs, storage or telemetry uploads.
type Stage='listen'|'asr'|'understand'|'execute'|'speak'
interface Event {turn:string;stage:Stage;outcome:string;durationMs?:number;actions?:string[];text?:string;plan?:unknown}
let events:Event[]=[]
let captureContent=false
let serial=0
export function newVoiceTrace(){return `voice-${++serial}`}
export function recordVoiceEvent(event:Event){
  const {text,plan,...metadata}=event
  events.push({...metadata,...(captureContent?{text,plan}: {})})
  events=events.slice(-120)
}
export function readVoiceDiagnostics(){return structuredClone(events)}
export function setVoiceDebugContent(enabled:boolean){captureContent=enabled;events=[]}
export function clearVoiceDiagnostics(){events=[]}
if(import.meta.env.DEV)Object.assign(window,{niloVoiceDiagnostics:{read:readVoiceDiagnostics,captureContent:setVoiceDebugContent,clear:clearVoiceDiagnostics}})
