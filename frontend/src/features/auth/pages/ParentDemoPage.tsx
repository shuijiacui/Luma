import { lt, t, useLocale } from '@/i18n'
import { LanguageSwitcher } from '@/i18n/LanguageSwitcher'
import { useChildHistory } from '@/hooks/useChildHistory'
import { ChildBirthDate } from '@/features/parents/components/ChildBirthDate'
import { PeriodicReportsSection } from '@/features/parents/components/PeriodicReportsSection'
import { FamilyDataSettings } from '@/features/parents/components/FamilyDataSettings'
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
import { portalUrl } from '@/config/appMode'
import bgParent from '@/assets/images/bg-parent.png'
import { Button, Card } from '@/components/ui'
import { fadeUp, staggerContainer } from '@/design-system'
import { CommunicationSection } from '@/features/parents/components/CommunicationSection'
import { DrawingInsightSection } from '@/features/parents/components/DrawingInsightSection'
import { TimelineSection } from '@/features/parents/components/TimelineSection'
import { AvatarPicker } from '@/features/profile/components/AvatarPicker'
import { fetchMe, type AnalysisSummary, type MeResponse } from '@/lib/api/authApi'
import { cn } from '@/lib/cn'
import { useAuth } from '../AuthContext'
import { findFamilyById, getChildrenForFamily } from '../storage'
import { ChildArtwork, type ArtworkKind } from '@/features/parents/components/dashboard/artworks'
import { AuthedArtwork } from '@/features/parents/components/dashboard/AuthedArtwork'
import { Butterfly, LeafSprig, OtterDeco, SparkleDot } from '@/features/parents/components/dashboard/decor'
import { ArrowLeftIcon, BellIcon, ChevronRightIcon } from '@/features/parents/components/dashboard/icons'
import { OverviewDashboard, type OverviewStats } from '@/features/parents/components/dashboard/OverviewDashboard'
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
import { ParentTabBar } from '@/features/parents/components/dashboard/ParentSidebar'
import '@/features/parents/styles/parent-app.css'

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
  未见明显风险信号: '未见明显风险信号',
  焦虑倾向: '需要留意',
  低落倾向: '需要留意',
  需要关注: '需要关注',
  信息不足: '观察中',
}

/**
 * 画作图片路由要求登录，而 <img> 发不出 Authorization 头。
 * 这里只传递后端返回的原始路径，实际取图由 AuthedArtwork 带头部 fetch 成 blob 完成，
 * 令牌不进 URL。所以模型里存的是 imagePath（待解析），不是可直接 src 的地址。
 */
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
      imagePath: firstImageForElement(analyses, el) ?? undefined,
    }))
}

