import { lt, t, useLocale } from '@/i18n'
import { useChildHistory } from '@/hooks/useChildHistory'
import { exportArchive } from '../exportArchive'
import { motion } from 'framer-motion'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import bgParent from '@/assets/images/bg-parent.png'
import { Navbar } from '@/components/layout'
import { Button, Card } from '@/components/ui'
import { fadeUp, staggerContainer } from '@/design-system'
import { AvatarPicker } from '@/features/profile/components/AvatarPicker'
import { useAuth } from '@/features/auth/AuthContext'
import { fetchMe, type AnalysisSummary, type MeResponse } from '@/lib/api/authApi'
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
  useLocale()
  const navigate = useNavigate()
  const { session, logout } = useAuth()

  const [me, setMe] = useState<MeResponse | null>(null)
  const [meError, setMeError] = useState(false)
  const [revision, setRevision] = useState(0)
  const [exportBusy, setExportBusy] = useState(false)
  const [exportStatus, setExportStatus] = useState('')
  const [selectedChildId, setSelectedChildId] = useState<string>('')

  useEffect(() => {
    if (session?.token && !session.isGuest) {
      let active = true
      fetchMe(session.token).then(value => { if (active) { setMe(value); setMeError(false) } }).catch(() => { if (active) setMeError(true) })
      return () => { active = false }
    }
  }, [session, revision])

  const children = me?.children ?? []
  const selectedChild = children.find((c) => c.id === selectedChildId) ?? children[0]

  const { analyses, error: historyError, reload } = useChildHistory(selectedChild?.id, session?.token)

  const months = useMemo(
    () => (analyses ? groupAnalysesByMonth(analyses) : null),
    [analyses],
  )

  const totalWorks = analyses?.length ?? 0

  async function download(year?: number) {
    if (!session?.token || !analyses || !selectedChild) return
    setExportBusy(true); setExportStatus('正在准备原图和解读…')
    try { await exportArchive(analyses, session.token, selectedChild.nickname, year); setExportStatus('已生成离线 HTML 文件，可打开并打印为 PDF。') }
    catch (error) { setExportStatus(error instanceof Error ? error.message : '导出失败，请重试。') }
    finally { setExportBusy(false) }
  }

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
                <div className="text-xs text-luma-muted">{t("家长账号")}</div>
              </div>
              <AvatarPicker userId={session?.id ?? 'guest-parent'} compact />
              <Button variant="ghost" size="sm" onClick={handleLogout}>
                {t("退出")}</Button>
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
            <div className="luma-eyebrow text-luma-gold-700">{t("家庭成长档案")}</div>
            <h1 className="luma-heading-1 mt-3 text-luma-teal-900">
              {lt(selectedChild ? `${selectedChild.nickname} 的创作旅程` : '成长档案')}
            </h1>
            <p className="luma-body-lg mt-4 max-w-2xl text-luma-muted">
              {lt(analyses === null
                ? '加载中…'
                : totalWorks > 0
                  ? `共 ${totalWorks} 件作品 · 每一件都是孩子留下的印记`
                  : '孩子完成第一次创作后，档案会出现在这里。')}
            </p>
          </motion.section>

          {meError || historyError ? <p role="alert">{lt(historyError ?? '家庭信息加载失败。')}<Button onClick={() => { setRevision(n => n + 1); reload() }}>{t("重试")}</Button></p> : (!session?.isGuest && !me) || months === null ? (
            <motion.div variants={fadeUp} className="mt-16 text-center text-sm text-luma-muted">
              {t("加载中…")}</motion.div>
          ) : months.length === 0 ? (
            <motion.div variants={fadeUp} className="mt-16 text-center text-sm text-luma-muted">
              {t("暂无创作记录")}</motion.div>
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
                    <span className="font-brand text-lg font-bold text-luma-teal-900">{lt(m.month)}</span>
                    <div className="h-px flex-1 bg-luma-teal-100" />
                    <span className="text-xs text-luma-muted">{lt(m.works.length)} {t("件")}</span>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {m.works.map((work) => (
                      <div
                        key={work.id}
                        className="rounded-2xl border border-luma-ivory-200 bg-white p-4 shadow-luma-sm transition hover:border-luma-teal-100"
                      >
                        <div className="font-bold text-luma-teal-900">{lt(work.title)}</div>
                        <div className="mt-2 flex items-center gap-2">
                          {work.emotion && (
                            <span
                              className={cn(
                                'rounded-full px-2.5 py-0.5 text-xs font-bold',
                                emotionColor[work.emotion] ?? 'bg-luma-ivory-100 text-luma-muted',
                              )}
                            >
                              {lt(work.emotion)}
                            </span>
                          )}
                          <span className="text-xs text-luma-muted">
                            {lt(new Date(work.createdAt).toLocaleDateString('zh-CN', {
                              month: 'numeric',
                              day: 'numeric',
                            }))}
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
              title={t("生成完整成长报告")}
              description="将一年的创作轨迹整理成可保存、可分享的成长册。"
              className="text-center"
            >
              <div className="mt-4 flex flex-wrap justify-center gap-3">
                <Button variant="primary" disabled={exportBusy || !totalWorks || !session?.token} onClick={() => download(new Date().getFullYear())}>{t("生成本年成长册")}</Button>
                <Button variant="secondary" disabled={exportBusy || !totalWorks || !session?.token} onClick={() => download()}>{t("导出全部作品")}</Button>
              </div>
              <p role="status" className="mt-3 text-sm">{lt(exportStatus)}</p>
              <p className="mt-4 text-xs text-luma-muted">{t("单文件 HTML 包含原图和已有解读，可离线查看与打印。不收取费用。")}</p>
            </Card>
          </motion.div>
        </motion.div>
      </div>
    </main>
  )
}
