import { afterEach, expect, test, vi } from 'vitest'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { PNG } from 'pngjs'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { evaluateOpenScene, main, openSceneOptions, openSceneReport, renderOpenScenePng, renderOpenSceneSvg } from '../scripts/eval-nilo-open-scenes.mjs'
import { openSceneCases, openSceneHash, previousOpenScene } from '../scripts/fixtures/niloOpenScenes.mjs'
import { sanitizeScenePlan } from '../../shared/niloSceneDrawing.mjs'
import * as sceneModels from '../src/services/niloSceneModels.js'
import * as imageModels from '../src/services/niloImageGenerator.js'

const temporary = []
afterEach(async () => {
  vi.restoreAllMocks()
  for (const path of temporary.splice(0)) {
    if (!resolve(path).startsWith(resolve(tmpdir()) + sep)) throw new Error('Test cleanup escaped temporary directory')
    await rm(path, { recursive: true, force: true })
  }
})

test('fixed cases span unseen settings, relations, feelings, exclusions, references and modification', () => {
  expect(openSceneCases).toHaveLength(24)
  expect(new Set(openSceneCases.map(fixture => fixture.id)).size).toBe(24)
  expect(openSceneHash).toMatch(/^[a-f0-9]{64}$/)
  expect(openSceneCases.map(fixture => fixture.group)).toEqual(expect.arrayContaining(['open_place', 'relationship', 'abstract_mood', 'negation', 'modification', 'preservation']))
  expect(openSceneCases.every(fixture => fixture.checklist.length >= 2 && fixture.utterance.length <= 600)).toBe(true)
  expect(sanitizeScenePlan(previousOpenScene())).not.toBeNull()
})

test('live evaluation is explicit and bounded, with reproducible single-case/offset selection', () => {
  expect(openSceneOptions()).toMatchObject({ live: false, limit: 24, offset: 0 })
  expect(openSceneOptions(['--live'])).toMatchObject({ live: true, limit: 1, maxApiCalls: 8, maxImageCalls: 2 })
  expect(openSceneOptions(['--live', '--case=whale_town']).cases.map(fixture => fixture.id)).toEqual(['whale_town'])
  expect(openSceneOptions(['--limit=2', '--offset=3']).cases).toEqual(openSceneCases.slice(3, 5))
  expect(openSceneOptions(['--preview=existing-run'])).toMatchObject({ live: false, preview: 'existing-run' })
  for (const args of [['--limit=0'], ['--limit=25'], ['--limit=1.5'], ['--offset=-1'], ['--offset=24'], ['--case=unknown'], ['--case=magic_world', '--offset=1'], ['--retry'], ['--limit=2', '--limit=3'], ['--preview='], ['--preview=run', '--live'], ['--preview=run', '--out=other']]) {
    expect(() => openSceneOptions(args)).toThrow()
  }
})

test('offline run prepares every artifact without reading credentials or making network requests', async () => {
  const root = await mkdtemp(join(tmpdir(), 'nilo-open-eval-')); temporary.push(root)
  const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network forbidden'))
  const load = vi.spyOn(process, 'loadEnvFile').mockImplementation(() => { throw new Error('secret access forbidden') })
  vi.spyOn(process.stdout, 'write').mockReturnValue(true)
  const run = await main([`--out=${root}`])
  expect(fetch).not.toHaveBeenCalled(); expect(load).not.toHaveBeenCalled()
  expect(run.report).toMatchObject({ executedLive: 0, syntheticRuns: 0, notRun: 24, usableAfterOneRequest: null, semanticPasses: null })
  const files = await readdir(run.out)
  expect(files).toEqual(expect.arrayContaining(['manifest.json', 'records.json', 'report.json', 'gallery.html', 'review.json']))
  for (const fixture of openSceneCases) expect(files).toEqual(expect.arrayContaining([`${fixture.id}.json`, `${fixture.id}-before.svg`, `${fixture.id}-after.svg`, `${fixture.id}-before.png`, `${fixture.id}-after.png`]))
  const json = JSON.parse(await readFile(join(run.out, 'magic_world.json'), 'utf8'))
  expect(json).toMatchObject({ executed: false, mode: 'offline_preparation', plan: null, result: null })
  expect(await readFile(join(run.out, 'gallery.html'), 'utf8')).toContain('离线页面未调用模型')
}, 15000)