function buildRealOverview(analyses: AnalysisSummary[]): OverviewModel | null {
  if (analyses.length === 0) return null
  const now = Date.now()
  const cutoff = now - RECENT_CUTOFF_DAYS * 24 * 60 * 60 * 1000
  const recent = analyses.filter((a) => new Date(a.createdAt).getTime() >= cutoff)
  const window = recent

  const latest = analyses[0]
  const elements = latest.summary.elements
  const imagePath = latest.imageUrl ?? undefined
  const date = new Date(latest.createdAt)
  const dateLabel = `${date.getMonth() + 1} 月 ${date.getDate()} 日`
  const title = elements.slice(0, 3).map(elementLabel).join('、') || '一幅小画'

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
      value: report ? Math.round(Math.min(100, Math.max(0, report.confidence * 100))) : 0,
      statusText: reportEmotion ?? '等待解读',
      tone: 'grass',
    },
    {
      id: 'express',
      emoji: '💬',
      label: '近 4 周作品数',
      value: 0,
      statusText: `${window.length} 幅`,
      tone: 'gold',
    },
    {
      id: 'imagine',
      emoji: '✨',
      label: '近 4 周元素种类',
      value: 0,
      statusText: `${new Set(window.flatMap(a => a.summary.elements)).size} 种`,
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
      imagePath,
      kind: kindForElements(elements),
    },
    statuses,
    themes,
    findings,
    suggestions,
    hint: window.length ? `近 4 周有 ${window.length} 幅作品，可以从这些画面和孩子聊聊。` : '过去 4 周暂无创作，顶部展示的是最近一次历史作品。',
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
  const locale = useLocale()
  const navigate = useNavigate()
  const { session, logout } = useAuth()
  const isGuest = !session || session.isGuest || !session.token

  const [me, setMe] = useState<MeResponse | null>(null)
  const [meError, setMeError] = useState(false)
  const [familyRevision, setFamilyRevision] = useState(0)
  useEffect(() => {
    const refresh = () => setFamilyRevision(n => n + 1)
    window.addEventListener('focus', refresh)
    const timer = window.setInterval(() => { if (!document.hidden) refresh() }, 30000)
    return () => { window.removeEventListener('focus', refresh); window.clearInterval(timer) }
  }, [])
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
      let active = true
      fetchMe(session.token).then(value => { if (active) { setMe(value); setMeError(false) } }).catch(() => { if (active) setMeError(true) })
      return () => { active = false }
    }
  }, [session, familyRevision])

  const family = isGuest ? (session ? findFamilyById(session.familyId) : undefined) : me?.family
  const inviteCode = isGuest ? family?.inviteCode : me?.family.inviteCode
  const children = useMemo(
    () =>
      isGuest
        ? session
          ? getChildrenForFamily(session.familyId).map(child => ({ ...child, nickname: t(child.nickname, locale) }))
          : []
        : (me?.children ?? []),
    [isGuest, session, me, locale],
  )

  const selectedChild = children.find((c) => c.id === selectedChildId) ?? children[0]

  const { analyses, error: historyError, reload: reloadHistory } = useChildHistory(isGuest ? undefined : selectedChild?.id, isGuest ? undefined : session?.token)

  const insight = useMemo(() => {
    if (isGuest) {
      return { observation: DEMO_INSIGHT.observation, suggestions: DEMO_INSIGHT.suggestions }
    }
    if (!analyses) return null
    return deriveInsight(analyses)
  }, [isGuest, analyses])

  const overview = useMemo<OverviewModel | null>(() => {
    if (isGuest) return DEMO_OVERVIEW
    if (analyses === null) return null
    // 正式家庭的空记录使用空状态。
    return buildRealOverview(analyses)
  }, [isGuest, analyses])

  const realEmptyDemo = false // 正式家庭不使用示例填补空记录

  const overviewStats = useMemo<OverviewStats>(() => {
    if (isGuest) {
      return {
        weeklyCount: 3,
        weeklyDelta: 1,
        recentCount: 5,
        emotionText: '稳定',
        emotionHint: '近期情绪较为平稳',
        highlight: '想象力',
        highlightHint: '在故事表达中有进步',
      }
    }
    const list = analyses ?? []
    const now = new Date()
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const mondayOffset = (midnight.getDay() + 6) % 7
    const weekStart = new Date(midnight)
    weekStart.setDate(midnight.getDate() - mondayOffset)
    const nextWeekStart = new Date(weekStart)
    nextWeekStart.setDate(weekStart.getDate() + 7)
    const lastWeekStart = new Date(weekStart)
    lastWeekStart.setDate(weekStart.getDate() - 7)
    const fourWeeksAgo = new Date(weekStart)
    fourWeeksAgo.setDate(weekStart.getDate() - 21)
    const inRange = (value: string, from: Date, to: Date) => {
      const date = new Date(value)
      return date >= from && date < to
    }
    const weeklyCount = list.filter((a) => inRange(a.createdAt, weekStart, nextWeekStart)).length
    const lastCount = list.filter((a) => inRange(a.createdAt, lastWeekStart, weekStart)).length
    const recentCount = list.filter((a) => inRange(a.createdAt, fourWeeksAgo, nextWeekStart)).length
    const emotion = overview?.statuses.find((s) => s.id === 'emotion')?.statusText ?? '观察中'
    const theme = overview?.themes[0]?.title
    const finding = overview?.findings[0]?.title
    return {
      weeklyCount,
      weeklyDelta: weeklyCount - lastCount,
      recentCount,
      emotionText: emotion,
      emotionHint: emotion === '观察中' ? '数据还在积累中' : '近期状态较为平稳',
      highlight: theme ?? '想象力',
      highlightHint: finding ?? '在故事表达中有进步',
    }
  }, [analyses, isGuest, overview])

  const childMeta = isGuest ? '5 岁 2 个月 · 小创作者' : '小创作者'
  // 只有游客使用演示内容。
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
    navigate('/auth?role=parent&mode=login', { replace: true })
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

  function renderRecords() {
    if (isGuest) {
      return (
        <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="space-y-7">
          {DEMO_RECORDS.map((group) => (
            <motion.section key={group.month} variants={fadeUp}>
              <div className="mb-3.5 flex items-center gap-4">
                <span className="font-display text-lg font-bold text-[#3a463c]">{lt(group.month)}</span>
                <div className="h-px flex-1 bg-[#e2ddca]" />
                <span className="text-xs text-[#9a9280]">{lt(group.works.length)} {t("件")}</span>
              </div>
              <div className="grid grid-cols-2 gap-3.5">
                {group.works.map((work) => (
                  <div key={work.id} className={cn('group overflow-hidden p-3', CARD_CLASS)}>
                    <div className="relative aspect-square overflow-hidden rounded-[1.25rem] bg-[#fffdf6]">
                      <ChildArtwork kind={work.kind} className="absolute inset-0 h-full w-full transition-transform duration-500 group-hover:scale-[1.04]" />
                    </div>
                    <div className="px-1.5 pt-3 pb-1.5">
                      <div className="text-sm font-bold text-[#3a463c]">{lt(work.title)}</div>
                      <div className="mt-1 text-xs text-[#9a9280]">{t("绘画 ·")}{lt(work.day)}</div>
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
      return <p className="py-16 text-center text-sm text-[#9a9280]">{t("加载中…")}</p>
    }
    const grouped = new Map<string, AnalysisSummary[]>()
    for (const a of analyses) {
      const d = new Date(a.createdAt)
      const key = `${d.getFullYear()} 年 ${d.getMonth() + 1} 月`
      const list = grouped.get(key) ?? []
      list.push(a)
      grouped.set(key, list)
    }
    const groups = Array.from(grouped.entries())
    return (
      <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="space-y-7">
        {groups.map(([month, works]) => (
          <motion.section key={month} variants={fadeUp}>
            <div className="mb-3.5 flex items-center gap-4">
              <span className="font-display text-lg font-bold text-[#3a463c]">{lt(month)}</span>
              <div className="h-px flex-1 bg-[#e2ddca]" />
              <span className="text-xs text-[#9a9280]">{lt(works.length)} {t("件")}</span>
            </div>
            <div className="grid grid-cols-2 gap-3.5">
              {works.map((a) => (
                <div key={a.id} className={cn('group overflow-hidden p-3', CARD_CLASS)}>
                  <div className="relative aspect-square overflow-hidden rounded-[1.25rem] bg-[#fffdf6]">
                    <AuthedArtwork
                      path={a.imageUrl}
                      token={session?.token}
                      kind={kindForElements(a.summary.elements)}
                      className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                    />
                  </div>
                  <div className="px-1.5 pt-3 pb-1.5">
                    <div className="text-sm font-bold text-[#3a463c]">
                      {lt(a.summary.elements.slice(0, 3).map(elementLabel).join('、') || '一幅小画')}
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-xs text-[#9a9280]">
                      <span>
                        {lt(new Date(a.createdAt).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }))}
                      </span>
                      {a.report?.emotion && (
                        <span className="rounded-full bg-luma-grass-50 px-2 py-0.5 font-bold text-luma-grass-700">
                          {lt(a.report.emotion)}
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
    const themes = isGuest || realEmptyDemo
      ? DEMO_OVERVIEW.themes
      : computeThemeTiles(analyses ?? [])
    return (
      <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="space-y-5">
        <motion.section variants={fadeUp} className={CARD_CLASS}>
          <div className="p-6 sm:p-7">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="luma-eyebrow text-[0.66rem] tracking-[0.2em] text-[#9b8a5f]">{t("主题探索")}</div>
                <h2 className="mt-1.5 font-display text-xl font-bold text-[#2c3a33]">
                  {lt(selectedChild?.nickname ?? '孩子')} {t("最近在探索什么？")}</h2>
              </div>
              <span className="rounded-full bg-[#f6f1e6] px-3 py-1 text-xs text-[#9a8f7a]">{t("过去 4 周")}</span>
            </div>
            <div className="mt-6 grid grid-cols-2 gap-3.5">
              {themes.map((theme, i) => (
                <div
                  key={theme.id}
                  className="group rounded-[1.4rem] border border-[#efe8d9] bg-[#fdfcf8] p-3 transition hover:-translate-y-1 hover:border-luma-grass-200 hover:shadow-luma-sm"
                >
                  <div className="relative aspect-square overflow-hidden rounded-[1.1rem] bg-[#fffdf6]">
                    <AuthedArtwork
                      path={theme.imagePath}
                      token={session?.token}
                      kind={theme.kind}
                    />
                  </div>
                  <div className="px-1 pt-3 pb-1 text-center">
                    <div className="text-sm font-bold text-[#3a463c]">{lt(theme.title)}</div>
                    <div className="mt-0.5 text-xs text-[#9a9280]">{t("出现")}{lt(theme.count)} {t("次")}</div>
                  </div>
                  <span className="sr-only">{lt(`第 ${i + 1} 个主题`)}</span>
                </div>
              ))}
            </div>
            {themes.length === 0 && (
              <p className="py-6 text-center text-sm text-[#9a9280]">
                {t("更多画作完成后，这里会整理出 ta 反复探索的主题。")}</p>
            )}
          </div>
        </motion.section>

        {insight && (
          <motion.section variants={fadeUp} className={CARD_CLASS}>
            <div className="p-6 sm:p-7">
              <div className="luma-eyebrow text-[0.66rem] tracking-[0.2em] text-[#9b8a5f]">{t("延伸的线索")}</div>
              <p className="mt-2 font-display text-lg leading-relaxed font-semibold text-[#3a463c] sm:text-xl">
                “{lt(insight.observation)}”
              </p>
              {isGuest && (
                <div className="mt-5 grid gap-3">
                  {DEMO_INSIGHT.observations.map((obs, index) => (
                    <div key={obs} className="rounded-2xl bg-[#faf7ef] p-4">
                      <span className="luma-eyebrow text-[#9b8a5f]">0{lt(index + 1)}</span>
                      <p className="mt-2 text-sm leading-relaxed text-[#7d8777]">{lt(obs)}</p>
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
        className="grid gap-5"
      >
        <motion.section variants={fadeUp} className={CARD_CLASS}>
          <div className="p-6 sm:p-7">
            <div className="luma-eyebrow text-[0.66rem] tracking-[0.2em] text-[#9b8a5f]">{t("家庭空间")}</div>
            <h2 className="mt-1.5 font-display text-xl font-bold text-[#2c3a33]">{t("邀请孩子加入")}</h2>
            <p className="mt-2 text-sm leading-relaxed text-[#7d8777]">
              {t("把这串邀请码发给孩子，ta 注册后就会出现在你的成长概览里，两个账号就连在一起了。")}</p>
            <div className="mt-5 flex items-center justify-between gap-3 rounded-2xl bg-luma-grass-50 px-5 py-4">
              <span className="font-brand text-2xl font-bold tracking-[0.14em] text-luma-grass-700">
                {inviteCode ?? '—'}
              </span>
              <Button
                variant="secondary"
                className="border-luma-grass-200 bg-white text-luma-grass-700 shadow-none hover:bg-luma-grass-100"
                onClick={copyInviteCode}
              >
                {lt(copied ? '已复制 ✓' : '复制邀请码')}
              </Button>
            </div>
          </div>
        </motion.section>

        <motion.section variants={fadeUp} className={CARD_CLASS}>
          <div className="p-6 sm:p-7">
            <div className="luma-eyebrow text-[0.66rem] tracking-[0.2em] text-[#9b8a5f]">{t("孩子管理")}</div>
            <h2 className="mt-1.5 font-display text-xl font-bold text-[#2c3a33]">{t("和 ta 们连接")}</h2>
            {!isGuest && selectedChild && session?.token && <ChildBirthDate key={selectedChild.id} childId={selectedChild.id} initial={me?.children.find(c => c.id === selectedChild.id)?.birthDate} token={session.token} onSaved={() => setFamilyRevision(n => n + 1)} />}
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
                      <span className="mt-0.5 block text-xs text-[#9a9280]">{t("在成长概览中查看")}</span>
                    </span>
                    <ChevronRightIcon className="size-4 text-[#9a9280]" />
                  </button>
                )
              })}
              {children.length === 0 && (
                <p className="rounded-2xl bg-[#faf7ef] px-4 py-3 text-sm text-[#9a9280]">
                  {t("还没有孩子加入，先复制上方的邀请码吧。")}</p>
              )}
            </div>
          </div>
        </motion.section>

        <motion.section variants={fadeUp} className={cn(CARD_CLASS)}>
          <div className="flex flex-wrap items-center justify-between gap-5 p-6 sm:p-7">
            <div className="flex items-center gap-4">
              <AvatarPicker userId={session?.id ?? 'guest-parent'} compact />
              <div>
                <div className="text-base font-bold text-[#334038]">{lt(session?.displayName ?? '家长')}</div>
                <div className="mt-0.5 text-xs text-[#9a9280]">
                  {t("家长账号 ·")}{lt(isGuest ? '游客演示家庭' : '已连接家庭空间')}
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
                  {t("重新看新手引导")}</Button>
              )}
              <Button variant="ghost" size="sm" onClick={handleLogout}>
                {t("退出登录")}</Button>
            </div>
          </div>
        </motion.section>

        {!isGuest && session?.token && <div className="md:col-span-2"><FamilyDataSettings token={session.token} onDeleted={handleLogout} /></div>}
        {isGuest && (
          <motion.section variants={fadeUp} className={cn(CARD_CLASS)}>
            <div className="flex flex-wrap items-center justify-between gap-4 p-6 sm:p-7">
              <div>
                <div className="text-sm font-bold text-[#334038]">{t("创建一个正式账号？")}</div>
                <p className="mt-1 text-xs leading-relaxed text-[#9a9280]">
                  {t("当前为演示家庭，所有内容仅用于体验呈现方式；注册后即可与真实创作数据相连。")}</p>
              </div>
              <Button
                variant="primary"
                className="bg-luma-grass-600 hover:bg-luma-grass-700"
                onClick={() => {
                  logout()
                  navigate('/auth?role=parent&mode=register')
                }}
              >
                {t("创建正式账号")}</Button>
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
    <main className="luma-parent-app luma-parent-shell text-[#3a463c]">
      <div className="luma-parent-stage">
        {/* 背景：柔和水彩底图 + 奶油色叠加，营造治愈氛围 */}
        <div className="luma-stage-bg" aria-hidden="true">
          <img src={bgParent} alt="" className="select-none" />
        </div>
        <div className="luma-stage-tint" aria-hidden="true" />

        {/* ===== 顶部固定外框 ===== */}
        <header data-onboarding="parent-navbar" className="luma-app-top">
          <div className="flex items-center gap-2">
            <a
              href={portalUrl}
              aria-label={t("返回 Luma 官网")}
              className="inline-flex items-center gap-2 rounded-2xl outline-none focus-visible:ring-3 focus-visible:ring-luma-grass-300/60"
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-full border border-white/85 bg-white/90 shadow-luma-sm">
                <OtterDeco className="h-8 w-8" alt={t('陪伴的水獭 Nilo')} />
              </span>
              <span className="leading-tight">
                <span className="block font-brand text-[1.35rem] font-bold tracking-[-0.03em] text-[#33503a]">Luma</span>
                <span className="block text-[0.6rem] font-medium text-[#9a9280]">{t('看见创作，也看见成长。')}</span>
              </span>
            </a>
            <div className="ml-auto flex items-center gap-1.5">
              <LanguageSwitcher />
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setBellOpen((v) => !v)}
                  aria-label={t("通知")}
                  aria-expanded={bellOpen}
                  className="relative grid size-10 place-items-center rounded-full border border-white/80 bg-white/90 text-[#8b9285] shadow-luma-sm transition hover:text-luma-grass-600 focus-visible:ring-3 focus-visible:ring-luma-grass-300/60"
                >
                  <BellIcon className="size-[1.15rem]" />
                  <span className="absolute top-2 right-2.5 size-1.5 rounded-full bg-luma-clay-300" />
                </button>
                {bellOpen && (
                  <div className="absolute top-[calc(100%+0.55rem)] right-0 z-50 w-72 rounded-3xl border border-white/90 bg-white/95 p-4 shadow-luma-md backdrop-blur-xl">
                    <div className="text-sm font-bold text-[#334038]">{t("通知")}</div>
                    <p className="mt-2 rounded-2xl bg-[#faf7ef] px-3.5 py-2.5 text-xs leading-relaxed text-[#8b8371]">
                      {t("暂时没有新消息。孩子完成新的创作后，我们会在这里轻轻提醒你 🍃")}</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 孩子信息栏 + 退出登录 */}
          <div className="mt-2.5 flex items-center gap-2">
            <div className="relative min-w-0 flex-1">
            <button
              type="button"
              data-onboarding="parent-child-switcher"
              onClick={() => setChildMenuOpen((v) => !v)}
              aria-expanded={childMenuOpen}
              aria-haspopup="listbox"
              className="flex w-full items-center gap-2.5 rounded-[1.4rem] border border-white/85 bg-white/92 py-2 pr-3 pl-2 shadow-luma-sm backdrop-blur-sm transition hover:-translate-y-0.5 focus-visible:ring-3 focus-visible:ring-luma-grass-300/60"
            >
              <img
                src={childAvatar(selectedChild ?? { id: 'none' }, Math.max(0, children.findIndex((c) => c.id === selectedChild?.id)))}
                alt=""
                className="size-9 shrink-0 rounded-full object-contain"
              />
              <span className="min-w-0 text-left leading-tight">
                <span className="block truncate text-sm font-bold text-[#334038]">
                  {lt(selectedChild?.nickname ?? '小小创作者')}
                </span>
                <span className="block truncate text-[0.65rem] font-medium text-[#9a9280]">{lt(childMeta)}</span>
              </span>
              <ChevronRightIcon
                className={cn('ml-auto size-4 shrink-0 text-[#9a9280] transition-transform', childMenuOpen && 'rotate-90')}
              />
            </button>

            {childMenuOpen && (
              <div
                role="listbox"
                aria-label={t("选择孩子")}
                className="absolute top-[calc(100%+0.55rem)] left-0 z-50 w-64 overflow-hidden rounded-3xl border border-white/90 bg-white/95 p-2 shadow-luma-md backdrop-blur-xl"
              >
                {children.length > 0 ? (
                  children.map((child, index) => {
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
                        <span className="flex-1 truncate text-sm font-bold text-[#334038]">{child.nickname}</span>
                        {active && <span className="size-1.5 rounded-full bg-luma-grass-500" />}
                      </button>
                    )
                  })
                ) : (
                  <p className="px-3 py-2.5 text-sm text-[#9a9280]">{t("还没有孩子加入，去家庭设置邀请 ta 吧。")}</p>
                )}
              </div>
            )}
            </div>

            {/* 退出登录：回到家长登录页 */}
            <button
              type="button"
              onClick={handleLogout}
              aria-label={t("退出登录")}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/85 bg-white/90 py-2 pr-3.5 pl-2.5 text-xs font-bold text-luma-teal-700 shadow-luma-sm transition hover:bg-luma-teal-50 focus-visible:ring-3 focus-visible:ring-luma-grass-300/60"
            >
              <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="size-4">
                <path d="M14 7V4.5A1.5 1.5 0 0 0 12.5 3h-8A1.5 1.5 0 0 0 3 4.5v11A1.5 1.5 0 0 0 4.5 17h8a1.5 1.5 0 0 0 1.5-1.5V13" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                <path d="m8 10 9 0M13.5 6.5 17 10l-3.5 3.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {t("退出登录")}
            </button>
          </div>

          {/* 手绘装饰 + 手写文案 */}
          <div aria-hidden="true" className="pointer-events-none mt-2 flex items-center justify-end gap-1.5 pr-1">
            <LeafSprig className="h-5 w-5 opacity-75" tone="green" />
            <span className="font-hand text-[0.95rem] leading-none text-[#8fa180] [text-shadow:0_1px_0_rgba(255,255,255,0.85)]">
              {t('每个孩子都有看向世界的方式♡')}
            </span>
            <OtterDeco className="h-8 w-auto opacity-90" alt="" />
            <Butterfly className="h-4 w-5 -translate-y-1 -rotate-6 opacity-90" />
          </div>
        </header>

        {/* ===== 中间滚动内容 ===== */}
        <div className="luma-app-scroll">
          <div className="luma-app-content">
            <motion.div variants={staggerContainer} initial="hidden" animate="visible">
              {/* 页面标题区 */}
              <motion.div variants={fadeUp} className="luma-app-title">
                <div className="flex items-center gap-2 text-[#a0906b]">
                  <SparkleDot className="size-3.5 text-luma-gold-300" />
                  <span className="luma-eyebrow text-[0.62rem] tracking-[0.22em]">{t("Luma · 家长空间")}</span>
                </div>
                <h1>{lt(meta.title)}</h1>
                <p>{lt(meta.subtitle)}</p>
              </motion.div>
            {isGuest && activeView === 'overview' && (
              <motion.div
                variants={fadeUp}
                className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-[1.4rem] border border-luma-gold-300/40 bg-[#fbf4e2]/85 px-5 py-3.5 backdrop-blur-sm"
              >
                <span className="text-xs leading-relaxed font-semibold text-[#8d6719] sm:text-sm">
                  {t("当前为演示家庭，页面内容用于体验成长洞察的呈现方式。")}</span>
                <button
                  type="button"
                  onClick={() => {
                    logout()
                    navigate('/auth?role=parent&mode=register')
                  }}
                  className="shrink-0 rounded-full bg-white px-3.5 py-1.5 text-xs font-bold text-[#8d6719] shadow-sm transition hover:bg-[#fdf6e2]"
                >
                  {t("创建正式账号")}</button>
              </motion.div>
            )}

            {realEmptyDemo && activeView !== 'settings' && (
              <motion.div
                variants={fadeUp}
                className="mt-5 flex items-start gap-2.5 rounded-[1.4rem] border border-luma-grass-200/70 bg-[#eef5e6]/90 px-5 py-3.5 text-xs leading-relaxed text-luma-grass-700 backdrop-blur-sm sm:items-center"
              >
                <SparkleDot className="mt-0.5 size-3.5 shrink-0 text-luma-grass-400 sm:mt-0" />
                <span>
                  {t("孩子还没有真实创作，当前展示的是内置示例内容，方便预览每个功能的样子；等 ta 画下第一幅画后会自动替换为真实数据。")}</span>
              </motion.div>
            )}

            {!isGuest && (meError || historyError) ? (
              <div role="alert" className="mt-6 rounded-2xl bg-white p-6">{lt(historyError ?? '家庭信息加载失败。')}<Button onClick={() => { setFamilyRevision(n => n + 1); reloadHistory() }}>{t("重试")}</Button></div>
            ) : !isGuest && !me ? <p className="p-6">{t("正在加载家庭信息…")}</p> : activeView === 'settings' ? <div className="mt-6">{lt(renderSettings())}</div> : children.length === 0 ? (
              <motion.section variants={fadeUp} className="mt-8">
                <Card
                  variant="glass"
                  title={t("邀请孩子加入家庭空间")}
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
                    {lt(copied ? '邀请码已复制' : '复制家庭邀请码')}
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
                          token={session?.token}
                          stats={overviewStats}
                          readingOpen={readingOpen}
                          onToggleReading={() => setReadingOpen((v) => !v)}
                          onMoreFindings={() => selectView('records')}
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
                                    {t("完整解读")}</div>
                                  <h2 className="mt-1.5 font-display text-2xl font-bold text-[#2c3a33]">
                                    《{lt(readingMeta.title)}》
                                  </h2>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setReadingOpen(false)}
                                  className="inline-flex items-center gap-1.5 rounded-full bg-luma-grass-50 px-3.5 py-1.5 text-xs font-bold text-luma-grass-700 transition hover:bg-luma-grass-100"
                                >
                                  <ArrowLeftIcon className="size-3.5" /> {t("收起解读")}</button>
                              </div>
                              {readingMeta.quote && (
                                <p className="mt-4 border-l-[3px] border-luma-grass-300 pl-4 text-[0.98rem] leading-relaxed text-[#5f6a57]">
                                  {lt(readingMeta.quote)}
                                  <span className="ml-2 text-xs text-[#a39a86]">{t("—— AI 画面描述")}</span>
                                </p>
                              )}
                              <p className="mt-4 max-w-3xl text-sm leading-[1.9] text-[#6b7462]">
                                {lt(readingMeta.observation)}
                              </p>

                              <div className="mt-6 grid gap-5">
                                <div className="rounded-[1.4rem] bg-[#faf7ef] p-5">
                                  <div className="flex items-center gap-2 text-xs font-bold tracking-wide text-[#8a9a7c]">
                                    <span className="inline-block size-1.5 rounded-full bg-luma-grass-400" />
                                    {t("近期状态")}</div>
                                  <div className="mt-3 space-y-3.5">
                                    {readingMeta.statuses.map((s) => (
                                      <div key={s.id} className="flex items-center gap-2.5">
                                        <span className="text-base">{lt(s.emoji)}</span>
                                        <span className="flex-1 text-sm font-semibold text-[#3a463c]">
                                          {lt(s.label)}
                                        </span>
                                        <span className="text-xs font-bold text-luma-grass-700">
                                          {lt(s.statusText)}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                                <div className="rounded-[1.4rem] bg-luma-grass-50 p-5">
                                  <div className="text-xs font-bold tracking-wide text-luma-grass-700">
                                    {t("给家长的陪伴建议")}</div>
                                  <ul className="mt-3 space-y-3">
                                    {readingMeta.suggestions.map((s) => (
                                      <li key={s.id} className="text-sm leading-relaxed text-[#4c5f43]">
                                        <span className="mr-1.5 font-bold">{lt(s.title)}：</span>
                                        {lt(s.desc)}
                                      </li>
                                    ))}
                                  </ul>
                                  <button
                                    type="button"
                                    onClick={() => selectView('communication')}
                                    className="mt-5 inline-flex items-center gap-1 rounded-full bg-white px-4 py-2 text-xs font-bold text-luma-grass-700 shadow-sm transition hover:-translate-y-0.5"
                                  >
                                    {t("去 AI 沟通助手聊一聊")}<ChevronRightIcon className="size-3.5" />
                                  </button>
                                </div>
                              </div>
                            </div>
                            {/* 报告生成入口：真实家庭才挂载（游客/无创作时 feedToken 为空，
                                组件自身会退回提示文案，不会误把演示内容当成真实解读） */}
                            <DrawingInsightSection key={feedChildId} childId={feedChildId} token={feedToken} onUpdated={reloadHistory} />
                          </motion.section>
                        )}
                      </>
                    ) : (
                      <motion.section variants={fadeUp} className={cn('p-8 text-center sm:p-12', CARD_CLASS)}>
                        <div className="mx-auto flex max-w-md flex-col items-center gap-4">
                          <OtterDeco className="h-24 w-auto opacity-90" alt="Nilo" />
                          <h2 className="font-display text-xl font-bold text-[#2c3a33]">
                            {lt(selectedChild?.nickname ?? '孩子')} {t("的第一幅画，正在路上")}</h2>
                          <p className="text-sm leading-relaxed text-[#7d8777]">
                            {t("等 ta 在创作空间画下第一幅画，这里就会慢慢长出成长概览、创作主题与陪伴建议。")}</p>
                        </div>
                      </motion.section>
                    )}
                  </>
                )}

                {activeView === 'records' && (
                  <div className="space-y-6">
                    <div>
                      <span className="text-xs text-[#9a9280]">
                        {lt(isGuest || realEmptyDemo
                          ? isGuest
                            ? '来自演示家庭的作品'
                            : '暂无真实创作，以下为功能示例'
                          : `共 ${analyses?.length ?? 0} 件作品 · 每一件都是孩子留下的印记`)}
                      </span>
                    </div>

                    {/* 创作记录：作品按月收好 */}
                    {lt(renderRecords())}

                    {/* 并入：主题探索 */}
                    <div className="luma-merge-block">{lt(renderThemes())}</div>

                    {/* 并入：成长时间轴 */}
                    <div className="luma-merge-block">
                      <TimelineSection
                        childName={selectedChild?.nickname ?? '孩子'}
                        childId={feedChildId}
                        token={feedToken}
                      />
                    </div>
                  </div>
                )}


                {activeView === 'communication' && (
                  <CommunicationSection key={feedChildId}
                    childName={selectedChild?.nickname ?? '孩子'}
                    childId={feedChildId}
                    token={feedToken}
                  />
                )}

                {activeView === 'reports' && <PeriodicReportsSection key={feedChildId} childId={feedChildId} childName={selectedChild?.nickname ?? '孩子'} token={feedToken} />}
              </div>
            )}
            </motion.div>
          </div>
        </div>

        {/* ===== 底部 Tab 固定外框 ===== */}
        <ParentTabBar active={activeView} onSelect={selectView} />
      </div>
    </main>
  )
}
