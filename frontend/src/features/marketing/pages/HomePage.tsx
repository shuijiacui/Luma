import { t, useLocale } from '@/i18n'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import '@fontsource-variable/caveat'

import homeLakeside from '@/assets/images/home-lakeside-v2.png'
import { Brand } from '@/components/brand'
import { childAppUrl, fixedRole, parentAppUrl } from '@/config/appMode'
import { useAuth } from '@/features/auth/AuthContext'
import { PricingModal } from '@/features/marketing/components/PricingModal'
import '../styles/home-lakeside.css'

interface HomePageProps {
  /** 独立 App（家长端 / 儿童端）的欢迎页：只保留一个"欢迎来到 Luma"入口 */
  singleEntry?: boolean
}

export function HomePage({ singleEntry = false }: HomePageProps) {
  useLocale()
  const { session } = useAuth()
  const [pricingOpen, setPricingOpen] = useState(false)

  const role = fixedRole ?? 'parent'
  const entryHref = singleEntry
    ? session?.role === role
      ? `/${role}/demo`
      : `/auth?role=${role}&mode=login`
    : undefined

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
      <nav className="luma-landing-entrances" aria-label={t(singleEntry ? '欢迎来到 Luma' : '选择进入儿童端或家长端')}>
        {singleEntry ? (
          <Link to={entryHref ?? '/auth?role=parent&mode=login'} aria-label={t('欢迎来到 Luma')}>
            <span>{t('欢迎来到 Luma')}</span>
            <ArrowIcon />
          </Link>
        ) : (
          <>
            <a href={childAppUrl} aria-label={t("进入儿童端")}><span>{t("儿童端")}</span><ArrowIcon /></a>
            <span className="luma-landing-divider" aria-hidden="true" />
            <a href={parentAppUrl} aria-label={t("进入家长端")}><span>{t("家长端")}</span><ArrowIcon /></a>
          </>
        )}
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