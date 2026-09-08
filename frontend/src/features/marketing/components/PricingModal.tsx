import { t, useLocale } from '@/i18n'
import { AnimatePresence, motion } from 'framer-motion'
import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui'

interface PricingModalProps { open: boolean; onClose: () => void }

export function PricingModal({ open, onClose }: PricingModalProps) {
  useLocale()
  useEffect(() => {
    if (!open) return
    function onKey(event: KeyboardEvent) { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  return <AnimatePresence>{open && <motion.div className="fixed inset-0 z-40 flex items-center justify-center bg-luma-teal-900/30 p-4 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
    <motion.div role="dialog" aria-modal="true" aria-labelledby="plan-title" className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-luma-ivory-50 p-6 shadow-luma-md sm:p-10" initial={{ scale: .96 }} animate={{ scale: 1 }} onClick={event => event.stopPropagation()}>
      <div className="flex items-start justify-between gap-4"><div><div className="luma-eyebrow text-luma-gold-700">{t("体验与计划")}</div><h2 id="plan-title" className="luma-heading-2 mt-2 text-luma-teal-900">{t("先开始一段创作时光")}</h2></div><Button variant="ghost" aria-label={t("关闭")} onClick={onClose}>✕</Button></div>
      <div className="mt-6 rounded-2xl border border-luma-teal-100 bg-white p-6">
        <h3 className="text-lg font-bold text-luma-teal-900">{t("当前版本 · 开放体验")}</h3>
        <p className="mt-3 text-sm leading-relaxed text-luma-muted">{t("游客可体验 Nilo 与绘画空间。注册家庭后，可保存创作、关联多个孩子、查看解读与周期摘要、导出成长档案。")}</p>
        <p className="mt-3 text-xs leading-relaxed text-luma-muted">{t("AI 识别需服务可用，请求受运行额度与限流约束。游客体验不保存到正式家庭档案。")}</p>
        <Link to="/auth?role=parent&mode=register" onClick={onClose} className="mt-5 inline-flex rounded-2xl bg-luma-teal-600 px-5 py-3 text-sm font-bold text-white">{t("创建家庭，开始体验")}</Link>
      </div>
      <div className="mt-4 rounded-2xl bg-luma-ivory-100 p-6"><h3 className="font-bold text-luma-teal-900">{t("Family / Premium · 后续计划")}</h3><p className="mt-2 text-sm leading-relaxed text-luma-muted">{t("付费订阅暂未开放，套餐价格、服务额度和权益以正式发布为准。当前无需购买套餐使用已开放功能。")}</p></div>
    </motion.div>
  </motion.div>}</AnimatePresence>
}
