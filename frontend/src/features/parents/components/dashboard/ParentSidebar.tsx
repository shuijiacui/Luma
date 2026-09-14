import { lt, t, useLocale } from '@/i18n'
import { Brand } from '@/components/brand'
import { portalUrl } from '@/config/appMode'
import { motion } from 'framer-motion'
import { cn } from '@/lib/cn'
import { HangingBranch, LeafSprig } from './decor'
import { NAV_ENTRIES, type ViewKey } from './parentNav'

interface TabBarProps {
  active: ViewKey
  onSelect: (view: ViewKey) => void
  className?: string
}

/** 网页端独立侧栏。桌面视口使用完整导航结构，不复用手机底栏。 */
export function ParentSidebar({ active, onSelect, className }: TabBarProps) {
  useLocale()
  return (
    <aside
      data-onboarding="parent-navbar"
      className={cn('luma-desktop-sidebar', className)}
    >
      <div className="luma-desktop-sidebar-brand">
        <a
          href={portalUrl}
          aria-label={t('返回 Luma 官网')}
          className="inline-flex rounded-2xl outline-none focus-visible:ring-3 focus-visible:ring-luma-grass-300/60"
        >
          <Brand size="sm" />
        </a>
        <div className="mt-3 flex items-start gap-1.5">
          <LeafSprig className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-80" tone="green" />
          <p className="text-[0.7rem] leading-[1.7] text-[#8a816b]">
            {t('看见每个孩子')}
            <br />
            {t('独一无二的想象力')}
          </p>
        </div>
      </div>

      <nav aria-label={t('家长端导航')} data-onboarding="parent-tabs" className="luma-desktop-sidebar-nav">
        {NAV_ENTRIES.map((entry) => {
          const isActive = entry.key === active
          return (
            <button
              key={entry.key}
              type="button"
              onClick={() => onSelect(entry.key)}
              aria-current={isActive ? 'page' : undefined}
              data-onboarding={
                entry.key === 'communication'
                  ? 'parent-tab-communication'
                  : entry.key === 'records'
                    ? 'parent-archive'
                    : undefined
              }
              className={cn('luma-desktop-nav-item', isActive && 'is-active')}
            >
              <span className="luma-desktop-nav-icon">{lt(entry.icon)}</span>
              <span className="min-w-0 truncate text-[0.92rem] font-bold tracking-wide">{lt(entry.label)}</span>
              {isActive && (
                <motion.span
                  layoutId="parent-desktop-nav-dot"
                  className="ml-auto size-1.5 shrink-0 rounded-full bg-luma-grass-500"
                  transition={{ type: 'spring', stiffness: 360, damping: 28 }}
                />
              )}
            </button>
          )
        })}
      </nav>

      <div className="relative mt-auto shrink-0 px-6 pb-7">
        <HangingBranch
          tone="green"
          className="pointer-events-none absolute -right-3 -bottom-3 h-28 w-24 -scale-x-100 opacity-60"
        />
        <p className="font-hand select-none text-base leading-relaxed tracking-[0.08em] text-[#9aa98c]" aria-hidden="true">
          Small ideas,<br />big worlds.
        </p>
      </div>
    </aside>
  )
}

/** 家长端底部常驻 Tab：图标 + 文字，选中项高亮。外框固定，只有中间内容滚动。 */
export function ParentTabBar({ active, onSelect, className }: TabBarProps) {
  useLocale()
  return (
    <nav
      aria-label={t('家长端导航')}
      data-onboarding="parent-tabs"
      className={cn('luma-tabbar', className)}
    >
      {NAV_ENTRIES.map((entry) => {
        const isActive = entry.key === active
        return (
          <button
            key={entry.key}
            type="button"
            onClick={() => onSelect(entry.key)}
            aria-current={isActive ? 'page' : undefined}
            data-onboarding={
              entry.key === 'communication'
                ? 'parent-tab-communication'
                : entry.key === 'records'
                  ? 'parent-archive'
                  : undefined
            }
            className={cn('luma-tabbar-item', isActive && 'is-active')}
          >
            <span className="luma-tabbar-icon" aria-hidden="true">
              {lt(entry.icon)}
            </span>
            <span className="luma-tabbar-label">{lt(entry.label)}</span>
          </button>
        )
      })}
    </nav>
  )
}
