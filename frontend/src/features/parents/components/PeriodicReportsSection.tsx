import { useEffect, useState } from 'react'
import { Button } from '@/components/ui'
import { authFetch } from '@/lib/api/authFetch'
import { elementLabel } from './dashboard/overviewModel'

export interface PeriodReport {
  id: string
  kind: 'weekly' | 'monthly'
  periodStart: string
  periodEnd: string
  generatedAt: string
  summary: {
    periodLabel: string
    artworkCount: number
    activeDays: number
    previousArtworkCount: number
    artworkCountChange: number
    withReport: number
    insufficientReports: number
    elements: { name: string; count: number }[]
    parentAdvice: string[]
    sources: { analysisId: string; createdAt: string; hasReport: boolean }[]
    note: string
  }
}
interface ReportPage { reports: PeriodReport[]; total: number; nextOffset: number | null; timeZone: string }

function downloadReport(report: PeriodReport, childName: string) {
  const url = URL.createObjectURL(new Blob([JSON.stringify({ childName, timeZone: 'Asia/Shanghai', ...report }, null, 2)], { type: 'application/json;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `Luma-${report.kind}-${report.summary.periodLabel.slice(0, 10)}.json`
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function PeriodicReportsSection({ childId, childName, token }: { childId?: string; childName: string; token?: string }) {
  const [kind, setKind] = useState<'weekly' | 'monthly'>('weekly')
  const [offset, setOffset] = useState(0)
  const [revision, setRevision] = useState(0)
  const [result, setResult] = useState<{ key: string; page?: ReportPage; error?: string } | null>(null)
  const key = `${childId}:${kind}:${offset}`
  useEffect(() => {
    if (!childId || !token) return
    let canceled = false
    let requestId = 0
    const refresh = () => {
      const currentRequest = ++requestId
      authFetch<ReportPage>(`/children/${encodeURIComponent(childId)}/digests?kind=${kind}&limit=12&offset=${offset}`, { token })
        .then(page => { if (!canceled && currentRequest === requestId) setResult({ key, page }) })
        .catch(() => { if (!canceled && currentRequest === requestId) setResult({ key, error: '周期报告加载失败，请重试。' }) })
    }
    refresh()
    window.addEventListener('focus', refresh)
    return () => { canceled = true; window.removeEventListener('focus', refresh) }
  }, [childId, token, kind, offset, revision, key])

  if (!childId || !token) return <p className="rounded-2xl bg-white p-6">正式家庭完成创作后，可以在这里查看周报与月报。</p>
  const current = result?.key === key ? result : null
  return <section className="space-y-5">
    <div className="flex flex-wrap items-center gap-3">
      {(['weekly', 'monthly'] as const).map(value => <Button key={value} variant={kind === value ? 'primary' : 'secondary'} aria-pressed={kind === value} onClick={() => { setKind(value); setOffset(0) }}>{value === 'weekly' ? '每周摘要' : '每月报告'}</Button>)}
      <Button variant="ghost" onClick={() => { setResult(null); setRevision(n => n + 1) }}>刷新报告</Button>
    </div>
    <p className="text-sm text-[#6b7462]">按北京时间汇总已结束的自然周（周一至周日）或自然月。有作品的周期会自动生成；本周、本月的创作可先在创作记录中查看。</p>
    {current?.error ? <div role="alert" className="rounded-2xl bg-white p-6">{current.error}<Button onClick={() => { setResult(null); setRevision(n => n + 1) }}>重试</Button></div>
      : !current?.page ? <p role="status">正在汇总创作…</p>
      : <>
        {current.page.reports.length === 0 && <p className="rounded-2xl bg-white p-6">还没有已结束周期的创作记录。完成第一段创作时光后，摘要会出现在这里。</p>}
        {current.page.reports.map(report => <article key={report.id} className="space-y-4 rounded-3xl border border-white bg-white/90 p-6 shadow-luma-card">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-lg font-bold">{childName} · {report.summary.periodLabel}</h3>
            <Button variant="secondary" size="sm" onClick={() => downloadReport(report, childName)}>下载摘要数据</Button>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[['作品', report.summary.artworkCount], ['创作天数', report.summary.activeDays], ['已有解读', report.summary.withReport], ['其中信息不足', report.summary.insufficientReports]].map(([label, value]) => <div key={label} className="rounded-xl bg-luma-grass-50 p-3"><div className="text-xs">{label}</div><div className="mt-1 text-xl font-bold">{value}</div></div>)}
          </div>
          <p className="text-sm">上一{kind === 'weekly' ? '周' : '月'}保存 {report.summary.previousArtworkCount} 件，本期{report.summary.artworkCountChange >= 0 ? '增加' : '减少'} {Math.abs(report.summary.artworkCountChange)} 件。</p>
          {report.summary.elements.length > 0 && <div className="flex flex-wrap gap-2">{report.summary.elements.map(item => <span key={item.name} className="rounded-full bg-[#faf7ef] px-3 py-1 text-sm">{elementLabel(item.name)} · {item.count} 件作品</span>)}</div>}
          <div><h4 className="font-semibold">已有解读中的陪伴建议</h4>{report.summary.parentAdvice.length ? <ul className="mt-2 list-disc space-y-2 pl-5 text-sm">{report.summary.parentAdvice.map(text => <li key={text}>{text}</li>)}</ul> : <p className="mt-2 text-sm">尚无可汇总的建议，可在成长概览的完整解读中选择画作生成报告。</p>}</div>
          <p className="text-xs leading-relaxed text-[#6b7462]">{report.summary.note} 下载的数据包含来源作品编号，可与成长档案核对。</p>
        </article>)}
        {(offset > 0 || current.page.nextOffset !== null) && <div className="flex gap-3"><Button disabled={offset === 0} onClick={() => setOffset(n => Math.max(0, n - 12))}>上一页</Button><Button disabled={current.page.nextOffset === null} onClick={() => setOffset(current.page!.nextOffset!)}>下一页</Button></div>}
      </>}
  </section>
}
