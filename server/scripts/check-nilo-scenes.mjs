import { guidePaths, grayGuide, rasterGuide } from './nilo-scene-preview.mjs'
// Explicit opt-in smoke test. Only synthetic instructions and a blank canvas are sent.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PNG } from 'pngjs'

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
