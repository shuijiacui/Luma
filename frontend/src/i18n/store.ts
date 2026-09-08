export type Locale = 'zh' | 'en'
const key = 'luma_locale'
function savedLocale(): Locale {
  try { return localStorage.getItem(key) === 'en' ? 'en' : 'zh' } catch { return 'zh' }
}
let locale: Locale = savedLocale()
const listeners = new Set<() => void>()
export const getLocale = () => locale
export const getIntlLocale = () => locale === 'en' ? 'en-US' : 'zh-CN'
export function setLocale(next: Locale) {
  if (next === locale) return
  locale = next
  try { localStorage.setItem(key, next) } catch { /* Language switching works without storage. */ }
  listeners.forEach(listener => listener())
}
export function subscribeLocale(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
if (typeof window !== 'undefined') {
  window.addEventListener('storage', event => {
    if (event.key === key) setLocale(event.newValue === 'en' ? 'en' : 'zh')
  })
}
