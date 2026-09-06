import { useChildHistory } from '@/hooks/useChildHistory'
import { motion } from 'framer-motion'
import { useMemo, useState } from 'react'

import { Card } from '@/components/ui'
import { fadeUp } from '@/design-system'
import { type AnalysisSummary } from '@/lib/api/authApi'
import { cn } from '@/lib/cn'

const RANGES = ['30天', '90天', '180天'] as const
type Range = (typeof RANGES)[number]

const RANGE_DAYS: Record<Range, number> = { '30天': 30, '90天': 90, '180天': 180 }

type MonthGroup = {
  month: string
  themes: string[]
  count: number
}

function groupByMonth(analyses: AnalysisSummary[], days: number): MonthGroup[] {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)

  const map = new Map<string, { themes: string[]; count: number }>()
  for (const a of analyses) {
    if (new Date(a.createdAt) < cutoff) continue
    const d = new Date(a.createdAt)
    const key = `${d.getFullYear()}年${d.getMonth() + 1}月`
    const entry = map.get(key) ?? { themes: [], count: 0 }
    entry.count++
    for (const el of a.summary.elements) {
      if (!entry.themes.includes(el)) entry.themes.push(el)
    }
    map.set(key, entry)
  }

  return Array.from(map.entries())
    .map(([month, v]) => ({ month, themes: v.themes.slice(0, 4), count: v.count }))
    .reverse()
}

// 游客演示数据
const DEMO_DATA: Record<Range, MonthGroup[]> = {
  '30天': [{ month: '5月', themes: ['冒险', '伙伴', '建造'], count: 9 }],
  '90天': [
    { month: '3月', themes: ['动物', '家庭', '游戏'], count: 8 },
    { month: '4月', themes: ['人物互动', '开放空间', '旅行'], count: 11 },
    { month: '5月', themes: ['冒险', '伙伴', '建造'], count: 9 },
  ],
  '180天': [
    { month: '12月', themes: ['节日', '礼物', '家人'], count: 6 },
    { month: '1月', themes: ['新开始', '动物', '天气'], count: 7 },
    { month: '2月', themes: ['家庭', '游戏', '想象'], count: 9 },
    { month: '3月', themes: ['动物', '家庭', '游戏'], count: 8 },
    { month: '4月', themes: ['人物互动', '开放空间', '旅行'], count: 11 },
    { month: '5月', themes: ['冒险', '伙伴', '建造'], count: 9 },
  ],
}

interface Props {
  childName: string
  childId?: string
  token?: string
}

export function TimelineSection({ childName, childId, token }: Props) {
  const [range, setRange] = useState<Range>('90天')
  const isReal = !!(childId && token)
  const { analyses, error, reload } = useChildHistory(childId, token)

  const months = useMemo(() => {
    if (!isReal) return DEMO_DATA[range]
    if (analyses === null) return null
    return groupByMonth(analyses, RANGE_DAYS[range])
  }, [isReal, analyses, range])

  return (
    <motion.section variants={fadeUp} id="timeline" className="mt-5">
      <Card
        eyebrow="成长时间轴"
        title={`${childName} 的创作变化`}
        description="记录每个阶段主题与表达方式的演变"
      >
        {error && <p role="alert">{error}<button onClick={reload}>重试</button></p>}
        <div className="mt-4 flex gap-2">
          {RANGES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className={cn(
                'rounded-full px-4 py-1.5 text-sm font-bold transition',
                range === r
                  ? 'bg-luma-teal-500 text-white'
                  : 'bg-luma-ivory-100 text-luma-muted hover:bg-luma-teal-50',
              )}
            >
              {r}
            </button>
          ))}
        </div>

        <div className="mt-7">
          {months === null ? (
            <p className="py-6 text-center text-sm text-luma-muted">加载中…</p>
          ) : months.length === 0 ? (
            <p className="py-6 text-center text-sm text-luma-muted">
              该时间段内暂无创作记录
            </p>
          ) : (
            months.map((m, i) => (
              <div key={m.month} className="relative flex gap-5">
                <div className="flex flex-col items-center">
                  <div
                    className={cn(
                      'mt-1 size-3 shrink-0 rounded-full border-2',
                      i === months.length - 1
                        ? 'border-luma-teal-500 bg-luma-teal-500'
                        : 'border-luma-teal-300 bg-white',
                    )}
                  />
                  {i < months.length - 1 && (
                    <div className="mt-1 w-px flex-1 bg-luma-teal-100" style={{ minHeight: '3.5rem' }} />
                  )}
                </div>

                <div className={cn('pb-7', i === months.length - 1 && 'pb-0')}>
                  <div className="flex items-center gap-3">
                    <span className="font-brand text-base font-bold text-luma-teal-900">
                      {m.month}
                    </span>
                    <span className="text-xs text-luma-muted">{m.count} 件作品</span>
                  </div>

                  <div className="mt-2 flex flex-wrap gap-2">
                    {m.themes.map((t) => (
                      <span
                        key={t}
                        className="rounded-full bg-luma-ivory-100 px-3 py-0.5 text-xs font-semibold text-luma-teal-700"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="mt-4 rounded-xl bg-luma-ivory-100 px-4 py-2.5 text-xs text-luma-muted">
          时间轴只记录创作中可见的变化趋势，不作心理诊断。
        </div>
      </Card>
    </motion.section>
  )
}
