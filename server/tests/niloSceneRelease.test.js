import { afterEach, expect, test, vi } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import policy from '../scripts/fixtures/niloSceneReleasePolicy.json' with { type: 'json' }
import { openSceneCases, openSceneHash, previousOpenScene } from '../scripts/fixtures/niloOpenScenes.mjs'
import { holdoutSceneCases, holdoutSceneHash } from '../scripts/fixtures/niloOpenScenesHoldout.mjs'
import { checkRelease, loadReleaseRun, unchangedSceneIssues } from '../scripts/check-nilo-release.mjs'
import { canonical, recordHoldoutExposure, sceneCaseEvidenceHash, sha256 } from '../scripts/nilo-scene-evidence.mjs'
import { openSceneOptions, renderOpenScenePng } from '../scripts/eval-nilo-open-scenes.mjs'

const temporary = []
afterEach(async () => {
  vi.restoreAllMocks()
  for (const path of temporary.splice(0)) {
    if (!resolve(path).startsWith(resolve(tmpdir()) + sep)) throw new Error('Unsafe temporary cleanup')
    await rm(path, { recursive: true, force: true })
  }
})

// Checker-only synthetic input. Never written as live model measurements.
const source = 'a'.repeat(64)
function acceptanceFixture() {
  const runs = [['regression', openSceneCases, openSceneHash], ['holdout', holdoutSceneCases, holdoutSceneHash]].map(([suite, cases, hash]) => ({
    suite, manifest: { live: true, suite, runId: suite, fixtureHash: hash, attemptsPerCase: 1,
      selectedCases: cases.map(fixture => fixture.id), sourceFingerprint: source, sourceFingerprintAfter: source,
      model: { text: 'synthetic-checker-fixture', vision: 'synthetic-checker-fixture', image: null },
      ...(suite === 'holdout' ? { holdoutExposure: { status: 'first_exposure', firstRunId: suite, runNumber: 1 } } : {}) },
    records: cases.map(fixture => ({ case: fixture.id, utterance: fixture.utterance, mode: 'live_provider', executed: true, ready: true,
      failureCode: null, failureStage: null, phaseLatencyMs: { plan: 1000, render: 100 }, latencyMs: 999999,
      plan: { status: 'proposed' }, result: { status: 'ready', plan: { objects: [{ render: { kind: 'illustration' } }] }, objects: [{}], metrics: {} } })),
    evidence: Object.fromEntries(cases.map(fixture => [fixture.id, { hash: sha256(fixture.id), issues: [] }])) }))
  const reviews = [{ version: 1, reviewer: { id: 'synthetic-independent-reviewer', kind: 'independent_assistant', independentOfGeneration: true },
    reviews: [...openSceneCases, ...holdoutSceneCases].map(fixture => ({ case: fixture.id, artifactHash: sha256(fixture.id),
      verdict: 'pass', imageInspected: true, dimensions: Object.fromEntries(policy.requiredDimensions.map(key => [key, { verdict: 'pass', evidence: 'Synthetic checker evidence, not a real picture review.' }])) })) }]
  return { runs, reviews, currentSourceFingerprint: source }
}

test('reserved suite contains eight unique cases without changing the fixed regression requests', () => {
  expect(holdoutSceneCases).toHaveLength(8)
  expect(new Set([...openSceneCases, ...holdoutSceneCases].map(fixture => fixture.id)).size).toBe(32)
  expect(holdoutSceneHash).toMatch(/^[a-f0-9]{64}$/)
  expect(holdoutSceneCases.map(fixture => fixture.group)).toEqual(['open_place', 'material_world', 'connection', 'containment', 'abstract_mood', 'negation', 'preservation', 'modification'])
  expect(openSceneOptions(['--suite=holdout'])).toMatchObject({ suite: 'holdout', live: false, limit: 8 })
  expect(openSceneOptions(['--suite=holdout', '--live', '--limit=8']).cases).toHaveLength(8)
  expect(() => openSceneOptions(['--suite=holdout', '--limit=9'])).toThrow()
  expect(() => openSceneOptions(['--suite=unlisted'])).toThrow()
})

test('technical pass requires all 32 bound independent reviews and never claims child satisfaction or includes confirmation pause', () => {
  const report = checkRelease(acceptanceFixture())
  expect(report).toMatchObject({ decision: 'PASS', total: 32, ready: 32, independentlyPassed: 32,
    childSatisfaction: { status: 'not_measured' }, timing: { planningP95Ms: 1000, simpleRenderP95Ms: 100, childConfirmationPauseIncluded: false } })
})