test('no-provider fixture execution stays offline even when a credential exists in the environment', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network forbidden'))
  expect(await evaluateOpenScene(openSceneCases[0])).toMatchObject({ executed: false, plan: null, result: null })
  expect(fetch).not.toHaveBeenCalled()
})

test('provider errors retain their stage and latency without saving secret-bearing messages', async () => {
  const chatText = vi.fn(async () => { throw new Error('Authorization: Bearer private-test-secret') })
  const row = await evaluateOpenScene(openSceneCases[0], { chatText })
  expect(row).toMatchObject({ mode: 'synthetic_provider', executed: true, ready: false, failureStage: 'understanding', failureCode: 'provider_error' })
  expect(row.calls[0]).toMatchObject({ phase: 'plan', stage: 'nilo_scene_understand', outcome: 'provider_error' })
  expect(row.latencyMs).toBeGreaterThanOrEqual(0)
  expect(JSON.stringify(row)).not.toContain('private-test-secret')
  expect(openSceneReport([row])).toMatchObject({ executedLive: 0, syntheticRuns: 1, usableRate: null, semanticPasses: null })
})

test('injected-provider integration really plans, compiles a registered PNG and saves drawable paths', async () => {
  const fixture = { ...openSceneCases[0], utterance: '画一只小兔子' }
  const plan = { version: 1, title: '小兔子', summary: '一只小兔子。', request: fixture.utterance, preserve: [], objects: [
    { id: 'rabbit', name: '小兔子', aliases: ['兔子'], role: 'main', essential: ['小兔子'], color: '#66729b',
      render: { kind: 'illustration', illustrationId: 'illustration-library-rabbit-beginner-01' },
      box: { x: .2, y: .2, width: .5, height: .5 } },
  ] }
  const chatText = vi.fn(async (_prompt, options) => options.kind === 'nilo_scene_understand'
    ? { brief: { version: 1, intent: fixture.utterance, setting: '', mood: [], reference: [], requiredSubjects: ['小兔子'],
      excludedSubjects: [], referenceOnlySubjects: [], motifs: [], relationships: [] } }
    : options.kind === 'nilo_scene_quality' ? { accepted: true, issues: [] } : { plan })
  const chatWithImage = vi.fn(async (_image, _prompt, options) => {
    expect(options.kind).toBe('nilo_scene_quality')
    return { accepted: true, issues: [] }
  })
  const row = await evaluateOpenScene(fixture, { chatText, chatWithImage })
  expect(row).toMatchObject({ mode: 'synthetic_provider', executed: true, ready: true, firstPassReady: true, failureStage: null, failureCode: null })
  expect(row.plan.status).toBe('proposed'); expect(row.result.status).toBe('ready')
  expect(row.calls.find(call => call.stage === 'nilo_scene_plan').plan).toEqual(plan)
  expect(row.planDiagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ phase: 'plan', issues: [] })]))
  expect(row.result.objects[0].proposal.illustrationId).toBe('illustration-library-rabbit-beginner-01')
  expect(row.previewSvg).toContain('stroke-dasharray="5 4"')
  expect(row.previewSvg).not.toContain('NaN')
  expect(openSceneReport([row])).toMatchObject({ syntheticRuns: 1, executedLive: 0, usableAfterOneRequest: null })
})

test('report keeps failures in the live denominator and separates repair-free from usable results', () => {
  const records = [
    { mode: 'live_provider', executed: true, ready: true, firstPassReady: true, latencyMs: 100 },
    { mode: 'live_provider', executed: true, ready: true, firstPassReady: false, latencyMs: 300 },
    { mode: 'live_provider', executed: true, ready: false, failureStage: 'render', failureCode: 'timeout', latencyMs: 500 },
    { mode: 'synthetic_provider', executed: true, ready: true, firstPassReady: true, latencyMs: 1 },
    { mode: 'offline_preparation', executed: false, ready: false },
  ]
  expect(openSceneReport(records)).toMatchObject({ total: 5, executedLive: 3, syntheticRuns: 1, notRun: 1,
    usableAfterOneRequest: 2, usableWithoutRepair: 1, usableRate: 2 / 3, latencyP50Ms: 300, latencyP95Ms: 500,
    failures: { 'render:timeout': 1 }, semanticPasses: null })
})

