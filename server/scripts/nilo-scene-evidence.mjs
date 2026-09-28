import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const workspace = fileURLToPath(new URL('../../', import.meta.url))
export const canonical = value => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item)
export const sha256 = value => createHash('sha256').update(value).digest('hex')

/** Hash source and shipped tracing geometry, never configuration or secrets. */
export async function sceneSourceFingerprint() {
  const paths = []
  const visit = async directory => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name)
      if (entry.isDirectory()) await visit(path)
      else if (entry.isFile() && /\.(?:[cm]?js|tsx?|json|css)$/.test(entry.name)) paths.push(path)
    }
  }
  for (const directory of ['server/src', 'frontend/src', 'shared', 'frontend/public/nilo-tracing']) await visit(resolve(workspace, directory))
  const hash = createHash('sha256')
  for (const path of paths.sort()) hash.update(relative(workspace, path).replaceAll('\\', '/')).update('\0').update(await readFile(path)).update('\0')
  return hash.digest('hex')
}

export function sceneCaseEvidenceHash(row, beforePng, afterPng, fixtureHash) {
  return sha256(canonical({ fixtureHash, row, beforePng: sha256(beforePng), afterPng: sha256(afterPng) }))
}

/** Automatic exposure log is outside individual runs, so selecting a better
 * later run cannot silently restore a set's unseen status. It stores IDs and
 * hashes only, never holdout text, credentials or provider output. */
export async function recordHoldoutExposure({ runId, fixtureHash, selectedCases }, ledgerPath = resolve(workspace, 'server/.tmp/nilo-open-scenes/holdout-exposure.json')) {
  await mkdir(dirname(ledgerPath), { recursive: true })
  let ledger
  try { ledger = JSON.parse(await readFile(ledgerPath, 'utf8')) }
  catch (error) { if (error.code !== 'ENOENT') throw error; ledger = { version: 1, sets: {} } }
  if (ledger.version !== 1 || !ledger.sets || typeof ledger.sets !== 'object') throw new Error('Invalid holdout exposure ledger')
  const set = ledger.sets[fixtureHash] ?? { firstRunId: runId, runs: [] }
  set.runs.push({ runId, selectedCases: [...selectedCases], exposedAt: new Date().toISOString() })
  ledger.sets[fixtureHash] = set
  await writeFile(ledgerPath, JSON.stringify(ledger, null, 2))
  return { firstRunId: set.firstRunId, runNumber: set.runs.length, status: set.runs.length === 1 ? 'first_exposure' : 'seen_do_not_claim_blind' }
}
