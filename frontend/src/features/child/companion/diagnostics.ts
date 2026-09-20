// Tab-local, bounded aggregate counters only. No images, speech, account IDs,
// coordinates or artwork names. Storage is optional and never blocks drawing.
const key = 'luma:nilo-turn-diagnostics:v1'
export const turnOutcomes = ['requested', 'ai_committed', 'local_committed', 'recovery_offered', 'recovery_previewed', 'recovery_accepted', 'nilo_undone', 'no_space',
  'unclear_target', 'misplaced_detail', 'duplicate_detail', 'unrelated_detail', 'uncertain_review', 'invalid_review',
  'wrong_target', 'invalid_response', 'provider_error', 'timeout', 'missing_image', 'model_unavailable', 'geometry_rejected', 'network_error'] as const
export type TurnOutcome = typeof turnOutcomes[number]
export function readTurnDiagnostics(): Partial<Record<TurnOutcome, number>> {
  try {
    const raw = JSON.parse(sessionStorage.getItem(key) ?? '{}')
    return Object.fromEntries(turnOutcomes.filter(k => Number.isSafeInteger(raw?.[k]) && raw[k] >= 0).map(k => [k, Math.min(1000000, raw[k])]))
  } catch { return {} }
}
export function recordTurnOutcome(outcome: string) {
  if (!turnOutcomes.includes(outcome as TurnOutcome)) return
  try {
    const data = readTurnDiagnostics(), code = outcome as TurnOutcome
    data[code] = Math.min(1000000, (data[code] ?? 0) + 1)
    sessionStorage.setItem(key, JSON.stringify(data))
  } catch { /* Private mode/storage restrictions cannot prevent co-creation. */ }
}
