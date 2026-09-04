import { motion } from 'framer-motion'
import type { ReactNode } from 'react'

import { Brand } from '@/components/brand'
import { motionTransition } from '@/design-system'
import { cn } from '@/lib/cn'

export interface NavItem {
  label: string
  /** 路由/锚点跳转；提供 onClick 时可省略，此时渲染为按钮 */
  href?: string
  /** 页内切换（如标签页）。提供后该项渲染为 <button>，点击不跳转 */
  onClick?: () => void
  isActive?: boolean
}

export interface NavbarProps {
  brand?: ReactNode
  items?: NavItem[]
  actions?: ReactNode
  className?: string
  ariaLabel?: string
}

export function Navbar({
  brand = (
    <Brand size="md" />
  ),
  items = [],
  actions,
  className,
  ariaLabel = '主导航',
}: NavbarProps) {
  return (
    <motion.header
      className={cn(
        'mx-auto flex min-h-18 w-full max-w-7xl items-center justify-between gap-6 rounded-luma-md border border-white/70 bg-luma-ivory-50/80 px-5 shadow-luma-sm backdrop-blur-xl md:px-7',
        className,
      )}
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={motionTransition.gentle}
    >
      <a
        href="/"
        className="shrink-0 text-luma-teal-900 outline-none focus-visible:rounded-lg focus-visible:ring-3 focus-visible:ring-luma-gold-300/60"
        aria-label="Luma 首页"
      >
        {brand}
      </a>

      {items.length > 0 && (
        <nav aria-label={ariaLabel} className="hidden items-center gap-1 md:flex">
          {items.map((item) => {
            const itemClass = cn(
              'rounded-xl px-4 py-2 text-sm font-medium text-luma-muted outline-none transition-colors',
              'hover:bg-white hover:text-luma-teal-700 focus-visible:ring-3 focus-visible:ring-luma-gold-300/60',
              item.isActive && 'bg-white text-luma-teal-700 shadow-luma-sm',
            )
            return item.onClick ? (
              <button
                key={item.label}
                type="button"
                onClick={item.onClick}
                aria-current={item.isActive ? 'page' : undefined}
                className={itemClass}
              >
                {item.label}
              </button>
            ) : (
              <a
                key={`${item.href}-${item.label}`}
                href={item.href}
                aria-current={item.isActive ? 'page' : undefined}
                className={itemClass}
              >
                {item.label}
              </a>
            )
          })}
        </nav>
      )}

      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </motion.header>
  )
}
