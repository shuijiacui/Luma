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
import { fetchMe, type MeResponse } from '@/lib/api/authApi'
import { cn } from '@/lib/cn'
import { useAuth } from '../AuthContext'
import { findFamilyById, getChildrenForFamily } from '../storage'

const demoInsight = {
  period: '本周创作洞察',
  themes: [
    {
      name: '探索新世界',
      detail: '在 5 幅画中出现',
      color: 'bg-luma-teal-500',
    },
    {
      name: '伙伴与合作',
      detail: '画面中角色常常一起出现',
      color: 'bg-luma-gold-300',
    },
    {
      name: '自然想象',
      detail: '云朵、河流和森林成为画面背景',
      color: 'bg-[#7a82d8]',
    },
  ],
  quotes: [
    {
      text: '“小船不知道要去哪里，但是 Nilo 说，我们可以一起找。”',
      source: '《Nilo 的蓝色小船》',
      time: '周二',
    },
    {
      text: '“森林里的每一盏灯，都是一个还没讲完的故事。”',
      source: '《会发光的森林》',
      time: '周四',
    },
  ],
  observation:
    '孩子最近的绘画经常出现探索和伙伴主题。角色面对未知时，常常会邀请朋友一起行动；在画面里，通往远方的道路、河流和小船也多次出现。',
  observations: [
    '画面角色从独自出发，逐渐变成结伴探索。',
    '孩子会为画面中的小物件补充细节和标注。',
    '同一个想象会通过不同绘画继续发展。',
  ],
  suggestions: [
    {
      title: '从画面继续',
      prompt: '”如果小船明天继续出发，它最想邀请谁一起去？”',
    },
    {
      title: '听孩子来定义',
      prompt: '“这片森林里，你最想带我认识哪个地方？”',
    },
    {
      title: '把好奇留给孩子',
      prompt: '“接下来发生什么，由你来决定的话，会是什么？”',
    },
  ],
  recentCreations: [
    { title: '会发光的森林', type: '绘画', day: '周四', tone: 'teal' },
    { title: 'Nilo 的蓝色小船', type: '绘画', day: '周二', tone: 'gold' },
    { title: '云朵上的城市', type: '绘画', day: '上周日', tone: 'violet' },
  ],
} as const

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
  // 游客：本地演示家庭；登录：后端真实家庭与孩子列表
  const [me, setMe] = useState<MeResponse | null>(null)
  useEffect(() => {
    if (!session?.isGuest && session?.token) {
      fetchMe(session.token).then(setMe).catch(() => setMe(null))
    }
  }, [session])
  const family = isGuest
    ? (session ? findFamilyById(session.familyId) : undefined)
    : me?.family
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
  const selectedChild =
    children.find((child) => child.id === selectedChildId) ?? children[0]

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

  // 孩子切换（紧凑）——顶栏与移动条共用
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

  // 家庭邀请码（紧凑）——顶栏与移动条共用
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
            {/* 第一行右侧：孩子切换 + 邀请码(lg+) + 账号 */}
            <div className="hidden items-center gap-2 lg:flex">
              {childSwitcher}
              {invitePill}
              <span className="h-6 w-px bg-luma-ivory-200" aria-hidden="true" />
            </div>
            <div className="hidden text-right 2xl:block">
              <div className="text-sm font-bold text-luma-teal-900">
                {session?.displayName}
              </div>
              <div className="text-xs text-luma-muted">家长账号</div>
            </div>
            <AvatarPicker userId={session?.id ?? 'guest-parent'} compact />
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              退出
            </Button>
          </>
        }
        secondaryRow={
          <nav
            aria-label="家长端分区"
            className="flex gap-1.5 overflow-x-auto"
          >
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
            {/* 窄屏(<lg)：孩子切换 + 邀请码（lg+ 已并入顶栏） */}
            <motion.div
              variants={fadeUp}
              className="mb-4 flex flex-wrap items-center justify-between gap-3 lg:hidden"
            >
              {childSwitcher}
              {invitePill}
            </motion.div>

            {/* 标签内容：切换标签或孩子时重放入场动画 */}
            <motion.div
              key={`${activeTab}-${selectedChild?.id}`}
              variants={staggerContainer}
              initial="hidden"
              animate="visible"
            >
              {activeTab === 'overview' && (
                <>
                  <motion.section variants={fadeUp} id="overview">
                    <div className="luma-eyebrow text-luma-gold-700">
                      {demoInsight.period}
                    </div>
                    <h1 className="luma-heading-1 mt-3 text-luma-teal-900">
                      看见创作里的成长轨迹
                    </h1>
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
                      <p className="font-display text-xl leading-relaxed font-semibold text-luma-teal-900 sm:text-2xl">
                        “{demoInsight.observation}”
                      </p>
                      <div className="mt-6 grid gap-3 md:grid-cols-3">
                        {demoInsight.observations.map((observation, index) => (
                          <div
                            key={observation}
                            className="rounded-2xl bg-luma-ivory-50 p-4"
                          >
                            <span className="luma-eyebrow text-luma-gold-700">
                              0{index + 1}
                            </span>
                            <p className="mt-2 text-sm leading-relaxed text-luma-muted">
                              {observation}
                            </p>
                          </div>
                        ))}
                      </div>
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
                      <div className="mt-2 space-y-5">
                        {demoInsight.themes.map((theme) => (
                          <div key={theme.name} className="flex items-start gap-3">
                            <span
                              className={cn(
                                'mt-1.5 size-2.5 shrink-0 rounded-full',
                                theme.color,
                              )}
                            />
                            <div>
                              <div className="font-bold text-luma-teal-900">
                                {theme.name}
                              </div>
                              <div className="mt-1 text-sm text-luma-muted">
                                {theme.detail}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </Card>

                    <Card
                      variant="soft"
                      eyebrow="孩子说过的话"
                      title="保留孩子自己的声音"
                      className="h-full"
                    >
                      <div className="mt-1 space-y-4">
                        {demoInsight.quotes.map((quote) => (
                          <figure
                            key={quote.source}
                            className="rounded-2xl border border-white/80 bg-white/70 p-4"
                          >
                            <blockquote className="font-display text-lg font-semibold leading-relaxed text-luma-teal-900">
                              {quote.text}
                            </blockquote>
                            <figcaption className="mt-3 text-xs font-semibold text-luma-muted">
                              {quote.source} · {quote.time}
                            </figcaption>
                          </figure>
                        ))}
                      </div>
                    </Card>
                  </motion.section>

                  <motion.section
                    variants={fadeUp}
                    id="conversation"
                    className="mt-5 grid gap-5 lg:grid-cols-[1fr_0.72fr]"
                  >
                    <Card
                      eyebrow="沟通建议"
                      title="把观察变成一次温柔的对话"
                      description="没有标准答案，让孩子决定画面如何继续。"
                    >
                      <div className="mt-2 space-y-3">
                        {demoInsight.suggestions.map((suggestion, index) => (
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
                    </Card>

                    <Card variant="outline" eyebrow="近期创作" title="表达的足迹">
                      <div className="mt-2 space-y-1">
                        {demoInsight.recentCreations.map((creation, index) => (
                          <div
                            key={creation.title}
                            className="relative flex gap-3 pb-5 last:pb-0"
                          >
                            {index < demoInsight.recentCreations.length - 1 && (
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
                              <div className="font-bold text-luma-teal-900">
                                {creation.title}
                              </div>
                              <div className="mt-1 text-xs text-luma-muted">
                                {creation.type} · {creation.day}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </Card>
                  </motion.section>
                </>
              )}

              {activeTab === 'timeline' && (
                <TimelineSection childName={selectedChild?.nickname ?? '孩子'} />
              )}

              {activeTab === 'communication' && (
                <CommunicationSection
                  childName={selectedChild?.nickname ?? '孩子'}
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
              <Button
                variant="secondary"
                className="mt-5"
                onClick={copyInviteCode}
              >
                {copied ? '邀请码已复制' : '复制家庭邀请码'}
              </Button>
            </Card>
          </motion.section>
        )}
      </motion.div>
    </main>
  )
}
