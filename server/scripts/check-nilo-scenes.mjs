// Explicit opt-in smoke test. Only synthetic instructions and a blank canvas are sent.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PNG } from 'pngjs'
import { sampleProposalGeometry } from '../../shared/niloGeometry.mjs'
import { getDrawingIllustration } from '../../shared/niloIllustrations.mjs'

const previewOnly = process.argv.includes('--preview')
if (!process.argv.includes('--live') && !previewOnly) {
  console.log('Use --live for synthetic scene requests; --case=library checks library composition. --preview redraws saved results without a model call.')
  process.exit(0)
}
if (!previewOnly) { try { process.loadEnvFile(new URL('../.env', import.meta.url)) } catch {} }
process.env.NODE_ENV = 'test'
const { generateNiloScene } = await import('../src/services/niloScene.js')
const { llmConfig, chatWithImage, chatText } = await import('../src/services/llmClient.js')
if (!previewOnly && !llmConfig().apiKey) throw new Error('Configured model key is required')
const out = resolve('..', '.tmp', 'nilo-scenes')
mkdirSync(out, { recursive: true })
const canvas = new PNG({ width: 840, height: 600 }); canvas.data.fill(255)
const imageBase64 = PNG.sync.write(canvas).toString('base64')
const cases = [
  { id: 'dream', text: '画一个迪士尼那样梦幻的场景', scope: 'scene' },
  { id: 'winged-castle', text: '画一座长着翅膀、飞在海上的城堡，要看得见翅膀', scope: 'object' },
  { id: 'whale-castle', text: '画一座长着鲸鱼尾巴、会游泳的城堡，尾巴必须长在城堡上', scope: 'object' },
  { id: 'library-dream-1', text: '画一个迪士尼那样梦幻的场景', scope: 'scene' },
  { id: 'library-dream-2', text: '画一个迪士尼那样梦幻的场景，换个新的主意', scope: 'scene' },
  { id: 'library-forest', text: '画一个小动物们在森林里一起玩耍的场景', scope: 'scene' },
  { id: 'library-ocean', text: '画一个精美的海底世界场景，有小鱼和水母', scope: 'scene' },
  { id: 'semantic-dream', text: '我想画迪士尼那样的梦幻场景', scope: 'scene' },
  { id: 'semantic-forest', text: '画童话故事书里的森林，不要画一本书', scope: 'scene' },
  { id: 'semantic-book', text: '画一本打开的童话故事书，旁边有一朵花', scope: 'object' },
  { id: 'semantic-book-literal', text: '画一本迪士尼故事书', scope: 'object' },
  { id: 'semantic-ocean', text: '画一个梦幻的海底场景，有水母和小鱼，不要城堡也不要故事书', scope: 'scene' },
  { id: 'semantic-space', text: '画一个像太空冒险电影里那样的场景，别画电影屏幕', scope: 'scene' },
]
const requested = process.argv.find(arg => arg.startsWith('--case='))?.split('=')[1]
const rows = []
const history = []
const xml = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c])
function guidePaths(proposal, aspect) {
  if (proposal.template !== 'illustration') return sampleProposalGeometry(proposal, aspect).map(stroke => stroke.points)
  const asset = getDrawingIllustration(proposal.illustrationId)
  if (!asset) throw new Error('Unknown illustration in preview')
  const guide = JSON.parse(readFileSync(new URL(`../../frontend/public/nilo-tracing/${asset.id}.json`, import.meta.url)))
  if (guide.projection === 'gray') return []
  let width = proposal.width, height = proposal.height
  if (width * aspect / height > guide.aspect) width = height * guide.aspect / aspect
  else height = width * aspect / guide.aspect
  const angle = proposal.rotation * Math.PI / 180
  return guide.paths.map(path => path.map(([x, y]) => {
    const dx = (x - .5) * width, dy = (y - .5) * height
    return { x: proposal.x + proposal.width / 2 + Math.cos(angle) * dx - Math.sin(angle) * dy / aspect,
      y: proposal.y + proposal.height / 2 + Math.sin(angle) * dx * aspect + Math.cos(angle) * dy }
  }))
}
function grayGuide(proposal) {
  if (proposal.template !== 'illustration') return null
  const asset = getDrawingIllustration(proposal.illustrationId)
  const guide = JSON.parse(readFileSync(new URL(`../../frontend/public/nilo-tracing/${asset.id}.json`, import.meta.url)))
  if (guide.projection !== 'gray') return null
  const source = readFileSync(new URL(`../../frontend/public${asset.src}`, import.meta.url))
  const width = Math.min(proposal.width * 840, proposal.height * 600 * guide.aspect)
  return { source, width, height: width / guide.aspect, cx: (proposal.x + proposal.width / 2) * 840, cy: (proposal.y + proposal.height / 2) * 600, rotation: proposal.rotation }
}
function rasterGuide(proposals) {
  const png = new PNG({ width: 840, height: 600 }); png.data.fill(255)
  const dot = (x, y) => {
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const px = Math.round(x) + dx, py = Math.round(y) + dy
      if (px < 0 || px >= 840 || py < 0 || py >= 600) continue
      const alpha = Math.max(0, Math.min(1, 1.25 - Math.hypot(px - x, py - y)))
      for (let c = 0; c < 3; c++) { const i = (py * 840 + px) * 4 + c; png.data[i] = Math.min(png.data[i], Math.round(255 * (1 - alpha) + [156, 163, 175][c] * alpha)) }
    }
  }
  for (const proposal of proposals) {
    const gray = grayGuide(proposal)
    if (gray) {
      const source = PNG.sync.read(gray.source), angle = gray.rotation * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle)
      const samples = Math.min(8, Math.max(1, Math.ceil(source.width / gray.width)))
      for (let y = 0; y < 600; y++) for (let x = 0; x < 840; x++) {
        const dx = x + .5 - gray.cx, dy = y + .5 - gray.cy
        const u = (dx * c + dy * s) / gray.width + .5, v = (-dx * s + dy * c) / gray.height + .5
        if (u < 0 || u >= 1 || v < 0 || v >= 1) continue
        let darkness = 0
        for (let sy = 0; sy < samples; sy++) for (let sx = 0; sx < samples; sx++) {
          const du = (sx + .5) / samples - .5, dv = (sy + .5) / samples - .5
          const ix = Math.floor((u + (du * c + dv * s) / gray.width) * source.width)
          const iy = Math.floor((v + (-du * s + dv * c) / gray.height) * source.height)
          if (ix < 0 || ix >= source.width || iy < 0 || iy >= source.height) continue
          const i = (iy * source.width + ix) * 4
          const luminance = .2126 * source.data[i] + .7152 * source.data[i + 1] + .0722 * source.data[i + 2]
          darkness += (1 - luminance / 255) * source.data[i + 3] / 255
        }
        const factor = 1 - darkness / (samples * samples) * .38
        for (let channel = 0; channel < 3; channel++) png.data[(y * 840 + x) * 4 + channel] *= factor
      }
      continue
    }
    for (const path of guidePaths(proposal, 1.4)) {
    let offset = 0
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i], length = Math.hypot((b.x - a.x) * 840, (b.y - a.y) * 600), steps = Math.max(1, Math.ceil(length * 3))
      for (let j = 0; j <= steps; j++) if ((offset + length * j / steps) % 11 < 6) dot((a.x + (b.x - a.x) * j / steps) * 840, (a.y + (b.y - a.y) * j / steps) * 600)
      offset += length
    }
    }
  }
  return PNG.sync.write(png)
}
for (const fixture of cases.filter(item => !requested || (['library', 'semantic'].includes(requested) ? item.id.startsWith(`${requested}-`) : item.id === requested))) {
  const context = { canvasAspect: 1.4, canvasSize: { width: 840, height: 600 }, requestScope: fixture.scope,
    scene: { childBounds: null, niloBounds: null, recentContributions: [] }, history: fixture.id === 'library-dream-2' ? [...history] : [], drawingStyle: { brushKind: 'round', brushSize: 3, color: '#66729b' } }
  const calls = []
  const observed = { chatWithImage: async (image, prompt, options) => { const data = await chatWithImage(image, prompt, options); calls.push({ kind: options.kind, data }); return data },
    chatText: async (prompt, options) => { const data = await chatText(prompt, options); calls.push({ kind: options.kind, data }); return data } }
  const saved = previewOnly ? JSON.parse(readFileSync(resolve(out, `${fixture.id}.json`))) : null
  const planned = saved?.planned ?? await generateNiloScene({ stage: 'plan', utterance: fixture.text, locale: 'zh', imageBase64, context }, observed)
  console.log(JSON.stringify({ case: fixture.id, stage: 'plan', status: planned.status, reason: planned.reason, metrics: planned.metrics }))
  const drawn = previewOnly ? saved.drawn : planned.status === 'proposed' ? await generateNiloScene({ stage: 'render', utterance: fixture.text, locale: 'zh', imageBase64, context, plan: planned.plan }, observed) : null
  console.log(JSON.stringify({ case: fixture.id, stage: 'render', status: drawn?.status, reason: drawn?.reason, metrics: drawn?.metrics }))
  if (!previewOnly) writeFileSync(resolve(out, `${fixture.id}.json`), JSON.stringify({ fixture, planned, drawn, calls }, null, 2))
  if (drawn?.status === 'ready') {
    writeFileSync(resolve(out, `${fixture.id}.png`), rasterGuide(drawn.objects.map(o => o.proposal)))
    const parts = drawn.objects.flatMap(({ proposal }) => {
      const gray = grayGuide(proposal)
      if (gray) return [`<image href="data:image/png;base64,${gray.source.toString('base64')}" x="${gray.cx - gray.width / 2}" y="${gray.cy - gray.height / 2}" width="${gray.width}" height="${gray.height}" transform="rotate(${gray.rotation} ${gray.cx} ${gray.cy})" style="opacity:.38;filter:grayscale(1);mix-blend-mode:multiply"/>`]
      return guidePaths(proposal, 1.4).map(path => `<polyline points="${path.map(point => `${(point.x * 840).toFixed(2)},${(point.y * 600).toFixed(2)}`).join(' ')}" fill="none" stroke="#9ca3af" stroke-width="1.5" stroke-dasharray="6 5" stroke-linecap="round" stroke-linejoin="round"/>`)
    })
    writeFileSync(resolve(out, `${fixture.id}.svg`), `<svg xmlns="http://www.w3.org/2000/svg" width="840" height="600" viewBox="0 0 840 600"><title>${xml(drawn.plan.title)}</title><rect width="840" height="600" fill="white"/>${parts.join('')}</svg>`)
    if (fixture.id === 'library-dream-1') history.push({ role: 'assistant', text: `场景参考：${drawn.plan.summary}` })
  }
  rows.push({ case: fixture.id, plan: planned.status, render: drawn?.status, profile: drawn?.plan.materialProfile, materials: drawn?.plan.objects.map(o => ({ name: o.name, ...o.render })), planMs: planned.metrics.durationMs, renderMs: drawn?.metrics.durationMs, reason: drawn?.reason ?? planned.reason })
}
writeFileSync(resolve(out, 'summary.json'), JSON.stringify(rows, null, 2))
console.log(JSON.stringify({ output: out, cases: rows }))
