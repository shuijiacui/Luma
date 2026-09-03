import { motion } from 'framer-motion'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { defaultAvatars } from '@/assets/avatars'
import { Navbar } from '@/components/layout'
import { Button, Card } from '@/components/ui'
import { fadeUp, staggerContainer } from '@/design-system'
import { AvatarPicker } from '@/features/profile/components/AvatarPicker'
import { cn } from '@/lib/cn'
import { useAuth } from '../AuthContext'
import { findFamilyById, getChildrenForFamily } from '../storage'

const demoInsight = {
  period: '本周创作洞察',
  themes: [
    {
      name: '探索新世界',
      detail: '在 3 个故事和 2 幅画中出现',
      color: 'bg-luma-teal-500',
    },
    {
      name: '伙伴与合作',
      detail: '角色常常一起解决问题',
      color: 'bg-luma-gold-300',
    },
    {
      name: '自然想象',
      detail: '云朵、河流和森林成为故事场景',
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
    '孩子最近的故事经常出现探索和伙伴主题。角色面对未知时，常常会邀请朋友一起行动；在画面里，通往远方的道路、河流和小船也多次出现。',
  observations: [
    '故事角色从独自出发，逐渐变成结伴探索。',
    '孩子会为画面中的小物件补充名字和故事。',
    '同一个想法会通过绘画和讲述继续发展。',
  ],
  suggestions: [
    {
      title: '从故事继续',
      prompt: '“如果小船明天继续出发，它最想邀请谁一起去？”',
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
    { title: '会发光的森林', type: '故事', day: '周四', tone: 'teal' },
    { title: 'Nilo 的蓝色小船', type: '绘画', day: '周二', tone: 'gold' },
    { title: '云朵上的城市', type: '故事', day: '上周日', tone: 'violet' },
  ],
} as const

export function ParentDemoPage() {
  const navigate = useNavigate()
  const { session, logout } = useAuth()
  const family = session ? findFamilyById(session.familyId) : undefined
  const children = useMemo(
    () => (session ? getChildrenForFamily(session.familyId) : []),
    [session],
  )
  const [selectedChildId, setSelectedChildId] = useState(
    () => children[0]?.id ?? '',
  )
  const [copied, setCopied] = useState(false)
  const selectedChild =
    children.find((child) => child.id === selectedChildId) ?? children[0]

  function handleLogout() {
    logout()
    navigate('/auth?role=parent&mode=login')
  }

  async function copyInviteCode() {
    if (!family?.inviteCode) return
    await navigator.clipboard.writeText(family.inviteCode)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  return (
    <main className="min-h-screen bg-luma-ivory-50 px-4 py-4 sm:px-5 sm:py-5">
      <Navbar
        items={[
          { label: '成长概览', href: '#overview', isActive: true },
          { label: '创作主题', href: '#themes' },
          { label: '沟通建议', href: '#conversation' },
        ]}
        actions={
          <>
            <div className="hidden text-right lg:block">
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

        <motion.section variants={fadeUp} id="overview">
          <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
            <div>
              <div className="luma-eyebrow text-luma-gold-700">
                {demoInsight.period}
              </div>
              <h1 className="luma-heading-1 mt-3 text-luma-teal-900">
                看见创作里的成长轨迹
              </h1>
              <p className="luma-body-lg mt-4 max-w-2xl text-luma-muted">
                从孩子画下的画面和讲过的故事中，整理值得继续倾听的主题与表达。
              </p>
            </div>

            <div className="rounded-2xl border border-luma-teal-100 bg-white px-5 py-3 shadow-luma-sm">
              <div className="luma-caption text-luma-muted">家庭邀请码</div>
              <div className="mt-1 flex items-center gap-3">
                <strong className="font-brand text-xl tracking-[0.12em] text-luma-teal-900">
                  {family?.inviteCode ?? '—'}
                </strong>
                <button
                  type="button"
                  onClick={copyInviteCode}
                  className="rounded-lg bg-luma-teal-50 px-2.5 py-1 text-xs font-bold text-luma-teal-700 transition hover:bg-luma-teal-100"
                >
                  {copied ? '已复制' : '复制'}
                </button>
              </div>
            </div>
          </div>
        </motion.section>

        {children.length > 0 ? (
          <>
            <motion.section variants={fadeUp} className="mt-9">
              <div className="flex flex-wrap items-center gap-3">
                <span className="mr-1 text-sm font-semibold text-luma-muted">
                  查看：
                </span>
                {children.map((child, index) => (
                  <button
                    key={child.id}
                    type="button"
                    onClick={() => setSelectedChildId(child.id)}
                    className={cn(
                      'flex items-center gap-2.5 rounded-2xl border px-2.5 py-2 pr-4 text-sm font-bold outline-none transition-all focus-visible:ring-3 focus-visible:ring-luma-gold-300/60',
                      selectedChild?.id === child.id
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
                      className="size-10 object-contain"
                    />
                    {child.nickname}
                  </button>
                ))}
              </div>
            </motion.section>

            <motion.div
              key={selectedChild?.id}
              variants={staggerContainer}
              initial="hidden"
              animate="visible"
              className="mt-7"
            >
              <motion.section
                variants={fadeUp}
                id="themes"
                className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]"
              >
                <Card
                  eyebrow="创作主题"
                  title={`${selectedChild?.nickname} 最近在探索什么？`}
                  description="根据近期绘画与故事中反复出现的内容整理"
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

              <motion.section
                variants={fadeUp}
                id="conversation"
                className="mt-5 grid gap-5 lg:grid-cols-[1fr_0.72fr]"
              >
                <Card
                  eyebrow="沟通建议"
                  title="把观察变成一次温柔的对话"
                  description="没有标准答案，让孩子决定故事如何继续。"
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

                <Card
                  variant="outline"
                  eyebrow="近期创作"
                  title="表达的足迹"
                >
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
                {family?.inviteCode ?? '—'}
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
