import { lt, t, useLocale } from '@/i18n'
import { motion } from 'framer-motion'
import type { ReactNode } from 'react'

import { fadeUp } from '@/design-system'
import { cn } from '@/lib/cn'
import { AuthedArtwork } from './AuthedArtwork'
import { LeafSprig, OtterDeco } from './decor'
import { ChevronRightIcon, HeartIcon, RecordsIcon, SproutIcon } from './icons'
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
  helper,
  trend,
}: {
  icon: ReactNode
  tone: keyof typeof METRIC_TONES
  value: string
  label: string
  helper?: string
  trend?: 'up' | 'down' | 'flat'
}) {
  useLocale()
  return (
    <div className="flex flex-col items-center rounded-[1.25rem] border border-white/80 bg-white/95 px-2 py-3 text-center shadow-luma-sm">
      <span className={cn('grid size-8 place-items-center rounded-full', METRIC_TONES[tone])}>
        {icon}
      </span>
      <span className="mt-2 font-display text-base font-bold leading-none text-[#2c3a33]">
        {lt(value)}
      </span>
      <span className="mt-1 text-[0.66rem] font-semibold text-[#8a9280]">{t(label)}</span>
      {helper && (
        <span className="mt-1 flex items-center gap-0.5 text-[0.6rem] leading-snug text-[#a49c87]">
          {trend === 'up' && <span aria-hidden="true" className="text-[#7fa462]">↑</span>}
          {trend === 'down' && <span aria-hidden="true" className="text-[#c4746a]">↓</span>}
          {lt(helper)}
        </span>
      )}
    </div>
  )
}

/** 顶部 Banner：柔和室内场景 + 小水獭 + 手写装饰 */
function BannerCard() {
  useLocale()
  return (
    <section className="relative overflow-hidden rounded-[1.9rem] border border-white/70 bg-gradient-to-br from-[#e9f3e4] via-[#fdf9ef] to-[#e6eff3] p-5 shadow-luma-card">
      <div aria-hidden="true" className="pointer-events-none absolute -top-8 -right-8 size-36 rounded-full bg-[#dcead0]/70 blur-2xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-10 left-6 size-32 rounded-full bg-[#dcebf1]/70 blur-2xl" />
      <span className="font-hand pointer-events-none absolute top-4 right-4 text-[0.8rem] leading-none text-[#9db08a] [text-shadow:0_1px_0_rgba(255,255,255,0.9)]">
        {t('小小的创作 大大的世界♡')}
      </span>

      <div className="relative flex items-end justify-between gap-2 pt-5">
        <div className="max-w-[62%]">
          <h2 className="font-display text-[1.45rem] font-bold leading-snug tracking-tight text-[#2c3a33]">
            {t('看见创作，也看见成长。')}
          </h2>
          <p className="mt-2 text-xs leading-relaxed text-[#7d8777]">
            {t('每一幅画，都是孩子看向世界的方式。')}
          </p>
        </div>
        <div className="relative shrink-0 pr-1">
          <OtterDeco className="h-24 w-auto opacity-95" alt={t('陪伴的水獭 Nilo')} />
          <span aria-hidden="true" className="absolute -bottom-1 left-1/2 h-2 w-20 -translate-x-1/2 rounded-full bg-[#d9c9a8]/60 blur-[2px]" />
          <LeafSprig className="absolute -left-4 bottom-1 h-9 w-9 opacity-70" tone="green" />
        </div>
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
    <section className="rounded-[1.9rem] border border-white/70 bg-white/95 p-4 shadow-luma-card">
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

      <div className="mt-3 flex gap-3">
        <div className="relative aspect-[4/3] w-[42%] shrink-0 overflow-hidden rounded-[1.25rem] border border-[#efe8d9] bg-[#fffdf6] shadow-[0_5px_14px_rgba(71,101,58,0.06)]">
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
    <section className="rounded-[1.9rem] border border-white/70 bg-white/95 p-5 shadow-luma-card">
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

      <ol className="mt-4 space-y-3">
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
  const weeklyDelta = stats?.weeklyDelta ?? 0
  const deltaText =
    weeklyDelta > 0
      ? `${t('比上周多')} ${weeklyDelta} ${t('幅')}`
      : weeklyDelta < 0
        ? `${t('比上周少')} ${Math.abs(weeklyDelta)} ${t('幅')}`
        : t('与上周持平')

  return (
    <motion.div className="flex flex-col gap-4" initial="hidden" animate="visible">
      <motion.div variants={fadeUp}>
        <BannerCard />
      </motion.div>

      <motion.section variants={fadeUp}>
        <div className="grid grid-cols-3 gap-2.5">
          <MetricCard
            icon={<RecordsIcon className="size-4" />}
            tone="blue"
            value={`${stats?.weeklyCount ?? 0} ${t('幅')}`}
            label="本周创作"
            helper={deltaText}
            trend={weeklyDelta > 0 ? 'up' : weeklyDelta < 0 ? 'down' : 'flat'}
          />
          <MetricCard
            icon={<SproutIcon className="size-4" />}
            tone="green"
            value={stats?.emotionText ?? '观察中'}
            label="情绪状态"
            helper={stats?.emotionHint ?? '数据还在积累中'}
          />
          <MetricCard
            icon={<HeartIcon className="size-4" />}
            tone="rose"
            value={stats?.highlight ?? '想象力'}
            label="成长亮点"
            helper={stats?.highlightHint ?? '在故事表达中有进步'}
          />
        </div>
        <div className="mt-1.5 flex items-center gap-1.5 px-1 text-[0.62rem] text-[#9a9280]">
          <span>{t('近 4 周作品数')}</span>
          <span aria-hidden="true">·</span>
          <span>{stats?.recentCount ?? 0} {t('件')}</span>
          <button
            type="button"
            onClick={onMoreFindings}
            className="ml-auto inline-flex items-center gap-0.5 font-semibold text-[#8a9a7c] transition hover:text-luma-grass-600"
          >
            {t('更多发现')}
            <ChevronRightIcon className="size-3" />
          </button>
        </div>
      </motion.section>

      <motion.div variants={fadeUp}>
        <ArtworkCard
          model={model}
          token={token}
          readingOpen={readingOpen}
          onToggleReading={onToggleReading}
        />
      </motion.div>

      <motion.div variants={fadeUp}>
        <SuggestionsCard model={model} onSuggestion={onSuggestion} />
      </motion.div>

      <span className="sr-only">{childName} · {t('成长概览')}</span>
    </motion.div>
  )
}
