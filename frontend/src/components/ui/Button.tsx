import { motion } from 'framer-motion'
import type { ComponentProps, ReactNode } from 'react'

import { motionTransition } from '@/design-system'
import { cn } from '@/lib/cn'

type ButtonVariant = 'primary' | 'secondary' | 'gold' | 'ghost'
type ButtonSize = 'sm' | 'md' | 'lg'

export type ButtonProps = Omit<
  ComponentProps<typeof motion.button>,
  'children'
> & {
  children?: ReactNode
  variant?: ButtonVariant
  size?: ButtonSize
  leadingIcon?: ReactNode
  trailingIcon?: ReactNode
  isLoading?: boolean
}

const variants: Record<ButtonVariant, string> = {
  primary:
    'bg-luma-teal-600 text-white shadow-luma-sm hover:bg-luma-teal-700 hover:shadow-luma-glow',
  secondary:
    'border border-luma-teal-100 bg-white text-luma-teal-700 shadow-luma-sm hover:border-luma-teal-300 hover:bg-luma-teal-50',
  gold:
    'bg-luma-gold-300 text-luma-teal-900 shadow-luma-sm hover:bg-luma-gold-500',
  ghost:
    'bg-transparent text-luma-teal-700 hover:bg-luma-teal-50',
}

const sizes: Record<ButtonSize, string> = {
  sm: 'min-h-9 rounded-xl px-3.5 text-sm',
  md: 'min-h-11 rounded-2xl px-5 text-sm',
  lg: 'min-h-14 rounded-2xl px-7 text-base',
}

export function Button({
  children,
  className,
  variant = 'primary',
  size = 'md',
  leadingIcon,
  trailingIcon,
  isLoading = false,
  disabled,
  type = 'button',
  ...props
}: ButtonProps) {
  const isDisabled = disabled || isLoading

  return (
    <motion.button
      type={type}
      className={cn(
        'inline-flex cursor-pointer items-center justify-center gap-2 font-semibold transition-[background-color,border-color,color,box-shadow] outline-none',
        'focus-visible:ring-3 focus-visible:ring-luma-gold-300/60 focus-visible:ring-offset-2 focus-visible:ring-offset-luma-ivory-50',
        'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-45',
        variants[variant],
        sizes[size],
        className,
      )}
      disabled={isDisabled}
      aria-busy={isLoading}
      whileHover={isDisabled ? undefined : { y: -2 }}
      whileTap={isDisabled ? undefined : { scale: 0.98 }}
      transition={motionTransition.quick}
      {...props}
    >
      {isLoading ? (
        <span
          className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent"
          aria-hidden="true"
        />
      ) : (
        leadingIcon
      )}
      <span>{children}</span>
      {!isLoading && trailingIcon}
    </motion.button>
  )
}
