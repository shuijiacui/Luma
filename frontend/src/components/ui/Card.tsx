import { lt, useLocale } from '@/i18n'
import { motion } from 'framer-motion'
import type { ComponentProps, ReactNode } from 'react'

import { motionTransition } from '@/design-system'
import { cn } from '@/lib/cn'

type CardVariant = 'surface' | 'soft' | 'glass' | 'outline'

export type CardProps = Omit<
  ComponentProps<typeof motion.article>,
  'children' | 'title'
> & {
  children?: ReactNode
  variant?: CardVariant
  interactive?: boolean
  eyebrow?: ReactNode
  title?: ReactNode
  description?: ReactNode
  footer?: ReactNode
}

const variants: Record<CardVariant, string> = {
  surface: 'border border-luma-ivory-200 bg-white shadow-luma-sm',
  soft: 'border border-luma-teal-100/70 bg-luma-teal-50',
  glass:
    'border border-white/70 bg-white/65 shadow-luma-md backdrop-blur-xl',
  outline: 'border border-luma-teal-100 bg-transparent',
}

export function Card({
  children,
  className,
  variant = 'surface',
  interactive = false,
  eyebrow,
  title,
  description,
  footer,
  ...props
}: CardProps) {
  useLocale()
  return (
    <motion.article
      className={cn(
        'overflow-hidden rounded-luma-md p-6 md:p-7',
        interactive &&
          'transition-[border-color,box-shadow] hover:border-luma-teal-300 hover:shadow-luma-md',
        variants[variant],
        className,
      )}
      whileHover={interactive ? { y: -4 } : undefined}
      transition={motionTransition.gentle}
      {...props}
    >
      {eyebrow && (
        <div className="luma-eyebrow mb-3 text-luma-gold-700">{lt(eyebrow)}</div>
      )}
      {title && (
        <h3 className="luma-heading-3 text-luma-teal-900">{lt(title)}</h3>
      )}
      {description && (
        <p className="luma-body mt-2 text-luma-muted">{lt(description)}</p>
      )}
      {children && <div className="mt-5">{lt(children)}</div>}
      {footer && (
        <div className="mt-6 border-t border-luma-ivory-200 pt-5">{lt(footer)}</div>
      )}
    </motion.article>
  )
}
