// A small, reproducible v3 comparison on existing synthetic drawings. No network
// without --live. Both variants get the same requests and 14-second deadline.
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import { freshCases } from './fixtures/niloFreshScenes.mjs'
import { renderSynthetic, syntheticContext } from './check-nilo-ablation.mjs'
import { placementFits, projectionFits } from '../../shared/niloCollision.mjs'

process.env.NODE_ENV = 'test'
const { generateNiloDialogue, validateProposal } = await import('../src/services/niloDialogue.js')
const { renderReviewCandidate } = await import('../src/services/niloPreview.js')
const { chatWithImage, llmConfig } = await import('../src/services/llmClient.js')
const requests = [
  ['forked_cactus', '轮到你了，看着我的画自由添一个有趣的新伙伴。'],
  ['fish_with_top_fin', '轮到你了，看着我的画自由添一个有趣的新伙伴。'],
  ['one_eye_tripod', '轮到你了，看着我的画自由添一个有趣的新伙伴。'],
  ['round_teapot', '请在旁边画一个长着翅膀、正在飞的茶杯，杯把和翅膀都要看得出来。'],
  ['rocket_with_flame', '请画一只戴着透明太空头盔的小兔子，兔耳朵和圆头盔都要看得见，陪火箭去旅行。'],
  ['house_and_garden', '请在房子旁添一朵会走路的花，要看见花瓣和两只脚。'],
]
export const comparisonCases = requests.map(([id, request], index) => ({ ...freshCases.find(f => f.id === id), request,
  group: index < 3 ? 'open_idea' : 'explicit_combination' }))

export async function evaluateIdeaFixture(fixture, variant, { provider = chatWithImage, model = 'synthetic-test' } = {}) {
  if (!['catalogue', 'idea-first'].includes(variant)) throw new Error('Invalid variant')
  const raster = renderSynthetic(fixture.points, fixture.aspect)
  const context = { ...syntheticContext(fixture, raster), drawingProtocol: 3, utterance: fixture.request }
  const started = performance.now(), calls = []
  let activeCall
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (...args) => {
    const response = await originalFetch(...args)
    try { const body = await response.clone().json(); if (activeCall && body?.usage) activeCall.tokens = body.usage } catch {}
    return response
  }
  const measured = async (image, prompt, options) => {
    if (calls.length >= 3) throw new Error('evaluation_call_budget')
    const call = { stage: options.kind, maxTokens: options.maxTokens, tokens: null, outcome: 'pending' }, t = performance.now()
    calls.push(call); activeCall = call
    try {
      const raw = await provider(image, prompt, { ...options, model, retries: 0, privateContent: true })
      call.data = raw; call.outcome = 'parsed'; return raw
    } catch (error) {
      call.outcome = options.signal.aborted ? 'timeout' : error.name === 'LLMParseError' ? 'invalid_json' : 'provider_error'
      throw error
    } finally { call.latencyMs = Math.round(performance.now() - t); activeCall = null }
  }
  let result
  try { result = await generateNiloDialogue({ imageBase64: raster.imageBase64, context, chatWithImage: measured, creativeMode: variant, timeoutMs: 14000 }) }
  finally { globalThis.fetch = originalFetch }
  const proposal = result?.proposal && validateProposal(result.proposal, { ...context, takeTurn: false,
    drawingStyle: { ...context.drawingStyle, color: result.proposal.color } })
  let canvasFits = !!proposal && placementFits(proposal, context.canvasAspect, context.canvasSize)
    && projectionFits(proposal, raster.occupancy, context.canvasAspect, context.canvasSize, raster.png)
  let preview, failureCode = canvasFits ? null : result.reason ?? 'missing_proposal'
  if (canvasFits) {
    try { preview = renderReviewCandidate(raster.imageBase64, proposal, { ...context, fixedGeometry: true }) }
    catch { canvasFits = false; failureCode = 'preview_failed' }
  }
  const record = { case: fixture.id, group: fixture.group, request: fixture.request, variant, model, executed: true,
    canvasFits, failureCode, latencyMs: Math.round(performance.now() - started), calls, result,
    route: proposal ? proposal.recipeId ? 'recipe' : 'custom' : null, semanticPasses: null }
  return { record, raster, preview }
}

export function ideaComparisonReport(records) {
  return { groups: [...new Set(records.map(r => r.variant))].map(variant => {
    const rows = records.filter(r => r.variant === variant), executed = rows.filter(r => r.executed)
    const latency = executed.map(r => r.latencyMs).sort((a, b) => a - b)
    const calls = executed.flatMap(r => r.calls), known = calls.filter(c => Number.isFinite(c.tokens?.total_tokens))
    return { variant, total: rows.length, executed: executed.length, canvasPasses: executed.filter(r => r.canvasFits).length,
      recipe: executed.filter(r => r.route === 'recipe').length, custom: executed.filter(r => r.route === 'custom').length,
      latencyP50Ms: latency.length ? latency[Math.ceil(latency.length / 2) - 1] : null,
      latencyMaxMs: latency.at(-1) ?? null, calls: calls.length, knownTokenCalls: known.length,
      totalTokens: known.length ? known.reduce((n, c) => n + c.tokens.total_tokens, 0) : null, semanticPasses: null }
  }), notes: ['Exploratory comparison on reused synthetic scenes; not a held-out accuracy estimate or real-user usage rate.',
    'One turn per case and variant; counterbalanced order, 14 s deadline, up to 3 calls, no best-of-N. Failures remain in the denominator.',
    'Different prompts/token limits are part of the compared pipelines; limits and actual usage are recorded per call.',
    'Canvas passing and subject labels do not prove the paths depict the idea. Compare the rendered images separately.'] }
}

