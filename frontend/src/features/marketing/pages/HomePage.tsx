import { t, useLocale } from '@/i18n'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import '@fontsource-variable/caveat'

import homeLakeside from '@/assets/images/home-lakeside-v2.png'
import { Brand } from '@/components/brand'
import { useAuth } from '@/features/auth/AuthContext'
import { PricingModal } from '@/features/marketing/components/PricingModal'
import '../styles/home-lakeside.css'

export function HomePage() {
  useLocale()
  const { session } = useAuth()
  const [pricingOpen, setPricingOpen] = useState(false)
  const destination = (role: 'child' | 'parent') =>
    session?.role === role ? `/${role}/demo` : `/auth?role=${role}&mode=login`

  return (
    <main className="luma-landing">
      <img className="luma-landing-art" src={homeLakeside} alt={t("Nilo 坐在湖畔，捧着一幅画有蓝色鲸鱼的画作")} fetchPriority="high" />
      <div className="luma-landing-wash" aria-hidden="true" />
      <header className="luma-landing-header">
        <button type="button" className="luma-landing-pricing" onClick={() => setPricingOpen(true)}>
          {t("订阅计划")}</button>
        <Link to="/" aria-label={t("Luma 首页")} className="luma-landing-brand">
          <Brand size="xl" />
        </Link>
      </header>
      <section className="luma-landing-message" lang="en" aria-label={t("小小创意，大大世界")}>
        <h1><span>Small Ideas,</span><span>Big World.</span></h1>
        <p>Let your imagination wander.</p>
      </section>
      <nav className="luma-landing-entrances" aria-label={t("选择进入儿童端或家长端")}>
        <Link to={destination('child')} aria-label={t("进入儿童端")}><span>{t("儿童端")}</span><ArrowIcon /></Link>
        <span className="luma-landing-divider" aria-hidden="true" />
        <Link to={destination('parent')} aria-label={t("进入家长端")}><span>{t("家长端")}</span><ArrowIcon /></Link>
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
