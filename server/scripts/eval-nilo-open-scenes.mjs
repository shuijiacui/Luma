// Production scene planning + rendering on fixed synthetic requests. Offline by
// default: only --live loads credentials and permits provider calls.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { getDrawingIllustration } from '../../shared/niloIllustrations.mjs'
import { sampleProposalGeometry } from '../../shared/niloGeometry.mjs'
import { validateGeneratedRaster } from '../../shared/niloGeneratedRaster.mjs'
import { placementFits } from '../../shared/niloCollision.mjs'
import { openSceneCases, openSceneContext, openSceneHash, openSceneVersion, previousOpenScene } from './fixtures/niloOpenScenes.mjs'
import { guidePaths, rasterGuide } from './nilo-scene-preview.mjs'
import { holdoutSceneCases, holdoutSceneHash, holdoutSceneVersion } from './fixtures/niloOpenScenesHoldout.mjs'
import { recordHoldoutExposure, sceneSourceFingerprint } from './nilo-scene-evidence.mjs'
import { evaluationBudget } from './nilo-evaluation-budget.mjs'

const publicRoot = fileURLToPath(new URL('../../frontend/public/', import.meta.url))
const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character])
const number = value => Math.round(value * 1000) / 1000
const percentile = (values, p) => values.length ? [...values].sort((a, b) => a - b)[Math.ceil(values.length * p) - 1] : null
const reviewText = value => typeof value === 'string' ? value : null
const reviewTexts = value => Array.isArray(value) ? value.filter(item => typeof item === 'string') : null

export function openSceneOptions(args = []) {
  if (args.some(value => value !== '--live' && !/^--(?:case|limit|offset|out|preview|suite|max-api-calls|max-image-calls)=/.test(value))) throw new Error('Unknown evaluation option')
  const get = (name, fallback) => args.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback
  for (const name of ['case', 'limit', 'offset', 'out', 'preview', 'suite', 'max-api-calls', 'max-image-calls']) if (args.filter(value => value.startsWith(`--${name}=`)).length > 1) throw new Error('Duplicate evaluation option')
  const suite = get('suite', 'regression')
  if (!['regression', 'holdout'].includes(suite)) throw new Error('Unknown evaluation suite')
  const suiteCases = suite === 'holdout' ? holdoutSceneCases : openSceneCases
  const live = args.includes('--live'), id = get('case', null), preview = get('preview', null)
  if (preview !== null && (!preview || live || args.some(value => value.startsWith('--out=')))) throw new Error('Preview reads an existing run and cannot be combined with live or out')
  const limit = Number(get('limit', id || live ? '1' : String(suiteCases.length)))
  const maxApiCalls = Number(get('max-api-calls', '8')), maxImageCalls = Number(get('max-image-calls', '2'))
  if (![maxApiCalls, maxImageCalls].every(value => Number.isSafeInteger(value) && value > 0)) throw new Error('Invalid evaluation budget')
  const offset = Number(get('offset', '0'))
  if (!Number.isInteger(limit) || limit < 1 || limit > suiteCases.length || !Number.isInteger(offset) || offset < 0 || offset >= suiteCases.length) throw new Error('Invalid case limit or offset')
  if (id && !suiteCases.some(fixture => fixture.id === id)) throw new Error('Unknown case')
  const cases = (id ? suiteCases.filter(fixture => fixture.id === id) : suiteCases).slice(offset, offset + limit)
  if (!cases.length) throw new Error('No cases selected')
  return { live, preview, cases, limit, offset, suite, maxApiCalls, maxImageCalls,
    fixtureVersion: suite === 'holdout' ? holdoutSceneVersion : openSceneVersion,
    fixtureHash: suite === 'holdout' ? holdoutSceneHash : openSceneHash,
    out: get('out', fileURLToPath(new URL('../.tmp/nilo-open-scenes/', import.meta.url))) }
}

function pendingRecord(fixture, mode = 'offline_preparation') {
  return { case: fixture.id, group: fixture.group, utterance: fixture.utterance, locale: fixture.locale, mode, executed: false,
    ready: false, firstPassReady: false, failureStage: null, failureCode: 'not_run_requires_live', latencyMs: null, phaseLatencyMs: {},
    calls: [], planDiagnostics: [], plan: null, result: null, before: null, previewSvg: null,
    checklist: fixture.checklist, semanticStatus: 'independent_review_required', semanticPassed: null }
}

/** Even injected-provider tests execute generateNiloScene itself. Their mode is
 * kept separate from live measurements so stubs cannot count as model success. */
