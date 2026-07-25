import { motion } from 'framer-motion'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import homeHero from '@/assets/images/home-hero.png'
import { Brand } from '@/components/brand'
import { Button } from '@/components/ui'
import { fadeUp, staggerContainer } from '@/design-system'
import { useAuth } from '@/features/auth/AuthContext'
import { PricingModal } from '@/features/marketing/components/PricingModal'

const particles = [
  { left: '8%', top: '25%', size: 5, delay: 0.1 },
  { left: '22%', top: '14%', size: 3, delay: 1.2 },
  { left: '40%', top: '20%', size: 4, delay: 0.6 },
  { left: '55%', top: '12%', size: 3, delay: 1.8 },
  { left: '67%', top: '31%', size: 5, delay: 0.9 },
  { left: '84%', top: '18%', size: 4, delay: 1.5 },
  { left: '91%', top: '47%', size: 3, delay: 0.3 },
] as const

export function HomePage() {
  const navigate = useNavigate()
  const { session } = useAuth()
  const destination = session ? `/${session.role}/demo` : '/auth?mode=login'
  const [pricingOpen, setPricingOpen] = useState(false)

  return (
    <main className="relative min-h-screen overflow-x-hidden bg-luma-ivory-50">
      <img
        src={homeHero}
        alt=""
        className="absolute inset-0 size-full origin-right object-cover object-[66%_center] transition-transform duration-1000 md:scale-[1.035] lg:object-center"
      />
      <div
        className="absolute inset-0 bg-gradient-to-r from-luma-ivory-50/96 via-luma-ivory-50/68 to-transparent md:via-luma-ivory-50/26"
        aria-hidden="true"
      />
      <div
        className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-luma-ivory-50/55 to-transparent md:hidden"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute right-[7%] bottom-[8%] h-14 w-[31%] rounded-[50%] bg-luma-teal-900/10 blur-2xl"
        aria-hidden="true"
      />

      <div className="pointer-events-none absolute inset-0 z-[1]" aria-hidden="true">
        {particles.map((particle, index) => (
          <motion.span
            key={index}
            className="absolute rotate-45 rounded-[1px] bg-luma-gold-300/65 shadow-[0_0_12px_rgba(237,205,112,0.75)]"
            style={{
              left: particle.left,
              top: particle.top,
              width: particle.size,
              height: particle.size,
            }}
            animate={{
              opacity: [0.2, 0.9, 0.2],
              scale: [0.8, 1.35, 0.8],
              y: [0, -7, 0],
            }}
            transition={{
              duration: 3.6,
              delay: particle.delay,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />
        ))}
      </div>

      <header className="relative z-20 mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-5 sm:px-8 lg:px-10">
        <Link
          to="/"
          className="rounded-2xl outline-none focus-visible:ring-3 focus-visible:ring-luma-gold-300/60"
          aria-label="Luma 首页"
        >
          <Brand
            size="xl"
            className="drop-shadow-[0_0_18px_rgba(120,200,182,0.22)]"
          />
        </Link>
        <div className="hidden text-right sm:block">
            <button
              type="button"
              onClick={() => setPricingOpen(true)}
              className="rounded-full border border-luma-gold-300/40 bg-luma-ivory-50/60 px-4 py-1.5 text-sm font-bold tracking-[0.04em] text-luma-gold-700 backdrop-blur-sm transition hover:bg-luma-gold-100/70"
            >
              订阅计划
            </button>
          </div>
      </header>

      <section className="relative z-10 mx-auto flex min-h-[calc(100svh-104px)] max-w-7xl items-center px-5 py-10 sm:px-8 lg:px-10">
        <motion.div
          className="max-w-[35rem] lg:-translate-x-4"
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
        >
          <motion.div
            variants={fadeUp}
            className="mb-6 inline-flex rounded-full border border-luma-gold-300/25 bg-luma-ivory-50/45 px-3.5 py-1.5 text-[0.7rem] font-medium tracking-[0.18em] text-luma-gold-700 backdrop-blur-sm"
          >
            儿童创意表达 AI 平台
          </motion.div>

          <motion.h1
            variants={fadeUp}
            className="font-display text-[clamp(3rem,6.5vw,5.4rem)] leading-[1.28] font-[680] tracking-[0.035em] text-luma-teal-900"
          >
            让想象，
            <br />
            被
            <span className="relative mx-1.5 inline-block text-luma-gold-700">
              温柔地
              <span
                className="absolute right-0 -bottom-0.5 left-0 h-px bg-gradient-to-r from-transparent via-luma-gold-300/70 to-transparent"
                aria-hidden="true"
              />
            </span>
            听见。
          </motion.h1>

          <motion.p
            variants={fadeUp}
            className="luma-body-lg mt-7 max-w-lg text-luma-muted"
          >
            和 AI 伙伴 Nilo 一起绘画，
            <br className="hidden sm:block" />
            创造只属于孩子的奇妙世界。
          </motion.p>

          <motion.div
            variants={fadeUp}
            className="mt-10 flex justify-start sm:justify-end sm:pr-10"
          >
            {session ? (
              <Button
                size="lg"
                trailingIcon={<ArrowIcon />}
                onClick={() => navigate(destination)}
                className="bg-gradient-to-b from-luma-teal-500 to-luma-teal-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.28),0_14px_35px_rgba(15,113,99,0.24)] hover:from-luma-teal-500 hover:to-luma-teal-600"
              >
                {session.role === 'child' ? '继续创作' : '进入家长空间'}
              </Button>
            ) : (
              <Button
                size="lg"
                trailingIcon={<ArrowIcon />}
                onClick={() => navigate('/auth?mode=login')}
                className="bg-gradient-to-b from-luma-teal-500 to-luma-teal-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.28),0_14px_35px_rgba(15,113,99,0.24)] hover:from-luma-teal-500 hover:to-luma-teal-600"
              >
                进入 Luma
              </Button>
            )}
          </motion.div>

          <motion.p
            variants={fadeUp}
            className="mt-7 w-fit rounded-full border border-white/55 bg-white/48 px-4 py-2 text-xs font-medium tracking-[0.04em] text-luma-muted shadow-[0_8px_24px_rgba(23,63,58,0.06)] backdrop-blur-md sm:ml-auto sm:mr-5"
          >
            一个安全、自由、不被评判的创意空间
          </motion.p>
        </motion.div>
      </section>

      <PricingModal open={pricingOpen} onClose={() => setPricingOpen(false)} />
    </main>
  )
}

function ArrowIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      className="size-4"
      aria-hidden="true"
    >
      <path
        d="M4 10h12m0 0-5-5m5 5-5 5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
