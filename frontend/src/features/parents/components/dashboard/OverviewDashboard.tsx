import { lt, t, useLocale } from '@/i18n'
import { motion } from 'framer-motion'
import type { ReactNode } from 'react'

import { fadeUp } from '@/design-system'
import { cn } from '@/lib/cn'
import { AuthedArtwork } from './AuthedArtwork'
import { LeafSprig } from './decor'
import { ChevronRightIcon, HeartIcon, RecordsIcon, SproutIcon, TimelineIcon } from './icons'
import type { OverviewModel } from './overviewModel'

/** 概览顶部指标卡的数据（由页面按真实创作计算，游客使用演示值） */
export interface OverviewStats {
  weeklyCount: number
  weeklyDelta: number
  recentCount: number
  emotionText: string
  emotionHint: string
  highlight: string
  highlightHint: string
  reportReady: boolean
}

interface Props {
  model: OverviewModel
  childName: string
  /** 取受保护画作图片用；游客演示无 token，走矢量占位画 */
  token?: string
  readingOpen?: boolean
  onToggleReading?: () => void
  onMoreFindings?: () => void
  onSuggestion?: (id: string) => void
  stats?: OverviewStats
}

const TAG_STYLES = [
  'bg-luma-grass-50 text-luma-grass-700',
  'bg-[#eaf2f6] text-[#5b7f91]',
  'bg-luma-clay-100 text-luma-clay-700',
  'bg-[#fdf3dd] text-luma-gold-700',
]

const METRIC_TONES = {
  blue: 'bg-[#e8f1f8] text-[#5b86a8]',
  green: 'bg-luma-grass-100 text-luma-grass-600',
  rose: 'bg-[#fbe9e6] text-[#c4746a]',
} as const

function MetricCard({
  icon,
  tone,
  value,
  label,
}: {
  icon: ReactNode
  tone: keyof typeof METRIC_TONES
  value: string
  label: string
}) {
  useLocale()
  return (
    <div className="luma-metric-card flex min-w-0 items-center gap-2.5 rounded-[1.35rem] border border-white/90 bg-white/92 px-3 py-3.5 shadow-luma-sm">
      <span className={cn('luma-metric-icon grid size-10 shrink-0 place-items-center rounded-full', METRIC_TONES[tone])}>
        {icon}
      </span>
      <span className="luma-metric-copy min-w-0 leading-tight">
        <span className="block truncate text-[0.66rem] font-semibold text-[#989e91]">{t(label)}</span>
        <span className="mt-1 block truncate font-display text-[1.05rem] font-bold text-[#27453f]">
          {lt(value)}
        </span>
      </span>
    </div>
  )
}

/** 首屏摘要入口：保持项目视觉，只参考设计稿的信息层级与横向结构。 */
function GrowthSummaryCard({ onViewDetails }: { onViewDetails?: () => void }) {
  useLocale()
  return (
    <section className="luma-growth-summary relative overflow-hidden rounded-[1.85rem] border border-white/80 bg-gradient-to-br from-[#eef7ed] via-[#f8fbf2] to-[#e7f1ee] px-5 py-6 shadow-luma-card">
      <div aria-hidden="true" className="pointer-events-none absolute -top-12 -right-6 size-40 rounded-full bg-white/60 blur-2xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-12 left-1/3 size-32 rounded-full bg-[#d8ecdf]/55 blur-2xl" />
      <div className="luma-growth-summary-row relative flex items-start justify-between gap-4">
        <h2 data-onboarding="parent-recent" className="luma-growth-summary-title font-display text-[1.65rem] font-bold leading-tight tracking-[-0.025em] text-[#204b49]">
          {t('本周成长摘要')}
        </h2>
        <button
          type="button"
          onClick={onViewDetails}
          className="luma-growth-summary-action inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full bg-white/90 px-4 text-sm font-bold text-luma-grass-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-white focus-visible:ring-3 focus-visible:ring-luma-grass-300/60"
        >
          {t('查看详情')}
          <ChevronRightIcon className="size-4" />
        </button>
      </div>
      <div aria-hidden="true" className="relative mt-4 flex items-center justify-end gap-1.5 pr-3 text-[#8bad91]">
        <span className="font-hand text-lg font-semibold tracking-[0.08em]">{t('小小创作')}</span>
        <span className="h-px w-12 rotate-[-10deg] bg-current/60" />
        <LeafSprig className="h-7 w-7 opacity-80" tone="green" />
      </div>
    </section>
  )
}

