// Offline release evidence check. This script never loads .env or calls models.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { PNG } from 'pngjs'
import policy from './fixtures/niloSceneReleasePolicy.json' with { type: 'json' }
import { openSceneCases, openSceneHash } from './fixtures/niloOpenScenes.mjs'
import { holdoutSceneCases, holdoutSceneHash } from './fixtures/niloOpenScenesHoldout.mjs'
import { canonical, sceneCaseEvidenceHash, sceneSourceFingerprint, sha256 } from './nilo-scene-evidence.mjs'
import { renderOpenScenePng } from './eval-nilo-open-scenes.mjs'

const suites = { regression: { cases: openSceneCases, hash: openSceneHash }, holdout: { cases: holdoutSceneCases, hash: holdoutSceneHash } }
const unchanged = { move_moon: ['castle', 'path'], replace_moon: ['castle', 'path'], add_path: ['castle', 'path', 'moon'] }
const percentile = values => values.length ? [...values].sort((a, b) => a - b)[Math.ceil(values.length * .95) - 1] : null
const usableMs = value => Number.isFinite(value) && value >= 0
const geometry = proposal => proposal && Object.fromEntries(Object.entries(proposal).filter(([key]) => !['target', 'relation'].includes(key)))
const readJson = async path => JSON.parse(await readFile(path, 'utf8'))

export function unchangedSceneIssues(fixture, row) {
  const issues = []
  for (const id of fixture.unchangedObjectIds ?? unchanged[fixture.id] ?? []) {
    const before = row.before?.objects?.find(object => object.id === id), after = row.result?.objects?.find(object => object.id === id)
    const beforePlan = row.before?.plan?.objects?.find(object => object.id === id), afterPlan = row.result?.plan?.objects?.find(object => object.id === id)
    if (!before || !after || before.name !== after.name || canonical(geometry(before.proposal)) !== canonical(geometry(after.proposal))
      || canonical(beforePlan?.render) !== canonical(afterPlan?.render) || canonical(beforePlan?.essential) !== canonical(afterPlan?.essential)) issues.push(`preserved_object_changed:${id}`)
  }
  return issues
}

export async function loadReleaseRun(directory, suite) {
  const out = resolve(directory), expected = suites[suite]
  if (!expected) throw new Error('Unknown acceptance suite')
  const manifest = await readJson(resolve(out, 'manifest.json')), records = await readJson(resolve(out, 'records.json'))
  if (!Array.isArray(records)) throw new Error('Invalid records')
  const evidence = {}
  for (const fixture of expected.cases) {
    const row = records.find(record => record.case === fixture.id), issues = []
    if (!row) { evidence[fixture.id] = { issues: ['missing_record'] }; continue }
    try {
      const before = await readFile(resolve(out, `${fixture.id}-before.png`)), after = await readFile(resolve(out, `${fixture.id}-after.png`))
      const actual = PNG.sync.read(after)
      if (actual.width !== 840 || actual.height !== 600) issues.push('invalid_preview_dimensions')
      const withoutChild = renderOpenScenePng({ ...fixture, childDrawing: undefined }, row.result)
      const guide = PNG.sync.read(withoutChild)
      let guidePixels = 0
      for (let index = 0; index < guide.data.length; index += 4) if (Math.min(guide.data[index], guide.data[index + 1], guide.data[index + 2]) < 240) guidePixels++
      if (guidePixels < 40) issues.push('empty_or_unreadable_guide')
      if (sha256(after) !== sha256(renderOpenScenePng(fixture, row.result))) issues.push('preview_does_not_match_result')
      if (sha256(before) !== sha256(renderOpenScenePng(fixture, row.before))) issues.push('before_preview_does_not_match_source')
      if (fixture.childDrawing) {
        const child = PNG.sync.read(before)
        let preservedPixels = 0, coveredPixels = 0
        for (let index = 0; index < child.data.length; index += 4) {
          if (Math.min(child.data[index], child.data[index + 1], child.data[index + 2]) >= 240) continue
          preservedPixels++
          if (!child.data.subarray(index, index + 4).equals(actual.data.subarray(index, index + 4))) issues.push('child_pixel_changed')
          if (Math.min(guide.data[index], guide.data[index + 1], guide.data[index + 2]) < 240) coveredPixels++
        }
        if (!preservedPixels) issues.push('missing_original_child_ink')
        if (coveredPixels) issues.push('guide_overlaps_existing_child_ink')
      }
      issues.push(...unchangedSceneIssues(fixture, row))
      evidence[fixture.id] = { hash: sceneCaseEvidenceHash(row, before, after, expected.hash), issues: [...new Set(issues)], guidePixels,
        beforeImage: resolve(out, `${fixture.id}-before.png`), afterImage: resolve(out, `${fixture.id}-after.png`) }
    } catch { evidence[fixture.id] = { issues: ['missing_or_invalid_picture_evidence'] } }
  }
  return { directory: out, suite, manifest, records, evidence }
}

