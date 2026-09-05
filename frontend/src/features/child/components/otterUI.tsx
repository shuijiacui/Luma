import { AnimatePresence, motion } from 'framer-motion'
import type { ReactNode } from 'react'

import { motionTransition } from '@/design-system'
import { cn } from '@/lib/cn'
import { NILO_POSES, type PoseKey } from './otter'

/*
 * 全身、无框水獭形象：直接展示透明底 PNG，不套圆框、不裁剪。
 * 像主持人/伙伴一样「站在」页面上，尺寸由调用方通过 className 控制。
 */
export function NiloStand({
  poseKey,
  className,
  ariaLabel,
  src,
  motionless = false,
}: {
  poseKey: PoseKey
  className?: string
  ariaLabel?: string
  /** 覆盖默认姿势图（例如用户提供的水獭全身素材） */
  src?: string
  /** true = 完全静止：无浮动、无姿势切换动画（欢迎蒙版用） */
  motionless?: boolean
}) {
  const pose = NILO_POSES[poseKey]
  const imageSrc = src ?? pose.src

  if (motionless) {
    return (
      <div
        className={cn('relative flex shrink-0 items-end justify-center', className)}
        aria-label={ariaLabel ?? pose.alt}
      >
        <img
          src={imageSrc}
          alt={pose.alt}
          className="h-full w-full object-contain drop-shadow-[0_8px_12px_rgba(32,53,47,0.16)] select-none"
          draggable={false}
        />
      </div>
    )
  }

  return (
    <motion.div
      animate={{ y: [0, -6, 0] }}
      transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
      className={cn('relative flex shrink-0 items-end justify-center', className)}
      aria-label={ariaLabel ?? pose.alt}
    >
      <AnimatePresence mode="wait">
        <motion.img
          key={poseKey}
          src={imageSrc}
          alt={pose.alt}
          initial={{ opacity: 0, scale: 0.88, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 8 }}
          transition={motionTransition.expressive}
          className="h-full w-full object-contain drop-shadow-[0_8px_12px_rgba(32,53,47,0.16)] select-none"
          draggable={false}
        />
      </AnimatePresence>
    </motion.div>
  )
}

/** 对话气泡：圆角框 + 小尾巴，尾巴指向水獭一侧 */
export function SpeechBubble({
  children,
  tail = 'left',
  className,
}: {
  children: ReactNode
  tail?: 'left' | 'right' | 'top'
  className?: string
}) {
  return (
    <div
      className={cn(
        'relative inline-block rounded-[1.5rem] border border-luma-teal-100 bg-white/95 px-4 py-3 text-luma-teal-900 shadow-luma-md backdrop-blur sm:px-5 sm:py-4',
        tail === 'left' && 'ml-2 sm:ml-3',
        tail === 'right' && 'mr-2 sm:mr-3',
        tail === 'top' && 'mt-2',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'absolute size-4 rotate-45 border-luma-teal-100 bg-white',
          tail === 'left' &&
            '-top-1.5 left-5 border-t border-l border-luma-teal-100 sm:top-1/2 sm:left-[-7px] sm:-translate-y-1/2 sm:border-b sm:border-l sm:border-t-0',
          tail === 'right' &&
            'top-1/2 right-[-7px] -translate-y-1/2 border-r border-b border-luma-teal-100',
          tail === 'top' && 'top-[-7px] left-8 border-t border-l border-luma-teal-100',
        )}
      />
      {children}
    </div>
  )
}

