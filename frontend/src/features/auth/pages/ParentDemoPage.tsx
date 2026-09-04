import { motion } from 'framer-motion'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { defaultAvatars } from '@/assets/avatars'
import bgParent from '@/assets/images/bg-parent.png'
import { Navbar } from '@/components/layout'
import { Button, Card } from '@/components/ui'
import { fadeUp, staggerContainer } from '@/design-system'
import { CommunicationSection } from '@/features/parents/components/CommunicationSection'
import { DrawingInsightSection } from '@/features/parents/components/DrawingInsightSection'
import { TimelineSection } from '@/features/parents/components/TimelineSection'
import { AvatarPicker } from '@/features/profile/components/AvatarPicker'
import { fetchMe, listAnalyses, type AnalysisSummary, type MeResponse } from '@/lib/api/authApi'
import { cn } from '@/lib/cn'
import { useAuth } from '../AuthContext'
import { findFamilyById, getChildrenForFamily } from '../storage'

// 游客演示 insight（无真实数据时展示）
const DEMO_INSIGHT = {
  period: '本周创作洞察',
  themes: [
    { name: '探索新世界', detail: '在 5 幅画中出现', color: 'bg-luma-teal-500' },
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
    { title: '从画面继续', prompt: '"如果小船明天继续出发，它最想邀请谁一起去？"' },
    { title: '听孩子来定义', prompt: '"这片森林里，你最想带我认识哪个地方？"' },
    { title: '把好奇留给孩子', prompt: '"接下来发生什么，由你来决定的话，会是什么？"' },
  ],
  recentCreations: [
    { title: '会发光的森林', type: '绘画', day: '周四', tone: 'teal' as const },
    { title: 'Nilo 的蓝色小船', type: '绘画', day: '周二', tone: 'gold' as const },
    { title: '云朵上的城市', type: '绘画', day: '上周日', tone: 'violet' as const },
  ],
} as const

const THEME_COLORS = ['bg-luma-teal-500', 'bg-luma-gold-300', 'bg-[#7a82d8]', 'bg-[#d87a7a]']

function deriveInsight(analyses: AnalysisSummary[]) {
  if (analyses.length === 0) return null

  // 主题：按频次排前3的 element
  const freq = new Map<string, number>()
  for (const a of analyses) {
    for (const el of a.summary.elements) freq.set(el, (freq.get(el) ?? 0) + 1)
  }
  const themes = Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name, count], i) => ({
      name,
      detail: `在 ${count} 幅画中出现`,
      color: THEME_COLORS[i],
    }))

  // 沟通建议：取最近一条有 parentAdvice 的 report
  const withAdvice = analyses.find((a) => a.report?.parentAdvice?.length)
  const suggestions = withAdvice?.report?.parentAdvice.slice(0, 3).map((adv, i) => ({
    title: `建议 ${i + 1}`,
    prompt: `"${adv}"`,
  })) ?? DEMO_INSIGHT.suggestions

  // 近期创作
  const TONES = ['teal', 'gold', 'violet'] as const
  const recentCreations = analyses.slice(0, 3).map((a, i) => ({
    title: a.summary.elements.slice(0, 2).join('与') || '无标题',
    type: '绘画',
    day: new Date(a.createdAt).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }),
    tone: TONES[i % TONES.length],
  }))

  // observation：取最新一条 parentAdvice 做总结
  const latestAdvice = withAdvice?.report?.parentAdvice[0]
  const observation = latestAdvice ?? '孩子的创作正在积累中，更多洞察即将生成。'

  return { themes, suggestions, recentCreations, observation }
}

type TabKey = 'overview' | 'themes' | 'timeline' | 'communication'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'overview', label: '成长概览' },
  { key: 'themes', label: '创作主题' },
  { key: 'timeline', label: '成长时间轴' },
  { key: 'communication', label: 'AI 沟通助手' },
]

