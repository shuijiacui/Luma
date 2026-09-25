type VoiceLocale = 'zh' | 'en'

const youthfulName = /\b(child|children|kid|kids|youth|young|junior|boy|girl)\b|童声|儿童|少年|女孩|男孩/i
// These voices may be exposed by the platform, but are never assumed installed.
// Match compact IDs (e.g. zh-CN-XiaoyouNeural) as well as friendly display names.
const childNames: Record<VoiceLocale, RegExp> = {
  zh: /(?:^|[\s_-])(?:xiaoyou|xiaoshuang)(?=neural|[\s_-]|$)|晓悠|晓双/i,
  en: /(?:^|[\s_-])(?:ana|maisie)(?=neural|[\s_-]|$)/i,
}
const gentleNames: Record<VoiceLocale, RegExp> = {
  zh: /(?:^|[\s_-])(?:xiaoxiao|xiaoyi|tingting|yunxia)(?=neural|[\s_-]|$)|晓晓|晓伊|婷婷|云夏/i,
  en: /(?:^|[\s_-])(?:jenny|aria|samantha)(?=neural|[\s_-]|$)/i,
}

function isChildlike(voice: SpeechSynthesisVoice, locale: VoiceLocale) {
  return childNames[locale].test(`${voice.name} ${voice.voiceURI}`) || youthfulName.test(voice.name)
}

/** Voice inventories differ by OS. Name preferences are a best effort, never a
 * claim that every device provides a child's voice. Never select another language.
 */
export function selectCompanionVoice(voices: readonly SpeechSynthesisVoice[], locale: VoiceLocale): SpeechSynthesisVoice | null {
  const matches = voices.filter(voice => voice.lang.toLowerCase().replaceAll('_', '-').split('-')[0] === locale)
  function score(voice: SpeechSynthesisVoice) {
    return (isChildlike(voice, locale) ? 100 : gentleNames[locale].test(`${voice.name} ${voice.voiceURI}`) ? 50 : 0)
      + (voice.default ? 2 : 0) + (voice.localService ? 1 : 0)
  }
  return matches.reduce<SpeechSynthesisVoice | null>((best, voice) => !best || score(voice) > score(best) ? voice : best, null)
}

/** Keep an actual child voice's natural timbre. A gentle fallback is only a
 * best effort: raising an adult voice's pitch cannot turn it into a child voice.
 */
export function companionSpeechProfile(voice: SpeechSynthesisVoice | null, locale: VoiceLocale) {
  return { pitch: voice && isChildlike(voice, locale) ? 1 : 1.18, rate: locale === 'zh' ? .94 : .96 }
}