export function releaseReviewTemplate(runs) {
  return { version: 1, reviewer: { id: '', kind: 'independent_assistant', independentOfGeneration: true },
    note: 'Inspect actual PNGs, original request and final summary. No auto-quality acceptance or children-satisfied claim. Keep partial/fail judgments.',
    reviews: runs.flatMap(run => suites[run.suite].cases.map(fixture => {
      const row = run.records.find(record => record.case === fixture.id), evidence = run.evidence[fixture.id]
      return { case: fixture.id, artifactHash: evidence?.hash ?? null, verdict: null, imageInspected: false,
        utterance: fixture.utterance, finalSummary: row?.result?.plan?.summary ?? null,
        beforeImage: evidence?.beforeImage ?? null, afterImage: evidence?.afterImage ?? null,
        dimensions: Object.fromEntries(policy.requiredDimensions.map(dimension => [dimension, { verdict: null, evidence: '' }])),
        checklist: fixture.checklist }
    })) }
}

/** Pure checker for saved first-run evidence and independently authored reviews.
 * Stubs can test the checker, but are rejected as live product evidence. */
export function checkRelease({ runs, reviews = [], currentSourceFingerprint, releasePolicy = policy }) {
  const blockers = [], reviewed = new Map(), planTimes = [], simpleTimes = [], complexTimes = []
  const add = (code, caseId) => blockers.push({ code, ...(caseId ? { case: caseId } : {}) })
  if (!Array.isArray(runs) || runs.length !== 2 || new Set(runs.map(run => run.suite)).size !== 2) add('require_one_complete_run_per_suite')
  for (const review of reviews) {
    const reviewer = review?.reviewer
    if (review?.version !== 1 || !['independent_assistant', 'adult_visual'].includes(reviewer?.kind)
      || !reviewer?.id?.trim() || reviewer.independentOfGeneration !== true || !Array.isArray(review.reviews)) {
      add('invalid_or_nonindependent_review'); continue
    }
    for (const item of review.reviews) {
      if (reviewed.has(item.case)) add('duplicate_case_review', item.case)
      else reviewed.set(item.case, { ...item, reviewer: { id: reviewer.id, kind: reviewer.kind } })
    }
  }
  const sourceIds = new Set(), models = new Set()
  let ready = 0, visualPasses = 0, expectedCount = 0
  for (const run of runs ?? []) {
    const expected = suites[run.suite], manifest = run.manifest
    if (!expected) { add('unknown_suite'); continue }
    expectedCount += expected.cases.length
    if (!manifest?.live || manifest.suite !== run.suite || manifest.fixtureHash !== expected.hash
      || manifest.attemptsPerCase !== 1) add('invalid_run_manifest', run.suite)
    const ids = expected.cases.map(fixture => fixture.id)
    if (canonical(manifest.selectedCases) !== canonical(ids) || canonical(run.records.map(row => row.case)) !== canonical(ids)) add('incomplete_or_reordered_batch', run.suite)
    if (!/^[a-f0-9]{64}$/.test(manifest.sourceFingerprint ?? '') || manifest.sourceFingerprint !== manifest.sourceFingerprintAfter
      || manifest.sourceFingerprint !== currentSourceFingerprint) add('source_changed_or_unbound', run.suite)
    sourceIds.add(manifest.sourceFingerprint)
    if (!manifest.model?.text || !manifest.model?.vision) add('missing_model_identity', run.suite)
    models.add(canonical(manifest.model))
    if (run.suite === 'holdout' && (manifest.holdoutExposure?.status !== 'first_exposure'
      || manifest.holdoutExposure.firstRunId !== manifest.runId || manifest.holdoutExposure.runNumber !== 1)) add('holdout_is_seen_or_unattested')
    for (const fixture of expected.cases) {
      const row = run.records.find(record => record.case === fixture.id), evidence = run.evidence?.[fixture.id], review = reviewed.get(fixture.id)
      if (!row || row.mode !== 'live_provider' || row.executed !== true || row.utterance !== fixture.utterance) add('missing_live_original_request', fixture.id)
      if (row?.ready && row.plan?.status === 'proposed' && row.result?.status === 'ready' && row.result?.objects?.length
        && row.result.objects.length === row.result.plan?.objects?.length && !row.failureCode && !row.failureStage) ready++
      else add('not_ready', fixture.id)
      if (!evidence?.hash || evidence.issues?.length) {
        for (const issue of evidence?.issues?.length ? evidence.issues : ['missing_bound_picture_evidence']) add(issue, fixture.id)
      }
      if (!review || review.artifactHash !== evidence?.hash || review.imageInspected !== true || review.verdict !== 'pass') add('missing_stale_or_nonpassing_visual_review', fixture.id)
      let dimensionsPass = true
      for (const dimension of releasePolicy.requiredDimensions) {
        const dimensionReview = review?.dimensions?.[dimension]
        const notApplicable = dimension === 'preservation' ? !fixture.previous && !fixture.childDrawing : dimension === 'requestedModification' ? !fixture.previous : false
        if ((!['pass', ...(notApplicable ? ['not_applicable'] : [])].includes(dimensionReview?.verdict))
          || typeof dimensionReview?.evidence !== 'string' || dimensionReview.evidence.trim().length < 8) {
          dimensionsPass = false; add(`visual_dimension_not_passed:${dimension}`, fixture.id)
        }
      }
      if (review?.verdict === 'pass' && review.imageInspected === true && review.artifactHash === evidence?.hash && dimensionsPass) visualPasses++
      const planMs = row?.phaseLatencyMs?.plan, renderMs = row?.phaseLatencyMs?.render
      if (!usableMs(planMs) || !usableMs(renderMs)) add('missing_stage_wall_times', fixture.id)
      else {
        planTimes.push(planMs)
        const complex = row.result?.plan?.objects?.some(object => !['illustration', 'recipe', 'compose'].includes(object.render?.kind))
          || row.result?.metrics?.customCalls > 0 || row.result?.metrics?.imageCalls > 0 || row.result?.metrics?.imageGenerations > 0
        ;(complex ? complexTimes : simpleTimes).push(renderMs)
      }
    }
  }
  if (sourceIds.size > 1 || models.size > 1) add('batches_use_different_source_or_models')
  const timing = { planningP95Ms: percentile(planTimes), simpleRenderP95Ms: percentile(simpleTimes), complexRenderP95Ms: percentile(complexTimes),
    complexRenderMaxMs: complexTimes.length ? Math.max(...complexTimes) : null,
    complexRenderTargetMs: releasePolicy.timing.complexRenderTargetMs, childConfirmationPauseIncluded: false }
  for (const key of ['planningP95Ms', 'simpleRenderP95Ms', 'complexRenderP95Ms', 'complexRenderMaxMs']) {
    if (timing[key] === null) continue
    if (!usableMs(releasePolicy.timing[key]) || releasePolicy.timing[key] === 0) add(`timing_threshold_not_finalized:${key}`)
    else if (timing[key] > releasePolicy.timing[key]) add(`timing_threshold_exceeded:${key}`)
  }
  return { version: 1, decision: blockers.length ? 'BLOCKED' : 'PASS', technicalReleaseEligible: blockers.length === 0,
    policyVersion: releasePolicy.version, policyHash: sha256(canonical(releasePolicy)), sourceFingerprint: currentSourceFingerprint,
    total: expectedCount, ready, independentlyPassed: visualPasses, timing, blockers,
    childSatisfaction: { status: 'not_measured', note: 'Synthetic prompts and independent assistant/adult picture review are software acceptance evidence, not evidence that children are satisfied.' },
    scopeLimits: ['Real microphone recognition, device performance and live canvas interaction require separate product checks.',
      'No best-of-N retries or partial judgments count as a release pass. A seen holdout can become regression data but is no longer blind.'] }
}

