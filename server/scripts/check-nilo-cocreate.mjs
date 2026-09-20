// Bounded live regression using synthetic heart/circle/star drawings only.
// No child images, prompts, credentials or conversation are read from storage.
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
process.env.NODE_ENV = 'test'
try { process.loadEnvFile(new URL('../.env', import.meta.url)) } catch { /* optional */ }
const { generateNiloDialogue } = await import('../src/services/niloDialogue.js')
const { chatWithImage, llmConfig } = await import('../src/services/llmClient.js')
const live = process.argv.includes('--live')
const local = process.argv.includes('--local')
const voice = process.argv.includes('--voice')
const output = new URL('../../frontend/.tmp/nilo-cocreate/', import.meta.url)
mkdirSync(output, { recursive: true })
let canvasTools
if (process.argv.includes('--check-canvas')) {
  // Exercise the exact production geometry checks, not an API-status proxy.
  const require = createRequire(new URL('../../frontend/package.json', import.meta.url))
  const bundle = new URL('canvas-check.mjs', output)
  await require('esbuild').build({ stdin: {
    contents: "export {validateProposal,prepareTurnProposal,drawingPlanFits,proposalStrokes} from './proposals'; export {refineAttachment} from './attachmentGrounding';",
    resolveDir: fileURLToPath(new URL('../../frontend/src/features/child/companion/', import.meta.url)), loader: 'ts',
  }, bundle: true, platform: 'node', format: 'esm', outfile: fileURLToPath(bundle) })
  canvasTools = await import(bundle.href)
}

