// 画面解读（家长视角）：基于孩子最近一幅画的情绪倾向报告
// 数据源：/api/report（判定逻辑全在后端，前端只展示，不做阈值判断、不改写文案）
import { useState } from 'react'

import { Button, Card } from '@/components/ui'
import {
  fetchReport,
  type Emotion,
  type FeatureJSON,
  type ReportResponse,
} from '@/lib/api/lumaApi'
import { LATEST_FEATURES_KEY } from '@/features/child/pages/ChildCreatePage'
import { cn } from '@/lib/cn'

const EMOTION_STYLE: Record<Emotion, { label: string; className: string }> = {
  乐观平稳: { label: '乐观平稳', className: 'bg-luma-teal-50 text-luma-teal-700 border-luma-teal-100' },
  未见明显风险信号: { label: '未见明显风险信号', className: 'bg-luma-teal-50 text-luma-teal-700 border-luma-teal-100' },
  焦虑倾向: { label: '焦虑倾向', className: 'bg-luma-gold-100 text-luma-gold-700 border-luma-gold-300/50' },
  低落倾向: { label: '低落倾向', className: 'bg-[#eceefc] text-[#5a63b8] border-[#d5d9f5]' },
  需要关注: { label: '需要关注', className: 'bg-[#fdeae7] text-[#c4533f] border-[#f6d0c9]' },
  信息不足: { label: '信息不足', className: 'bg-luma-ivory-100 text-luma-muted border-luma-ivory-200' },
}

function readLatestFeatures(): FeatureJSON | null {
  try {
    const raw = window.sessionStorage.getItem(LATEST_FEATURES_KEY)
    return raw ? (JSON.parse(raw) as FeatureJSON) : null
  } catch {
    return null
  }
}

export function DrawingInsightSection() {
  const [report, setReport] = useState<ReportResponse | null>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const features = readLatestFeatures()

  async function handleGenerate() {
    const latest = readLatestFeatures()
    if (!latest || status === 'loading') return
    setStatus('loading')
    try {
      setReport(await fetchReport(latest))
      setStatus('idle')
    } catch {
      setStatus('error')
    }
  }

  if (!features) {
    return (
      <Card
        variant="soft"
        eyebrow="画面解读"
        title="还没有可以解读的画作"
        description="孩子在创作空间完成一幅画后，这里会出现基于画面特征的情绪倾向与沟通建议。"
        className="mt-5"
      />
    )
  }

  const style = report ? EMOTION_STYLE[report.emotion] : null

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
          <Button variant="secondary" onClick={handleGenerate} disabled={status === 'loading'}>
            {status === 'loading' ? '正在解读…' : '生成画面解读'}
          </Button>
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
                置信度 {Math.round(report.confidence * 100)}%
              </span>
            </div>
          </div>

          {report.evidence.length > 0 && (
            <div>
              <div className="luma-eyebrow text-luma-gold-700">判定依据（可追溯文献条目）</div>
              <ul className="mt-2 space-y-2">
                {report.evidence.map((item) => (
                  <li
                    key={item.entryId}
                    className="rounded-xl bg-luma-ivory-50 px-3.5 py-2.5 text-sm leading-relaxed text-luma-muted"
                  >
                    <span className="mr-2 font-mono text-xs font-bold text-luma-teal-700">
                      {item.entryId}
                    </span>
                    {item.summary}
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

          <div className="rounded-xl bg-luma-teal-50 px-4 py-3 text-xs leading-relaxed text-luma-teal-700">
            以上仅为单幅画面的情绪倾向参考，置信度已按测量工具效度上限校准；请结合日常观察综合了解孩子。
          </div>

          <Button variant="ghost" size="sm" onClick={handleGenerate} disabled={status === 'loading'}>
            {status === 'loading' ? '正在解读…' : '重新解读'}
          </Button>
        </div>
      )}
    </Card>
  )
}