export async function evaluateOpenScene(fixture, { live = false, chatText, chatWithImage, generateImage, diagnosticDirectory } = {}) {
  if (!live && !chatText && !chatWithImage) return pendingRecord(fixture)
  const { generateNiloScene } = await import('../src/services/niloScene.js')
  const provider = await import('../src/services/niloSceneModels.js')
  if (live && !provider.niloSceneModelConfig().apiKey && !chatText) throw new Error('No configured scene model credential')
  const row = pendingRecord(fixture, live && !chatText && !chatWithImage && !generateImage ? 'live_provider' : 'synthetic_provider'), started = performance.now()
  row.executed = true; row.failureCode = null
  let phase = fixture.previous ? 'setup' : 'plan'
  const measured = (fn, vision) => async (...args) => {
    // Cover the bounded production worst case (8 objects, draw/review repairs
    // and scene quality checks). Production deadlines/retry caps still apply.
    if (row.calls.length >= 48) throw new Error('evaluation_call_budget')
    const options = args[vision ? 2 : 1], began = performance.now()
    const call = { phase, stage: options.kind, maxTokens: options.maxTokens, outcome: 'pending', latencyMs: null }
    row.calls.push(call)
    try {
      // Never capture headers, endpoint URLs, raw error messages or prompts.
      const result = await fn(...args); call.outcome = 'parsed'
      if (options.kind === 'nilo_scene_understand') call.brief = result?.brief ?? null
      if (options.kind === 'nilo_scene_plan') call.plan = result?.plan ?? null
      if (options.kind === 'nilo_scene_select') call.selection = result ?? null
      if (options.kind === 'nilo_scene_quality') call.quality = result ?? null
      if (options.kind === 'nilo_scene_observe') call.observation = {
        subject: reviewText(result?.subject), parts: reviewTexts(result?.parts), connections: reviewTexts(result?.connections),
        orientation: reviewText(result?.orientation), uncertain: reviewTexts(result?.uncertain),
      }
      if (options.kind === 'nilo_scene_review') call.review = {
        observed: result?.observed ? { subject: reviewText(result.observed.subject), parts: reviewTexts(result.observed.parts), connections: reviewTexts(result.observed.connections) } : null,
        recognizable: typeof result?.recognizable === 'boolean' ? result.recognizable : null,
        features: Array.isArray(result?.features) ? result.features.map(feature => ({ essential: reviewText(feature?.essential), visible: typeof feature?.visible === 'boolean' ? feature.visible : null })) : null,
      }
      return result
    } catch (error) {
      call.outcome = options.signal?.aborted ? 'timeout' : error?.name === 'LLMParseError' ? 'invalid_json' : 'provider_error'
      throw error
    } finally { call.latencyMs = Math.round(performance.now() - began) }
  }
  const unavailableOffline = async () => { throw new Error('offline_provider_not_supplied') }
  const options = { chatText: measured(chatText ?? (live ? provider.sceneChatText : unavailableOffline), false),
    chatWithImage: measured(chatWithImage ?? (live ? provider.sceneChatWithImage : unavailableOffline), true),
    onPlanDiagnostics: diagnostics => row.planDiagnostics.push({ phase, ...diagnostics }) }
  const imageProvider = live ? await import('../src/services/niloImageGenerator.js') : null
  if (generateImage || imageProvider?.niloImageConfig().enabled) options.generateImage = async (...args) => {
    if (row.calls.length >= 48) throw new Error('evaluation_call_budget')
    const began = performance.now(), sequence = row.calls.length + 1, call = { phase, stage: 'nilo_scene_image', outcome: 'pending', latencyMs: null }
    row.calls.push(call)
    try {
      const raster = await (generateImage ?? imageProvider.generateNiloImage)(...args)
      call.outcome = 'generated'
      const object = args[0]
      call.image = { objectId: object.id, name: object.name, essential: [...object.essential], projection: raster.projection }
      // These are synthetic fixture diagnostics, not accepted output. Keep all
      // candidates, including rejected attempts, separate from the after image.
      // Never serialize provider options, headers, URLs or raster metadata.
      if (diagnosticDirectory) {
        const valid = validateGeneratedRaster(raster)
        if (!valid) call.candidateError = 'invalid_raster'
        else try {
          const filename = `${fixture.id.replace(/[^a-zA-Z0-9_-]/g, '_')}-candidate-${String(sequence).padStart(2, '0')}.png`
          await writeFile(resolve(diagnosticDirectory, filename), Buffer.from(valid.pngBase64, 'base64'))
          call.candidatePng = filename
        } catch { call.candidateError = 'artifact_write_failed' }
      }
      return raster
    } catch (error) { call.outcome = args[2]?.signal?.aborted ? 'timeout' : 'provider_error'; throw error }
    finally { call.latencyMs = Math.round(performance.now() - began) }
  }
  const context = openSceneContext(fixture), previous = fixture.previous ? previousOpenScene() : null
  const timed = async (name, operation) => {
    const began = performance.now()
    try { return await operation() } finally { row.phaseLatencyMs[name] = Math.round(performance.now() - began) }
  }
  try {
    if (previous) {
      row.before = await timed('setup', () => generateNiloScene({ stage: 'render', locale: fixture.locale, context, plan: previous }, options))
      if (row.before.status !== 'ready') {
        row.failureStage = 'setup'; row.failureCode = row.before.reason ?? 'setup_not_ready'; return row
      }
      context.previousScene = { plan: row.before.plan, objects: row.before.objects }
    }
    phase = 'plan'
    row.plan = await timed('plan', () => generateNiloScene({ stage: 'plan', utterance: fixture.utterance, locale: fixture.locale,
      context, ...(previous ? { plan: previous } : {}) }, options))
    if (row.plan.status !== 'proposed') {
      row.failureStage = row.calls.at(-1)?.stage === 'nilo_scene_quality' ? 'quality_review' : row.plan.metrics?.plans ? 'plan' : 'understanding'
      row.failureCode = row.plan.reason ?? 'plan_not_proposed'; return row
    }
    phase = 'render'
    row.result = await timed('render', () => generateNiloScene({ stage: 'render', utterance: fixture.utterance, locale: fixture.locale, context, plan: row.plan.plan }, options))
    if (row.result.status !== 'ready') {
      row.failureStage = row.result.reason === 'visual_mismatch' ? 'visual_review' : 'render'
      row.failureCode = row.result.reason ?? 'render_not_ready'; return row
    }
    phase = 'preview'
    if (!row.result.objects.every(object => placementFits(object.proposal, context.canvasAspect, context.canvasSize))) throw new Error('preview_geometry')
    row.previewSvg = await renderOpenSceneSvg(fixture, row.result)
    row.ready = true
    row.firstPassReady = !(row.plan.metrics?.repairs || row.result.metrics?.repairs)
  } catch {
    row.failureStage = phase; row.failureCode = phase === 'preview' ? 'preview_failed' : 'evaluation_error'
  } finally { row.latencyMs = Math.round(performance.now() - started) }
  return row
}