const escape = text => String(text ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
function gallery(records, fixtures) {
  return `<!doctype html><meta charset="utf-8"><title>先构思，再找画法 · 对照试验</title><style>body{font:16px system-ui;margin:28px;color:#23433b;background:#f3f6f2}h1{font-size:26px}section{background:white;padding:16px;margin:22px 0;border-radius:14px}h2{font-size:17px;margin:0 0 12px}.row{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}img{width:100%;height:300px;object-fit:contain;border:1px solid #e0e7e2}p{font-size:14px;line-height:1.5;margin:8px 0}.muted{color:#6a7e76}b{display:block}</style><h1>先构思，再找画法</h1><p>深绿色为原画，彩色为新增笔画。6 张合成画，新旧流程各运行一次。可渲染不等于创意表达完整；请同时看轮廓和细节。</p>${fixtures.map(f => `<section><h2>${escape(f.request)}</h2><div class="row"><div><b>原画</b><img src="${f.id}-before.png"></div>${['catalogue', 'idea-first'].map(v => {
    const r = records.find(r => r.case === f.id && r.variant === v), idea = r.calls?.find(c => c.stage === 'nilo_creative_ideate')?.data?.idea
    return `<div><b>${v === 'catalogue' ? '原流程：目录参与构思' : '试验：先构思后检索'}</b><img src="${f.id}-${v}-${r.canvasFits ? 'after' : 'before'}.png"><p>${escape(r.result?.proposal?.subject ?? r.failureCode ?? '尚未运行')} · ${r.executed ? (r.latencyMs / 1000).toFixed(1) + ' 秒' : '未运行'} · ${escape(r.route ?? '无成图')}</p><p class="muted">${escape(idea ? `先定主意：${idea.subject}；必需细节：${idea.details?.join('、')}` : r.result?.proposal?.relation ?? '')}</p></div>`
  }).join('')}</div></section>`).join('')}`
}

export async function main(args = process.argv.slice(2)) {
  if (args.some(a => a !== '--live' && !a.startsWith('--out='))) throw new Error('Unknown option')
  const live = args.includes('--live')
  if (live) { try { process.loadEnvFile(new URL('../.env', import.meta.url)) } catch {} }
  const config = llmConfig()
  if (live && !config.apiKey) throw new Error('No configured provider key; no requests sent')
  const runId = new Date().toISOString().replace(/[:.]/g, '-')
  const root = args.find(a => a.startsWith('--out='))?.slice(6) ?? fileURLToPath(new URL('../.tmp/nilo-idea-first/', import.meta.url))
  const out = resolve(root, runId); mkdirSync(out, { recursive: true })
  const fixtures = comparisonCases.map(({ id, group, points, aspect, request }) => ({ id, group, points, aspect, request }))
  const hash = createHash('sha256').update(JSON.stringify(fixtures)).digest('hex')
  const records = comparisonCases.flatMap((f, i) => (i % 2 ? ['idea-first', 'catalogue'] : ['catalogue', 'idea-first'])
    .map(variant => ({ case: f.id, group: f.group, variant, executed: false, calls: [] })))
  writeFileSync(resolve(out, 'manifest.json'), JSON.stringify({ runId, live, fixtureHash: hash, model: config.visionModel, fixtures, order: records.map(r => [r.case, r.variant]) }, null, 2))
  const save = () => {
    writeFileSync(resolve(out, 'records.json'), JSON.stringify(records, null, 2))
    writeFileSync(resolve(out, 'report.json'), JSON.stringify(ideaComparisonReport(records), null, 2))
    writeFileSync(resolve(out, 'comparison.html'), gallery(records, comparisonCases))
    writeFileSync(resolve(out, 'comparison-open.html'), gallery(records, comparisonCases.slice(0, 3)))
    writeFileSync(resolve(out, 'comparison-combined.html'), gallery(records, comparisonCases.slice(3)))
  }
  for (const f of comparisonCases) {
    const { bytes } = renderSynthetic(f.points, f.aspect)
    for (const suffix of ['before', 'catalogue-before', 'idea-first-before']) writeFileSync(resolve(out, `${f.id}-${suffix}.png`), bytes)
  }
  save()
  if (live) for (let i = 0; i < records.length; i++) {
    const row = records[i], fixture = comparisonCases.find(f => f.id === row.case)
    const { record, preview } = await evaluateIdeaFixture(fixture, row.variant, { model: config.visionModel })
    records[i] = record
    if (preview) writeFileSync(resolve(out, `${row.case}-${row.variant}-after.png`), Buffer.from(preview.imageBase64, 'base64'))
    save()
    process.stdout.write(`${i + 1}/12 ${row.case} ${row.variant}: ${record.canvasFits ? record.route : record.failureCode}, ${record.latencyMs} ms\n`)
  }
  process.stdout.write(`${JSON.stringify({ out, report: ideaComparisonReport(records) })}\n`)
  return { out, records }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(() => { process.stderr.write('Comparison failed; inspect persisted records. Provider error details withheld.\n'); process.exitCode = 1 })
}
