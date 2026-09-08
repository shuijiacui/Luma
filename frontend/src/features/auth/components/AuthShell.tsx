import { lt, t, useLocale } from '@/i18n'
import { LanguageSwitcher } from '@/i18n/LanguageSwitcher'
import { motion } from 'framer-motion'
import type { ReactNode } from 'react'

import authChildBackground from '@/assets/images/auth-child.png'
import authParentBackground from '@/assets/images/auth-parent.png'
import { Brand } from '@/components/brand'
import { portalUrl } from '@/config/appMode'
import { fadeUp, staggerContainer } from '@/design-system'
import { cn } from '@/lib/cn'

interface AuthShellProps {
  role?: 'parent' | 'child'
  showBack?: boolean
  eyebrow: string
  title: string
  description: string
  children: ReactNode
}

export function AuthShell({
  role,
  showBack = true,
  eyebrow,
  title,
  description,
  children,
}: AuthShellProps) {
  useLocale()
  const background =
    role === 'child' ? authChildBackground : authParentBackground

  return (
    <main
      className={cn(
        'luma-auth-shell relative min-h-screen overflow-y-auto',
        role === 'child' ? 'bg-luma-teal-50' : 'bg-luma-ivory-50',
      )}
    >
      {/* 桌面/平板宽屏：整幅背景插画 + 渐变，保持原版式 */}
      <motion.img
        key={`lg-${role ?? 'none'}`}
        src={background}
        alt=""
        initial={{ opacity: 0, scale: 1.015 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.55, ease: 'easeOut' }}
        className={cn(
          'pointer-events-none absolute inset-0 hidden size-full object-cover lg:block',
          role === 'child' ? 'object-center' : 'object-center',
        )}
      />
      <div
        className={cn(
          'pointer-events-none absolute inset-0 hidden lg:block',
          role === 'child'
            ? 'bg-gradient-to-r from-luma-ivory-50/94 via-luma-ivory-50/60 to-luma-ivory-50/8'
            : 'bg-gradient-to-l from-luma-ivory-50/94 via-luma-ivory-50/60 to-luma-ivory-50/8',
        )}
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute inset-0 hidden bg-luma-ivory-50/28 lg:block lg:bg-transparent"
        aria-hidden="true"
      />

      {/* 手机竖屏：整幅插画完整显示在页面顶部，不被裁切 */}
      <div className="lg:hidden">
        <motion.img
          key={`sm-${role ?? 'none'}`}
          src={background}
          alt=""
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="block h-auto w-full object-contain"
        />
      </div>

      <div
        className={cn(
          'luma-auth-shell-content relative z-10 mx-auto flex w-full max-w-7xl justify-center px-5 py-6 sm:px-8 sm:py-8 lg:min-h-screen lg:items-center lg:px-24 lg:py-10 xl:px-36 2xl:px-40',
          role === 'child' ? 'lg:justify-start' : 'lg:justify-end',
        )}
      >
        <motion.div
          className="luma-auth-panel w-full max-w-md"
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
        >
          {showBack && (
            <motion.div variants={fadeUp} className="mb-4">
              <a
                href={portalUrl}
                className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/55 bg-white/45 px-3 text-sm font-semibold text-luma-teal-700 shadow-sm outline-none backdrop-blur-md transition-colors hover:bg-white/75 hover:text-luma-teal-900 focus-visible:ring-3 focus-visible:ring-luma-gold-300/60"
                aria-label={t("返回 Luma 官网")}
              >
                <svg
                  viewBox="0 0 20 20"
                  fill="none"
                  className="size-4"
                  aria-hidden="true"
                >
                  <path
                    d="M16 10H4m0 0 5-5m-5 5 5 5"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                {t("返回官网")}</a>
            </motion.div>
          )}

          <motion.div variants={fadeUp} className="luma-auth-heading mb-7 text-center">
            <div className="luma-auth-brand-row">
              <a
                href={portalUrl}
                className="inline-flex items-center gap-2 rounded-2xl outline-none focus-visible:ring-3 focus-visible:ring-luma-gold-300/60"
                aria-label={t("返回 Luma 官网")}
              >
                <Brand size="md" />
              </a>
              <LanguageSwitcher />
            </div>
            <div className="luma-eyebrow mb-3 text-luma-gold-700">{lt(eyebrow)}</div>
            <h1 className="luma-heading-2 text-luma-teal-900">{lt(title)}</h1>
            <p className="luma-body mt-3 text-luma-muted">{lt(description)}</p>
          </motion.div>

          <motion.section
            variants={fadeUp}
            className="luma-auth-card rounded-luma-lg border border-white/85 bg-white/82 p-6 shadow-[0_24px_70px_rgba(23,63,58,0.14)] backdrop-blur-xl sm:p-8"
          >
            {lt(children)}
          </motion.section>
        </motion.div>
      </div>
    </main>
  )
}
