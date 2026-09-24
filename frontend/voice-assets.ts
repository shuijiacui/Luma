import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'

// Ship pinned model/runtime assets from our own origin, including their notices.
// No runtime CDN requests or child audio sent to third-party asset hosts.
export function voiceAssets():Plugin {
  const files=new Map([
    ['silero_vad_v5.onnx','@ricky0123/vad-web/dist/silero_vad_v5.onnx'],
    ['vad.worklet.bundle.min.js','@ricky0123/vad-web/dist/vad.worklet.bundle.min.js'],
    ['ort-wasm-simd-threaded.mjs','onnxruntime-web/dist/ort-wasm-simd-threaded.mjs'],
    ['ort-wasm-simd-threaded.wasm','onnxruntime-web/dist/ort-wasm-simd-threaded.wasm'],
    ['VAD-LICENSE.txt','../licenses/vad.txt'],
    ['ORT-LICENSE.txt','../licenses/onnxruntime.txt'],
  ])
  const read=(path:string)=>readFileSync(fileURLToPath(new URL(`./node_modules/${path}`,import.meta.url)))
  return {name:'local-voice-assets',
    configureServer(server){server.middlewares.use((req,res,next)=>{
      const name=req.url?.split('?')[0].replace(/^\/voice-vad\//,'')??''
      const source=req.url?.startsWith('/voice-vad/')?files.get(name):undefined
      if(!source){next();return}
      res.setHeader('Content-Type',name.endsWith('.wasm')?'application/wasm':/\.(mjs|js)$/.test(name)?'text/javascript':'application/octet-stream')
      res.end(read(source))
    })},
    generateBundle(){for(const [name,path] of files)this.emitFile({type:'asset',fileName:`voice-vad/${name}`,source:read(path)})},
  }
}
