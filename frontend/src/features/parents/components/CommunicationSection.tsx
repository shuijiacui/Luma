import { motion } from 'framer-motion'
import { useState } from 'react'

import { Card } from '@/components/ui'
import { fadeUp } from '@/design-system'
import { cn } from '@/lib/cn'

const observations = [
  {
    id: 'o1',
    tag: '独处场景',
    detail: '最近三次作品中，孩子经常创造独处场景——主角一个人探索、一个人等待。',
    suggestions: [
      {
        intent: '顺着孩子的表达问',
        prompt: '"你的故事里的角色喜欢一个人待着吗？"',
      },
      {
        intent: '保持开放，不预设',
        prompt: '"这个角色一个人的时候，在想什么？"',
      },
    ],
    tone: 'teal' as const,
  },
  {
    id: 'o2',
    tag: '未完成的结局',
    detail: '近期故事里，孩子频繁让故事停在悬念处，没有明确的结尾。',
    suggestions: [
      {
        intent: '让孩子掌控叙事',
        prompt: '"如果接下来发生的事由你来定，会是什么？"',
      },
      {
        intent: '不急着给答案',
        prompt: '"你喜欢让故事停在这里吗？"',
      },
    ],
    tone: 'gold' as const,
  },
  {
    id: 'o3',
    tag: '重复出现的物件',
    detail: '小船、灯笼、钥匙这几个意象在不同作品中反复出现。',
    suggestions: [
      {
        intent: '好奇地跟进',
        prompt: '"这把钥匙能打开什么？"',
      },
      {
        intent: '让孩子来解释',
        prompt: '"这个东西对故事里的角色来说重要吗？"',
      },
    ],
    tone: 'violet' as const,
  },
]

export function CommunicationSection({ childName }: { childName: string }) {
  const [openId, setOpenId] = useState<string>(observations[0].id)

  return (
    <motion.section variants={fadeUp} id="communication" className="mt-5">
      <Card
        eyebrow="AI 沟通助手"
        title={`和 ${childName} 聊什么？`}
        description="从创作观察出发，给你一个和孩子开口的理由"
      >
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
                  <span
                    className={cn(
                      'shrink-0 text-luma-muted transition-transform',
                      isOpen && 'rotate-180',
                    )}
                  >
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
                        <div
                          key={s.prompt}
                          className="rounded-xl bg-luma-ivory-50 p-4"
                        >
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
      </Card>
    </motion.section>
  )
}