function crc32(bytes) {
  let crc = 0xffffffff
  for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0) }
  return (crc ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const buffer = Buffer.alloc(data.length + 12), label = Buffer.from(type)
  buffer.writeUInt32BE(data.length); label.copy(buffer, 4); data.copy(buffer, 8)
  buffer.writeUInt32BE(crc32(Buffer.concat([label, data])), data.length + 8)
  return buffer
}
function render(points, size = 512) {
  const pixels = Buffer.alloc(size * size * 4, 255)
  for (let p = 1; p < points.length; p++) {
    const a = points[p - 1], b = points[p], steps = Math.ceil(Math.hypot(a.x - b.x, a.y - b.y) * size * 2)
    if (b.move) continue
    for (let i = 0; i <= steps; i++) {
      const x = Math.round((a.x + (b.x - a.x) * i / Math.max(1, steps)) * size)
      const y = Math.round((a.y + (b.y - a.y) * i / Math.max(1, steps)) * size)
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
        if (dx * dx + dy * dy > 9 || x + dx < 0 || y + dy < 0 || x + dx >= size || y + dy >= size) continue
        const offset = ((y + dy) * size + x + dx) * 4
        pixels[offset] = 215; pixels[offset + 1] = 73; pixels[offset + 2] = 82
      }
    }
  }
  const grid = n => {
    const hits = Array(n * n).fill(0), total = Array(n * n).fill(0)
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const cell = Math.floor(y / size * n) * n + Math.floor(x / size * n)
      total[cell]++; if (pixels[(y * size + x) * 4] < 242) hits[cell]++
    }
    return hits.map((hit, i) => hit / total[i])
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(size); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 6
  const rows = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y++) pixels.copy(rows, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  const hasInkAt = (point, radius) => {
    const cx = point.x * size, cy = point.y * size
    for (let y = Math.max(0, Math.floor(cy-radius)); y < Math.min(size, Math.ceil(cy+radius)); y++) {
      for (let x = Math.max(0, Math.floor(cx-radius)); x < Math.min(size, Math.ceil(cx+radius)); x++) {
        if (pixels[(y*size+x)*4] >= 242) continue
        const dx = Math.max(x-cx,cx-x-1,0), dy = Math.max(y-cy,cy-y-1,0)
        if (Math.hypot(dx,dy) <= radius) return true
      }
    }
    return false
  }
  return { png: Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]), grid: grid(8), occupancy: grid(256), hasInkAt }
}
const circle = Array.from({ length: 121 }, (_, i) => ({ x: .5 + .23 * Math.cos(i * Math.PI / 60), y: .5 + .23 * Math.sin(i * Math.PI / 60) }))
const heart = Array.from({ length: 161 }, (_, i) => {
  const a = i * Math.PI / 80
  return { x: .5 + 16 * Math.sin(a) ** 3 / 65, y: .47 - (13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a)) / 65 }
})
const star = Array.from({ length: 11 }, (_, i) => {
  const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? .105 : .255
  return { x: .5 + r * Math.cos(a), y: .5 + r * Math.sin(a) }
})
// A fruit-like outline with a visible stem exercises structural attachment.
const apple = [{ x: .5, y: .12 }, { x: .48, y: .19 }, { x: .48, y: .3 }, ...heart]
const apple_top = apple.map(p => ({ x:p.x,y:p.y-.05 }))
const heartBefore = heart.map(p => ({x:p.x*.6+.02,y:p.y*.6+.1}))
const oldString = [{x:.32,y:.65},{x:.34,y:.77},{x:.31,y:.86}]
const appleAfter = apple.map(p => ({x:p.x*.6+.4,y:p.y*.6+.05}))
const heart_then_apple = [heartBefore,oldString,appleAfter].flatMap(path => path.map((p,i) => ({...p,...(i===0?{move:true}:{})})))
const cases = { heart, circle, star, apple, apple_top, heart_then_apple }
const selected = process.argv.find(arg => arg.startsWith('--case='))?.split('=')[1]
if (selected && !Object.hasOwn(cases, selected)) throw new Error('Unknown synthetic case')
const results = []
const repeats = Number(process.argv.find(arg => arg.startsWith('--repeat='))?.split('=')[1] ?? 1)
if (!Number.isInteger(repeats) || repeats < 1 || repeats > 3) throw new Error('repeat must be 1..3')
for (const [name, points] of Object.entries(cases).flatMap(entry => Array.from({ length: repeats }, () => entry))) {
  if (selected && selected !== name) continue
  const raster = render(points)
  writeFileSync(new URL(`${name}.png`, output), raster.png)
  const xs = points.map(p => p.x), ys = points.map(p => p.y)
  const bounds = { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) }
  const latestPoints = name === 'heart_then_apple' ? appleAfter : points
  const lastStroke = { points: Array.from({ length: 24 }, (_, i) => latestPoints[Math.round(i / 23 * (latestPoints.length - 1))]), color: '#d74952', width: 6, brushKind: 'round' }
  // No shape name or story is supplied to the model; it must inspect the pixels.
  const context = { locale: 'zh', utterance: '轮到你了，请看着我的画接一小笔。', requestDrawing: true, takeTurn: true,
    imageProvenance: 'child', revision: 1, canvasSize: { width: 512, height: 512 },
    lastStroke, inkGrid: raster.grid, drawingStyle: { brushKind: 'round', color: '#d74952', brushSize: 6 },
    scene: { childBounds: bounds, niloBounds: null, recentContributions: [{ owner: 'child', bounds, brushKind: 'round', color: '#d74952', strokeCount: 1 }] } }
  if (name === 'heart_then_apple') {
    const box = path => {const xs=path.map(p=>p.x),ys=path.map(p=>p.y);return {x:Math.min(...xs),y:Math.min(...ys),width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys)}}
    context.imageProvenance='composite'
    context.scene.niloBounds=box(oldString)
    context.scene.recentContributions=[heartBefore,oldString,appleAfter].map((path,i)=>({owner:i===1?'nilo':'child',bounds:box(path),brushKind:'round',color:'#d74952',strokeCount:1}))
  }
  if (voice) { context.takeTurn = false; context.utterance = '请在苹果的梗上接一片叶子。' }
  let result = null, calls = 0, repairs = 0, prepared = null
  const started = Date.now()
  if (live) {
    if (!llmConfig().apiKey) throw new Error('LLM key not configured')
    const requestPlan = async requestContext => {
    if (local) {
      const response = await fetch('http://127.0.0.1:3001/api/nilo/companion', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: raster.png.toString('base64'), context: requestContext }), signal: AbortSignal.timeout(27000) })
      if (!response.ok) throw new Error(`Local server returned ${response.status}`)
      return await response.json()
    } else return await generateNiloDialogue({ imageBase64: raster.png.toString('base64'), context: requestContext, chatWithImage: async (...args) => {
      calls++
      let raw
      try { raw = await chatWithImage(...args) } catch (error) {
        if (process.argv.includes('--details') && typeof error.raw === 'string') writeFileSync(new URL(`${name}-raw.txt`, output), error.raw)
        throw error
      }
      if (process.argv.includes('--details')) writeFileSync(new URL(`${name}-${args[2].kind}-${calls}.json`, output), JSON.stringify(raw, null, 2))
      console.log(JSON.stringify({ case: name, stage: args[2].kind, sceneType: raw.sceneType, grounding: raw.grounding,
        ...(args[2].kind.endsWith('review') ? { review: raw } : {}) }))
      return raw
    } })
    }
    result = await requestPlan(context)
    if (canvasTools) {
      const paths = []
      for (const p of points) {
        if (!paths.length || p.move) paths.push([])
        paths.at(-1).push({ x:p.x,y:p.y })
      }
      const document = { version:1,baseSource:'child',operations:paths.map((path,i)=>({owner:name==='heart_then_apple'&&i===1?'nilo':'child',type:'stroke',groupId:String(i),points:path,brushKind:'round',color:'#d74952',size:6,eraser:false,referenceWidth:512,referenceHeight:512})) }
      for (let attempt = 0; attempt < 2; attempt++) {
        const p = canvasTools.validateProposal(result?.proposal)
        if (!p) break
        const grounded = canvasTools.refineAttachment(p, document, 1)
        const connected = !grounded.attachment || raster.hasInkAt(grounded.attachment, grounded.strokeWidth / 2 + .5)
        prepared = connected ? canvasTools.prepareTurnProposal(grounded, raster.occupancy, 1, context.canvasSize) : null
        if (prepared || voice || attempt) break
        repairs++
        result = await requestPlan({ ...context,renderFeedback:{reason:connected?'ink_collision':'detached_attachment',proposal:grounded} })
      }
      if (prepared) {
        if (!canvasTools.drawingPlanFits([prepared],raster.occupancy,1,context.canvasSize)) throw new Error('Prepared geometry failed final canvas check')
        const additions = canvasTools.proposalStrokes(prepared,1).flatMap(stroke=>stroke.points.map((p,i)=>({...p,...(i===0?{move:true}:{})})))
        writeFileSync(new URL(`${name}-after-${results.filter(r=>r.name===name).length+1}.png`,output),render([...points,...additions]).png)
      }
    }
  }
  const record = { name, points, occupancy: raster.occupancy, result, prepared, repairs, calls, latencyMs: Date.now() - started }
  results.push(record)
  console.log(JSON.stringify({ case: name, status: result?.status ?? 'dry-run', calls, repairs, ...(canvasTools ? {canvasFits:!!prepared}:{}), latencyMs: record.latencyMs, template: result?.proposal?.template, subject: result?.proposal?.subject, relation: result?.proposal?.relation, reason: result?.reason }))
  if (live && (!result?.proposal || (canvasTools && !prepared))) process.exitCode = 1
}
writeFileSync(new URL('results.json', output), JSON.stringify(results, null, 2))
writeFileSync(new URL(`${selected ?? 'all'}-results.json`, output), JSON.stringify(results, null, 2))
