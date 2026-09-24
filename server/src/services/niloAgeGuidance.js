import conversation from '../../../knowledge/child-development/conversation.json' with { type: 'json' }

export const AGE_BANDS = ['5-7', '8-9', '10-12']

// Use the family profile on the server. A client-supplied age is not trusted.
export function ageBandForBirthDate(birthDate, now = new Date()) {
  if (typeof birthDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return null
  const birth = new Date(`${birthDate}T00:00:00Z`)
  if (!Number.isFinite(birth.getTime()) || birth.toISOString().slice(0, 10) !== birthDate) return null
  let age = now.getUTCFullYear() - birth.getUTCFullYear()
  if (now.getUTCMonth() < birth.getUTCMonth()
    || (now.getUTCMonth() === birth.getUTCMonth() && now.getUTCDate() < birth.getUTCDate())) age--
  return age >= 5 && age <= 7 ? '5-7' : age >= 8 && age <= 9 ? '8-9' : age >= 10 && age <= 12 ? '10-12' : null
}

const languageOf = context => context?.locale === 'en' ? 'en' : 'zh'
const bandOf = context => AGE_BANDS.includes(context?.ageBand) ? context.ageBand : null

export function niloAgeGuidance(context) {
  const band = bandOf(context)
  return (band ? conversation.ageBands[band].niloGuidance : conversation.niloGuidance)[languageOf(context)]
}

export function niloAgeClarification(context) {
  const band = bandOf(context)
  return band ? conversation.ageBands[band].niloClarify[languageOf(context)] : null
}
