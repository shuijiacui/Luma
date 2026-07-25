import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'

import { lumaLogo } from '@/assets/brand'
import niloGif from '@/assets/images/hello.gif'
import { lumaEase } from '@/design-system'

// ─── slide definitions ────────────────────────────────────────────────────────

const SLIDES = [
  'brand-logo',
  'brand-origin',
  'nilo-intro',
  'feature-drawing',
  'feature-emotion',
  'feature-guidance',
  'feature-parent',
  'closing',
] as const

type SlideId = (typeof SLIDES)[number]

// ─── motion variants ──────────────────────────────────────────────────────────

const slideIn = {
  hidden: { opacity: 0, x: 60 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.55, ease: lumaEase } },
  exit: { opacity: 0, x: -60, transition: { duration: 0.35, ease: lumaEase } },
}

const fadeIn = {
  hidden: { opacity: 0, y: 20 },
  visible: (delay = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: lumaEase, delay },
  }),
}

// ─── individual slides ────────────────────────────────────────────────────────

function SlideBrandLogo() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-8">
      <motion.img
        src={lumaLogo}
        alt="Luma"
        className="w-40 sm:w-56"
        variants={fadeIn}
        custom={0}
        initial="hidden"
        animate="visible"
      />
      <motion.p
        className="font-brand text-4xl font-bold tracking-widest text-luma-teal-900 sm:text-6xl"
        variants={fadeIn}
        custom={0.3}
        initial="hidden"
        animate="visible"
      >
        Luma
      </motion.p>
      <motion.p
        className="text-lg text-luma-muted sm:text-xl"
        variants={fadeIn}
        custom={0.55}
        initial="hidden"
        animate="visible"
      >
        AI 儿童情感成长陪伴平台
      </motion.p>
    </div>
  )
}

function SlideBrandOrigin() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-10 px-8 text-center">
      <motion.div variants={fadeIn} custom={0} initial="hidden" animate="visible">
        <span className="rounded-full bg-luma-teal-100 px-4 py-1.5 text-sm font-bold text-luma-teal-700">
          品牌由来
        </span>
      </motion.div>

      <motion.div
        className="flex flex-wrap items-center justify-center gap-6 text-5xl font-bold sm:text-7xl"
        variants={fadeIn}
        custom={0.2}
        initial="hidden"
        animate="visible"
      >
        <span className="font-brand text-luma-teal-300">illu</span>
        <span className="font-brand text-luma-teal-500">minate</span>
        <span className="text-3xl text-luma-muted sm:text-4xl">+</span>
        <span className="font-brand text-luma-gold-500">lumen</span>
      </motion.div>

      <motion.div
        className="flex flex-col items-center gap-3"
        variants={fadeIn}
        custom={0.45}
        initial="hidden"
        animate="visible"
      >
        <div className="h-px w-16 bg-luma-teal-300" />
        <p className="font-display text-2xl font-semibold text-luma-teal-900 sm:text-3xl">
          一束光
        </p>
        <p className="max-w-md text-lg leading-relaxed text-luma-muted">
          照亮孩子内心的小世界
        </p>
      </motion.div>

      <motion.div
        className="grid max-w-lg grid-cols-2 gap-4"
        variants={fadeIn}
        custom={0.65}
        initial="hidden"
        animate="visible"
      >
        {[
          { word: 'illuminate', meaning: '照亮 · 启迪' },
          { word: 'lumen', meaning: '光通量 · 光之本质' },
        ].map((item) => (
          <div
            key={item.word}
            className="rounded-2xl border border-luma-ivory-200 bg-white/60 px-5 py-4 backdrop-blur-sm"
          >
            <div className="font-brand text-lg font-bold text-luma-teal-500">{item.word}</div>
            <div className="mt-1 text-sm text-luma-muted">{item.meaning}</div>
          </div>
        ))}
      </motion.div>
    </div>
  )
}

function SlideNiloIntro() {
  return (
    <div className="flex h-full items-center justify-center gap-12 px-8">
      {/* Nilo */}
      <motion.div
        className="flex shrink-0 flex-col items-center gap-4"
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1, transition: { duration: 0.6, ease: lumaEase } }}
      >
        <motion.img
          src={niloGif}
          alt="Nilo"
          className="w-48 sm:w-64"
          style={{ mixBlendMode: 'multiply' }}
          animate={{ y: [0, -10, 0] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        />
        <span className="rounded-full bg-luma-teal-100 px-4 py-1.5 text-sm font-bold text-luma-teal-700">
          Nilo
        </span>
      </motion.div>

      {/* speech bubble */}
      <motion.div
        className="relative max-w-md rounded-3xl border border-luma-ivory-200 bg-white/80 p-8 shadow-luma-md backdrop-blur-sm"
        variants={fadeIn}
        custom={0.3}
        initial="hidden"
        animate="visible"
      >
        {/* tail */}
        <div className="absolute -left-3 top-10 h-6 w-6 rotate-45 border-b border-l border-luma-ivory-200 bg-white/80" />

        <p className="font-display text-2xl font-semibold leading-relaxed text-luma-teal-900">
          "嗨！我是 Nilo，一只爱冒险的水獭。"
        </p>
        <p className="mt-4 leading-relaxed text-luma-muted">
          我会陪伴孩子在画布上探索内心世界——每一笔都是一个故事，每一个故事都值得被听见。
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          {['陪伴', '倾听', '引导', '鼓励'].map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-luma-teal-50 px-3 py-1 text-xs font-bold text-luma-teal-600"
            >
              {tag}
            </span>
          ))}
        </div>
      </motion.div>
    </div>
  )
}

