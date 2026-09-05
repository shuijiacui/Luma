// 画面解读（家长视角）：基于孩子画作的情绪倾向报告 + 历史解读
// 数据源：/api/report + /api/children/:id/analyses（判定逻辑全在后端，前端只展示，不做阈值判断、不改写文案）
import { useCallback, useEffect, useRef, useState } from 'react'

import { Button, Card } from '@/components/ui'
import {
  fetchReport,
  type Emotion,
  type FeatureJSON,
  type ReportResponse,
} from '@/lib/api/lumaApi'
import { listAnalyses, fetchTrend, type AnalysisSummary, type TrendResponse } from '@/lib/api/authApi'
import {
  LATEST_ANALYSIS_ID_KEY,
  LATEST_FEATURES_KEY,
} from '@/features/child/pages/ChildCreatePage'
import { cn } from '@/lib/cn'

const EMOTION_STYLE: Record<Emotion, { label: string; className: string }> = {
  乐观平稳: { label: '乐观平稳', className: 'bg-luma-teal-50 text-luma-teal-700 border-luma-teal-100' },
  未见明显风险信号: { label: '未见明显风险信号', className: 'bg-luma-teal-50 text-luma-teal-700 border-luma-teal-100' },
  焦虑倾向: { label: '焦虑倾向', className: 'bg-luma-gold-100 text-luma-gold-700 border-luma-gold-300/50' },
  低落倾向: { label: '低落倾向', className: 'bg-[#eceefc] text-[#5a63b8] border-[#d5d9f5]' },
  需要关注: { label: '需要关注', className: 'bg-[#fdeae7] text-[#c4533f] border-[#f6d0c9]' },
  信息不足: { label: '信息不足', className: 'bg-luma-ivory-100 text-luma-muted border-luma-ivory-200' },
}

function emotionStyle(emotion: string) {
  return EMOTION_STYLE[emotion as Emotion] ?? EMOTION_STYLE.信息不足
}

function readLatestFeatures(): FeatureJSON | null {
  try {
    const raw = window.sessionStorage.getItem(LATEST_FEATURES_KEY)
    return raw ? (JSON.parse(raw) as FeatureJSON) : null
  } catch {
    return null
  }
}

