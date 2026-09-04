import { motion } from 'framer-motion'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import bgParent from '@/assets/images/bg-parent.png'
import { Navbar } from '@/components/layout'
import { Button, Card } from '@/components/ui'
import { fadeUp, staggerContainer } from '@/design-system'
import { AvatarPicker } from '@/features/profile/components/AvatarPicker'
import { useAuth } from '@/features/auth/AuthContext'
import { fetchMe, listAnalyses, type AnalysisSummary, type MeResponse } from '@/lib/api/authApi'
import { cn } from '@/lib/cn'

type MonthData = {
  month: string
  works: { id: string; title: string; emotion: string | null; createdAt: string }[]
}

function groupAnalysesByMonth(analyses: AnalysisSummary[]): MonthData[] {
  const map = new Map<string, MonthData['works']>()
  for (const a of analyses) {
    const d = new Date(a.createdAt)
    const key = `${d.getFullYear()}年${d.getMonth() + 1}月`
    const works = map.get(key) ?? []
    works.push({
      id: a.id,
      title: a.summary.elements.slice(0, 2).join('与') || '无标题',
      emotion: a.report?.emotion ?? null,
      createdAt: a.createdAt,
    })
    map.set(key, works)
  }
  return Array.from(map.entries())
    .map(([month, works]) => ({ month, works }))
    .sort((a, b) => b.month.localeCompare(a.month))
}

const emotionColor: Record<string, string> = {
  '乐观平稳': 'bg-luma-teal-50 text-luma-teal-700',
  '未见明显风险信号': 'bg-luma-teal-50 text-luma-teal-700',
  '焦虑倾向': 'bg-luma-gold-100 text-luma-gold-700',
  '低落倾向': 'bg-luma-gold-100 text-luma-gold-700',
  '需要关注': 'bg-red-50 text-red-600',
  '信息不足': 'bg-luma-ivory-100 text-luma-muted',
}

export function ArchivePage() {
  const navigate = useNavigate()
  const { session, logout } = useAuth()

  const [me, setMe] = useState<MeResponse | null>(null)
  const [analyses, setAnalyses] = useState<AnalysisSummary[] | null>(null)
  const [selectedChildId, setSelectedChildId] = useState<string>('')

  useEffect(() => {
    if (session?.token && !session.isGuest) {
      fetchMe(session.token).then(setMe).catch(() => setMe(null))
    }
  }, [session])

  const children = me?.children ?? []
  const selectedChild = children.find((c) => c.id === selectedChildId) ?? children[0]

  useEffect(() => {
    if (!selectedChild || !session?.token) return
    setAnalyses(null)
    listAnalyses(selectedChild.id, session.token)
      .then((res) => setAnalyses(res.analyses))
      .catch(() => setAnalyses([]))
  }, [selectedChild?.id, session?.token])

  const months = useMemo(
    () => (analyses ? groupAnalysesByMonth(analyses) : null),
    [analyses],
  )

  const totalWorks = analyses?.length ?? 0

  function handleLogout() {
    logout()
    navigate('/auth?role=parent&mode=login')
  }

  return (
    <main className="relative z-0 min-h-screen bg-luma-ivory-50 px-4 py-4 sm:px-5 sm:py-5">
      <img
        src={bgParent}
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 h-full w-full object-cover opacity-40 select-none"
      />
      <div className="relative z-0">
        <Navbar
          items={[
            { label: '成长概览', href: '/parent/demo' },
            { label: '成长档案', href: '#archive', isActive: true },
          ]}
          actions={
            <>
              {children.length > 1 && (
                <div className="flex gap-1.5">
                  {children.map((child) => (
                    <button
                      key={child.id}
                      type="button"
                      onClick={() => setSelectedChildId(child.id)}
                      className={cn(
                        'rounded-full px-3 py-1 text-xs font-bold transition',
                        selectedChild?.id === child.id
                          ? 'bg-luma-teal-500 text-white'
                          : 'bg-luma-ivory-100 text-luma-muted hover:bg-luma-teal-50',
                      )}
                    >
                      {child.nickname}
                    </button>
                  ))}
                </div>
              )}
              <div className="hidden text-right lg:block">
                <div className="text-sm font-bold text-luma-teal-900">{session?.displayName}</div>
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
          className="mx-auto max-w-4xl py-10 sm:py-14"
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
        >
          <motion.section variants={fadeUp} id="archive">
            <div className="luma-eyebrow text-luma-gold-700">家庭成长档案</div>
            <h1 className="luma-heading-1 mt-3 text-luma-teal-900">
              {selectedChild ? `${selectedChild.nickname} 的创作旅程` : '成长档案'}
            </h1>
            <p className="luma-body-lg mt-4 max-w-2xl text-luma-muted">
              {analyses === null
                ? '加载中…'
                : totalWorks > 0
                  ? `共 ${totalWorks} 件作品 · 每一件都是孩子留下的印记`
                  : '孩子完成第一次创作后，档案会出现在这里。'}
            </p>
          </motion.section>

          {months === null ? (
            <motion.div variants={fadeUp} className="mt-16 text-center text-sm text-luma-muted">
              加载中…
            </motion.div>
          ) : months.length === 0 ? (
            <motion.div variants={fadeUp} className="mt-16 text-center text-sm text-luma-muted">
              暂无创作记录
            </motion.div>
          ) : (
            <motion.div
              variants={staggerContainer}
              initial="hidden"
              animate="visible"
              className="mt-10 space-y-8"
            >
              {months.map((m) => (
                <motion.div key={m.month} variants={fadeUp}>
                  <div className="mb-4 flex items-center gap-4">
                    <span className="font-brand text-lg font-bold text-luma-teal-900">{m.month}</span>
                    <div className="h-px flex-1 bg-luma-teal-100" />
                    <span className="text-xs text-luma-muted">{m.works.length} 件</span>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {m.works.map((work) => (
                      <div
                        key={work.id}
                        className="rounded-2xl border border-luma-ivory-200 bg-white p-4 shadow-luma-sm transition hover:border-luma-teal-100"
                      >
                        <div className="font-bold text-luma-teal-900">{work.title}</div>
                        <div className="mt-2 flex items-center gap-2">
                          {work.emotion && (
                            <span
                              className={cn(
                                'rounded-full px-2.5 py-0.5 text-xs font-bold',
                                emotionColor[work.emotion] ?? 'bg-luma-ivory-100 text-luma-muted',
                              )}
                            >
                              {work.emotion}
                            </span>
                          )}
                          <span className="text-xs text-luma-muted">
                            {new Date(work.createdAt).toLocaleDateString('zh-CN', {
                              month: 'numeric',
                              day: 'numeric',
                            })}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              ))}
            </motion.div>
          )}

          <motion.div variants={fadeUp} className="mt-12">
            <Card
              variant="glass"
              eyebrow="年度回顾"
              title="生成完整成长报告"
              description="将一年的创作轨迹整理成可保存、可分享的成长册。"
              className="text-center"
            >
              <div className="mt-4 flex flex-wrap justify-center gap-3">
                <Button variant="primary">生成成长册</Button>
                <Button variant="secondary">导出全部作品</Button>
              </div>
              <p className="mt-4 text-xs text-luma-muted">成长册功能为年付会员专属</p>
            </Card>
          </motion.div>
        </motion.div>
      </div>
    </main>
  )
}
