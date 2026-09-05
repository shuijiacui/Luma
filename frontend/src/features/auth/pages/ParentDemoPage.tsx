import { motion } from 'framer-motion'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import {
  isOnboardingDone,
  isOnboardingShownThisSession,
  markOnboardingDone,
  markOnboardingShownThisSession,
  useOnboarding,
} from '@/features/onboarding/OnboardingContext'
import { parentSteps } from '@/features/onboarding/steps/parentSteps'

import { defaultAvatars } from '@/assets/avatars'
import { lumaLogo } from '@/assets/brand'
import bgParent from '@/assets/images/bg-parent.png'
import { Button, Card } from '@/components/ui'
import { fadeUp, staggerContainer } from '@/design-system'
import { CommunicationSection } from '@/features/parents/components/CommunicationSection'
import { TimelineSection } from '@/features/parents/components/TimelineSection'
import { AvatarPicker } from '@/features/profile/components/AvatarPicker'
import { fetchMe, listAnalyses, type AnalysisSummary, type MeResponse } from '@/lib/api/authApi'
import { cn } from '@/lib/cn'
import { useAuth } from '../AuthContext'
import { findFamilyById, getChildrenForFamily } from '../storage'
import { ChildArtwork, type ArtworkKind } from '@/features/parents/components/dashboard/artworks'
import { Butterfly, LeafSprig, OtterDeco, SparkleDot } from '@/features/parents/components/dashboard/decor'
import { ArrowLeftIcon, BellIcon, ChevronDownIcon, ChevronRightIcon } from '@/features/parents/components/dashboard/icons'
import { OverviewDashboard } from '@/features/parents/components/dashboard/OverviewDashboard'
import {
  DEMO_OVERVIEW,
  elementLabel,
  kindForElements,
  type Finding,
  type OverviewModel,
  type OverviewStatus,
  type Suggestion,
  type ThemeTile,
} from '@/features/parents/components/dashboard/overviewModel'
import { DEFAULT_VIEW, NAV_ENTRIES, type ViewKey } from '@/features/parents/components/dashboard/parentNav'
import { ParentMobileNav, ParentSidebar } from '@/features/parents/components/dashboard/ParentSidebar'

// 游客演示 insight（无真实数据时展示）
const DEMO_INSIGHT = {
  period: '本周创作洞察',
  themes: [
    { name: '探索新世界', detail: '在 5 幅画中出现', color: 'bg-luma-grass-500' },
    { name: '伙伴与合作', detail: '画面中角色常常一起出现', color: 'bg-luma-gold-300' },
    { name: '自然想象', detail: '云朵、河流和森林成为画面背景', color: 'bg-[#7a82d8]' },
  ],
  quotes: [
    {
      text: '"小船不知道要去哪里，但是 Nilo 说，我们可以一起找。"',
      source: '《Nilo 的蓝色小船》',
      time: '周二',
    },
    {
      text: '"森林里的每一盏灯，都是一个还没讲完的故事。"',
      source: '《会发光的森林》',
      time: '周四',
    },
  ],
  observation: '孩子最近的绘画经常出现探索和伙伴主题。角色面对未知时，常常会邀请朋友一起行动；在画面里，通往远方的道路、河流和小船也多次出现。',
  observations: [
    '画面角色从独自出发，逐渐变成结伴探索。',
    '孩子会为画面中的小物件补充细节和标注。',
    '同一个想象会通过不同绘画继续发展。',
  ],
  suggestions: [
    { title: '从画面出发聊聊', prompt: '"如果小船明天继续出发，它最想邀请谁一起去？"' },
    { title: '支持 ta 的好奇心', prompt: '"这片森林里，你最想带我认识哪个地方？"' },
    { title: '创造共同创作的时刻', prompt: '"接下来发生什么，由你来决定的话，会是什么？"' },
  ],
  recentCreations: [
    { title: '会发光的森林', type: '绘画', day: '9 月 3 日', tone: 'teal' as const },
    { title: 'Nilo 的蓝色小船', type: '绘画', day: '8 月 29 日', tone: 'gold' as const },
    { title: '云朵上的城市', type: '绘画', day: '8 月 22 日', tone: 'violet' as const },
  ],
} as const

function deriveInsight(analyses: AnalysisSummary[]) {
  if (analyses.length === 0) return null

  const withAdvice = analyses.find((a) => a.report?.parentAdvice?.length)
  const suggestions =
    withAdvice?.report?.parentAdvice.slice(0, 3).map((adv, i) => ({
      title: ['从画面出发聊聊', '听听 ta 的解释', '把好奇留给孩子'][i] ?? `建议 ${i + 1}`,
      prompt: `"${adv}"`,
    })) ?? DEMO_INSIGHT.suggestions

  const latestAdvice = withAdvice?.report?.parentAdvice[0]
  const observation =
    latestAdvice ??
    (analyses.length > 0
      ? '孩子的创作正在积累中，更多观察会在解读生成后出现在这里。'
      : '孩子的创作正在积累中，更多洞察即将生成。')

  return { suggestions, observation }
}

const RECENT_CUTOFF_DAYS = 28
const SUGGESTION_FALLBACK_TITLES = ['从画面出发聊聊', '支持 ta 的好奇心', '创造共同创作的时刻']
const EMOTION_TEXT: Record<string, string> = {
  乐观平稳: '平稳积极',
  未见明显风险信号: '平稳积极',
  焦虑倾向: '需要留意',
  低落倾向: '需要留意',
  需要关注: '需要关注',
  信息不足: '观察中',
}

