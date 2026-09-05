import { motion } from 'framer-motion'
import type { ReactNode } from 'react'

import { Button } from '@/components/ui'
import { fadeUp } from '@/design-system'
import { cn } from '@/lib/cn'
import { ChildArtwork } from './artworks'
import { OtterDeco, Squiggle } from './decor'
import { ChevronRightIcon, HeartIcon } from './icons'
import type { OverviewModel, OverviewStatus, ThemeTile } from './overviewModel'

const TONE_BAR: Record<OverviewStatus['tone'], string> = {
  grass: 'bg-luma-grass-400',
  clay: 'bg-luma-clay-300',
  gold: 'bg-luma-gold-300',
  teal: 'bg-luma-teal-300',
}

const TAG_STYLES = [
  'bg-luma-grass-50 text-luma-grass-700',
  'bg-luma-clay-100 text-luma-clay-700',
  'bg-[#fdf3dd] text-luma-gold-700',
  'bg-[#eaf2f6] text-[#5b7f91]',
]

interface Props {
  model: OverviewModel
  childName: string
  readingOpen?: boolean
  onToggleReading?: () => void
  onMoreFindings?: () => void
  onSuggestion?: (id: string) => void
}

function CardHeader({
  title,
  caption,
  action,
}: {
  title: ReactNode
  caption?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2.5">
      <div className="flex items-center gap-2.5">
        <h3 className="font-display text-lg font-bold tracking-tight text-[#2c3a33]">{title}</h3>
      </div>
      <div className="flex items-center gap-2">
        {action}
        {caption && (
          <span className="rounded-full bg-[#f6f1e6] px-3 py-1 text-[0.72rem] font-semibold text-[#9a8f7a]">
            {caption}
          </span>
        )}
      </div>
    </div>
  )
}

function ArtworkImage({ kind, imageUrl }: { kind?: ThemeTile['kind']; imageUrl?: string }) {
  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt="孩子的画作"
        className="absolute inset-0 h-full w-full object-cover"
      />
    )
  }
  if (kind) {
    return <ChildArtwork kind={kind} className="absolute inset-0 h-full w-full" />
  }
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-[#faf6ea] text-xs text-[#b7ab92]">
      等待一幅新画
    </div>
  )
}

