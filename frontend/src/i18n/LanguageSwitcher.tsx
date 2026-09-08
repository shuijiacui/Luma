import { useEffect } from 'react'
import { setLocale, useLocale } from './index'
import './language.css'

export function LanguageSwitcher() {
  const locale = useLocale()
  useEffect(() => {
    document.documentElement.lang = locale === 'en' ? 'en' : 'zh-CN'
    document.title = locale === 'en' ? 'Luma · Small Ideas, Big World' : 'Luma · 让想象被温柔地听见'
  }, [locale])
  return (
    <div className="luma-language-bar">
      <button type="button" onClick={() => setLocale(locale === 'zh' ? 'en' : 'zh')}
        aria-label={locale === 'zh' ? 'Switch to English' : '切换为中文'} className="luma-language-switch">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="12" cy="12" r="9" /><ellipse cx="12" cy="12" rx="4" ry="9" /><path d="M3 12h18" /></svg>
        <span lang="zh-CN" className={locale === 'zh' ? 'is-current' : ''}>中文</span>
        <span aria-hidden="true">/</span>
        <span lang="en" className={locale === 'en' ? 'is-current' : ''}>English</span>
      </button>
    </div>
  )
}
