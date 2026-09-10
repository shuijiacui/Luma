import { lt, t, useLocale } from '@/i18n'
import { cn } from '@/lib/cn'
import { NAV_ENTRIES, type ViewKey } from './parentNav'

interface TabBarProps {
  active: ViewKey
  onSelect: (view: ViewKey) => void
  className?: string
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
