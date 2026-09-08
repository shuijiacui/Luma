import { t, useLocale } from '@/i18n'

export function SafetyDisclaimer() {
  useLocale()
  return (
    <aside
      aria-label={t('重要免责声明')}
      className="luma-safety-disclaimer border-t border-amber-200 bg-amber-50/95 px-4 py-2 text-center text-[0.68rem] leading-4 text-amber-950 backdrop-blur-sm sm:px-6"
    >
      <p className="shrink-0 font-bold">{t('重要提示')}</p>
      <p className="max-w-4xl">
        {t('本工具仅供健康信息参考与支持，不构成医疗建议，不能取代专业医护人员的诊断或治疗。如有健康疑虑，请咨询注册医生或相关专业人士。AI 生成内容可能不准确。')}
      </p>
      <p className="max-w-3xl">
        {t('本服务不是心理治疗或危机干预替代方案。如你正在经历紧急危险，请立即联系当地紧急救援或组委会提供的热线资源。')}
      </p>
    </aside>
  )
}
