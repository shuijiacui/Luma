import { t, useLocale } from '@/i18n'
import { LanguageSwitcher } from '@/i18n/LanguageSwitcher'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import '@fontsource-variable/caveat'

import homeLakeside from '@/assets/images/home-lakeside-v2.png'
import { Brand } from '@/components/brand'
import { childAppUrl, parentAppUrl } from '@/config/appMode'
import { PricingModal } from '@/features/marketing/components/PricingModal'
import '../styles/home-lakeside.css'

function loginUrl(baseUrl: string, role: 'parent' | 'child') {
  return `${baseUrl.replace(/\/$/, '')}/auth?role=${role}&mode=login&force=1`
}

export function HomePage() {
  useLocale()
  const [pricingOpen, setPricingOpen] = useState(false)

  return (
    <main className="luma-landing">
      <img className="luma-landing-art" src={homeLakeside} alt={t("Nilo 坐在湖畔，捧着一幅画有蓝色鲸鱼的画作")} fetchPriority="high" />
      <div className="luma-landing-wash" aria-hidden="true" />
      <header className="luma-landing-header">
        <button type="button" className="luma-landing-pricing" onClick={() => setPricingOpen(true)}>
          {t("订阅计划")}</button>
        <LanguageSwitcher />
        <Link to="/" aria-label={t("Luma 首页")} className="luma-landing-brand">
          <Brand size="xl" />
        </Link>
      </header>
      <section className="luma-landing-message" lang="en" aria-label={t("小小创意，大大世界")}>
        <h1><span>Small Ideas,</span><span>Big World.</span></h1>
        <p>Let your imagination wander.</p>
      </section>
      <nav className="luma-landing-entrances" aria-label={t('选择进入儿童端或家长端')}>
        <a href={loginUrl(childAppUrl, 'child')} aria-label={t("进入儿童端登录页")}><span>{t("儿童端")}</span><ArrowIcon /></a>
        <span className="luma-landing-divider" aria-hidden="true" />
        <a href={loginUrl(parentAppUrl, 'parent')} aria-label={t("进入家长端登录页")}><span>{t("家长端")}</span><ArrowIcon /></a>
      </nav>
      <PricingModal open={pricingOpen} onClose={() => setPricingOpen(false)} />
    </main>
  )
}

function ArrowIcon() {
  useLocale()
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 12h14m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