test('preview preserves child ink and escapes all model-supplied text', async () => {
  const svg = await renderOpenSceneSvg({ ...openSceneCases.find(fixture => fixture.childDrawing), utterance: '<script>alert(1)</script>' }, null)
  expect(svg).toContain('stroke="#23433b"')
  expect(svg).toContain('&lt;script&gt;')
  expect(svg).not.toContain('<script>')
  expect(svg).not.toContain('stroke-dasharray')
})

test('saved-result preview writes PNGs without changing evaluation records or contacting a provider', async () => {
  const root = await mkdtemp(join(tmpdir(), 'nilo-open-preview-')); temporary.push(root)
  const fixture = openSceneCases[0]
  const result = { status: 'ready', objects: [{ proposal: { template: 'illustration', illustrationId: 'illustration-library-rabbit-beginner-01',
    x: .2, y: .2, width: .5, height: .5, rotation: 0, color: '#66729b', strokeWidth: 3 } }] }
  const records = JSON.stringify([{ case: fixture.id, utterance: fixture.utterance, checklist: fixture.checklist,
    executed: true, mode: 'live_provider', ready: true, latencyMs: 2345, before: null, plan: null, result }])
  await writeFile(join(root, 'records.json'), records)
  await writeFile(join(root, 'report.json'), '{"untouched":true}')
  const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network forbidden'))
  const load = vi.spyOn(process, 'loadEnvFile').mockImplementation(() => { throw new Error('secret access forbidden') })
  vi.spyOn(process.stdout, 'write').mockReturnValue(true)
  expect(await main([`--preview=${root}`])).toMatchObject({ out: root, previewed: ['magic_world'] })
  expect(await readFile(join(root, 'records.json'), 'utf8')).toBe(records)
  expect(await readFile(join(root, 'report.json'), 'utf8')).toBe('{"untouched":true}')
  const png = PNG.sync.read(await readFile(join(root, 'magic_world-after.png')))
  expect([png.width, png.height]).toEqual([840, 600])
  expect(png.data.some((value, index) => index % 4 !== 3 && value < 220)).toBe(true)
  expect(await readFile(join(root, 'gallery.html'), 'utf8')).toContain('magic_world-after.png')
  expect(fetch).not.toHaveBeenCalled(); expect(load).not.toHaveBeenCalled()
})

test('dense guides rasterize to pale gray while preserved child strokes keep their color', () => {
  const fixture = openSceneCases.find(item => item.childDrawing)
  const result = { status: 'ready', objects: [{ proposal: { template: 'illustration', illustrationId: 'illustration-bookshop',
    x: .2, y: .05, width: .5, height: .6, rotation: 12, color: '#66729b', strokeWidth: 3 } }] }
  const png = PNG.sync.read(renderOpenScenePng(fixture, result)), gray = [], ink = []
  for (let index = 0; index < png.data.length; index += 4) {
    const [red, green, blue] = png.data.subarray(index, index + 3)
    if (red === green && green === blue && red < 240) gray.push(red)
    if (red < 100 && green > red && green > blue) ink.push(red)
  }
  expect(gray.length).toBeGreaterThan(500)
  expect(Math.min(...gray)).toBeGreaterThanOrEqual(155)
  expect(ink.length).toBeGreaterThan(100)
})

