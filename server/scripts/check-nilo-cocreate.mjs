// Bounded live regression using synthetic geometric and simple object drawings.
// No child images, prompts, credentials or conversation are read from storage.
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { encodeOccupancy } from '../../shared/niloOccupancy.mjs'
import { holdoutCases, holdoutVersion } from './fixtures/niloHoldout.mjs'
import { evaluationReport, evaluationMarkdown } from './nilo-eval-report.mjs'
process.env.NODE_ENV = 'test'
try { process.loadEnvFile(new URL('../.env', import.meta.url)) } catch { /* optional */ }
const { generateNiloDialogue } = await import('../src/services/niloDialogue.js')
const { chatWithImage, llmConfig } = await import('../src/services/llmClient.js')
const live = process.argv.includes('--live')
const local = process.argv.includes('--local')
const voice = process.argv.includes('--voice')
const output = new URL('../../frontend/.tmp/nilo-cocreate/', import.meta.url)
mkdirSync(output, { recursive: true })
let canvasTools, focusBoundsForScene
{
  // Exercise the exact production geometry checks, not an API-status proxy.
  const require = createRequire(new URL('../../frontend/package.json', import.meta.url))
  const bundle = new URL('canvas-check.mjs', output)
  await require('esbuild').build({ stdin: {
    contents: "export {validateProposal,prepareTurnProposal,drawingPlanFits,proposalStrokes} from './proposals'; export {refineAttachment} from './attachmentGrounding'; export {companionFocusBounds} from './focus';",
    resolveDir: fileURLToPath(new URL('../../frontend/src/features/child/companion/', import.meta.url)), loader: 'ts',
  }, bundle: true, platform: 'node', format: 'esm', outfile: fileURLToPath(bundle) })
  const bundled = await import(bundle.href)
  focusBoundsForScene = bundled.companionFocusBounds
  if (process.argv.includes('--check-canvas')) canvasTools = bundled
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
function render(points, size = 512, aspect = 1, rgb = [215,73,82]) {
  const width=Math.round(size*aspect)
  const pixels = Buffer.alloc(width * size * 4, 255)
  for (let p = 1; p < points.length; p++) {
    const a = points[p - 1], b = points[p], steps = Math.ceil(Math.hypot((a.x-b.x)*width,(a.y-b.y)*size)*2)
    if (b.move) continue
    for (let i = 0; i <= steps; i++) {
      const x = Math.round((a.x + (b.x - a.x) * i / Math.max(1, steps)) * width)
      const y = Math.round((a.y + (b.y - a.y) * i / Math.max(1, steps)) * size)
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
        if (dx * dx + dy * dy > 9 || x + dx < 0 || y + dy < 0 || x + dx >= width || y + dy >= size) continue
        const offset = ((y + dy) * width + x + dx) * 4
        pixels[offset] = rgb[0]; pixels[offset + 1] = rgb[1]; pixels[offset + 2] = rgb[2]
      }
    }
  }
  const grid = n => {
    const hits = Array(n * n).fill(0), total = Array(n * n).fill(0)
    for (let y = 0; y < size; y++) for (let x = 0; x < width; x++) {
      const cell = Math.floor(y / size * n) * n + Math.floor(x / width * n)
      total[cell]++; if (pixels[(y * width + x) * 4] < 242) hits[cell]++
    }
    return hits.map((hit, i) => hit / total[i])
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 6
  const rows = Buffer.alloc((width * 4 + 1) * size)
  for (let y = 0; y < size; y++) pixels.copy(rows, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4)
  const hasInkAt = (point, radius) => {
    const cx = point.x * width, cy = point.y * size
    for (let y = Math.max(0, Math.floor(cy-radius)); y < Math.min(size, Math.ceil(cy+radius)); y++) {
      for (let x = Math.max(0, Math.floor(cx-radius)); x < Math.min(width, Math.ceil(cx+radius)); x++) {
        if (pixels[(y*width+x)*4] >= 242) continue
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
const open_curve = Array.from({length:24},(_,i)=>({x:.35+i*.012,y:.45+Math.sin(i/23*Math.PI)*.1}))
const wheel = circle
const paths = (...lines) => lines.flatMap(line=>line.map(([x,y],i)=>({x,y,...(i===0?{move:true}:{})})))
const house = paths([[.25,.48],[.5,.22],[.75,.48]],[[.3,.45],[.3,.78],[.7,.78],[.7,.45]])
const fish = paths(Array.from({length:65},(_,i)=>[.48+.22*Math.cos(i*Math.PI/32),.48+.13*Math.sin(i*Math.PI/32)]),[[.26,.48],[.14,.32],[.14,.64],[.26,.48]])
const person = paths(Array.from({length:49},(_,i)=>[.5+.12*Math.cos(i*Math.PI/24),.3+.12*Math.sin(i*Math.PI/24)]),[[.5,.42],[.5,.65]],[[.35,.5],[.5,.47],[.65,.5]],[[.5,.65],[.38,.85]],[[.5,.65],[.62,.85]])
const fish_left = fish.map(p=>({...p,x:1-p.x}))
const fish_up = fish.map(p=>({...p,x:p.y,y:1-p.x}))
const fish_with_eye = [...fish,...paths(Array.from({length:25},(_,i)=>[.61+.025*Math.cos(i*Math.PI/12),.44+.025*Math.sin(i*Math.PI/12)]))]
// Reconstructed from the user's large-head screenshot, excluding Nilo's short
// stroke and the red explanatory annotation. This is a regression fixture,
// not a claim to reproduce every original pixel or brush sample.
const arc=(cx,cy,rx,ry,start,end,count=40)=>Array.from({length:count},(_,i)=>[cx+rx*Math.cos(start+(end-start)*i/(count-1)),cy+ry*Math.sin(start+(end-start)*i/(count-1))])
const large_person = paths(arc(.56,.405,.265,.365,0,Math.PI*2,90),
  arc(.36,.41,.06,.095,Math.PI,Math.PI*2,24),arc(.53,.41,.065,.09,Math.PI,Math.PI*2,24),
  arc(.465,.56,.065,.11,0,Math.PI,28),[[.69,.73],[.78,.87]],[[.66,.77],[.72,.89]])
const cat=paths(arc(.5,.48,.2,.18,0,Math.PI*2,64),[[.33,.37],[.3,.19],[.44,.31]],[[.56,.31],[.69,.19],[.67,.37]],arc(.43,.45,.012,.016,0,Math.PI*2,16),arc(.57,.45,.012,.016,0,Math.PI*2,16),[[.48,.52],[.5,.54],[.52,.52]])
const robot=paths([[.32,.16],[.68,.16],[.68,.4],[.32,.4],[.32,.16]],arc(.42,.27,.02,.02,0,Math.PI*2,20),arc(.58,.27,.02,.02,0,Math.PI*2,20),[[.5,.4],[.5,.45]],[[.29,.45],[.71,.45],[.71,.75],[.29,.75],[.29,.45]],[[.29,.5],[.18,.64]],[[.71,.5],[.82,.64]],[[.39,.75],[.39,.89],[.3,.89]],[[.61,.75],[.61,.89],[.7,.89]])
const guitar=paths([[.47,.1],[.54,.1],[.54,.56],[.63,.5],[.72,.57],[.75,.74],[.65,.88],[.4,.88],[.3,.76],[.32,.6],[.4,.52],[.47,.57],[.47,.1]],arc(.515,.68,.055,.055,0,Math.PI*2,30),[[.44,.82],[.59,.82]])
// Synthetic landscape regression: a tree, a cloud and two separate sky marks.
// The final gesture is deliberately not the largest subject.
const tree_scene=paths(
  [[.27,.97],[.29,.88],[.3,.65],[.29,.59],[.33,.69],[.36,.57],[.36,.82],[.39,.96],[.43,.98]],
  [...arc(.25,.63,.1,.17,Math.PI/2,Math.PI*1.5,20),...arc(.24,.4,.085,.14,Math.PI,Math.PI*1.5,14),...arc(.3,.31,.065,.1,Math.PI,Math.PI*2,16),...arc(.4,.32,.07,.14,Math.PI,Math.PI*2.15,22),...arc(.49,.49,.07,.16,Math.PI*1.15,Math.PI*2.6,25),...arc(.47,.68,.055,.1,-Math.PI/2,Math.PI/2,15),[.37,.74]],
  [...arc(.66,.16,.04,.08,Math.PI/2,Math.PI*1.5,15),...arc(.7,.13,.04,.06,Math.PI,Math.PI*2,15),...arc(.76,.18,.05,.06,Math.PI,Math.PI*2.7,20),[.71,.25],[.68,.24],[.66,.16]],
  [[.83,.73],[.85,.69],[.89,.72],[.91,.66],[.96,.65]],
  [[.69,.93],[.71,.89],[.76,.91],[.78,.86],[.84,.89],[.88,.83]])
const cases = { tree_scene, large_person, cat, robot, guitar, fish_left, fish_up, fish_with_eye, heart, circle, star, apple, apple_top, heart_then_apple, open_curve, wheel, house, fish, person,
  ...Object.fromEntries(Object.entries(holdoutCases).map(([name,data])=>[name,data.points])) }
const selected = process.argv.find(arg => arg.startsWith('--case='))?.split('=')[1]
const suite=process.argv.find(arg=>arg.startsWith('--suite='))?.split('=')[1]??'all'
const retest=process.argv.includes('--retest')
const runLabel=selected??`${suite}${retest?'-retest':''}`
if(!['all','development','holdout','smoke'].includes(suite))throw new Error('suite must be all, development, holdout or smoke')
const modelOverride = process.argv.find(arg => arg.startsWith('--model='))?.slice(8)
if (local && modelOverride) throw new Error('--model applies to direct provider tests; local mode uses the running server configuration')
if (selected && !Object.hasOwn(cases, selected)) throw new Error('Unknown synthetic case')
const results = []
const repeats = Number(process.argv.find(arg => arg.startsWith('--repeat='))?.split('=')[1] ?? 1)
if (!Number.isInteger(repeats) || repeats < 1 || repeats > 3) throw new Error('repeat must be 1..3')
for (const [name, points] of Object.entries(cases).flatMap(entry => Array.from({ length: repeats }, () => entry))) {
  if (selected && selected !== name) continue
  if(!selected && (suite==='holdout'&&!holdoutCases[name] || suite==='development'&&holdoutCases[name]
    || suite==='smoke'&&!['tree_scene','large_person','cat','robot','guitar'].includes(name)))continue
  const aspect=['large_person','tree_scene'].includes(name)?2:1
  const rgb=name==='large_person'?[32,53,47]:[215,73,82]
  const raster = render(points,512,aspect,rgb)
  writeFileSync(new URL(`${name}.png`, output), raster.png)
  const xs = points.map(p => p.x), ys = points.map(p => p.y)
  const bounds = { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) }
  const latestPoints = name === 'heart_then_apple' ? appleAfter : points.slice(Math.max(0, points.findLastIndex(p=>p.move)))
  const lastStroke = { points: Array.from({ length: 24 }, (_, i) => latestPoints[Math.round(i / 23 * (latestPoints.length - 1))]), color: '#d74952', width: 6, brushKind: 'round' }
  // No shape name or story is supplied to the model; it must inspect the pixels.
  const context = { locale: 'zh', utterance: '轮到你了，请看着我的画接一小笔。', requestDrawing: true, takeTurn: true, useDrawingKnowledge:!process.argv.includes('--without-knowledge'), turnScope: name==='tree_scene'?'scene':'latest',
    drawingProtocol:process.argv.includes('--legacy')||process.argv.includes('--without-knowledge')?1:2, collisionMap:encodeOccupancy(raster.occupancy),
    imageProvenance: 'child', revision: 1, canvasAspect:aspect, canvasSize: { width: 512*aspect, height: 512 },
    lastStroke, inkGrid: raster.grid, drawingStyle: { brushKind: 'round', color: '#d74952', brushSize: 6 },
    scene: { childBounds: bounds, niloBounds: null, recentContributions: [{ owner: 'child', bounds, brushKind: 'round', color: '#d74952', strokeCount: 1 }] } }
  if (name === 'heart_then_apple') {
    const box = path => {const xs=path.map(p=>p.x),ys=path.map(p=>p.y);return {x:Math.min(...xs),y:Math.min(...ys),width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys)}}
    context.imageProvenance='composite'
    context.scene.niloBounds=box(oldString)
    context.scene.recentContributions=[heartBefore,oldString,appleAfter].map((path,i)=>({owner:i===1?'nilo':'child',bounds:box(path),brushKind:'round',color:'#d74952',strokeCount:1}))
  }
  if (name === 'large_person' || name === 'tree_scene') {
    const lines=[];for(const p of points){if(!lines.length||p.move)lines.push([]);lines.at(-1).push(p)}
    const box=line=>{const xs=line.map(p=>p.x),ys=line.map(p=>p.y);return {x:Math.min(...xs)-.004,y:Math.min(...ys)-.004,width:Math.max(...xs)-Math.min(...xs)+.008,height:Math.max(...ys)-Math.min(...ys)+.008}}
    context.scene.recentContributions=lines.map(line=>({owner:'child',bounds:box(line),strokeCount:1,brushKind:'round',color:'#20352f'}))
    context.drawingStyle={brushKind:'round',color:'#20352f',brushSize:8}
  }
  if (voice) { context.takeTurn = false; context.utterance = '请在苹果的梗上接一片叶子。' }
  if (name === 'wheel') { context.utterance='这是我的车轮，轮到你了。'; context.theme='车轮' }
  // Crop in physical canvas space so neither full nor focus views stretch ink.
  const focusBounds = focusBoundsForScene(context.scene, aspect)
  let focusImage
  if (focusBounds && !process.argv.includes('--without-focus')) {
    const side = Math.min(1, Math.max(focusBounds.width*aspect, focusBounds.height)), cropWidth=side/aspect
    const bounds = {x:Math.max(0,Math.min(1-cropWidth,focusBounds.x+focusBounds.width/2-cropWidth/2)),y:Math.max(0,Math.min(1-side,focusBounds.y+focusBounds.height/2-side/2)),width:cropWidth,height:side}
    const crop = render(points.map(p=>({...p,x:(p.x-bounds.x)/cropWidth,y:(p.y-bounds.y)/side})),512,1,rgb)
    focusImage={imageBase64:crop.png.toString('base64'),bounds}
    writeFileSync(new URL(`${name}-focus.png`,output),crop.png)
  }
  let result = null, calls = 0, repairs = 0, prepared = null
  const started = Date.now()
  if (live) {
    if (!llmConfig().apiKey) throw new Error('LLM key not configured')
    const requestPlan = async requestContext => {
    if (local) {
      const response = await fetch('http://localhost:3001/api/nilo/companion', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: raster.png.toString('base64'), focusImage, context: requestContext }), signal: AbortSignal.timeout(16000) })
      if (!response.ok) throw new Error(`Local server returned ${response.status}`)
      return await response.json()
    } else return await generateNiloDialogue({ imageBase64: raster.png.toString('base64'), focusImage, context: requestContext, chatWithImage: async (...args) => {
      calls++
      let raw
      try { raw = await chatWithImage(args[0],args[1],{...args[2],...(modelOverride?{model:modelOverride}:{})}) } catch (error) {
        if (process.argv.includes('--details') && typeof error.raw === 'string') writeFileSync(new URL(`${name}-raw.txt`, output), error.raw)
        throw error
      }
      if (args[2].reviewImage) writeFileSync(new URL(`${name}-review-${calls}.png`,output),Buffer.from(args[2].reviewImage,'base64'))
      if (args[2].referenceSheet) writeFileSync(new URL(`${name}-references.png`,output),Buffer.from(args[2].referenceSheet.imageBase64,'base64'))
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
      const document = { version:1,baseSource:'child',operations:paths.map((path,i)=>({owner:name==='heart_then_apple'&&i===1?'nilo':'child',type:'stroke',groupId:String(i),points:path,brushKind:'round',color:'#d74952',size:6,eraser:false,referenceWidth:512*aspect,referenceHeight:512})) }
      for (let attempt = 0; attempt < 1; attempt++) {
        const p = canvasTools.validateProposal(result?.proposal)
        if (!p) break
        const grounded = result.geometryReviewed ? p : canvasTools.refineAttachment(p, document, aspect)
        const connected = !grounded.attachment || raster.hasInkAt(grounded.attachment, grounded.strokeWidth / 2 + .5)
        prepared = connected ? result.geometryReviewed
          ? canvasTools.drawingPlanFits([grounded],raster.occupancy,aspect,context.canvasSize) ? grounded : null
          : canvasTools.prepareTurnProposal(grounded, raster.occupancy, aspect, context.canvasSize) : null
      }
      if (prepared) {
        if (!canvasTools.drawingPlanFits([prepared],raster.occupancy,aspect,context.canvasSize)) throw new Error('Prepared geometry failed final canvas check')
        const additions = canvasTools.proposalStrokes(prepared,aspect).flatMap(stroke=>stroke.points.map((p,i)=>({...p,...(i===0?{move:true}:{})})))
        writeFileSync(new URL(`${name}-after-${results.filter(r=>r.name===name).length+1}.png`,output),render([...points,...additions],512,aspect,rgb).png)
      }
    }
  }
  let semanticCheck = 'manual_review_required'
  if (prepared && name === 'large_person' && result.protocolVersion!==2) {
    semanticCheck=/刘海|帽|冠|发饰|鼻|hair|fringe|hat|crown|nose/i.test(prepared.subject??'') && prepared.y<.6 ? 'person_detail_requires_visual_review' : 'unexpected_person_contribution'
    if (semanticCheck==='unexpected_person_contribution') process.exitCode=1
  }
  if (prepared && name.startsWith('fish') && /眼|eye/i.test(prepared.subject??'')) {
    const cx=prepared.x+prepared.width/2,cy=prepared.y+prepared.height/2
    const headSide=name==='fish_left'?cx<.45:name==='fish_up'?cy<.45:cx>.55
    semanticCheck=name==='fish_with_eye'?'duplicate_eye_rejected':headSide?'head_side_only_passed':'wrong_head_side'
    if (!headSide || name==='fish_with_eye') process.exitCode=1
  }
  repairs=result?.drawingMetrics?.repairs??repairs
  const record = { semanticCheck, name, group:holdoutCases[name]?.group??'development',split:holdoutCases[name]?retest?'regression_from_holdout':'holdout':'development',canvasAspect:aspect, model:modelOverride??llmConfig().visionModel, focused:!!focusImage, points, occupancy: raster.occupancy, result, prepared, repairs, calls:local?null:calls, latencyMs: Date.now() - started }
  results.push(record)
  console.log(JSON.stringify({ case: name, semanticCheck, status: result?.status ?? 'dry-run', calls:local?null:calls, repairs, ...(canvasTools ? {canvasFits:!!prepared}:{}), latencyMs: record.latencyMs, template: result?.proposal?.template, subject: result?.proposal?.subject, relation: result?.proposal?.relation, reason: result?.reason }))
  if (live && (!result?.proposal || (canvasTools && !prepared))) process.exitCode = 1
}
writeFileSync(new URL('results.json', output), JSON.stringify(results, null, 2))
writeFileSync(new URL(`${runLabel}-results.json`, output), JSON.stringify(results, null, 2))
const report=evaluationReport(results,{suite:runLabel,fixtureVersion:holdoutVersion,live})
writeFileSync(new URL(`${runLabel}-evaluation.json`,output),JSON.stringify(report,null,2))
writeFileSync(new URL(`${runLabel}-evaluation.md`,output),evaluationMarkdown(report))
writeFileSync(new URL(`${runLabel}-${new Date().toISOString().replace(/[:.]/g,'-')}-evaluation.json`,output),JSON.stringify(report,null,2))
