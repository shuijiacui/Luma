import { useSyncExternalStore, type ReactNode } from 'react'
import { english } from './en'
import { getLocale, subscribeLocale } from './store'
export { getLocale, getIntlLocale, setLocale } from './store'
export function useLocale() {
  return useSyncExternalStore(subscribeLocale, getLocale, () => 'zh' as const)
}
const normalize = (text: string) => text.replace(/\s+/g, ' ').trim()
const chinese = Object.fromEntries(Object.entries(english).filter(([key]) => !/\{\d+\}/.test(key)).map(([zh, en]) => [en, zh]))
const patterns = Object.entries(english).filter(([key]) => /\{\d+\}/.test(key)).map(([key, value]) => {
  const keys: string[] = []
  const source = key.split(/(\{\d+\})/).map(part => {
    if (/^\{\d+\}$/.test(part)) { keys.push(part); return '(.+?)' }
    return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }).join('')
  return { pattern: new RegExp(`^${source}$`), value, keys, preserveValues: /创作旅程|创作变化|聊什么|打开作品|^选择\{0\}/.test(key), specificity: key.length - keys.length * 3 }
}).sort((a, b) => b.specificity - a.specificity)
/** Translate presentation strings only. Domain values and stored user content stay unchanged. */
export function t(text: string, locale = getLocale()): string {
  if (!text) return text
  const key = normalize(text)
  if (locale === 'zh') return chinese[key] ?? text
  const exact = english[key]
  if (exact !== undefined) return exact
  for (const { pattern, value, keys, preserveValues } of patterns) {
    const match = key.match(pattern)
    if (match) return value.replace(/\{\d+\}/g, token => {
      const captured = match[keys.indexOf(token) + 1] ?? token
      return preserveValues ? captured : t(captured, locale)
    })
  }
  // Lists produced by the API use Chinese separators; translate their known labels.
  if (key.includes('、')) return key.split('、').map(part => t(part, locale)).join(', ')
  return text
}
/** Localize text/arrays at a JSX boundary, preserving elements, numbers and identity. */
export function lt(value: ReactNode): ReactNode {
  if (typeof value === 'string') return t(value)
  if (Array.isArray(value)) return value.map(lt)
  return value
}
