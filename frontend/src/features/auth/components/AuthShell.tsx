import { motion } from 'framer-motion'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

import authChildBackground from '@/assets/images/auth-child.png'
import authParentBackground from '@/assets/images/auth-parent.png'
import { Brand } from '@/components/brand'
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
  return (
    <main
      className={cn(
        'relative flex min-h-screen items-center overflow-y-auto px-5 py-6 sm:px-8 sm:py-10',
        role === 'child' ? 'bg-luma-teal-50' : 'bg-luma-ivory-50',
      )}
    >
      <motion.img
        key={role}
        src={
          role === 'child' ? authChildBackground : authParentBackground
        }
        alt=""
        initial={{ opacity: 0, scale: 1.015 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.55, ease: 'easeOut' }}
        className={cn(
          'absolute inset-0 size-full object-cover',
          role === 'child'
            ? 'object-[62%_center] lg:object-center'
            : 'object-[38%_center] lg:object-center',
        )}
      />
      <div
        className={cn(
          'pointer-events-none absolute inset-0',
          role === 'child'
            ? 'bg-gradient-to-r from-luma-ivory-50/94 via-luma-ivory-50/60 to-luma-ivory-50/8'
            : 'bg-gradient-to-l from-luma-ivory-50/94 via-luma-ivory-50/60 to-luma-ivory-50/8',
        )}
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute inset-0 bg-luma-ivory-50/28 lg:bg-transparent"
        aria-hidden="true"
      />

      <div
        className={cn(
          'relative z-10 mx-auto flex w-full max-w-7xl justify-center lg:px-24 xl:px-36 2xl:px-40',
          role === 'child' ? 'lg:justify-start' : 'lg:justify-end',
        )}
      >
        <motion.div
          className="w-full max-w-md"
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
        >
          {showBack && (
            <motion.div variants={fadeUp} className="mb-4">
              <Link
                to="/"
                className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/55 bg-white/45 px-3 text-sm font-semibold text-luma-teal-700 shadow-sm outline-none backdrop-blur-md transition-colors hover:bg-white/75 hover:text-luma-teal-900 focus-visible:ring-3 focus-visible:ring-luma-gold-300/60"
                aria-label="返回 Luma 首页"
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
                返回首页
              </Link>
            </motion.div>
          )}

          <motion.div variants={fadeUp} className="mb-7 text-center">
            <Link
              to="/"
              className="mx-auto mb-5 inline-flex items-center gap-2 rounded-2xl outline-none focus-visible:ring-3 focus-visible:ring-luma-gold-300/60"
            >
              <Brand size="lg" />
            </Link>
            <div className="luma-eyebrow mb-3 text-luma-gold-700">{eyebrow}</div>
            <h1 className="luma-heading-2 text-luma-teal-900">{title}</h1>
            <p className="luma-body mt-3 text-luma-muted">{description}</p>
          </motion.div>

          <motion.section
            variants={fadeUp}
            className="rounded-luma-lg border border-white/85 bg-white/82 p-6 shadow-[0_24px_70px_rgba(23,63,58,0.14)] backdrop-blur-xl sm:p-8"
          >
            {children}
          </motion.section>
        </motion.div>
      </div>
    </main>
  )
}