function firstImageForElement(analyses: AnalysisSummary[], element: string): string | null {
  for (const a of analyses) {
    if (a.imageUrl && a.summary.elements.includes(element)) return a.imageUrl
  }
  return null
}

function computeThemeTiles(analyses: AnalysisSummary[]): ThemeTile[] {
  const freq = new Map<string, number>()
  for (const a of analyses) {
    for (const el of a.summary.elements) freq.set(el, (freq.get(el) ?? 0) + 1)
  }
  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([el, count]) => ({
      id: el,
      title: elementLabel(el),
      count,
      kind: kindForElements([el]),
      imageUrl: firstImageForElement(analyses, el) ?? undefined,
    }))
}

function buildRealOverview(analyses: AnalysisSummary[], token?: string): OverviewModel | null {
  if (analyses.length === 0) return null
  const now = Date.now()
  const cutoff = now - RECENT_CUTOFF_DAYS * 24 * 60 * 60 * 1000
  const recent = analyses.filter((a) => new Date(a.createdAt).getTime() >= cutoff)
  const window = recent.length > 0 ? recent : analyses

  const latest = analyses[0]
  const elements = latest.summary.elements
  const imageUrl = latest.imageUrl
    ? token
      ? `${latest.imageUrl}?token=${encodeURIComponent(token)}`
      : latest.imageUrl
    : undefined
  const date = new Date(latest.createdAt)
  const dateLabel = `${date.getMonth() + 1} 月 ${date.getDate()} 日`
  const title = elements.slice(0, 3).join('、') || '一幅小画'

  const advice =
    latest.report?.parentAdvice?.slice(0, 3) ??
    analyses.find((a) => a.report?.parentAdvice?.length)?.report?.parentAdvice?.slice(0, 3) ??
    []
  const observation =
    advice[0] ??
    (elements.length > 0
      ? `这幅画里出现了${elements.map(elementLabel).join('、')}，更多观察会在解读生成后出现在这里。`
      : '更多观察会在解读生成后出现在这里。')

  const report = latest.report
  const reportEmotion = report?.emotion ? EMOTION_TEXT[report.emotion] ?? report.emotion : undefined
  const statuses: OverviewStatus[] = [
    {
      id: 'emotion',
      emoji: '☀️',
      label: '情绪倾向',
      value: report ? Math.round(Math.min(100, Math.max(12, report.confidence * 100))) : 10,
      statusText: reportEmotion ?? '等待解读',
      tone: 'grass',
    },
    {
      id: 'express',
      emoji: '💬',
      label: '表达意愿',
      value: Math.min(94, 52 + window.length * 8),
      statusText: window.length >= 3 ? '较主动' : '正在积累',
      tone: 'gold',
    },
    {
      id: 'imagine',
      emoji: '✨',
      label: '想象丰富度',
      value: Math.min(94, 48 + window.length * 6 + (window[0]?.summary.elements.length ?? 0) * 3),
      statusText: window.length >= 2 ? '丰富' : '慢慢展开',
      tone: 'clay',
    },
  ]

  const themes = computeThemeTiles(window)
  const topTwo = themes.slice(0, 2)
  const findings: Finding[] = topTwo.length
    ? [
        {
          id: 'f1',
          emoji: '🔎',
          title: `常画“${topTwo[0].title}”`,
          desc: `在最近 ${window.length} 幅作品中，“${topTwo[0].title}”出现了 ${topTwo[0].count} 次，成为画面里最常出现的内容之一。`,
        },
        ...(topTwo[1]
          ? [
              {
                id: 'f2',
                emoji: '🧩',
                title: `“${topTwo[1].title}”也在悄悄出现`,
                desc: `它出现了 ${topTwo[1].count} 次，和 ta 最近关心的事或许有关。`,
              } satisfies Finding,
            ]
          : []),
      ]
    : [
        {
          id: 'f1',
          emoji: '🌱',
          title: '创作正在积累',
          desc: '更多画作完成后，这里会慢慢浮现 ta 的成长小发现。',
        },
      ]

  const suggestions: Suggestion[] = advice.map((text, i) => ({
    id: `s${i}`,
    emoji: ['💬', '🔭', '🎨'][i] ?? '🌿',
    title: SUGGESTION_FALLBACK_TITLES[i] ?? `建议 ${i + 1}`,
    desc: text,
  }))

  return {
    periodLabel: '过去 4 周',
    artwork: {
      id: latest.id,
      title,
      dateLabel,
      quote: latest.rawDescription ? `“${latest.rawDescription}”` : undefined,
      tags: elements.slice(0, 5).map(elementLabel),
      observation,
      imageUrl,
      kind: kindForElements(elements),
    },
    statuses,
    themes,
    findings,
    suggestions,
    hint: `ta 最近的作品里，${themes[0] ? `“${themes[0].title}”` : '不同主题'}出现得比较多，可以顺着这些画面和孩子聊聊。`,
  }
}

/** 演示用创作记录（游客） */
const DEMO_RECORDS = [
  {
    month: '9 月',
    works: [
      { id: 'd-1', title: '一艘去远方的小船', day: '9 月 5 日', kind: 'boat' as ArtworkKind },
      { id: 'd-2', title: '会发光的森林', day: '9 月 3 日', kind: 'nature' as ArtworkKind },
    ],
  },
  {
    month: '8 月',
    works: [
      { id: 'd-3', title: 'Nilo 的蓝色小船', day: '8 月 29 日', kind: 'boat' as ArtworkKind },
      { id: 'd-4', title: '云朵上的城市', day: '8 月 22 日', kind: 'nature' as ArtworkKind },
      { id: 'd-5', title: '一起野餐的朋友们', day: '8 月 16 日', kind: 'family' as ArtworkKind },
    ],
  },
]

