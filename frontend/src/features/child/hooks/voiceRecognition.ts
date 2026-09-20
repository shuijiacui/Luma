import vocabulary from '../../../../../shared/voiceVocabulary.json'

export const SPEECH_PAUSE_MS = 2200
export interface DrawingSpeechContext { theme?: string; subjects?: string[] }

export function recognitionContext(context: DrawingSpeechContext = {}): DrawingSpeechContext {
  const clean = (value: unknown, max: number) => typeof value === 'string' ? value.replace(/\p{Cc}/gu, ' ').trim().slice(0, max) : ''
  return {
    theme: clean(context.theme, 120),
    subjects: Array.isArray(context.subjects) ? [...new Set(context.subjects.slice(-8).map(value => clean(value, 40)).filter(Boolean))] : [],
  }
}

export function recognitionVocabulary(locale: 'zh' | 'en', context: DrawingSpeechContext = {}): string[] {
  const bounded = recognitionContext(context)
  return [...new Set([...vocabulary[locale], ...(bounded.subjects ?? []), ...(bounded.theme ? [bounded.theme] : [])])]
}

/** Energy-based endpointing, not semantic VAD. Keep brief pauses and quiet speech.
 * Estimate the floor from non-speech frames; a single click is not an utterance. */
export function createSpeechEndpoint(started: number) {
  let noiseFloor = .003
  let speechFrames = 0
  let heardSpeech = false
  let lastSpeech = started
  return (rms: number, now: number): 'listening' | 'silence' | 'no-speech' => {
    const threshold = Math.max(.008, Math.min(.04, noiseFloor * 2.8))
    if (Number.isFinite(rms) && rms > threshold) {
      speechFrames++
      if (speechFrames >= 2) heardSpeech = true
      lastSpeech = now
    } else {
      speechFrames = 0
      if (Number.isFinite(rms) && rms >= 0) noiseFloor = noiseFloor * .9 + rms * .1
    }
    if (!heardSpeech && now - started >= 7000) return 'no-speech'
    if (heardSpeech && now - lastSpeech >= SPEECH_PAUSE_MS) return 'silence'
    return 'listening'
  }
}