function formatTime(iso: string) {
  const date = new Date(iso)
  return `${date.getMonth() + 1}月${date.getDate()}日 ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

// 趋势方向文案（描述性，不做预测、不下结论——v2 界限）
const DIRECTION_TEXT: Record<TrendResponse['direction'], { text: string; className: string }> = {
  insufficient: { text: '解读次数还太少，趋势需更多画作积累', className: 'text-luma-muted' },
  stable: { text: '近期解读未见预警信号，状态平稳', className: 'text-luma-teal-700' },
  watch: { text: '近期解读中出现了需要留意的信号，建议持续观察', className: 'text-[#c4533f]' },
}

interface DrawingInsightSectionProps {
  childId?: string
  token?: string
}

export function DrawingInsightSection({ childId, token }: DrawingInsightSectionProps) {
  const [report, setReport] = useState<ReportResponse | null>(null)
  const [reportSource, setReportSource] = useState<'latest' | 'history'>('latest')
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [history, setHistory] = useState<AnalysisSummary[]>([])
  const [trend, setTrend] = useState<TrendResponse | null>(null)
  const features = readLatestFeatures()

  // 每次加载打一个递增的 token：childId 切换、或 handleGenerate 手动触发的重新加载，
  // 都会产生新的 token，只有最新一次请求的结果会被采纳，避免旧孩子/旧请求的数据后到覆盖新数据
  const loadTokenRef = useRef(0)

  const loadHistory = useCallback(() => {
    if (!childId || !token) return
    const requestToken = ++loadTokenRef.current
    listAnalyses(childId, token)
      .then((res) => {
        if (loadTokenRef.current === requestToken) setHistory(res.analyses)
      })
      .catch(() => {
        if (loadTokenRef.current === requestToken) setHistory([])
      })
    fetchTrend(childId, token)
      .then((res) => {
        if (loadTokenRef.current === requestToken) setTrend(res)
      })
      .catch(() => {
        if (loadTokenRef.current === requestToken) setTrend(null)
      })
  }, [childId, token])

  useEffect(loadHistory, [loadHistory])

  async function handleGenerate() {
    const latest = readLatestFeatures()
    if (!latest || status === 'loading') return
    setStatus('loading')
    try {
      const analysisId = window.sessionStorage.getItem(LATEST_ANALYSIS_ID_KEY) ?? undefined
      setReport(await fetchReport(latest, { token, analysisId }))
      setReportSource('latest')
      setStatus('idle')
      loadHistory() // report 回写后刷新历史
    } catch {
      setStatus('error')
    }
  }

  function handleSelectHistory(item: AnalysisSummary) {
    if (!item.report) return
    setReport(item.report as ReportResponse)
    setReportSource('history')
  }

  const style = report ? emotionStyle(report.emotion) : null

  return (
    <Card
      variant="glass"
      eyebrow="画面解读"
      title="最近一幅画透露的状态"
      description="只呈现情绪倾向与置信度，不构成任何诊断结论"
      className="mt-5 border-luma-teal-100"
    >
      {!report ? (
        <div className="mt-2 flex flex-wrap items-center gap-3">
          {features ? (
            <Button variant="secondary" onClick={handleGenerate} disabled={status === 'loading'}>
              {status === 'loading' ? '正在解读…' : '生成画面解读'}
            </Button>
          ) : (
            <p className="text-sm text-luma-muted">
              孩子在创作空间完成一幅画后，这里会出现基于画面特征的情绪倾向与沟通建议。
            </p>
          )}
          {status === 'error' && (
            <span className="text-sm font-semibold text-[#c4533f]">
              解读服务暂时不可用，请确认后端已启动后重试
            </span>
          )}
        </div>
      ) : (
        <div className="mt-2 space-y-5">
          <div className="flex flex-wrap items-center gap-4">
            <span
              className={cn(
                'rounded-full border px-4 py-1.5 text-sm font-bold',
                style?.className,
              )}
            >
              {style?.label}
            </span>
            <div className="flex items-center gap-2">
              <div className="h-2 w-36 overflow-hidden rounded-full bg-luma-ivory-200">
                <div
                  className="h-full rounded-full bg-luma-teal-500"
                  style={{ width: `${Math.round(report.confidence * 100)}%` }}
                />
              </div>
              <span className="text-sm font-bold text-luma-teal-900">
                参考分值 {Math.round(report.confidence * 100)}%
              </span>
            </div>
            {reportSource === 'history' && (
              <span className="text-xs font-semibold text-luma-muted">（历史解读）</span>
            )}
          </div>

          {report.narrative && (
            <div className="rounded-xl border border-luma-ivory-200 bg-white px-4 py-3 text-sm leading-relaxed text-luma-teal-900">
              {report.narrative}
            </div>
          )}

          {report.evidence.length > 0 && (
            <div>
              <div className="luma-eyebrow text-luma-gold-700">判定依据（可追溯文献条目）</div>
              <ul className="mt-2 space-y-2">
                {report.evidence.map((item) => (
                  <li
                    key={item.entryId}
                    className="rounded-xl bg-luma-ivory-50 px-3.5 py-2.5 text-sm leading-relaxed"
                  >
                    <span className={item.plain ? 'text-luma-teal-900' : 'text-luma-muted'}>
                      {item.plain ?? item.summary}
                    </span>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <span className="font-mono text-[11px] font-bold text-luma-teal-600">
                        {item.entryId}
                      </span>
                      {item.clusterLabel && (
                        <span className="rounded-full bg-luma-teal-50 px-2 py-0.5 text-[11px] font-semibold text-luma-teal-700">
                          {item.clusterLabel}
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <div className="luma-eyebrow text-luma-gold-700">沟通建议</div>
            <ul className="mt-2 space-y-2">
              {report.parentAdvice.map((advice) => (
                <li key={advice} className="flex items-start gap-2.5 text-sm leading-relaxed text-luma-teal-900">
                  <span className="mt-2 size-1.5 shrink-0 rounded-full bg-luma-gold-300" />
                  {advice}
                </li>
              ))}
            </ul>
          </div>

          {report.webAdvice && report.webAdvice.length > 0 && (
            <div>
              <div className="luma-eyebrow text-luma-teal-700">
                {report.webAdviceSource ?? '延伸建议'}（网络搜索）
              </div>
              <ul className="mt-2 space-y-2">
                {report.webAdvice.map((advice) => (
                  <li key={advice} className="flex items-start gap-2.5 text-sm leading-relaxed text-luma-muted">
                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-luma-ivory-300" />
                    {advice}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="rounded-xl bg-luma-teal-50 px-4 py-3 text-xs leading-relaxed text-luma-teal-700">
            以上仅为单幅画面的情绪倾向参考，置信度已按测量工具效度上限校准；请结合日常观察综合了解孩子。
          </div>

          {features && (
            <Button variant="ghost" size="sm" onClick={handleGenerate} disabled={status === 'loading'}>
              {status === 'loading' ? '正在解读…' : '重新解读最新画作'}
            </Button>
          )}
        </div>
      )}

      {token && trend && trend.withReport > 0 && (
        <div className="mt-4 rounded-xl bg-luma-ivory-50 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="luma-eyebrow text-luma-gold-700">近期趋势</span>
            <span className="flex items-center gap-1" aria-label="历次解读结果">
              {trend.points.map((p) => (
                <span
                  key={p.createdAt}
                  title={`${formatTime(p.createdAt)} ${p.emotion} ${Math.round(p.confidence * 100)}%`}
                  className={cn(
                    'inline-block size-2.5 rounded-full',
                    p.emotion === '需要关注' && 'bg-[#ef7b69]',
                    (p.emotion === '焦虑倾向' || p.emotion === '低落倾向') && 'bg-luma-gold-300',
                    (p.emotion === '乐观平稳' || p.emotion === '未见明显风险信号') && 'bg-luma-teal-500',
                    p.emotion === '信息不足' && 'bg-luma-ivory-200',
                  )}
                />
              ))}
            </span>
          </div>
          <p className={cn('mt-1.5 text-xs font-semibold', DIRECTION_TEXT[trend.direction].className)}>
            {DIRECTION_TEXT[trend.direction].text}
            <span className="ml-2 font-normal text-luma-muted">（基于最近 {trend.withReport} 次解读，仅为历史呈现，不构成预测）</span>
          </p>
        </div>
      )}

      {token && history.length > 0 && (
        <div className="mt-6 border-t border-luma-ivory-200 pt-5">
          <div className="luma-eyebrow text-luma-gold-700">历史解读</div>
          <ul className="mt-3 space-y-2">
            {history.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => handleSelectHistory(item)}
                  disabled={!item.report}
                  className={cn(
                    'flex w-full items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-left text-sm transition',
                    item.report
                      ? 'border-luma-ivory-200 bg-white hover:border-luma-teal-100 hover:bg-luma-teal-50'
                      : 'cursor-default border-luma-ivory-200 bg-luma-ivory-50 text-luma-muted',
                  )}
                >
                  <span className="text-luma-muted">{formatTime(item.createdAt)}</span>
                  <span className="flex-1 truncate font-semibold text-luma-teal-900">
                    {item.summary.elements.length > 0
                      ? `画了 ${item.summary.elements.join('、')}`
                      : '画面元素较少'}
                  </span>
                  {item.imageUrl && token && (
                    <img
                      src={`${item.imageUrl}?token=${encodeURIComponent(token)}`}
                      alt="孩子的画作"
                      className="size-12 shrink-0 rounded-lg object-cover"
                    />
                  )}
                  {item.report ? (
                    <span
                      className={cn(
                        'shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-bold',
                        emotionStyle(item.report.emotion).className,
                      )}
                    >
                      {item.report.emotion} {Math.round(item.report.confidence * 100)}%
                    </span>
                  ) : (
                    <span className="shrink-0 text-xs">未生成解读</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  )
}
