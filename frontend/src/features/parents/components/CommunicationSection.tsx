import { motion } from 'framer-motion'
import { useEffect, useMemo, useState } from 'react'

import { Card } from '@/components/ui'
import { fadeUp } from '@/design-system'
import { listAnalyses, type AnalysisSummary } from '@/lib/api/authApi'
import { cn } from '@/lib/cn'

type Tone = 'teal' | 'gold' | 'violet'
const TONES: Tone[] = ['teal', 'gold', 'violet']

type Observation = {
  id: string
  tag: string
  detail: string
  suggestions: { intent: string; prompt: string }[]
  tone: Tone
}

const DEMO_OBS: Observation[] = [
  {
    id: 'o1',
    tag: '独处场景',
    detail: '最近三次画作中，孩子经常创造独处场景——主角一个人探索、一个人等待。',
    suggestions: [
      { intent: '顺着孩子的表达问', prompt: '"你画里的角色喜欢一个人待着吗？"' },
      { intent: '保持开放，不预设', prompt: '"这个角色一个人的时候，在想什么？"' },
    ],
    tone: 'teal',
  },
  {
    id: 'o2',
    tag: '未完成的结局',
    detail: '近期画作里，孩子频繁让画面停在悬念处，没有明确的结局。',
    suggestions: [
      { intent: '让孩子掌控叙事', prompt: '"如果接下来发生的事由你来定，会是什么？"' },
      { intent: '不急着给答案', prompt: '"你喜欢让画面停在这里吗？"' },
    ],
    tone: 'gold',
  },
  {
    id: 'o3',
    tag: '重复出现的物件',
    detail: '小船、灯笼、钥匙这几个意象在不同作品中反复出现。',
    suggestions: [
      { intent: '好奇地跟进', prompt: '"这把钥匙能打开什么？"' },
      { intent: '让孩子来解释', prompt: '"这个东西对画里的角色来说重要吗？"' },
    ],
    tone: 'violet',
  },
]

function deriveObservations(analyses: AnalysisSummary[]): Observation[] {
  // 收集所有 parentAdvice（去重）
  const allAdvice: string[] = []
  const elementFreq = new Map<string, number>()

  for (const a of analyses) {
    if (a.report?.parentAdvice) {
      for (const advice of a.report.parentAdvice) {
        if (!allAdvice.includes(advice)) allAdvice.push(advice)
      }
    }
    for (const el of a.summary.elements) {
      elementFreq.set(el, (elementFreq.get(el) ?? 0) + 1)
    }
  }

  if (allAdvice.length === 0) return []

  // 取前 3 条建议，每条作为一个观察项
  const topAdvice = allAdvice.slice(0, 3)

  // 取高频元素（出现 ≥2 次）
  const freqEls = Array.from(elementFreq.entries())
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1])
    .map(([el]) => el)
    .slice(0, 3)

  return topAdvice.map((advice, i): Observation => ({
    id: `r${i}`,
    tag: freqEls[i] ? `关于"${freqEls[i]}"` : `洞察 ${i + 1}`,
    detail: advice,
    suggestions: [
      { intent: '从创作出发', prompt: `"你最近画的${freqEls[i] ?? '画'}，最想让我看哪一部分？"` },
      { intent: '把选择留给孩子', prompt: '"关于这幅画，你有什么想告诉我的吗？"' },
    ],
    tone: TONES[i % TONES.length],
  }))
}

interface Props {
  childName: string
  childId?: string
  token?: string
}

export function CommunicationSection({ childName, childId, token }: Props) {
  const [analyses, setAnalyses] = useState<AnalysisSummary[] | null>(null)
  const isReal = !!(childId && token)

  useEffect(() => {
    if (!isReal) return
    let cancelled = false
    listAnalyses(childId!, token!)
      .then((res) => {
        if (!cancelled) setAnalyses(res.analyses)
      })
      .catch(() => {
        if (!cancelled) setAnalyses([])
      })
    // childId 切换时，effect 重新执行前会先跑这里，标记旧请求已过期，
    // 避免旧孩子的数据在新请求之后才返回，覆盖了新孩子的数据
    return () => {
      cancelled = true
    }
  }, [childId, token, isReal])

  const observations = useMemo(() => {
    if (!isReal) return DEMO_OBS
    if (analyses === null) return null
    const derived = deriveObservations(analyses)
    return derived.length > 0 ? derived : null
  }, [isReal, analyses])

  const [openId, setOpenId] = useState<string>('')
  useEffect(() => {
    if (observations && observations.length > 0) setOpenId(observations[0].id)
  }, [observations])

  return (
    <motion.section variants={fadeUp} id="communication" className="mt-5">
      <Card
        eyebrow="AI 沟通助手"
        title={`和 ${childName} 聊什么？`}
        description="从创作观察出发，给你一个和孩子开口的理由"
      >
        {observations === null ? (
          <p className="py-6 text-center text-sm text-luma-muted">
            {analyses === null ? '加载中…' : '孩子完成更多创作并生成报告后，沟通建议会出现在这里。'}
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            {observations.map((obs) => {
              const isOpen = openId === obs.id
              return (
                <div
                  key={obs.id}
                  className={cn(
                    'overflow-hidden rounded-2xl border transition-all',
                    isOpen
                      ? 'border-luma-teal-200 bg-white shadow-luma-sm'
                      : 'border-luma-ivory-200 bg-luma-ivory-50',
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setOpenId(isOpen ? '' : obs.id)}
                    className="flex w-full items-center gap-3 px-5 py-4 text-left"
                  >
                    <span
                      className={cn(
                        'shrink-0 rounded-full px-3 py-0.5 text-xs font-bold',
                        obs.tone === 'teal' && 'bg-luma-teal-50 text-luma-teal-700',
                        obs.tone === 'gold' && 'bg-luma-gold-100 text-luma-gold-700',
                        obs.tone === 'violet' && 'bg-[#eeeffe] text-[#5a62c0]',
                      )}
                    >
                      {obs.tag}
                    </span>
                    <span className="flex-1 text-sm font-semibold text-luma-teal-900 line-clamp-1">
                      {obs.detail}
                    </span>
                    <span className={cn('shrink-0 text-luma-muted transition-transform', isOpen && 'rotate-180')}>
                      ▾
                    </span>
                  </button>

                  {isOpen && (
                    <div className="border-t border-luma-ivory-200 px-5 pb-5 pt-4">
                      <p className="text-sm leading-relaxed text-luma-muted">
                        <span className="font-bold text-luma-teal-900">观察：</span>
                        {obs.detail}
                      </p>
                      <div className="mt-4 space-y-3">
                        {obs.suggestions.map((s) => (
                          <div key={s.prompt} className="rounded-xl bg-luma-ivory-50 p-4">
                            <div className="text-xs font-bold uppercase tracking-wider text-luma-gold-700">
                              {s.intent}
                            </div>
                            <p className="mt-2 font-display text-lg font-semibold leading-relaxed text-luma-teal-900">
                              {s.prompt}
                            </p>
                          </div>
                        ))}
                      </div>
                      <div className="mt-4 text-xs text-luma-muted">
                        这些问题没有标准答案，孩子可以选择不回答。
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </Card>
    </motion.section>
  )
}
