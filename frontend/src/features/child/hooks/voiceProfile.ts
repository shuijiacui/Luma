type VoiceLocale = 'zh' | 'en'

const youthfulName = /\b(child|children|kid|kids|youth|young|junior|boy|girl)\b|童声|儿童|少年|女孩|男孩/i
const gentleNames: Record<VoiceLocale, RegExp> = {
  zh: /\b(xiaoxiao|xiaoyi|tingting)\b|晓晓|晓伊|婷婷/i,
  en: /\b(ana|jenny|aria|samantha)\b/i,
}

/** Voice inventories differ by OS. Name preferences are a best effort, never a
 * claim that every device provides a child's voice. Never select another language.
 */
export function selectCompanionVoice(voices: readonly SpeechSynthesisVoice[], locale: VoiceLocale): SpeechSynthesisVoice | null {
  const matches = voices.filter(voice => voice.lang.toLowerCase().replaceAll('_', '-').split('-')[0] === locale)
  function score(voice: SpeechSynthesisVoice) {
    return (youthfulName.test(voice.name) ? 100 : gentleNames[locale].test(voice.name) ? 50 : 0)
      + (voice.default ? 2 : 0) + (voice.localService ? 1 : 0)
  }
  return matches.reduce<SpeechSynthesisVoice | null>((best, voice) => !best || score(voice) > score(best) ? voice : best, null)
}

export const companionSpeechProfile = { pitch: 1.18, rate: .96 } as const