const CARD_CLASS =
  'rounded-[1.9rem] border border-white/70 bg-white/95 shadow-luma-card backdrop-blur-sm'

export function ParentDemoPage() {
  const navigate = useNavigate()
  const { session, logout } = useAuth()
  const isGuest = !session || session.isGuest || !session.token

  const [me, setMe] = useState<MeResponse | null>(null)
  const [analyses, setAnalyses] = useState<AnalysisSummary[] | null>(null)
  const [activeView, setActiveView] = useState<ViewKey>(DEFAULT_VIEW)
  const [readingOpen, setReadingOpen] = useState(false)
  const [childMenuOpen, setChildMenuOpen] = useState(false)
  const [bellOpen, setBellOpen] = useState(false)
  const [selectedChildId, setSelectedChildId] = useState('')
  const [copied, setCopied] = useState(false)

  const { start: startOnboarding } = useOnboarding()
  useEffect(() => {
    if (isGuest) {
      if (isOnboardingShownThisSession('parent')) return
      const timer = window.setTimeout(() => {
        markOnboardingShownThisSession('parent')
        startOnboarding(parentSteps)
      }, 700)
      return () => window.clearTimeout(timer)
    }
    if (isOnboardingDone('parent')) return
    const timer = window.setTimeout(() => {
      startOnboarding(parentSteps, { onDismiss: () => markOnboardingDone('parent') })
    }, 700)
    return () => window.clearTimeout(timer)
  }, [isGuest, startOnboarding])

  useEffect(() => {
    if (!session?.isGuest && session?.token) {
      fetchMe(session.token).then(setMe).catch(() => setMe(null))
    }
  }, [session])

  const family = isGuest ? (session ? findFamilyById(session.familyId) : undefined) : me?.family
  const inviteCode = isGuest ? family?.inviteCode : me?.family.inviteCode
  const children = useMemo(
    () =>
      isGuest
        ? session
          ? getChildrenForFamily(session.familyId)
          : []
        : (me?.children ?? []),
    [isGuest, session, me],
  )

  const selectedChild = children.find((c) => c.id === selectedChildId) ?? children[0]

  useEffect(() => {
    if (isGuest || !selectedChild || !session?.token) {
      setAnalyses(null)
      return
    }
    listAnalyses(selectedChild.id, session.token)
      .then((res) => setAnalyses(res.analyses))
      .catch(() => setAnalyses([]))
  }, [isGuest, selectedChild?.id, session?.token])

  const insight = useMemo(() => {
    if (isGuest || (analyses !== null && analyses.length === 0)) {
      return { observation: DEMO_INSIGHT.observation, suggestions: DEMO_INSIGHT.suggestions }
    }
    if (!analyses) return null
    return deriveInsight(analyses)
  }, [isGuest, analyses])

  const overview = useMemo<OverviewModel | null>(() => {
    if (isGuest) return DEMO_OVERVIEW
    if (analyses === null) return null
    // 尚无真实画作时，用硬编码示例内容展示功能形态
    return buildRealOverview(analyses, session?.token) ?? DEMO_OVERVIEW
  }, [isGuest, analyses, session?.token])

  const realEmptyDemo = !isGuest && analyses !== null && analyses.length === 0

  const childMeta = isGuest ? '5 岁 2 个月 · 小创作者' : '小创作者'
  // 无真实创作数据时，让时间轴 / AI 助手等视图用内置示例内容展示功能
  const feedChildId = isGuest || realEmptyDemo ? undefined : selectedChild?.id
  const feedToken = isGuest || realEmptyDemo ? undefined : session?.token

  function childAvatar(child: { id: string }, index: number) {
    return (
      window.localStorage.getItem(`luma_avatar_${child.id}`) ??
      defaultAvatars[index % defaultAvatars.length].src
    )
  }

  function handleLogout() {
    logout()
    navigate('/auth?role=parent&mode=login')
  }

  async function copyInviteCode() {
    if (!inviteCode) return
    await navigator.clipboard.writeText(inviteCode)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  function selectView(view: ViewKey) {
    setActiveView(view)
    setReadingOpen(false)
    setChildMenuOpen(false)
    setBellOpen(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const meta = NAV_ENTRIES.find((e) => e.key === activeView) ?? NAV_ENTRIES[0]

  const childDropdown = children.length > 0 && (
    <div className="relative hidden lg:block" data-onboarding="parent-child-switcher">
      <button
        type="button"
        onClick={() => setChildMenuOpen((v) => !v)}
        aria-expanded={childMenuOpen}
        aria-haspopup="listbox"
        className="flex items-center gap-2.5 rounded-full border border-white/80 bg-white/90 py-1.5 pr-3 pl-1.5 shadow-luma-sm backdrop-blur-sm transition hover:-translate-y-0.5 focus-visible:ring-3 focus-visible:ring-luma-grass-300/60"
      >
        <img
          src={childAvatar(
            selectedChild ?? { id: 'none' },
            Math.max(0, children.findIndex((c) => c.id === selectedChild?.id)),
          )}
          alt=""
          className="size-9 rounded-full object-contain"
        />
        <span className="text-left leading-tight">
          <span className="block text-sm font-bold text-[#334038]">
            {selectedChild?.nickname ?? '小创作者'}
          </span>
          <span className="block text-[0.65rem] font-medium text-[#9a9280]">{childMeta}</span>
        </span>
        <ChevronDownIcon
          className={cn('size-4 text-[#9a9280] transition-transform', childMenuOpen && 'rotate-180')}
        />
      </button>

      {childMenuOpen && (
        <div
          role="listbox"
          aria-label="选择孩子"
          className="absolute top-[calc(100%+0.6rem)] right-0 z-40 w-64 overflow-hidden rounded-3xl border border-white/90 bg-white/95 p-2 shadow-luma-md backdrop-blur-xl"
        >
          {children.map((child, index) => {
            const active = child.id === selectedChild?.id
            return (
              <button
                key={child.id}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => {
                  setSelectedChildId(child.id)
                  setChildMenuOpen(false)
                }}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-2xl px-3 py-2.5 text-left transition',
                  active ? 'bg-luma-grass-50' : 'hover:bg-[#faf7ef]',
                )}
              >
                <img src={childAvatar(child, index)} alt="" className="size-8 rounded-full object-contain" />
                <span className="flex-1 text-sm font-bold text-[#334038]">{child.nickname}</span>
                {active && <span className="size-1.5 rounded-full bg-luma-grass-500" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )

  const mobileChildChips = children.length > 0 && (
    <div data-onboarding="parent-child-switcher-mobile" className="flex flex-wrap items-center gap-1.5 lg:hidden">
      {children.map((child, index) => {
        const active = child.id === selectedChild?.id
        return (
          <button
            key={child.id}
            type="button"
            onClick={() => setSelectedChildId(child.id)}
            aria-pressed={active}
            className={cn(
              'flex items-center gap-1.5 rounded-full border py-0.5 pr-3 pl-0.5 text-xs font-bold transition',
              active
                ? 'border-luma-grass-200 bg-white text-luma-grass-700 shadow-luma-sm'
                : 'border-transparent bg-white/70 text-[#8b9285]',
            )}
          >
            <img src={childAvatar(child, index)} alt="" className="size-7 rounded-full object-contain" />
            {child.nickname}
          </button>
        )
      })}
    </div>
  )

  const invitePill = (
    <div
      data-onboarding="parent-invite"
      className="hidden shrink-0 items-center gap-2 rounded-full border border-white/80 bg-white/85 py-1 pr-1 pl-3 shadow-luma-sm backdrop-blur-sm xl:flex"
    >
      <span className="text-xs font-semibold text-[#9a9280]">邀请码</span>
      <strong className="font-brand text-sm tracking-[0.1em] text-luma-grass-700">
        {inviteCode ?? '—'}
      </strong>
      <button
        type="button"
        onClick={copyInviteCode}
        className="rounded-full bg-luma-grass-100 px-2.5 py-1 text-xs font-bold text-luma-grass-700 transition hover:bg-luma-grass-200"
      >
        {copied ? '已复制' : '复制'}
      </button>
    </div>
  )

  const mobileInvitePill = (
    <div
      data-onboarding="parent-invite-mobile"
      className="flex items-center gap-1.5 rounded-full border border-white/80 bg-white/85 px-2.5 py-1 text-xs shadow-sm backdrop-blur-sm lg:hidden"
    >
      <span className="text-[#9a9280]">邀请码</span>
      <strong className="font-brand text-[0.8rem] tracking-[0.08em] text-luma-grass-700">
        {inviteCode ?? '—'}
      </strong>
      <button
        type="button"
        onClick={copyInviteCode}
        className="rounded-full bg-luma-grass-100 px-2 py-0.5 text-[0.68rem] font-bold text-luma-grass-700"
      >
        {copied ? '已复制' : '复制'}
      </button>
    </div>
  )

  const headerActions = (
    <div className="flex items-center gap-2.5">
      {invitePill}
      {childDropdown}
      <div className="relative">
        <button
          type="button"
          onClick={() => setBellOpen((v) => !v)}
          aria-label="通知"
          className="relative grid size-10 place-items-center rounded-full border border-white/80 bg-white/90 text-[#8b9285] shadow-luma-sm backdrop-blur-sm transition hover:-translate-y-0.5 hover:text-luma-grass-600 focus-visible:ring-3 focus-visible:ring-luma-grass-300/60"
        >
          <BellIcon className="size-[1.15rem]" />
          <span className="absolute top-2 right-2.5 size-1.5 rounded-full bg-luma-clay-300" />
        </button>
        {bellOpen && (
          <div className="absolute top-[calc(100%+0.6rem)] right-0 z-40 w-64 rounded-3xl border border-white/90 bg-white/95 p-4 shadow-luma-md backdrop-blur-xl">
            <div className="text-sm font-bold text-[#334038]">通知</div>
            <p className="mt-2 rounded-2xl bg-[#faf7ef] px-3.5 py-2.5 text-xs leading-relaxed text-[#8b8371]">
              暂时没有新消息。孩子完成新的创作后，我们会在这里轻轻提醒你 🍃
            </p>
          </div>
        )}
      </div>
    </div>
  )

  const mobileQuickRow = (
    <div className="mt-3 flex items-center justify-between gap-2 lg:hidden">
      {mobileChildChips}
      {mobileInvitePill}
    </div>
  )

  const renderHeader = (
    <motion.div variants={fadeUp} className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-[#9a8a5f]">
          <SparkleDot className="size-3.5 text-luma-gold-300" />
          <span className="luma-eyebrow text-[0.66rem] tracking-[0.22em] text-[#a0906b]">Luma · 家长空间</span>
        </div>
        <h1 className="mt-1.5 font-display text-[2rem] font-bold tracking-tight text-[#2c3a33] sm:text-[2.5rem]">
          {meta.title}
        </h1>
        <p className="mt-2 max-w-xl text-[0.9rem] leading-relaxed text-[#7d8777]">{meta.subtitle}</p>
        {activeView === 'overview' && mobileQuickRow}
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1.5">
        {headerActions}
        {activeView === 'overview' && (
          <div className="hidden items-center gap-1 lg:flex" aria-hidden="true">
            <OtterDeco className="h-10 w-auto" alt="Nilo" />
            <Butterfly className="h-5 w-6 -translate-y-1 -rotate-6" />
            <LeafSprig className="h-4 w-4 -translate-y-2 rotate-12 opacity-80" tone="green" />
            <span className="font-hand ml-1 text-[0.95rem] text-[#8fa180] [text-shadow:0_1px_0_rgba(255,255,255,0.8)]">
              每一幅画都是 ta 看向世界的方式。
            </span>
          </div>
        )}
      </div>
    </motion.div>
  )

  function renderRecords() {
    if (isGuest || (analyses !== null && analyses.length === 0)) {
      return (
        <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="space-y-7">
          {DEMO_RECORDS.map((group) => (
            <motion.section key={group.month} variants={fadeUp}>
              <div className="mb-3.5 flex items-center gap-4">
                <span className="font-display text-lg font-bold text-[#3a463c]">{group.month}</span>
                <div className="h-px flex-1 bg-[#e2ddca]" />
                <span className="text-xs text-[#9a9280]">{group.works.length} 件</span>
              </div>
              <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
                {group.works.map((work) => (
                  <div key={work.id} className={cn('group overflow-hidden p-3', CARD_CLASS)}>
                    <div className="relative aspect-square overflow-hidden rounded-[1.25rem] bg-[#fffdf6]">
                      <ChildArtwork kind={work.kind} className="absolute inset-0 h-full w-full transition-transform duration-500 group-hover:scale-[1.04]" />
                    </div>
                    <div className="px-1.5 pt-3 pb-1.5">
                      <div className="text-sm font-bold text-[#3a463c]">{work.title}</div>
                      <div className="mt-1 text-xs text-[#9a9280]">绘画 · {work.day}</div>
                    </div>
                  </div>
                ))}
              </div>
            </motion.section>
          ))}
        </motion.div>
      )
    }
    if (analyses === null) {
      return <p className="py-16 text-center text-sm text-[#9a9280]">加载中…</p>
    }
    const grouped = new Map<string, AnalysisSummary[]>()
    for (const a of analyses) {
      const d = new Date(a.createdAt)
      const key = `${d.getFullYear()} 年 ${d.getMonth() + 1} 月`
      const list = grouped.get(key) ?? []
      list.push(a)
      grouped.set(key, list)
    }
    const groups = Array.from(grouped.entries()).sort((a, b) => b[0].localeCompare(a[0]))
    return (
      <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="space-y-7">
        {groups.map(([month, works]) => (
          <motion.section key={month} variants={fadeUp}>
            <div className="mb-3.5 flex items-center gap-4">
              <span className="font-display text-lg font-bold text-[#3a463c]">{month}</span>
              <div className="h-px flex-1 bg-[#e2ddca]" />
              <span className="text-xs text-[#9a9280]">{works.length} 件</span>
            </div>
            <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
              {works.map((a) => (
                <div key={a.id} className={cn('group overflow-hidden p-3', CARD_CLASS)}>
                  <div className="relative aspect-square overflow-hidden rounded-[1.25rem] bg-[#fffdf6]">
                    {a.imageUrl ? (
                      <img
                        src={session?.token ? `${a.imageUrl}?token=${encodeURIComponent(session.token)}` : a.imageUrl}
                        alt="孩子的画作"
                        className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                      />
                    ) : (
                      <ChildArtwork kind={kindForElements(a.summary.elements)} className="absolute inset-0 h-full w-full" />
                    )}
                  </div>
                  <div className="px-1.5 pt-3 pb-1.5">
                    <div className="text-sm font-bold text-[#3a463c]">
                      {a.summary.elements.slice(0, 3).map(elementLabel).join('、') || '一幅小画'}
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-xs text-[#9a9280]">
                      <span>
                        {new Date(a.createdAt).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })}
                      </span>
                      {a.report?.emotion && (
                        <span className="rounded-full bg-luma-grass-50 px-2 py-0.5 font-bold text-luma-grass-700">
                          {a.report.emotion}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </motion.section>
        ))}
      </motion.div>
    )
  }

  function renderThemes() {
    const themes = isGuest || realEmptyDemo ? DEMO_OVERVIEW.themes : computeThemeTiles(analyses ?? [])
    return (
      <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="space-y-5">
        <motion.section variants={fadeUp} className={CARD_CLASS}>
          <div className="p-6 sm:p-7">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="luma-eyebrow text-[0.66rem] tracking-[0.2em] text-[#9b8a5f]">主题探索</div>
                <h2 className="mt-1.5 font-display text-xl font-bold text-[#2c3a33]">
                  {selectedChild?.nickname ?? '孩子'} 最近在探索什么？
                </h2>
              </div>
              <span className="rounded-full bg-[#f6f1e6] px-3 py-1 text-xs text-[#9a8f7a]">过去 4 周</span>
            </div>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {themes.map((theme, i) => (
                <div
                  key={theme.id}
                  className="group rounded-[1.4rem] border border-[#efe8d9] bg-[#fdfcf8] p-3 transition hover:-translate-y-1 hover:border-luma-grass-200 hover:shadow-luma-sm"
                >
                  <div className="relative aspect-square overflow-hidden rounded-[1.1rem] bg-[#fffdf6]">
                    {theme.imageUrl ? (
                      <img src={theme.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
                    ) : (
                      <ChildArtwork kind={theme.kind} className="absolute inset-0 h-full w-full" />
                    )}
                  </div>
                  <div className="px-1 pt-3 pb-1 text-center">
                    <div className="text-sm font-bold text-[#3a463c]">{theme.title}</div>
                    <div className="mt-0.5 text-xs text-[#9a9280]">出现 {theme.count} 次</div>
                  </div>
                  <span className="sr-only">{`第 ${i + 1} 个主题`}</span>
                </div>
              ))}
            </div>
            {themes.length === 0 && (
              <p className="py-6 text-center text-sm text-[#9a9280]">
                更多画作完成后，这里会整理出 ta 反复探索的主题。
              </p>
            )}
          </div>
        </motion.section>

        {insight && (
          <motion.section variants={fadeUp} className={CARD_CLASS}>
            <div className="p-6 sm:p-7">
              <div className="luma-eyebrow text-[0.66rem] tracking-[0.2em] text-[#9b8a5f]">延伸的线索</div>
              <p className="mt-2 font-display text-lg leading-relaxed font-semibold text-[#3a463c] sm:text-xl">
                “{insight.observation}”
              </p>
              {isGuest && (
                <div className="mt-5 grid gap-3 md:grid-cols-3">
                  {DEMO_INSIGHT.observations.map((obs, index) => (
                    <div key={obs} className="rounded-2xl bg-[#faf7ef] p-4">
                      <span className="luma-eyebrow text-[#9b8a5f]">0{index + 1}</span>
                      <p className="mt-2 text-sm leading-relaxed text-[#7d8777]">{obs}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.section>
        )}
      </motion.div>
    )
  }

  function renderSettings() {
    return (
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
        className="grid gap-5 md:grid-cols-2"
      >
        <motion.section variants={fadeUp} className={CARD_CLASS}>
          <div className="p-6 sm:p-7">
            <div className="luma-eyebrow text-[0.66rem] tracking-[0.2em] text-[#9b8a5f]">家庭空间</div>
            <h2 className="mt-1.5 font-display text-xl font-bold text-[#2c3a33]">邀请孩子加入</h2>
            <p className="mt-2 text-sm leading-relaxed text-[#7d8777]">
              把这串邀请码发给孩子，ta 注册后就会出现在你的成长概览里，两个账号就连在一起了。
            </p>
            <div className="mt-5 flex items-center justify-between gap-3 rounded-2xl bg-luma-grass-50 px-5 py-4">
              <span className="font-brand text-2xl font-bold tracking-[0.14em] text-luma-grass-700">
                {inviteCode ?? '—'}
              </span>
              <Button
                variant="secondary"
                className="border-luma-grass-200 bg-white text-luma-grass-700 shadow-none hover:bg-luma-grass-100"
                onClick={copyInviteCode}
              >
                {copied ? '已复制 ✓' : '复制邀请码'}
              </Button>
            </div>
          </div>
        </motion.section>

        <motion.section variants={fadeUp} className={CARD_CLASS}>
          <div className="p-6 sm:p-7">
            <div className="luma-eyebrow text-[0.66rem] tracking-[0.2em] text-[#9b8a5f]">孩子管理</div>
            <h2 className="mt-1.5 font-display text-xl font-bold text-[#2c3a33]">和 ta 们连接</h2>
            <div className="mt-5 space-y-2.5">
              {children.map((child, index) => {
                const active = child.id === selectedChild?.id
                return (
                  <button
                    key={child.id}
                    type="button"
                    onClick={() => {
                      setSelectedChildId(child.id)
                      setActiveView('overview')
                    }}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition',
                      active
                        ? 'border-luma-grass-200 bg-luma-grass-50'
                        : 'border-[#efe8d9] bg-[#fdfcf8] hover:border-luma-grass-200',
                    )}
                  >
                    <img src={childAvatar(child, index)} alt="" className="size-10 rounded-full object-contain" />
                    <span className="flex-1">
                      <span className="block text-sm font-bold text-[#334038]">{child.nickname}</span>
                      <span className="mt-0.5 block text-xs text-[#9a9280]">在成长概览中查看</span>
                    </span>
                    <ChevronRightIcon className="size-4 text-[#9a9280]" />
                  </button>
                )
              })}
              {children.length === 0 && (
                <p className="rounded-2xl bg-[#faf7ef] px-4 py-3 text-sm text-[#9a9280]">
                  还没有孩子加入，先复制上方的邀请码吧。
                </p>
              )}
            </div>
          </div>
        </motion.section>

        <motion.section variants={fadeUp} className={cn(CARD_CLASS, 'md:col-span-2')}>
          <div className="flex flex-wrap items-center justify-between gap-5 p-6 sm:p-7">
            <div className="flex items-center gap-4">
              <AvatarPicker userId={session?.id ?? 'guest-parent'} compact />
              <div>
                <div className="text-base font-bold text-[#334038]">{session?.displayName ?? '家长'}</div>
                <div className="mt-0.5 text-xs text-[#9a9280]">
                  家长账号 · {isGuest ? '游客演示家庭' : '已连接家庭空间'}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              {!isGuest && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    startOnboarding(parentSteps, { onDismiss: () => markOnboardingDone('parent') })
                  }
                >
                  重新看新手引导
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={handleLogout}>
                退出登录
              </Button>
            </div>
          </div>
        </motion.section>

        {isGuest && (
          <motion.section variants={fadeUp} className={cn(CARD_CLASS, 'md:col-span-2')}>
            <div className="flex flex-wrap items-center justify-between gap-4 p-6 sm:p-7">
              <div>
                <div className="text-sm font-bold text-[#334038]">创建一个正式账号？</div>
                <p className="mt-1 text-xs leading-relaxed text-[#9a9280]">
                  当前为演示家庭，所有内容仅用于体验呈现方式；注册后即可与真实创作数据相连。
                </p>
              </div>
              <Button
                variant="primary"
                className="bg-luma-grass-600 hover:bg-luma-grass-700"
                onClick={() => {
                  logout()
                  navigate('/auth?role=parent&mode=register')
                }}
              >
                创建正式账号
              </Button>
            </div>
          </motion.section>
        )}
      </motion.div>
    )
  }

  const readingMeta =
    overview && (isGuest || insight)
      ? {
          title: overview.artwork.title,
          quote: overview.artwork.quote,
          observation: overview.artwork.observation,
          statuses: overview.statuses,
          suggestions: overview.suggestions,
        }
      : null

  return (
    <main className="relative min-h-screen overflow-x-clip text-[#3a463c]">
      {/* 背景：保留原图，叠加奶油色让卡片透气 */}
      <img
        src={bgParent}
        alt=""
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 -z-20 h-full w-full object-cover select-none"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 -z-10 bg-[#faf7ef]/55"
      />

      <div className="mx-auto flex w-full max-w-[1560px] gap-6 px-3 py-4 sm:px-5 sm:py-5">
        {/* 桌面端固定左侧导航：悬浮于屏幕中部 */}
        <ParentSidebar active={activeView} onSelect={selectView} />
        <div aria-hidden="true" className="hidden w-[264px] shrink-0 lg:block" />

        <div className="min-w-0 flex-1">
          {/* 移动端导航条 */}
          <div className="mb-4 lg:hidden" data-onboarding="parent-navbar">
            <div className="flex items-center justify-between rounded-[1.7rem] border border-white/70 bg-white/85 px-4 py-3 shadow-luma-card backdrop-blur-xl">
              <a href="/" aria-label="Luma 首页" className="flex items-center gap-2">
                <img src={lumaLogo} alt="" className="h-9 w-9 object-contain" />
                <span className="font-brand text-xl font-bold text-[#33503a]">Luma</span>
                <span className="hidden text-[0.62rem] text-[#9a9280] sm:block">家长空间</span>
              </a>
              <button
                type="button"
                onClick={() => setActiveView('settings')}
                className="flex items-center gap-1.5 rounded-full bg-luma-grass-100 px-3 py-1.5 text-xs font-bold text-luma-grass-700"
              >
                {NAV_ENTRIES[5].icon} 设置
              </button>
            </div>
            <ParentMobileNav active={activeView} onSelect={selectView} className="mt-3" />
          </div>

          <motion.div variants={staggerContainer} initial="hidden" animate="visible">
            {renderHeader}

            {isGuest && activeView === 'overview' && (
              <motion.div
                variants={fadeUp}
                className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-[1.4rem] border border-luma-gold-300/40 bg-[#fbf4e2]/85 px-5 py-3.5 backdrop-blur-sm"
              >
                <span className="text-xs leading-relaxed font-semibold text-[#8d6719] sm:text-sm">
                  当前为演示家庭，页面内容用于体验成长洞察的呈现方式。
                </span>
                <button
                  type="button"
                  onClick={() => {
                    logout()
                    navigate('/auth?role=parent&mode=register')
                  }}
                  className="shrink-0 rounded-full bg-white px-3.5 py-1.5 text-xs font-bold text-[#8d6719] shadow-sm transition hover:bg-[#fdf6e2]"
                >
                  创建正式账号
                </button>
              </motion.div>
            )}

            {realEmptyDemo && activeView !== 'settings' && (
              <motion.div
                variants={fadeUp}
                className="mt-5 flex items-start gap-2.5 rounded-[1.4rem] border border-luma-grass-200/70 bg-[#eef5e6]/90 px-5 py-3.5 text-xs leading-relaxed text-luma-grass-700 backdrop-blur-sm sm:items-center"
              >
                <SparkleDot className="mt-0.5 size-3.5 shrink-0 text-luma-grass-400 sm:mt-0" />
                <span>
                  孩子还没有真实创作，当前展示的是内置示例内容，方便预览每个功能的样子；等 ta 画下第一幅画后会自动替换为真实数据。
                </span>
              </motion.div>
            )}

            {children.length === 0 ? (
              <motion.section variants={fadeUp} className="mt-8">
                <Card
                  variant="glass"
                  title="邀请孩子加入家庭空间"
                  description="孩子使用家庭邀请码完成注册后，创作洞察会出现在这里。"
                  className="mx-auto max-w-2xl border-luma-grass-100 text-center"
                >
                  <div className="font-brand text-3xl font-bold tracking-[0.14em] text-luma-grass-700">
                    {inviteCode ?? '—'}
                  </div>
                  <Button
                    variant="secondary"
                    className="mt-5 border-luma-grass-200 bg-white text-luma-grass-700 shadow-none hover:bg-luma-grass-100"
                    onClick={copyInviteCode}
                  >
                    {copied ? '邀请码已复制' : '复制家庭邀请码'}
                  </Button>
                </Card>
              </motion.section>
            ) : (
              <div className="mt-6">
                {activeView === 'overview' && (
                  <>
                    {overview ? (
                      <>
                        <OverviewDashboard
                          model={overview}
                          childName={selectedChild?.nickname ?? '孩子'}
                          readingOpen={readingOpen}
                          onToggleReading={() => setReadingOpen((v) => !v)}
                          onMoreFindings={() => selectView('themes')}
                          onSuggestion={() => selectView('communication')}
                        />
                        {readingOpen && readingMeta && (
                          <motion.section
                            variants={fadeUp}
                            initial="hidden"
                            animate="visible"
                            className="mt-5"
                          >
                            <div className={cn('relative overflow-hidden p-6 sm:p-7', CARD_CLASS)}>
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                  <div className="luma-eyebrow text-[0.66rem] tracking-[0.2em] text-[#9b8a5f]">
                                    完整解读
                                  </div>
                                  <h2 className="mt-1.5 font-display text-2xl font-bold text-[#2c3a33]">
                                    《{readingMeta.title}》
                                  </h2>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setReadingOpen(false)}
                                  className="inline-flex items-center gap-1.5 rounded-full bg-luma-grass-50 px-3.5 py-1.5 text-xs font-bold text-luma-grass-700 transition hover:bg-luma-grass-100"
                                >
                                  <ArrowLeftIcon className="size-3.5" /> 收起解读
                                </button>
                              </div>
                              {readingMeta.quote && (
                                <p className="mt-4 border-l-[3px] border-luma-grass-300 pl-4 text-[0.98rem] leading-relaxed text-[#5f6a57]">
                                  {readingMeta.quote}
                                  <span className="ml-2 text-xs text-[#a39a86]">—— 孩子原话</span>
                                </p>
                              )}
                              <p className="mt-4 max-w-3xl text-sm leading-[1.9] text-[#6b7462]">
                                {readingMeta.observation}
                              </p>

                              <div className="mt-6 grid gap-5 lg:grid-cols-2">
                                <div className="rounded-[1.4rem] bg-[#faf7ef] p-5">
                                  <div className="flex items-center gap-2 text-xs font-bold tracking-wide text-[#8a9a7c]">
                                    <span className="inline-block size-1.5 rounded-full bg-luma-grass-400" />
                                    近期状态
                                  </div>
                                  <div className="mt-3 space-y-3.5">
                                    {readingMeta.statuses.map((s) => (
                                      <div key={s.id} className="flex items-center gap-2.5">
                                        <span className="text-base">{s.emoji}</span>
                                        <span className="flex-1 text-sm font-semibold text-[#3a463c]">
                                          {s.label}
                                        </span>
                                        <span className="text-xs font-bold text-luma-grass-700">
                                          {s.statusText}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                                <div className="rounded-[1.4rem] bg-luma-grass-50 p-5">
                                  <div className="text-xs font-bold tracking-wide text-luma-grass-700">
                                    给家长的陪伴建议
                                  </div>
                                  <ul className="mt-3 space-y-3">
                                    {readingMeta.suggestions.map((s) => (
                                      <li key={s.id} className="text-sm leading-relaxed text-[#4c5f43]">
                                        <span className="mr-1.5 font-bold">{s.title}：</span>
                                        {s.desc}
                                      </li>
                                    ))}
                                  </ul>
                                  <button
                                    type="button"
                                    onClick={() => selectView('communication')}
                                    className="mt-5 inline-flex items-center gap-1 rounded-full bg-white px-4 py-2 text-xs font-bold text-luma-grass-700 shadow-sm transition hover:-translate-y-0.5"
                                  >
                                    去 AI 沟通助手聊一聊
                                    <ChevronRightIcon className="size-3.5" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          </motion.section>
                        )}
                      </>
                    ) : (
                      <motion.section variants={fadeUp} className={cn('p-8 text-center sm:p-12', CARD_CLASS)}>
                        <div className="mx-auto flex max-w-md flex-col items-center gap-4">
                          <OtterDeco className="h-24 w-auto opacity-90" alt="Nilo" />
                          <h2 className="font-display text-xl font-bold text-[#2c3a33]">
                            {selectedChild?.nickname ?? '孩子'} 的第一幅画，正在路上
                          </h2>
                          <p className="text-sm leading-relaxed text-[#7d8777]">
                            等 ta 在创作空间画下第一幅画，这里就会慢慢长出成长概览、创作主题与陪伴建议。
                          </p>
                        </div>
                      </motion.section>
                    )}
                  </>
                )}

                {activeView === 'records' && (
                  <div className="space-y-6">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span className="text-xs text-[#9a9280]">
                        {isGuest || realEmptyDemo
                          ? isGuest
                            ? '来自演示家庭的作品'
                            : '暂无真实创作，以下为功能示例'
                          : `共 ${analyses?.length ?? 0} 件作品 · 每一件都是孩子留下的印记`}
                      </span>
                      <a
                        href="/parent/archive"
                        data-onboarding="parent-archive"
                        className="inline-flex items-center gap-1.5 rounded-full bg-white/80 px-4 py-2 text-xs font-bold text-luma-grass-700 shadow-sm backdrop-blur-sm transition hover:-translate-y-0.5 hover:bg-white"
                      >
                        进入完整成长档案
                        <ChevronRightIcon className="size-3.5" />
                      </a>
                    </div>
                    {renderRecords()}
                  </div>
                )}

                {activeView === 'themes' && renderThemes()}

                {activeView === 'timeline' && (
                  <TimelineSection
                    childName={selectedChild?.nickname ?? '孩子'}
                    childId={feedChildId}
                    token={feedToken}
                  />
                )}

                {activeView === 'communication' && (
                  <CommunicationSection
                    childName={selectedChild?.nickname ?? '孩子'}
                    childId={feedChildId}
                    token={feedToken}
                  />
                )}

                {activeView === 'settings' && renderSettings()}
              </div>
            )}
          </motion.div>
        </div>
      </div>
    </main>
  )
}