/** 模块 1 · 最近一幅作品（顶部大卡片） */
function ArtworkModule({
  model,
  readingOpen,
  onToggleReading,
}: Pick<Props, 'model' | 'readingOpen' | 'onToggleReading'>) {
  const art = model.artwork
  return (
    <section
      id="latest-artwork"
      className="overflow-hidden rounded-[1.9rem] border border-white/70 bg-white/95 p-5 shadow-luma-card backdrop-blur-sm sm:p-6"
    >
      <div className="grid gap-6 md:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
        <div className="relative">
          <div className="relative aspect-[5/4] overflow-hidden rounded-[1.5rem] border border-[#efe8d9] bg-[#fffdf6] shadow-[0_6px_18px_rgba(71,101,58,0.06)]">
            <ArtworkImage kind={art.kind} imageUrl={art.imageUrl} />
            <span className="absolute top-3 right-3 rounded-full border border-white/70 bg-white/80 px-3 py-1 text-xs font-bold text-[#6d7b5f] shadow-sm backdrop-blur-sm">
              {art.dateLabel ?? ''}
            </span>
          </div>
        </div>

        <div className="flex min-w-0 flex-col">
          <div className="luma-eyebrow text-[0.68rem] tracking-[0.2em] text-[#9b8a5f]">最近一幅作品</div>
          <h2 className="mt-2 font-display text-[1.55rem] font-bold leading-snug text-[#2c3a33] sm:text-[1.8rem]">
            《{art.title}》
          </h2>

          {art.quote && (
            <p className="mt-3 border-l-[3px] border-luma-grass-300 pl-3 text-[0.95rem] leading-relaxed text-[#6b6f5f]">
              {art.quote}
              <span className="ml-2 text-xs whitespace-nowrap text-[#a39a86]">—— 孩子原话</span>
            </p>
          )}

          {art.tags.length > 0 && (
            <div className="mt-3.5 flex flex-wrap gap-2">
              {art.tags.slice(0, 5).map((tag, i) => (
                <span
                  key={tag}
                  className={cn(
                    'rounded-full px-3.5 py-1 text-xs font-bold',
                    TAG_STYLES[i % TAG_STYLES.length],
                  )}
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          <div className="mt-4 min-h-0 flex-1">
            <div className="flex items-center gap-2 text-xs font-bold tracking-wide text-[#8a9a7c]">
              <span className="inline-block size-1.5 rounded-full bg-luma-grass-400" />
              画面观察
            </div>
            <p className="mt-2 text-sm leading-[1.85] text-[#66705f]">{art.observation}</p>
          </div>

          {onToggleReading && (
            <div className="mt-5">
              <Button
                variant="secondary"
                className="border-luma-grass-200 bg-white text-luma-grass-700 shadow-none hover:border-luma-grass-300 hover:bg-luma-grass-50"
                onClick={onToggleReading}
                trailingIcon={
                  <ChevronRightIcon className={cn('size-4 transition-transform', readingOpen && 'rotate-90')} />
                }
              >
                {readingOpen ? '收起完整解读' : '查看完整解读'}
              </Button>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

/** 模块 2 · 近期状态 */
function StatusModule({ statuses, hint, caption }: { statuses: OverviewStatus[]; hint: string; caption: string }) {
  return (
    <section className="flex h-full flex-col rounded-[1.9rem] border border-white/70 bg-white/95 p-5 shadow-luma-card backdrop-blur-sm sm:p-6">
      <CardHeader title="近期状态" caption={caption} />
      <div className="mt-5 space-y-5">
        {statuses.map((s) => (
          <div key={s.id}>
            <div className="flex items-center gap-2.5">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#f6f2e7] text-base">
                {s.emoji}
              </span>
              <span className="flex-1 text-sm font-bold text-[#3a463c]">{s.label}</span>
              <span className="rounded-full bg-luma-grass-50 px-2.5 py-0.5 text-xs font-bold text-luma-grass-700">
                {s.statusText}
              </span>
            </div>
            <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-[#f1eee4]">
              <motion.div
                className={cn('h-full rounded-full', TONE_BAR[s.tone])}
                initial={{ width: 0 }}
                animate={{ width: `${s.value}%` }}
                transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-5 rounded-2xl bg-[#faf6ea] px-4 py-3 text-xs leading-relaxed text-[#8a816b]">
        {hint}
      </div>
    </section>
  )
}

/** 模块 3 · 创作主题 */
function ThemesModule({ themes, caption }: { themes: ThemeTile[]; caption: string }) {
  return (
    <section className="flex h-full flex-col rounded-[1.9rem] border border-white/70 bg-white/95 p-5 shadow-luma-card backdrop-blur-sm sm:p-6">
      <CardHeader title="创作主题" caption={caption} />
      <div className="mt-5 grid grid-cols-2 gap-3.5 sm:grid-cols-4">
        {themes.map((theme, i) => (
          <motion.div
            key={theme.id}
            className="group cursor-default"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 * i, duration: 0.4 }}
          >
            <div className="relative aspect-square overflow-hidden rounded-[1.25rem] border border-[#efe8d9] bg-[#fffdf6] shadow-[0_5px_14px_rgba(71,101,58,0.05)] transition-transform duration-300 group-hover:-translate-y-1">
              <ArtworkImage kind={theme.kind} imageUrl={theme.imageUrl} />
            </div>
            <div className="mt-2.5 text-center">
              <div className="text-sm font-bold text-[#3a463c]">{theme.title}</div>
              <div className="mt-0.5 text-[0.72rem] text-[#9a9280]">出现 {theme.count} 次</div>
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  )
}

/** 模块 4 · 成长小发现 */
function FindingsModule({
  model,
  onMoreFindings,
}: Pick<Props, 'model' | 'onMoreFindings'>) {
  return (
    <section className="relative flex h-full flex-col overflow-hidden rounded-[1.9rem] border border-white/70 bg-white/95 p-5 shadow-luma-card backdrop-blur-sm sm:p-6">
      <CardHeader
        title="成长小发现"
        action={
          onMoreFindings ? (
            <button
              type="button"
              onClick={onMoreFindings}
              className="flex items-center gap-1 rounded-full bg-luma-grass-50 px-3.5 py-1.5 text-xs font-bold text-luma-grass-700 transition hover:bg-luma-grass-100"
            >
              更多发现
              <ChevronRightIcon className="size-3.5" />
            </button>
          ) : undefined
        }
      />
      <div className="mt-4 space-y-3.5">
        {model.findings.map((f) => (
          <div key={f.id} className="flex gap-3 rounded-2xl bg-[#faf7ef] px-4 py-3.5">
            <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-white text-base shadow-[0_2px_8px_rgba(71,101,58,0.08)]">
              {f.emoji}
            </span>
            <div className="min-w-0">
              <div className="text-sm font-bold text-[#334038]">{f.title}</div>
              <div className="mt-1 text-xs leading-relaxed text-[#7d8373]">{f.desc}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-auto flex items-end justify-between gap-2 pt-5">
        <p className="font-hand text-lg leading-snug text-[#8a9a7c] sm:text-xl">
          理解，是最长久的陪伴。
          <Squiggle className="mt-1 text-luma-grass-300" />
        </p>
        <OtterDeco className="h-16 w-auto opacity-90 sm:h-20" alt="陪伴的水獭 Nilo" />
      </div>
    </section>
  )
}

/** 模块 5 · 陪伴建议（底部通栏） */
function SuggestionsModule({ model, onSuggestion }: Pick<Props, 'model' | 'onSuggestion'>) {
  const suggestions = model.suggestions
  return (
    <section className="rounded-[1.9rem] border border-white/70 bg-white/95 p-5 shadow-luma-card backdrop-blur-sm sm:p-6">
      <div className="flex items-center gap-2">
        <span className="grid size-8 place-items-center rounded-full bg-[#fcefdc] text-luma-clay-500">
          <HeartIcon className="size-4" />
        </span>
        <h3 className="font-display text-lg font-bold tracking-tight text-[#2c3a33]">陪伴建议</h3>
      </div>
      <div className="mt-5 grid gap-3.5 md:grid-cols-3">
        {suggestions.map((s, i) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onSuggestion?.(s.id)}
            className="group rounded-[1.4rem] border border-[#f0e8d8] bg-[#fdfcf8] p-4 text-left transition hover:-translate-y-1 hover:border-luma-grass-200 hover:bg-luma-grass-50/60 hover:shadow-luma-sm"
          >
            <div className="flex items-center gap-2.5">
              <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-white text-lg shadow-[0_2px_10px_rgba(71,101,58,0.08)]">
                {s.emoji}
              </span>
              <span className="font-hand text-base font-semibold text-[#48663a]">
                0{i + 1} · {s.title}
              </span>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-[#7d8373]">{s.desc}</p>
            <span className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-luma-grass-600 opacity-0 transition group-hover:opacity-100">
              去和 ta 聊聊 <ChevronRightIcon className="size-3.5" />
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}

export function OverviewDashboard({
  model,
  childName,
  readingOpen,
  onToggleReading,
  onMoreFindings,
  onSuggestion,
}: Props) {
  return (
    <motion.div
      className="grid gap-4 xl:grid-cols-[minmax(0,1.22fr)_minmax(0,0.78fr)] xl:gap-5"
      initial="hidden"
      animate="visible"
    >
      <motion.div variants={fadeUp} className="xl:col-start-1 xl:row-start-1">
        <ArtworkModule model={model} readingOpen={readingOpen} onToggleReading={onToggleReading} />
      </motion.div>
      <motion.div variants={fadeUp} className="xl:col-start-2 xl:row-start-1">
        <StatusModule
          statuses={model.statuses}
          hint={model.hint}
          caption={model.periodLabel}
        />
      </motion.div>
      <motion.div variants={fadeUp} className="xl:col-start-1 xl:row-start-2">
        <ThemesModule themes={model.themes} caption={model.periodLabel} />
      </motion.div>
      <motion.div variants={fadeUp} className="xl:col-start-2 xl:row-start-2">
        <FindingsModule model={model} onMoreFindings={onMoreFindings} />
      </motion.div>
      <motion.div variants={fadeUp} className="xl:col-span-2">
        <SuggestionsModule model={model} onSuggestion={onSuggestion} />
      </motion.div>
      <span className="sr-only">为 {childName} 生成的成长概览</span>
    </motion.div>
  )
}