export function ParentDemoPage() {
  const navigate = useNavigate()
  const { session, logout } = useAuth()
  const isGuest = !session || session.isGuest || !session.token

  const [me, setMe] = useState<MeResponse | null>(null)
  const [analyses, setAnalyses] = useState<AnalysisSummary[] | null>(null)

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
        ? (session ? getChildrenForFamily(session.familyId) : [])
        : (me?.children ?? []),
    [isGuest, session, me],
  )

  const [selectedChildId, setSelectedChildId] = useState('')
  const [copied, setCopied] = useState(false)
  const [activeTab, setActiveTab] = useState<TabKey>('overview')

  const selectedChild = children.find((c) => c.id === selectedChildId) ?? children[0]

  // 拉取选中孩子的 analyses
  useEffect(() => {
    if (isGuest || !selectedChild || !session?.token) {
      setAnalyses(null)
      return
    }
    listAnalyses(selectedChild.id, session.token)
      .then((res) => setAnalyses(res.analyses))
      .catch(() => setAnalyses([]))
  }, [isGuest, selectedChild?.id, session?.token])

  // 从真实数据派生 insight，无数据时用 demo
  const insight = useMemo(() => {
    if (isGuest) return DEMO_INSIGHT
    if (!analyses || analyses.length === 0) return null
    return deriveInsight(analyses) ?? DEMO_INSIGHT
  }, [isGuest, analyses])

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

  const childSwitcher = children.length > 0 && (
    <div className="flex items-center gap-1.5">
      {children.map((child, index) => {
        const active = selectedChild?.id === child.id
        return (
          <button
            key={child.id}
            type="button"
            onClick={() => setSelectedChildId(child.id)}
            aria-pressed={active}
            title={`查看 ${child.nickname}`}
            className={cn(
              'flex items-center gap-1.5 rounded-full border py-0.5 pr-3 pl-0.5 text-xs font-bold outline-none transition focus-visible:ring-2 focus-visible:ring-luma-gold-300/60',
              active
                ? 'border-luma-teal-300 bg-white text-luma-teal-900 shadow-luma-sm'
                : 'border-transparent bg-luma-ivory-100 text-luma-muted hover:bg-white',
            )}
          >
            <img
              src={
                window.localStorage.getItem(`luma_avatar_${child.id}`) ??
                defaultAvatars[index % defaultAvatars.length].src
              }
              alt=""
              className="size-7 shrink-0 object-contain"
            />
            {child.nickname}
          </button>
        )
      })}
    </div>
  )

  const invitePill = (
    <div className="flex shrink-0 items-center gap-2 rounded-full border border-luma-teal-100 bg-white/70 py-1 pr-1 pl-3">
      <span className="text-xs font-semibold text-luma-muted">邀请码</span>
      <strong className="font-brand text-sm tracking-[0.1em] text-luma-teal-900">
        {inviteCode ?? '—'}
      </strong>
      <button
        type="button"
        onClick={copyInviteCode}
        className="rounded-full bg-luma-teal-50 px-2.5 py-1 text-xs font-bold text-luma-teal-700 transition hover:bg-luma-teal-100"
      >
        {copied ? '已复制' : '复制'}
      </button>
    </div>
  )

  return (
    <main className="relative z-0 min-h-screen bg-luma-ivory-50 px-4 py-4 sm:px-5 sm:py-5">
      <img
        src={bgParent}
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 h-full w-full object-cover opacity-40 select-none"
      />
      <Navbar
        className="sticky top-4 z-30"
        actions={
          <>
            <div className="hidden items-center gap-2 lg:flex">
              {childSwitcher}
              {invitePill}
              <span className="h-6 w-px bg-luma-ivory-200" aria-hidden="true" />
            </div>
            <div className="hidden text-right 2xl:block">
              <div className="text-sm font-bold text-luma-teal-900">{session?.displayName}</div>
              <div className="text-xs text-luma-muted">家长账号</div>
            </div>
            <AvatarPicker userId={session?.id ?? 'guest-parent'} compact />
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              退出
            </Button>
          </>
        }
        secondaryRow={
          <nav aria-label="家长端分区" className="flex gap-1.5 overflow-x-auto">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                aria-current={activeTab === tab.key ? 'page' : undefined}
                className={cn(
                  'shrink-0 rounded-full px-4 py-1.5 text-sm font-bold outline-none transition focus-visible:ring-3 focus-visible:ring-luma-gold-300/60',
                  activeTab === tab.key
                    ? 'bg-luma-teal-500 text-white shadow-luma-sm'
                    : 'text-luma-muted hover:bg-white hover:text-luma-teal-700',
                )}
              >
                {tab.label}
              </button>
            ))}
            <a
              href="/parent/archive"
              className="shrink-0 rounded-full px-4 py-1.5 text-sm font-bold text-luma-muted outline-none transition hover:bg-white hover:text-luma-teal-700 focus-visible:ring-3 focus-visible:ring-luma-gold-300/60"
            >
              成长档案
            </a>
          </nav>
        }
      />

      <motion.div
        className="mx-auto max-w-6xl py-10 sm:py-14"
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
      >
        {session?.isGuest && (
          <motion.div
            variants={fadeUp}
            className="mb-7 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-luma-gold-300/50 bg-luma-gold-100/65 px-5 py-3.5"
          >
            <span className="text-sm font-semibold text-luma-gold-700">
              当前为演示家庭，页面内容用于体验成长洞察的呈现方式。
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                logout()
                navigate('/auth?role=parent&mode=register')
              }}
            >
              创建正式账号
            </Button>
          </motion.div>
        )}

        {children.length > 0 ? (
          <>
            <motion.div
              variants={fadeUp}
              className="mb-4 flex flex-wrap items-center justify-between gap-3 lg:hidden"
            >
              {childSwitcher}
              {invitePill}
            </motion.div>

            <motion.div
              key={`${activeTab}-${selectedChild?.id}`}
              variants={staggerContainer}
              initial="hidden"
              animate="visible"
            >
              {activeTab === 'overview' && (
                <>
                  <motion.section variants={fadeUp} id="overview">
                    <div className="luma-eyebrow text-luma-gold-700">本周创作洞察</div>
                    <h1 className="luma-heading-1 mt-3 text-luma-teal-900">看见创作里的成长轨迹</h1>
                    <p className="luma-body-lg mt-4 max-w-2xl text-luma-muted">
                      从孩子画下的画面中，整理值得继续倾听的主题与表达。
                    </p>
                  </motion.section>

                  <DrawingInsightSection
                    childId={selectedChild?.id}
                    token={session?.token}
                  />

                  <motion.section variants={fadeUp} className="mt-5">
                    <Card
                      variant="glass"
                      eyebrow="AI 观察"
                      title="创作中正在延伸的线索"
                      className="border-luma-teal-100"
                    >
                      {insight ? (
                        <>
                          <p className="font-display text-xl leading-relaxed font-semibold text-luma-teal-900 sm:text-2xl">
                            "{insight.observation}"
                          </p>
                          <div className="mt-6 grid gap-3 md:grid-cols-3">
                            {(isGuest ? DEMO_INSIGHT.observations : [
                              insight.themes[0] ? `"${insight.themes[0].name}"在近期创作中最为突出。` : null,
                              insight.themes[1] ? `"${insight.themes[1].name}"也是常见主题。` : null,
                              '孩子的创作正在持续成长中。',
                            ].filter(Boolean) as string[]).map((obs, index) => (
                              <div key={obs} className="rounded-2xl bg-luma-ivory-50 p-4">
                                <span className="luma-eyebrow text-luma-gold-700">0{index + 1}</span>
                                <p className="mt-2 text-sm leading-relaxed text-luma-muted">{obs}</p>
                              </div>
                            ))}
                          </div>
                        </>
                      ) : (
                        <p className="py-4 text-sm text-luma-muted">
                          孩子完成更多创作并生成报告后，AI 观察会出现在这里。
                        </p>
                      )}
                      <div className="mt-5 rounded-xl bg-luma-teal-50 px-4 py-3 text-xs leading-relaxed text-luma-teal-700">
                        Luma 只整理创作中可见的表达与变化，不为孩子贴标签。
                      </div>
                    </Card>
                  </motion.section>
                </>
              )}

              {activeTab === 'themes' && (
                <>
                  <motion.section
                    variants={fadeUp}
                    id="themes"
                    className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]"
                  >
                    <Card
                      eyebrow="创作主题"
                      title={`${selectedChild?.nickname} 最近在探索什么？`}
                      description="根据近期绘画中反复出现的内容整理"
                      className="h-full"
                    >
                      {insight && insight.themes.length > 0 ? (
                        <div className="mt-2 space-y-5">
                          {insight.themes.map((theme) => (
                            <div key={theme.name} className="flex items-start gap-3">
                              <span className={cn('mt-1.5 size-2.5 shrink-0 rounded-full', theme.color)} />
                              <div>
                                <div className="font-bold text-luma-teal-900">{theme.name}</div>
                                <div className="mt-1 text-sm text-luma-muted">{theme.detail}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-4 text-sm text-luma-muted">
                          孩子完成更多创作后，主题会出现在这里。
                        </p>
                      )}
                    </Card>

                    <Card
                      variant="soft"
                      eyebrow="近期创作"
                      title="表达的足迹"
                      className="h-full"
                    >
                      {insight && insight.recentCreations.length > 0 ? (
                        <div className="mt-2 space-y-1">
                          {insight.recentCreations.map((creation, index) => (
                            <div key={`${creation.title}-${index}`} className="relative flex gap-3 pb-5 last:pb-0">
                              {index < insight.recentCreations.length - 1 && (
                                <span className="absolute top-6 bottom-0 left-[7px] w-px bg-luma-teal-100" />
                              )}
                              <span
                                className={cn(
                                  'relative mt-1.5 size-4 shrink-0 rounded-full border-4 border-white',
                                  creation.tone === 'teal' && 'bg-luma-teal-500',
                                  creation.tone === 'gold' && 'bg-luma-gold-300',
                                  creation.tone === 'violet' && 'bg-[#7a82d8]',
                                )}
                              />
                              <div>
                                <div className="font-bold text-luma-teal-900">{creation.title}</div>
                                <div className="mt-1 text-xs text-luma-muted">
                                  {creation.type} · {creation.day}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-4 text-sm text-luma-muted">暂无创作记录</p>
                      )}
                    </Card>
                  </motion.section>

                  <motion.section
                    variants={fadeUp}
                    id="conversation"
                    className="mt-5"
                  >
                    <Card
                      eyebrow="沟通建议"
                      title="把观察变成一次温柔的对话"
                      description="没有标准答案，让孩子决定画面如何继续。"
                    >
                      {insight && insight.suggestions.length > 0 ? (
                        <div className="mt-2 space-y-3">
                          {insight.suggestions.map((suggestion, index) => (
                            <div
                              key={suggestion.title}
                              className="group rounded-2xl border border-luma-ivory-200 bg-luma-ivory-50 p-4 transition hover:border-luma-teal-100 hover:bg-luma-teal-50"
                            >
                              <div className="flex items-center gap-2">
                                <span className="flex size-6 items-center justify-center rounded-full bg-luma-gold-100 text-xs font-bold text-luma-gold-700">
                                  {index + 1}
                                </span>
                                <span className="text-sm font-bold text-luma-teal-900">
                                  {suggestion.title}
                                </span>
                              </div>
                              <p className="mt-2.5 pl-8 font-display text-lg font-semibold leading-relaxed text-luma-teal-900">
                                {suggestion.prompt}
                              </p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-4 text-sm text-luma-muted">
                          孩子完成更多创作后，沟通建议会出现在这里。
                        </p>
                      )}
                    </Card>
                  </motion.section>
                </>
              )}

              {activeTab === 'timeline' && (
                <TimelineSection
                  childName={selectedChild?.nickname ?? '孩子'}
                  childId={isGuest ? undefined : selectedChild?.id}
                  token={isGuest ? undefined : session?.token}
                />
              )}

              {activeTab === 'communication' && (
                <CommunicationSection
                  childName={selectedChild?.nickname ?? '孩子'}
                  childId={isGuest ? undefined : selectedChild?.id}
                  token={isGuest ? undefined : session?.token}
                />
              )}
            </motion.div>
          </>
        ) : (
          <motion.section variants={fadeUp} className="mt-10">
            <Card
              variant="soft"
              title="邀请孩子加入家庭空间"
              description="孩子使用家庭邀请码完成注册后，创作洞察会出现在这里。"
              className="mx-auto max-w-2xl text-center"
            >
              <div className="font-brand mt-3 text-3xl font-bold tracking-[0.14em] text-luma-teal-900">
                {inviteCode ?? '—'}
              </div>
              <Button variant="secondary" className="mt-5" onClick={copyInviteCode}>
                {copied ? '邀请码已复制' : '复制家庭邀请码'}
              </Button>
            </Card>
          </motion.section>
        )}
      </motion.div>
    </main>
  )
}
