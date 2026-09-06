import { motion } from 'framer-motion'

import { lumaLogo } from '@/assets/brand'
import { cn } from '@/lib/cn'
import { HangingBranch, LeafSprig } from './decor'
import { NAV_ENTRIES, type ViewKey } from './parentNav'

interface SidebarProps {
  active: ViewKey
  onSelect: (view: ViewKey) => void
  onLogout?: () => void
  className?: string
}

export function ParentSidebar({ active, onSelect, onLogout, className }: SidebarProps) {
  return (
    <aside
      data-onboarding="parent-navbar"
      className={cn(
        'fixed top-1/2 left-[max(20px,calc((100vw-1560px)/2+20px))] z-30 hidden w-[264px] -translate-y-1/2 flex-col overflow-hidden rounded-[2rem] border border-white/70 bg-white/85 shadow-luma-card backdrop-blur-xl lg:flex',
        className,
      )}
      style={{ maxHeight: 'calc(100vh - 48px)' }}
    >
      {/* 品牌 */}
      <div className="px-7 pt-7">
        <a
          href="/"
          aria-label="Luma 首页"
          className="group inline-flex items-center gap-2.5 rounded-2xl outline-none focus-visible:ring-3 focus-visible:ring-luma-grass-300/60"
        >
          <span className="relative grid size-11 shrink-0 place-items-center">
            <img
              src={lumaLogo}
              alt=""
              className="size-full object-contain drop-shadow-[0_4px_8px_rgba(16,90,81,0.14)] transition-transform duration-300 group-hover:-rotate-2"
            />
          </span>
          <span className="font-brand text-[1.55rem] font-bold tracking-[-0.035em] text-[#33503a]">
            Luma
          </span>
          <span
            className="mb-[0.4em] size-1.5 rotate-45 rounded-[2px] bg-luma-gold-300"
            aria-hidden="true"
          />
        </a>
        <div className="mt-3 flex items-start gap-1.5 pl-0.5">
          <LeafSprig className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-80" tone="green" />
          <p className="text-[0.7rem] leading-[1.7] text-[#8a816b]">
            看见每个孩子
            <br />
            独一无二的想象力
          </p>
        </div>
      </div>

      {/* 导航菜单 */}
      <nav
        aria-label="家长端导航"
        data-onboarding="parent-tabs"
        className="mt-6 flex-1 space-y-1 overflow-y-auto px-4 pb-4"
      >
        {NAV_ENTRIES.map((entry) => {
          const isActive = entry.key === active
          return (
            <button
              key={entry.key}
              type="button"
              onClick={() => onSelect(entry.key)}
              aria-current={isActive ? 'page' : undefined}
              data-onboarding={entry.key === 'communication' ? 'parent-tab-communication' : entry.key === 'records' ? 'parent-archive' : undefined}
              className={cn(
                'group flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left outline-none transition-colors duration-200 focus-visible:ring-3 focus-visible:ring-luma-grass-300/60',
                isActive
                  ? 'bg-luma-grass-100 text-[#3f5a33]'
                  : 'text-[#6e7868] hover:bg-[#f4f1e7]',
              )}
            >
              <span
                className={cn(
                  'grid size-9 shrink-0 place-items-center rounded-[0.9rem] transition-colors duration-200',
                  isActive
                    ? 'bg-white text-luma-grass-600 shadow-[0_2px_8px_rgba(71,101,58,0.10)]'
                    : 'bg-[#f6f2e7] text-[#98a08c] group-hover:bg-white group-hover:text-luma-grass-500',
                )}
              >
                {entry.icon}
              </span>
              <span className="text-[0.92rem] font-bold tracking-wide">{entry.label}</span>
              {isActive && (
                <motion.span
                  layoutId="parent-nav-dot"
                  className="ml-auto size-1.5 rounded-full bg-luma-grass-500"
                  transition={{ type: 'spring', stiffness: 360, damping: 28 }}
                />
              )}
            </button>
          )
        })}
      </nav>

      {/* 底部操作 */}
      <div className="relative mt-auto shrink-0 px-6 pb-8">
        {onLogout && (
          <button type="button" onClick={onLogout} className="mb-4 w-full rounded-xl px-3 py-2 text-left text-sm font-bold text-[#6e7868] transition hover:bg-[#f4f1e7]">
            退出登录
          </button>
        )}
        <HangingBranch
          tone="green"
          className="pointer-events-none absolute -right-3 -bottom-3 h-32 w-24 -scale-x-100 opacity-70"
        />
        <div
          className="font-hand flex select-none flex-col gap-[0.35rem] text-[0.95rem] leading-none tracking-[0.14em] text-[#9aa98c]"
          style={{ transform: 'rotate(-1.5deg)' }}
          aria-hidden="true"
        >
          <span>More</span>
          <span>Art</span>
          <span>A</span>
          <span>Kinder</span>
          <span>Tomorrow</span>
        </div>
      </div>
    </aside>
  )
}

export function ParentMobileNav({
  active,
  onSelect,
  className,
}: SidebarProps) {
  return (
    <div
      data-onboarding="parent-tabs"
      className={cn(
        '-mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        className,
      )}
    >
      {NAV_ENTRIES.map((entry) => {
        const isActive = entry.key === active
        return (
          <button
            key={entry.key}
            type="button"
            onClick={() => onSelect(entry.key)}
            aria-current={isActive ? 'page' : undefined}
            data-onboarding={entry.key === 'communication' ? 'parent-tab-communication' : entry.key === 'records' ? 'parent-archive' : undefined}
            className={cn(
              'flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-bold whitespace-nowrap transition',
              isActive
                ? 'bg-luma-grass-600 text-white shadow-luma-sm'
                : 'bg-white/80 text-[#6e7868] backdrop-blur-sm hover:bg-white',
            )}
          >
            {entry.icon}
            {entry.label}
          </button>
        )
      })}
    </div>
  )
}