/** 最近一幅作品：左图右文，右上角日期与箭头可进入完整解读 */
function ArtworkCard({
  model,
  token,
  readingOpen,
  onToggleReading,
}: Pick<Props, 'model' | 'token' | 'readingOpen' | 'onToggleReading'>) {
  useLocale()
  const art = model.artwork
  return (
    <section className="luma-artwork-card rounded-[1.9rem] border border-white/70 bg-white/95 p-4 shadow-luma-card">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-display text-base font-bold tracking-tight text-[#2c3a33]">{t('最近一幅作品')}</h3>
        {onToggleReading && (
          <button
            type="button"
            onClick={onToggleReading}
            className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[0.7rem] font-semibold text-[#9a8f7a] transition hover:bg-[#f6f1e6] hover:text-[#6d7b5f]"
          >
            {lt(art.dateLabel ?? '')}
            <ChevronRightIcon className={cn('size-3.5 transition-transform', readingOpen && 'rotate-90')} />
          </button>
        )}
      </div>

      <div className="luma-artwork-body mt-3 flex gap-3">
        <div className="luma-artwork-preview relative aspect-[4/3] w-[42%] shrink-0 overflow-hidden rounded-[1.25rem] border border-[#efe8d9] bg-[#fffdf6] shadow-[0_5px_14px_rgba(71,101,58,0.06)]">
          <AuthedArtwork path={art.imagePath} token={token} kind={art.kind} />
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <h4 className="font-display text-[1.02rem] font-bold leading-snug text-[#2c3a33]">
            《{lt(art.title)}》
          </h4>

          {art.quote && (
            <p className="mt-2 text-[0.72rem] leading-relaxed text-[#6b6f5f]">
              {lt(art.quote)}
              <span className="mt-1 block text-[0.6rem] text-[#a39a86]">{t('—— AI 画面描述')}</span>
            </p>
          )}

          {art.tags.length > 0 && (
            <div className="mt-auto flex flex-wrap gap-1.5 pt-2.5">
              {art.tags.slice(0, 2).map((tag, i) => (
                <span
                  key={tag}
                  className={cn('rounded-full px-2.5 py-0.5 text-[0.66rem] font-bold', TAG_STYLES[i % TAG_STYLES.length])}
                >
                  {lt(tag)}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

/** 本周陪伴建议：序号 + 标题 + 说明，右上角箭头查看更多 */
function SuggestionsCard({ model, onSuggestion }: Pick<Props, 'model' | 'onSuggestion'>) {
  useLocale()
  const suggestions = model.suggestions.slice(0, 2)
  return (
    <section className="luma-suggestions-card rounded-[1.9rem] border border-white/70 bg-white/95 p-5 shadow-luma-card">
      <div className="flex items-center gap-2">
        <span className="grid size-7 place-items-center rounded-full bg-luma-grass-100 text-luma-grass-600">
          <SproutIcon className="size-4" />
        </span>
        <h3 className="font-display text-base font-bold tracking-tight text-[#2c3a33]">{t('本周陪伴建议')}</h3>
        <button
          type="button"
          onClick={() => onSuggestion?.(suggestions[0]?.id ?? '')}
          aria-label={t('查看更多建议')}
          className="ml-auto grid size-8 place-items-center rounded-full bg-[#f6f1e6] text-[#9a8f7a] transition hover:bg-luma-grass-50 hover:text-luma-grass-600"
        >
          <ChevronRightIcon className="size-4" />
        </button>
      </div>

      <ol className="luma-suggestions-list mt-4 space-y-3">
        {suggestions.map((s, i) => (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => onSuggestion?.(s.id)}
              className="flex w-full gap-3 rounded-2xl bg-[#faf7ef] px-3.5 py-3 text-left transition hover:bg-luma-grass-50/70"
            >
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-luma-grass-100 text-[0.7rem] font-bold text-luma-grass-700">
                {i + 1}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-bold text-[#334038]">{lt(s.title)}</span>
                <span className="mt-1 block text-[0.72rem] leading-relaxed text-[#7d8373]">{lt(s.desc)}</span>
              </span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  )
}

export function OverviewDashboard({
  model,
  childName,
  token,
  readingOpen,
  onToggleReading,
  onMoreFindings,
  onSuggestion,
  stats,
}: Props) {
  useLocale()

  return (
    <motion.div className="luma-overview-layout flex flex-col gap-4" initial="hidden" animate="visible">
      <motion.div variants={fadeUp}>
        <GrowthSummaryCard onViewDetails={onMoreFindings} />
      </motion.div>

      <motion.section variants={fadeUp}>
        <div className="luma-overview-grid grid grid-cols-3 gap-2.5">
          <MetricCard
            icon={<RecordsIcon className="size-4" />}
            tone="green"
            value={t(`${stats?.weeklyCount ?? 0} 幅`)}
            label="本周创作"
          />
          <MetricCard
            icon={<HeartIcon className="size-4" />}
            tone="rose"
            value={stats?.reportReady ? '可查看' : '待生成'}
            label="画面观察"
          />
          <MetricCard
            icon={<TimelineIcon className="size-4" />}
            tone="blue"
            value={stats?.reportReady ? '已生成' : '待生成'}
            label="本月报告"
          />
        </div>
      </motion.section>

      <motion.div variants={fadeUp} className="hidden lg:block">
        <ArtworkCard
          model={model}
          token={token}
          readingOpen={readingOpen}
          onToggleReading={onToggleReading}
        />
      </motion.div>

      <motion.div variants={fadeUp} className="hidden lg:block">
        <SuggestionsCard model={model} onSuggestion={onSuggestion} />
      </motion.div>

      <span className="sr-only">{childName} · {t('成长概览')}</span>
    </motion.div>
  )
}
