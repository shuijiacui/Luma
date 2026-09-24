import { SPEECH_PAUSE_MS } from './voiceRecognition'

export async function startVoiceVad(stream:MediaStream,signal:AbortSignal,onEnd:()=>void,onSpeech:()=>void){
  const {MicVAD}=await import('@ricky0123/vad-web')
  signal.throwIfAborted()
  const base=`${import.meta.env.BASE_URL}voice-vad/`
  const vad=await MicVAD.new({model:'v5',startOnLoad:false,baseAssetPath:base,onnxWASMBasePath:base,
    ortConfig:ort=>{ort.env.wasm.numThreads=1},
    getStream:async()=>{signal.throwIfAborted();return stream},
    pauseStream:async()=>{},resumeStream:async()=>stream,
    redemptionMs:SPEECH_PAUSE_MS,preSpeechPadMs:500,minSpeechMs:160,
    submitUserSpeechOnPause:false,
    onSpeechRealStart:()=>{if(!signal.aborted)onSpeech()},
    onSpeechEnd:()=>{if(!signal.aborted)onEnd()},
  })
  let closed=false
  const close=()=>{if(closed)return;closed=true;signal.removeEventListener('abort',close);void vad.destroy().catch(()=>{})}
  if(signal.aborted){close();signal.throwIfAborted()}
  signal.addEventListener('abort',close,{once:true})
  try{await vad.start();signal.throwIfAborted();if(vad.errored)throw new Error('vad_start_failed')}
  catch(error){close();throw error}
  return close
}
