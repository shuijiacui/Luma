import { AnimatePresence, motion } from 'framer-motion'
import { useEffect } from 'react'

import { Button } from '@/components/ui'
import { cn } from '@/lib/cn'

interface PricingModalProps {
  open: boolean
  onClose: () => void
}

const plans = [
  {
    id: 'free',
    name: 'Free',
    label: '体验版',
    price: null,
    priceMonthly: '¥0',
    priceYearly: null,
    recommended: false,
    childFeatures: ['无限绘画', '基础 Nilo 互动'],
    childLimits: ['不保存长期记录', '不生成成长报告', '不提供趋势分析'],
    parentNote: '家长仅可查看：今天孩子完成了一幅作品。',
    cta: '免费开始',
    ctaVariant: 'secondary' as const,
  },
  {
    id: 'family',
    name: 'Family',
    label: '核心版',
    badge: '最受欢迎',
    price: null,
    priceMonthly: '¥39/月',
    priceYearly: '¥399/年',
    recommended: true,
    childFeatures: ['无限绘画', '完整 AI 互动'],
    parentFeatures: ['每周成长摘要', '成长时间线', '沟通建议'],
    cta: '选择 Family',
    ctaVariant: 'primary' as const,
  },
  {
    id: 'premium',
    name: 'Premium',
    label: '深度版',
    price: null,
    priceMonthly: '¥99/月',
    priceYearly: '¥999/年',
    recommended: false,
    childFeatures: ['无限绘画', '完整 AI 互动'],
    parentFeatures: [
      '月度成长报告',
      '创作主题 · 兴趣 · 表达方式变化',
      '家庭互动建议',
      '多孩子支持',
      '更高 AI 额度（图像分析 · 长期记忆 · 多轮推理）',
    ],
    cta: '选择 Premium',
    ctaVariant: 'secondary' as const,
  },
] as const

export function PricingModal({ open, onClose }: PricingModalProps) {
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="backdrop"
            className="fixed inset-0 z-40 flex items-center justify-center bg-luma-teal-900/30 p-4 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          >
            <motion.div
              key="modal"
              className="relative z-50 w-full max-w-5xl overflow-y-auto rounded-3xl bg-luma-ivory-50 shadow-luma-md"
              style={{ maxHeight: '90vh' }}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              onClick={(e) => e.stopPropagation()}
            >
            <div className="px-6 pt-8 pb-6 sm:px-10 sm:pt-10">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="luma-eyebrow text-luma-gold-700">订阅计划</div>
                  <h2 className="luma-heading-2 mt-2 text-luma-teal-900">
                    选择适合你家庭的方式
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="mt-1 flex size-9 shrink-0 items-center justify-center rounded-full bg-luma-ivory-100 text-luma-muted transition hover:bg-luma-ivory-200"
                  aria-label="关闭"
                >
                  ✕
                </button>
              </div>

              <div className="mt-8 grid gap-4 lg:grid-cols-3">
                {plans.map((plan) => (
                  <div
                    key={plan.id}
                    className={cn(
                      'relative flex flex-col rounded-2xl border p-6 transition',
                      plan.recommended
                        ? 'border-luma-teal-300 bg-white shadow-luma-md'
                        : 'border-luma-ivory-200 bg-luma-ivory-50',
                    )}
                  >
                    {plan.recommended && (
                      <span className="absolute -top-3 left-5 rounded-full bg-luma-teal-500 px-3 py-0.5 text-xs font-bold text-white">
                        {'badge' in plan ? plan.badge : '最受欢迎'}
                      </span>
                    )}

                    <div>
                      <div className="flex items-baseline gap-2">
                        <span className="font-brand text-xl font-bold text-luma-teal-900">
                          {plan.name}
                        </span>
                        <span className="text-sm text-luma-muted">{plan.label}</span>
                      </div>

                      <div className="mt-3">
                        <div className="font-brand text-3xl font-bold text-luma-teal-900">
                          {plan.priceMonthly}
                        </div>
                        {'priceYearly' in plan && plan.priceYearly && (
                          <div className="mt-0.5 text-xs text-luma-muted">
                            或 {plan.priceYearly}（节省约 15%）
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="mt-5 flex-1 space-y-4">
                      <div>
                        <div className="luma-eyebrow mb-2 text-luma-teal-600">
                          儿童端
                        </div>
                        <ul className="space-y-1.5">
                          {plan.childFeatures.map((f) => (
                            <li
                              key={f}
                              className="flex items-start gap-2 text-sm text-luma-teal-900"
                            >
                              <span className="mt-0.5 text-luma-teal-500">✔</span>
                              {f}
                            </li>
                          ))}
                          {'childLimits' in plan &&
                            plan.childLimits.map((l) => (
                              <li
                                key={l}
                                className="flex items-start gap-2 text-sm text-luma-muted"
                              >
                                <span className="mt-0.5">✕</span>
                                {l}
                              </li>
                            ))}
                        </ul>
                      </div>

                      {'parentFeatures' in plan && plan.parentFeatures && (
                        <div>
                          <div className="luma-eyebrow mb-2 text-luma-gold-700">
                            家长端
                          </div>
                          <ul className="space-y-1.5">
                            {plan.parentFeatures.map((f) => (
                              <li
                                key={f}
                                className="flex items-start gap-2 text-sm text-luma-teal-900"
                              >
                                <span className="mt-0.5 text-luma-teal-500">✔</span>
                                {f}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {'parentNote' in plan && plan.parentNote && (
                        <div className="rounded-xl bg-luma-ivory-100 px-3 py-2 text-xs text-luma-muted">
                          {plan.parentNote}
                        </div>
                      )}
                    </div>

                    <div className="mt-6">
                      <Button
                        variant={plan.ctaVariant}
                        className="w-full justify-center"
                      >
                        {plan.cta}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              <p className="mt-6 text-center text-xs text-luma-muted">
                所有方案均可随时取消 · 年付可享额外折扣
              </p>
            </div>
          </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