/** Portable browser preview using the exact shared vector sampler and shipped
 * PNG centerlines. Dense references keep the same pale-gray display policy. */
export async function renderOpenSceneSvg(fixture, result) {
  const width = 840, height = 600, aspect = width / height, pieces = [], childPieces = []
  const line = (points, color = '#9ca3af', dashed = true, thickness = 1.5) => `<polyline fill="none" stroke="${color}" stroke-width="${thickness}" stroke-linecap="round" stroke-linejoin="round"${dashed ? ' stroke-dasharray="5 4"' : ''} points="${points.map(p => `${number(p.x * width)},${number(p.y * height)}`).join(' ')}"/>`
  if (fixture.childDrawing) {
    const child = { template: 'boat', x: .32, y: .79, width: .23, height: .13, rotation: 0, color: '#23433b', strokeWidth: 3 }
    childPieces.push(...sampleProposalGeometry(child, aspect).map(stroke => line(stroke.points, '#23433b', false, 3)))
  }
  if (result?.status === 'ready') for (const { proposal: p } of result.objects) {
    if (p.template === 'generated' && p.raster?.projection === 'gray') {
      const raster = validateGeneratedRaster(p.raster)
      if (!raster) throw new Error('invalid_generated_raster')
      const boxWidth = Math.min(p.width * width, p.height * height * raster.width / raster.height), boxHeight = boxWidth * raster.height / raster.width
      const cx = (p.x + p.width / 2) * width, cy = (p.y + p.height / 2) * height
      pieces.push(`<image href="data:image/png;base64,${raster.pngBase64}" x="${cx - boxWidth / 2}" y="${cy - boxHeight / 2}" width="${boxWidth}" height="${boxHeight}" transform="rotate(${p.rotation} ${cx} ${cy})" filter="url(#gray)" opacity=".38" style="mix-blend-mode:multiply"/>`)
      continue
    }
    if (p.template === 'generated') {
      if (!validateGeneratedRaster(p.raster)) throw new Error('invalid_generated_raster')
      const paths = guidePaths(p, aspect)
      if (!paths.length) throw new Error('missing_generated_trace')
      pieces.push(...paths.map(points => line(points)))
      continue
    }
    if (p.template !== 'illustration') {
      const strokes = sampleProposalGeometry(p, aspect)
      if (!strokes.length) throw new Error('missing_vector_geometry')
      pieces.push(...strokes.map(stroke => line(stroke.points)))
      continue
    }
    const asset = getDrawingIllustration(p.illustrationId)
    if (!asset || !/^[a-zA-Z0-9_-]+$/.test(asset.id)) throw new Error('unknown_illustration')
    const trace = JSON.parse(await readFile(resolve(publicRoot, 'nilo-tracing', `${asset.id}.json`), 'utf8'))
    if (!Array.isArray(trace.paths) || !Number.isFinite(trace.aspect) || trace.aspect <= 0) throw new Error('invalid_trace')
    const boxWidth = Math.min(p.width * width, p.height * height * trace.aspect), boxHeight = boxWidth / trace.aspect
    const cx = (p.x + p.width / 2) * width, cy = (p.y + p.height / 2) * height
    if (trace.projection === 'gray') {
      const path = resolve(publicRoot, asset.src.replace(/^\/+/, ''))
      if (!path.startsWith(publicRoot.endsWith(sep) ? publicRoot : publicRoot + sep) || !path.endsWith('.png')) throw new Error('invalid_asset_path')
      const bytes = await readFile(path)
      pieces.push(`<image href="data:image/png;base64,${bytes.toString('base64')}" x="${cx - boxWidth / 2}" y="${cy - boxHeight / 2}" width="${boxWidth}" height="${boxHeight}" transform="rotate(${p.rotation} ${cx} ${cy})" filter="url(#gray)" opacity=".38" style="mix-blend-mode:multiply"/>`)
    } else {
      const angle = p.rotation * Math.PI / 180, cosine = Math.cos(angle), sine = Math.sin(angle)
      pieces.push(...trace.paths.map(path => line(path.map(([x, y]) => {
        const dx = (x - .5) * boxWidth, dy = (y - .5) * boxHeight
        return { x: (cx + dx * cosine - dy * sine) / width, y: (cy + dx * sine + dy * cosine) / height }
      }))))
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><title>${escape(fixture.utterance)}</title><defs><filter id="gray"><feColorMatrix type="saturate" values="0"/></filter></defs><rect width="840" height="600" fill="white"/>${pieces.join('')}${childPieces.join('')}</svg>`
}

/** Same local PNG rasterizer as the earlier scene smoke test, with original
 * child strokes kept solid above the dashed / dense-gray temporary guide. */
export function renderOpenScenePng(fixture, result) {
  const childProposals = fixture.childDrawing ? [{ template: 'boat', x: .32, y: .79, width: .23, height: .13,
    rotation: 0, color: '#23433b', strokeWidth: 3 }] : []
  return rasterGuide(result?.status === 'ready' ? result.objects.map(object => object.proposal) : [], { childProposals })
}

async function savePreviewImages(out, fixture, row) {
  for (const [suffix, result] of [['before', row.before], ['after', row.result]]) {
    await writeFile(resolve(out, `${fixture.id}-${suffix}.svg`), await renderOpenSceneSvg(fixture, result))
    await writeFile(resolve(out, `${fixture.id}-${suffix}.png`), renderOpenScenePng(fixture, result))
  }
}

export async function previewOpenSceneRun(runDirectory, selectedCases = openSceneCases) {
  const out = resolve(runDirectory)
  const records = JSON.parse(await readFile(resolve(out, 'records.json'), 'utf8'))
  if (!Array.isArray(records)) throw new Error('Invalid saved scene records')
  const selected = new Set(selectedCases.map(fixture => fixture.id))
  const rows = records.filter(row => selected.has(row.case))
  if (!rows.length) throw new Error('No saved cases match the preview selection')
  for (const row of rows) {
    const fixture = selectedCases.find(item => item.id === row.case)
    // A known fixture ID supplies every filename. Saved model text is never a
    // path. This command only regenerates images and the gallery, not results.
    await savePreviewImages(out, fixture, row)
  }
  await writeFile(resolve(out, 'gallery.html'), gallery(records))
  process.stdout.write(`Saved results previewed without model calls: ${resolve(out, 'gallery.html')}\n`)
  return { out, records, previewed: rows.map(row => row.case) }
}

export function openSceneReport(records, meta = {}) {
  const live = records.filter(row => row.executed && row.mode === 'live_provider'), completed = live.filter(row => row.ready), failures = {}
  for (const row of live.filter(row => !row.ready)) {
    const key = `${row.failureStage ?? 'unknown'}:${row.failureCode ?? 'unknown'}`
    failures[key] = (failures[key] ?? 0) + 1
  }
  const stageTimes = rows => rows.map(row => row.phaseLatencyMs?.render).filter(Number.isFinite)
  const complex = row => row.result?.plan?.objects?.some(object => !['illustration', 'recipe', 'compose'].includes(object.render?.kind))
    || row.result?.metrics?.imageCalls > 0 || row.result?.metrics?.customCalls > 0
  const planning = live.map(row => row.phaseLatencyMs?.plan).filter(Number.isFinite), simple = stageTimes(live.filter(row => !complex(row))), generated = stageTimes(live.filter(complex))
  return { ...meta, total: records.length, executedLive: live.length, syntheticRuns: records.filter(row => row.mode === 'synthetic_provider' && row.executed).length,
    notRun: records.filter(row => !row.executed).length, usableAfterOneRequest: live.length ? completed.length : null,
    usableWithoutRepair: live.length ? completed.filter(row => row.firstPassReady).length : null,
    usableRate: live.length ? completed.length / live.length : null, failures,
    latencyP50Ms: percentile(live.map(row => row.latencyMs), .5), latencyP95Ms: percentile(live.map(row => row.latencyMs), .95),
    stageLatencies: { planning: { count: planning.length, p50Ms: percentile(planning, .5), p95Ms: percentile(planning, .95) },
      simpleRender: { count: simple.length, p50Ms: percentile(simple, .5), p95Ms: percentile(simple, .95) },
      complexRender: { count: generated.length, p50Ms: percentile(generated, .5), p95Ms: percentile(generated, .95), maxMs: generated.length ? Math.max(...generated) : null },
      childConfirmationPauseIncluded: false },
    semanticPasses: null, notes: [
      'Offline preparation and injected-provider unit tests are not real-model measurements.',
      'One plan/render transaction per case; production internal bounded repairs are counted, with no best-of-N retry.',
      'Candidate PNGs are diagnostics for every generated attempt, including rejected images; only the production ready result supplies the after preview and usable count.',
      'Usable means the production pipeline produced complete in-bounds renderable geometry; it does not prove semantic or artistic quality.',
      'Review the saved before/after previews and checklist independently, recording whether the reviewer is an adult or an assistant. Semantic pass counts stay null in this automatic report.',
      'Synthetic text only: microphone recognition, real children, device rendering and user satisfaction are not measured.',
    ] }
}

function gallery(records) {
  return `<!doctype html><html lang="zh"><meta charset="utf-8"><title>Nilo 开放场景评测</title><style>body{font:16px system-ui;background:#f3f6f2;color:#23433b;max-width:1280px;margin:24px auto;padding:0 16px}article{background:white;padding:20px;margin:24px 0;border-radius:14px}.previews{display:grid;grid-template-columns:1fr 1fr;gap:16px}img{width:100%;border:1px solid #dbe6dd}small{color:#677a70}p{line-height:1.6}li{margin:.4em 0}</style><h1>Nilo 开放场景评测</h1><p>可渲染不等于理解正确。请检查物体身份、空间关系、否定要求、画风、留白和修改保留。离线页面未调用模型。</p>${records.map(row => `<article><h2>${escape(row.utterance)}</h2><small>${escape(row.case)} · ${escape(row.mode)} · ${row.executed ? `${row.latencyMs} ms · ${row.ready ? '可渲染，待人工评审' : escape(`${row.failureStage}: ${row.failureCode}`)}` : '未运行'}</small><div class="previews"><div><p>原画 / 修改前</p><img src="${row.case}-before.png" alt="原画"></div><div><p>新底图</p><img src="${row.case}-after.png" alt="${row.ready ? '生成的底图' : '尚无可用成图'}"></div></div><p>${escape(row.plan?.plan?.summary ?? row.plan?.reply ?? '尚无模型构思')}</p><ul>${row.checklist.map(check => `<li>${escape(check)}</li>`).join('')}</ul><a href="${row.case}.json">计划、结果和阶段耗时</a></article>`).join('')}</html>`
}

export async function main(args = process.argv.slice(2)) {
  const options = openSceneOptions(args)
  if (options.preview) return previewOpenSceneRun(options.preview, options.cases)
  // Loading .env is intentionally live-only; offline preparation never discovers
  // credentials and never imports a provider as a side effect.
  let model = null
  if (options.live) {
    try { process.loadEnvFile(new URL('../.env', import.meta.url)) } catch { /* Environment variables also work. */ }
    const { niloSceneModelConfig } = await import('../src/services/niloSceneModels.js'), config = niloSceneModelConfig()
    const { niloImageConfig } = await import('../src/services/niloImageGenerator.js'), image = niloImageConfig()
    if (!config.apiKey) throw new Error('No configured model credential; no calls sent')
    model = { text: config.textModel, understanding: config.understandingModel ?? config.textModel, vision: config.visionModel,
      observation: config.observationModel ?? config.visionModel, image: image.enabled ? image.model : null, imageEnabled: image.enabled }
  }
  const runId = new Date().toISOString().replace(/[:.]/g, '-'), out = resolve(options.out, runId)
  await mkdir(out, { recursive: true })
  const sourceFingerprint = await sceneSourceFingerprint()
  const meta = { runId, suite: options.suite, fixtureVersion: options.fixtureVersion, fixtureHash: options.fixtureHash, live: options.live, model, sourceFingerprint,
    sourceFingerprintAfter: null, holdoutExposure: null,
    selectedCases: options.cases.map(fixture => fixture.id), maxProviderCallsPerCase: 48, attemptsPerCase: 1 }
  const records = options.cases.map(fixture => pendingRecord(fixture)), review = records.map(row => ({ case: row.case, passed: null, reviewer: '', notes: '', checklist: row.checklist }))
  await writeFile(resolve(out, 'manifest.json'), JSON.stringify({ ...meta, fixtures: options.cases }, null, 2))
  await writeFile(resolve(out, 'review.json'), JSON.stringify(review, null, 2))
  const persist = async () => {
    const saved = records.map(({ previewSvg, ...row }) => row)
    await writeFile(resolve(out, 'records.json'), JSON.stringify(saved, null, 2))
    await writeFile(resolve(out, 'report.json'), JSON.stringify(openSceneReport(records, meta), null, 2))
    await writeFile(resolve(out, 'gallery.html'), gallery(records))
  }
  for (const fixture of options.cases) {
    await savePreviewImages(out, fixture, {})
    await writeFile(resolve(out, `${fixture.id}.json`), JSON.stringify(records.find(row => row.case === fixture.id), null, 2))
  }
  await persist()
  if (options.live && options.suite === 'holdout') {
    meta.holdoutExposure = await recordHoldoutExposure(meta)
    await writeFile(resolve(out, 'manifest.json'), JSON.stringify({ ...meta, fixtures: options.cases }, null, 2))
  }
  const originalFetch = globalThis.fetch, budget = evaluationBudget(originalFetch, options)
  if (options.live) globalThis.fetch = budget.fetch
  meta.apiUsage = budget.usage
  try { if (options.live) for (const [index, fixture] of options.cases.entries()) {
    if (budget.usage.apiCalls >= options.maxApiCalls || budget.usage.blockedCalls) break
    records[index] = await evaluateOpenScene(fixture, { live: true, diagnosticDirectory: out })
    const { previewSvg, ...row } = records[index]
    await writeFile(resolve(out, `${fixture.id}.json`), JSON.stringify(row, null, 2))
    await savePreviewImages(out, fixture, row)
    await persist()
    process.stdout.write(`${index + 1}/${records.length} ${row.case}: ${row.ready ? 'renderable_pending_review' : row.failureCode}, ${row.latencyMs} ms\n`)
  } } finally { if (options.live) globalThis.fetch = originalFetch }
  meta.sourceFingerprintAfter = await sceneSourceFingerprint()
  await writeFile(resolve(out, 'manifest.json'), JSON.stringify({ ...meta, fixtures: options.cases }, null, 2))
  await persist()
  process.stdout.write(`Evaluation ${options.live ? 'completed' : 'prepared offline'}: ${resolve(out, 'gallery.html')}\n`)
  return { out, records, report: openSceneReport(records, meta) }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(() => { process.stderr.write('Evaluation could not finish. Inspect saved records; provider error details are withheld.\n'); process.exitCode = 1 })
}