test('ready alone, partial judgments, automatic reviewers, missing cases and stale artifacts cannot release', () => {
  for (const mutate of [
    value => { value.reviews = [] },
    value => { value.reviews[0].reviews[0].verdict = 'partial' },
    value => { value.reviews[0].reviews[0].dimensions.originalIntent.verdict = 'fail' },
    value => { value.reviews[0].reviews[0].imageInspected = false },
    value => { value.reviews[0].reviewer.kind = 'production_quality_model' },
    value => { value.reviews[0].reviewer.independentOfGeneration = false },
    value => { value.reviews[0].reviews[0].artifactHash = 'outdated' },
    value => { value.runs[0].records[0].mode = 'synthetic_provider' },
    value => { value.runs[0].records[0].ready = false },
    value => { value.runs[0].records.pop() },
    value => { value.runs[0].manifest.sourceFingerprintAfter = 'b'.repeat(64) },
    value => { value.runs[1].manifest.holdoutExposure.status = 'seen_do_not_claim_blind' },
    value => { value.runs[1].manifest.model.image = 'different-config' },
    value => { value.runs[0].evidence.magic_world.issues = ['empty_or_unreadable_guide'] },
  ]) {
    const input = acceptanceFixture(); mutate(input)
    expect(checkRelease(input).decision).toBe('BLOCKED')
  }
})

test('timing is measured separately before/after confirmation and complex generation blocks until policy is finalized', () => {
  const input = acceptanceFixture()
  input.runs[0].records[0].result.plan.objects[0].render.kind = 'generated'
  input.runs[0].records[0].phaseLatencyMs.render = 12800
  const pending = { ...policy, timing: { ...policy.timing, complexRenderP95Ms: null } }
  expect(checkRelease({ ...input, releasePolicy: pending }).blockers).toContainEqual({ code: 'timing_threshold_not_finalized:complexRenderP95Ms' })
  const finalized = { ...policy, version: 'synthetic-measured-policy', timing: { ...policy.timing, complexRenderP95Ms: 30000 } }
  expect(checkRelease({ ...input, releasePolicy: finalized }).decision).toBe('PASS')
  input.runs[0].records[0].phaseLatencyMs.render = 31000
  expect(checkRelease({ ...input, releasePolicy: finalized }).blockers).toContainEqual({ code: 'timing_threshold_exceeded:complexRenderP95Ms' })
  input.runs[0].records[0].phaseLatencyMs.render = 48001
  expect(checkRelease(input).blockers).toContainEqual({ code: 'timing_threshold_exceeded:complexRenderMaxMs' })
  for (const row of input.runs[0].records) row.phaseLatencyMs.plan = 12001
  expect(checkRelease(input).blockers).toContainEqual({ code: 'timing_threshold_exceeded:planningP95Ms' })
})

test('exposure ledger remembers the first run even when a later run would look better', async () => {
  const root = await mkdtemp(join(tmpdir(), 'nilo-exposure-')); temporary.push(root)
  const path = join(root, 'exposure.json'), request = { fixtureHash: holdoutSceneHash, selectedCases: holdoutSceneCases.map(fixture => fixture.id) }
  expect(await recordHoldoutExposure({ ...request, runId: 'first' }, path)).toMatchObject({ firstRunId: 'first', status: 'first_exposure', runNumber: 1 })
  expect(await recordHoldoutExposure({ ...request, runId: 'later' }, path)).toMatchObject({ firstRunId: 'first', status: 'seen_do_not_claim_blind', runNumber: 2 })
  expect(await readFile(path, 'utf8')).not.toContain(holdoutSceneCases[0].utterance)
})

test('local-edit acceptance preserves actual geometry and material identity while ignoring only explanatory prose', () => {
  const before = { plan: previousOpenScene(), objects: ['castle', 'path', 'moon'].map(id => ({ id, name: id, proposal: { template: 'custom', x: .1, rotation: 25, relation: 'old' } })) }
  const row = { before, result: structuredClone(before) }, fixture = openSceneCases.find(item => item.id === 'move_moon')
  row.result.objects[0].proposal.relation = 'new summary'
  expect(unchangedSceneIssues(fixture, row)).toEqual([])
  row.result.objects[0].proposal.rotation = 0
  expect(unchangedSceneIssues(fixture, row)).toContain('preserved_object_changed:castle')
})

test('evidence hashes bind both pixels and final plan, and missing/blank PNGs block without network or credentials', async () => {
  const root = await mkdtemp(join(tmpdir(), 'nilo-release-evidence-')); temporary.push(root)
  const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('No network'))
  const env = vi.spyOn(process, 'loadEnvFile').mockImplementation(() => { throw new Error('No secrets') })
  const fixture = openSceneCases[0], row = { case: fixture.id, utterance: fixture.utterance, ready: true, result: { status: 'ready', objects: [] } }
  const blank = renderOpenScenePng(fixture, null)
  await writeFile(join(root, 'manifest.json'), canonical({ suite: 'regression' }))
  await writeFile(join(root, 'records.json'), canonical([row]))
  await writeFile(join(root, `${fixture.id}-before.png`), blank)
  await writeFile(join(root, `${fixture.id}-after.png`), blank)
  const loaded = await loadReleaseRun(root, 'regression')
  expect(loaded.evidence[fixture.id].issues).toContain('empty_or_unreadable_guide')
  const hash = sceneCaseEvidenceHash(row, blank, blank, openSceneHash)
  expect(sceneCaseEvidenceHash({ ...row, result: { ...row.result, summary: 'changed' } }, blank, blank, openSceneHash)).not.toBe(hash)
  expect(fetch).not.toHaveBeenCalled(); expect(env).not.toHaveBeenCalled()
})
