import { motion } from 'framer-motion'
import { useState } from 'react'

import { Card } from '@/components/ui'
import { fadeUp } from '@/design-system'
import { cn } from '@/lib/cn'

const RANGES = ['30天', '90天', '180天'] as const
type Range = (typeof RANGES)[number]

const timelineData: Record<
  Range,
  {
    month: string
    themes: string[]
    count: number
    change: string | null
    aiNote: string | null
  }[]
> = {
  '30天': [
    {
      month: '5月',
      themes: ['冒险', '伙伴', '建造'],
      count: 9,
      change: '主角开始邀请其他角色一起行动',
      aiNote:
        '角色关系从平行存在变为主动协作，孩子在故事中越来越多地描述"一起做某件事"。',
    },
  ],
  '90天': [
    {
      month: '3月',
      themes: ['动物', '家庭', '游戏'],
      count: 8,
      change: null,
      aiNote: null,
    },
    {
      month: '4月',
      themes: ['人物互动', '开放空间', '旅行'],
      count: 11,
      change: '更多人物互动，更多开放空间',
      aiNote:
        '过去一个月，创作中的社交元素增加，场景从封闭空间转向开阔环境。',
    },
    {
      month: '5月',
      themes: ['冒险', '伙伴', '建造'],
      count: 9,
      change: '主角开始邀请其他角色一起行动',
      aiNote:
        '角色关系从平行存在变为主动协作，描述"一起做某件事"的频率增加。',
    },
  ],
  '180天': [
    {
      month: '12月',
      themes: ['节日', '礼物', '家人'],
      count: 6,
      change: null,
      aiNote: null,
    },
    {
      month: '1月',
      themes: ['新开始', '动物', '天气'],
      count: 7,
      change: '场景从室内转向室外',
      aiNote: null,
    },
    {
      month: '2月',
      themes: ['家庭', '游戏', '想象'],
      count: 9,
      change: '更多奇幻元素加入',
      aiNote:
        '创作中开始出现"不可能发生的事"，例如会说话的云朵和会飞的石头。',
    },
    {
      month: '3月',
      themes: ['动物', '家庭', '游戏'],
      count: 8,
      change: '动物角色开始有名字和性格',
      aiNote: null,
    },
    {
      month: '4月',
      themes: ['人物互动', '开放空间', '旅行'],
      count: 11,
      change: '更多人物互动，更多开放空间',
      aiNote:
        '创作中的社交元素增加，场景从封闭空间转向开阔环境。',
    },
    {
      month: '5月',
      themes: ['冒险', '伙伴', '建造'],
      count: 9,
      change: '主角开始邀请其他角色一起行动',
      aiNote:
        '角色关系从平行存在变为主动协作，描述"一起做某件事"的频率增加。',
    },
  ],
}

export function TimelineSection({ childName }: { childName: string }) {
  const [range, setRange] = useState<Range>('90天')
  const months = timelineData[range]

  return (
    <motion.section variants={fadeUp} id="timeline" className="mt-5">
      <Card
        eyebrow="成长时间轴"
        title={`${childName} 的创作变化`}
        description="记录每个阶段主题与表达方式的演变"
      >
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
          {months.map((m, i) => (
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
                  <div
                    className="mt-1 w-px flex-1 bg-luma-teal-100"
                    style={{ minHeight: '3.5rem' }}
                  />
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

                {m.change && (
                  <div className="mt-2 flex items-start gap-2 text-sm text-luma-muted">
                    <span className="mt-0.5 font-bold text-luma-teal-500">↑</span>
                    <span>变化：{m.change}</span>
                  </div>
                )}

                {m.aiNote && (
                  <div className="mt-2 rounded-xl bg-luma-teal-50 px-4 py-2.5 text-sm text-luma-teal-700">
                    AI："{m.aiNote}"
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 rounded-xl bg-luma-ivory-100 px-4 py-2.5 text-xs text-luma-muted">
          时间轴只记录创作中可见的变化趋势，不作心理诊断。
        </div>
      </Card>
    </motion.section>
  )
}