export async function main(args = process.argv.slice(2)) {
  if (args.some(arg => arg !== '--prepare' && !/^--(?:regression|holdout|review|out)=/.test(arg))) throw new Error('Unknown acceptance option')
  const get = name => args.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3)
  for (const name of ['regression', 'holdout', 'out']) if (args.filter(arg => arg.startsWith(`--${name}=`)).length > 1) throw new Error('Duplicate acceptance option')
  if (!get('regression') || !get('holdout')) throw new Error('Both complete run directories are required')
  const runs = [await loadReleaseRun(get('regression'), 'regression'), await loadReleaseRun(get('holdout'), 'holdout')]
  const out = resolve(get('out') ?? get('regression')); await mkdir(out, { recursive: true })
  if (args.includes('--prepare')) {
    await writeFile(resolve(out, 'release-review-template.json'), JSON.stringify(releaseReviewTemplate(runs), null, 2))
    process.stdout.write('Independent review template prepared; no acceptance granted.\n')
    return { prepared: true, out }
  }
  const reviews = []
  for (const path of args.filter(arg => arg.startsWith('--review=')).map(arg => arg.slice(9))) reviews.push(await readJson(resolve(path)))
  const report = checkRelease({ runs, reviews, currentSourceFingerprint: await sceneSourceFingerprint() })
  await writeFile(resolve(out, 'release-acceptance.json'), JSON.stringify(report, null, 2))
  process.stdout.write(`Technical release gate: ${report.decision}; ready ${report.ready}/${report.total}; independent visual pass ${report.independentlyPassed}/${report.total}; blockers ${report.blockers.length}. Child satisfaction: not measured.\n`)
  return report
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().then(result => { if (result.decision === 'BLOCKED') process.exitCode = 2 })
    .catch(() => { process.stderr.write('Acceptance evidence is incomplete or invalid; release is blocked.\n'); process.exitCode = 1 })
}