test('default live evaluation uses the dedicated scene provider functions, without exposing credentials', async () => {
  vi.spyOn(sceneModels, 'niloSceneModelConfig').mockReturnValue({ apiKey: 'synthetic-credential', textModel: 'scene-text', visionModel: 'scene-vision' })
  vi.spyOn(imageModels, 'niloImageConfig').mockReturnValue({ enabled: false })
  const fixture = { ...openSceneCases[0], utterance: '画一只小兔子' }
  const scene = { version: 1, title: '兔子', summary: '一只小兔子。', request: fixture.utterance, preserve: [], objects: [
    { id: 'rabbit', name: '小兔子', aliases: ['兔子'], role: 'main', essential: ['小兔子'], color: '#66729b',
      render: { kind: 'illustration', illustrationId: 'illustration-library-rabbit-beginner-01' }, box: { x: .2, y: .2, width: .5, height: .5 } },
  ] }
  const text = vi.spyOn(sceneModels, 'sceneChatText').mockResolvedValue({ plan: scene })
  const vision = vi.spyOn(sceneModels, 'sceneChatWithImage').mockRejectedValue(new Error('unexpected vision call'))
  const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network forbidden'))
  const row = await evaluateOpenScene(fixture, { live: true })
  expect(row.ready).toBe(true)
  expect(text).toHaveBeenCalledOnce(); expect(vision).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled()
  expect(row.phaseLatencyMs.plan).toBeGreaterThanOrEqual(0)
  expect(row.phaseLatencyMs.render).toBeGreaterThanOrEqual(0)
  expect(JSON.stringify(row)).not.toContain('synthetic-credential')
})

test('generated self-contained PNGs keep their gray or dashed projection in both exported preview formats', async () => {
  const source = new PNG({ width: 40, height: 40 }); source.data.fill(255)
  for (let y = 5; y <= 34; y++) for (let x = 5; x <= 34; x++) if (x === 5 || x === 34 || y === 5 || y === 34) {
    const i = (y * source.width + x) * 4; source.data[i] = source.data[i + 1] = source.data[i + 2] = 0
  }
  const raster = { version: 1, pngBase64: PNG.sync.write(source).toString('base64'), width: 40, height: 40, projection: 'gray' }
  const proposal = { template: 'generated', raster, x: .1, y: .1, width: .4, height: .4, rotation: 25, color: '#66729b', strokeWidth: 3 }
  const fixture = openSceneCases.find(item => item.childDrawing), result = { status: 'ready', objects: [{ proposal }] }
  const gray = await renderOpenSceneSvg(fixture, result)
  expect(gray).toContain('data:image/png;base64,')
  expect(gray).toContain('opacity=".38"')
  expect(gray).toContain('rotate(25 ')
  expect(gray.lastIndexOf('stroke="#23433b"')).toBeGreaterThan(gray.indexOf('<image '))
  const png = PNG.sync.read(renderOpenScenePng(openSceneCases[0], result))
  const grayPixels = []
  for (let i = 0; i < png.data.length; i += 4) if (png.data[i] < 240) grayPixels.push(png.data[i])
  expect(grayPixels.length).toBeGreaterThan(100)
  expect(Math.min(...grayPixels)).toBeGreaterThanOrEqual(155)
  const dashedResult = { ...result, objects: [{ proposal: { ...proposal, raster: { ...raster, projection: 'dashed', paths: [[[.1, .1], [.9, .1], [.9, .9], [.1, .9], [.1, .1]]] } } }] }
  const dashed = await renderOpenSceneSvg(openSceneCases[0], dashedResult)
  expect(dashed).toContain('stroke-dasharray')
  expect(dashed).not.toContain('<image ')
  expect(PNG.sync.read(renderOpenScenePng(openSceneCases[0], dashedResult)).data.some((value, i) => i % 4 !== 3 && value < 220)).toBe(true)
})

