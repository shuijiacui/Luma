# Nilo scene acceptance

This package checks technical and independently reviewed visual quality. It does **not** establish child satisfaction, microphone reliability, real-device performance or a user-study result. Passing automatic model review or returning `ready` alone is insufficient.

## Frozen cases and policy

- Regression: the existing 24 requests in `fixtures/niloOpenScenes.mjs`.
- Reserved holdout: 8 requests in `fixtures/niloOpenScenesHoldout.mjs`. Categories: unfamiliar place, material transformation, connection, containment, abstract mood, exclusion, preserving child ink, local modification. Do not read, disclose or tune against the prompts before final acceptance.
- Release policy: `fixtures/niloSceneReleasePolicy.json`. All 32 cases must be complete, from the same source/model configuration and independently pass every relevant dimension. `partial`, missing images and automatic-gate-only judgments block release.
- Timing uses separately measured plan and render wall time, excluding the child's confirmation pause: planning P95 <= 12s; simple stock/compose rendering P95 <= 3s; complex generation P95 <= 30s and maximum <= 48s. Targets are fixed before the final run and must not be changed to rescue a failed result.
- Each batch runs every selected case once. Production's bounded repairs remain visible. Do not select the best outcome from retries. The automatic exposure ledger marks subsequent holdout runs as seen; a failed holdout becomes regression evidence and requires a new reserved set for another blind test.

## Run regression during development

Reuse saved records and images first. Do not rerun a passing case unless a
specific code change invalidates its evidence. From `server/`, target one
affected public case with an explicit paid-call ceiling:

```powershell
node scripts/eval-nilo-open-scenes.mjs --live --case=upside_forest --max-api-calls=8 --max-image-calls=2
```

Live runs now default to one case, 8 total model HTTP attempts and 2 image
attempts per invocation, including transport retries. Failed requests consume
the allowance too; requests beyond either cap never reach the network. Saved
`manifest.json.apiUsage` reports actual attempts and blocked requests. Downloads
are not model calls. A stopped/incomplete run is not a passing evaluation.

The complete 24-case regression and reserved 8-case holdout remain release
requirements, but must not be rerun during iterative debugging. A full paid
acceptance run requires a separately agreed budget; do not increase the caps
or run multiple invocations to evade the user's limit. Keep release blocked
while required evidence is missing, rather than lowering the quality bar.

Default is offline preparation. Model calls require `--live`. Live execution uses `sceneChatText` / `sceneChatWithImage`, records the dedicated understanding/text/vision IDs and image model ID, and never writes credentials or service endpoints. Generated PNG references are self-contained and preview using the same dashed/gray policy as the product. Source hashes are captured before and after the batch; any source changes during a batch invalidate its use as frozen release evidence.

## Independent review and release check

Create a review template using the two final batch directories:

```powershell
node scripts/check-nilo-release.mjs --regression=REGRESSION_DIR --holdout=HOLDOUT_DIR --prepare --out=ACCEPTANCE_DIR
```

A reviewer independent of generation must inspect each actual before/after PNG, original request and final summary. Fill the seven dimensions with `pass`, `partial` or `fail` and concrete visible evidence. `not_applicable` is accepted only for preservation/modification on cases without those operations. Use `reviewer.kind: "independent_assistant"` or `"adult_visual"` honestly. An assistant review is not a child/user study. Separate reviewers can each submit a nonoverlapping subset.

The template binds every judgment to the exact record and both PNG hashes. Altered/stale pictures, missing subjects, extra retries, different builds/models, a seen holdout or any non-passing dimension block release. The checker also verifies that saved images match rendered results, the guide is nonblank, child pixels are unchanged and unobscured, and named untouched objects keep their exact material/geometry.

```powershell
node scripts/check-nilo-release.mjs --regression=REGRESSION_DIR --holdout=HOLDOUT_DIR --review=REVIEW_ONE.json --review=REVIEW_TWO.json --out=ACCEPTANCE_DIR
```

The command writes `release-acceptance.json`: exit 0 for technical `PASS`, exit 2 for `BLOCKED`, exit 1 for invalid evidence. It never invokes a provider or loads `.env`. Do not treat checker unit fixtures or offline preparation as successful live measurements.