// ─── feature slides (Nilo left + content right) ───────────────────────────────

interface FeatureSlideProps {
  step: string
  title: string
  description: string
  detail: string
  points: string[]
  accent: string
  icon: string
}

function FeatureSlide({ step, title, description, detail, points, accent, icon }: FeatureSlideProps) {
  return (
    <div className="flex h-full items-center gap-10 px-8">
      {/* Nilo sidebar */}
      <motion.div
        className="flex w-40 shrink-0 flex-col items-center gap-3"
        initial={{ opacity: 0, x: -30 }}
        animate={{ opacity: 1, x: 0, transition: { duration: 0.5, ease: lumaEase } }}
      >
        <motion.img
          src={niloGif}
          alt="Nilo"
          className="w-36"
          style={{ mixBlendMode: 'multiply' }}
          animate={{ y: [0, -8, 0] }}
          transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
        />
        <div className="rounded-2xl border border-luma-ivory-200 bg-white/70 px-3 py-2 text-center text-xs leading-relaxed text-luma-muted backdrop-blur-sm">
          {detail}
        </div>
      </motion.div>

      {/* content */}
      <div className="min-w-0 flex-1">
        <motion.div variants={fadeIn} custom={0.1} initial="hidden" animate="visible">
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${accent}`}>{step}</span>
        </motion.div>

        <motion.div
          className="mt-4 text-5xl"
          variants={fadeIn}
          custom={0.2}
          initial="hidden"
          animate="visible"
        >
          {icon}
        </motion.div>

        <motion.h2
          className="mt-3 font-display text-3xl font-semibold text-luma-teal-900 sm:text-4xl"
          variants={fadeIn}
          custom={0.3}
          initial="hidden"
          animate="visible"
        >
          {title}
        </motion.h2>

        <motion.p
          className="mt-3 text-lg leading-relaxed text-luma-muted"
          variants={fadeIn}
          custom={0.4}
          initial="hidden"
          animate="visible"
        >
          {description}
        </motion.p>

        <motion.ul
          className="mt-6 space-y-3"
          variants={fadeIn}
          custom={0.5}
          initial="hidden"
          animate="visible"
        >
          {points.map((pt) => (
            <li key={pt} className="flex items-start gap-3">
              <span className="mt-1 size-2 shrink-0 rounded-full bg-luma-teal-400" />
              <span className="text-luma-muted">{pt}</span>
            </li>
          ))}
        </motion.ul>
      </div>
    </div>
  )
}

function SlideClosing() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-8 px-8 text-center">
      <motion.img
        src={niloGif}
        alt="Nilo"
        className="w-40"
        style={{ mixBlendMode: 'multiply' }}
        animate={{ y: [0, -12, 0] }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        initial={{ opacity: 0, scale: 0.8 }}
        whileInView={{ opacity: 1, scale: 1 }}
      />

      <motion.div variants={fadeIn} custom={0.2} initial="hidden" animate="visible">
        <img src={lumaLogo} alt="Luma" className="mx-auto w-20" />
      </motion.div>

      <motion.p
        className="font-display text-3xl font-semibold leading-relaxed text-luma-teal-900 sm:text-4xl"
        variants={fadeIn}
        custom={0.4}
        initial="hidden"
        animate="visible"
      >
        每个孩子都值得被真正听见
      </motion.p>

      <motion.p
        className="max-w-md text-lg text-luma-muted"
        variants={fadeIn}
        custom={0.6}
        initial="hidden"
        animate="visible"
      >
        Luma · 用一束光，照亮孩子内心的小世界
      </motion.p>
    </div>
  )
}

// ─── slide data ───────────────────────────────────────────────────────────────

const FEATURE_DATA: Record<string, FeatureSlideProps> = {
  'feature-drawing': {
    step: '第一步',
    title: '孩子自由作画',
    description: 'Nilo 静静陪在一旁，实时观察画布上的每一笔——颜色、形状、构图都被温柔地记录下来。',
    detail: '"画吧，我在看！"',
    points: [
      '自由画布，无边界创作',
      'Nilo 实时感知画面内容与情绪倾向',
      '不打断，不评判，只是陪伴',
    ],
    accent: 'bg-luma-teal-50 text-luma-teal-700',
    icon: '🎨',
  },
  'feature-emotion': {
    step: '第二步',
    title: '情绪可视化解读',
    description: 'Nilo 从画面中提取情绪线索，用温柔的方式把孩子内心的感受呈现出来。',
    detail: '"我看到了你的心情~"',
    points: [
      '从颜色、笔触、元素识别情绪信号',
      '生成直观的情绪主题标签',
      '帮助孩子认识和命名自己的感受',
    ],
    accent: 'bg-luma-gold-100 text-luma-gold-700',
    icon: '✨',
  },
  'feature-guidance': {
    step: '第三步',
    title: 'Nilo 引导孩子表达',
    description: '基于画面内容，Nilo 提出温暖的问题，一步一步鼓励孩子用语言说出内心的故事。',
    detail: '"告诉我更多吧！"',
    points: [
      '结合画面内容生成个性化引导问题',
      '语气温柔，节奏由孩子掌握',
      '将沉默的画面转化为有声的表达',
    ],
    accent: 'bg-[#ede9ff] text-[#5a4fcf]',
    icon: '💬',
  },
  'feature-parent': {
    step: '第四步',
    title: '成长洞察反馈给家长',
    description: '创作结束后，家长端收到一份完整的成长报告，并附上 AI 生成的沟通建议。',
    detail: '"我来帮你们更靠近~"',
    points: [
      '画作 + 情绪 + 表达内容整合呈现',
      'AI 分析近期创作主题与情绪变化',
      '提供具体的亲子沟通话术建议',
    ],
    accent: 'bg-luma-teal-50 text-luma-teal-600',
    icon: '📋',
  },
}

// ─── main page ────────────────────────────────────────────────────────────────

export function PresentPage() {
  const [current, setCurrent] = useState(0)
  const audioRef = useRef<HTMLAudioElement>(null)
  const [muted, setMuted] = useState(false)

  const total = SLIDES.length
  const slideId = SLIDES[current] as SlideId

  // keyboard navigation
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault()
        setCurrent((c) => Math.min(c + 1, total - 1))
      }
      if (e.key === 'ArrowLeft') {
        setCurrent((c) => Math.max(c - 1, 0))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [total])

  // autoplay music
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    audio.volume = 0.35
    audio.loop = true
    audio.play().catch(() => {})
  }, [])

  function toggleMute() {
    const audio = audioRef.current
    if (!audio) return
    audio.muted = !audio.muted
    setMuted(audio.muted)
  }

  function renderSlide(id: SlideId) {
    if (id === 'brand-logo') return <SlideBrandLogo />
    if (id === 'brand-origin') return <SlideBrandOrigin />
    if (id === 'nilo-intro') return <SlideNiloIntro />
    if (id === 'closing') return <SlideClosing />
    return <FeatureSlide {...FEATURE_DATA[id]} />
  }

  return (
    <div className="relative flex h-screen w-screen flex-col overflow-hidden bg-luma-ivory-50">
      {/* ambient background blobs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -top-32 -left-32 size-[500px] rounded-full bg-luma-teal-100/50 blur-3xl" />
        <div className="absolute -right-32 -bottom-32 size-[400px] rounded-full bg-luma-gold-100/60 blur-3xl" />
      </div>

      {/* audio */}
      <audio ref={audioRef} src="/demo-music.mp3" preload="auto" />

      {/* top bar */}
      <div className="relative z-10 flex items-center justify-between px-6 pt-5">
        <img src={lumaLogo} alt="Luma" className="h-7" />
        <div className="flex items-center gap-3">
          {/* progress dots */}
          <div className="flex gap-1.5">
            {SLIDES.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setCurrent(i)}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === current
                    ? 'w-6 bg-luma-teal-500'
                    : i < current
                      ? 'w-1.5 bg-luma-teal-300'
                      : 'w-1.5 bg-luma-ivory-200'
                }`}
                aria-label={`跳转到第 ${i + 1} 页`}
              />
            ))}
          </div>
          {/* mute toggle */}
          <button
            type="button"
            onClick={toggleMute}
            className="rounded-full bg-white/70 px-3 py-1.5 text-xs font-bold text-luma-muted backdrop-blur-sm transition hover:bg-white"
          >
            {muted ? '🔇' : '🎵'}
          </button>
        </div>
      </div>

      {/* slide area */}
      <div className="relative z-10 min-h-0 flex-1">
        <AnimatePresence mode="wait">
          <motion.div
            key={slideId}
            className="absolute inset-0"
            variants={slideIn}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            {renderSlide(slideId)}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* bottom nav */}
      <div className="relative z-10 flex items-center justify-between px-6 pb-6">
        <button
          type="button"
          onClick={() => setCurrent((c) => Math.max(c - 1, 0))}
          disabled={current === 0}
          className="rounded-full border border-luma-ivory-200 bg-white/70 px-5 py-2 text-sm font-bold text-luma-muted backdrop-blur-sm transition hover:bg-white disabled:opacity-30"
        >
          ← 上一页
        </button>

        <span className="text-xs text-luma-muted">
          {current + 1} / {total}
        </span>

        <button
          type="button"
          onClick={() => setCurrent((c) => Math.min(c + 1, total - 1))}
          disabled={current === total - 1}
          className="rounded-full bg-luma-teal-500 px-5 py-2 text-sm font-bold text-white shadow-luma-sm transition hover:bg-luma-teal-600 disabled:opacity-30"
        >
          下一页 →
        </button>
      </div>
    </div>
  )
}