test('neutral observation and final rejection retain both generated attempts without becoming accepted output', async () => {
  const root = await mkdtemp(join(tmpdir(), 'nilo-open-candidates-')); temporary.push(root)
  const fixture = { ...openSceneCases[0], utterance: '画一只戴墨镜的小兔子' }
  const plan = { version: 1, title: '戴墨镜的小兔子', summary: '一只戴墨镜的小兔子。', request: fixture.utterance, preserve: [], objects: [
    { id: 'rabbit', name: '戴墨镜的小兔子', aliases: ['兔子'], role: 'main', essential: ['戴墨镜的小兔子'], color: '#66729b',
      render: { kind: 'generated' }, box: { x: .2, y: .2, width: .5, height: .5 } },
  ] }
  const rasters = [6, 12].map(left => {
    const source = new PNG({ width: 40, height: 40 }); source.data.fill(255)
    for (let y = 5; y < 35; y++) for (let x = left; x < left + 3; x++) {
      const i = (y * source.width + x) * 4
      source.data[i] = source.data[i + 1] = source.data[i + 2] = 0
    }
    return { version: 1, pngBase64: PNG.sync.write(source).toString('base64'), width: 40, height: 40, projection: 'gray' }
  })
  const generateImage = vi.fn().mockResolvedValueOnce(rasters[0]).mockResolvedValueOnce(rasters[1])
  const observation = { subject: 'a vertical black bar', parts: ['one rectangle'], connections: [],
    orientation: 'long sides vertical, flat top above flat base', uncertain: ['No animal identity is visible'] }
  const missing = 'Only a rectangular bar is visible; the requested rabbit head and ears are missing.'
  const chatText = vi.fn(async (_prompt, options) => {
    if (options.kind === 'nilo_scene_understand') return { brief: { version: 1, intent: fixture.utterance, setting: '', mood: [],
      reference: [], requiredSubjects: ['戴墨镜的小兔子'], preservedSubjects: [], excludedSubjects: [], referenceOnlySubjects: [], motifs: [], relationships: [] } }
    if (options.kind === 'nilo_scene_plan') return { plan }
    if (options.kind === 'nilo_scene_quality') return { accepted: true, issues: [] }
    throw new Error(`Unexpected text stage ${options.kind}`)
  })
  const chatWithImage = vi.fn(async (_image, prompt, options) => {
    if (options.kind === 'nilo_scene_observe') {
      expect(prompt).not.toContain('小兔子')
      return observation
    }
    expect(options.kind).toBe('nilo_scene_quality')
    expect(prompt).toContain(observation.subject)
    return { accepted: false, issues: [missing] }
  })
  const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network forbidden'))
  const row = await evaluateOpenScene(fixture, { chatText, chatWithImage, generateImage, diagnosticDirectory: root })
  expect(row).toMatchObject({ mode: 'synthetic_provider', ready: false, firstPassReady: false, failureStage: 'visual_review', failureCode: 'visual_mismatch' })
  expect(row.result).not.toHaveProperty('objects')
  const images = row.calls.filter(call => call.stage === 'nilo_scene_image')
  expect(images).toHaveLength(2)
  expect(images[0].candidatePng).not.toBe(images[1].candidatePng)
  for (const [index, call] of images.entries()) {
    expect(call.image).toEqual({ objectId: 'rabbit', name: '戴墨镜的小兔子', essential: row.plan.plan.objects[0].essential, projection: 'gray' })
    expect(call.candidatePng).toMatch(/^magic_world-candidate-\d+\.png$/)
    expect(await readFile(join(root, call.candidatePng))).toEqual(Buffer.from(rasters[index].pngBase64, 'base64'))
    expect(PNG.sync.read(await readFile(join(root, call.candidatePng))).width).toBe(40)
  }
  expect(row.calls.filter(call => call.phase === 'render').map(call => call.stage)).toEqual([
    'nilo_scene_image', 'nilo_scene_observe', 'nilo_scene_quality', 'nilo_scene_image', 'nilo_scene_observe', 'nilo_scene_quality',
  ])
  expect(row.calls.filter(call => call.stage === 'nilo_scene_observe').map(call => call.observation)).toEqual([observation, observation])
  expect(row.calls.filter(call => call.phase === 'render' && call.stage === 'nilo_scene_quality').map(call => call.quality))
    .toEqual([{ accepted: false, issues: [missing] }, { accepted: false, issues: [missing] }])
  expect(generateImage).toHaveBeenCalledTimes(2)
  expect(generateImage.mock.calls[1][2].missing).toEqual([missing])
  expect(JSON.stringify(row)).not.toMatch(/pngBase64|Authorization|apiKey/)
  expect(PNG.sync.read(renderOpenScenePng(fixture, row.result)).data.every(value => value === 255)).toBe(true)
  expect(openSceneReport([{ ...row, mode: 'live_provider' }])).toMatchObject({ usableAfterOneRequest: 0, usableWithoutRepair: 0, semanticPasses: null })
  expect(fetch).not.toHaveBeenCalled()
})
