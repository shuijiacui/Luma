import type { Transition, Variants } from 'framer-motion'

export const lumaEase = [0.22, 1, 0.36, 1] as const

export const motionTransition = {
  instant: { duration: 0.16, ease: lumaEase },
  quick: { duration: 0.24, ease: lumaEase },
  gentle: { duration: 0.42, ease: lumaEase },
  expressive: {
    type: 'spring',
    stiffness: 260,
    damping: 24,
    mass: 0.8,
  },
} satisfies Record<string, Transition>

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: motionTransition.gentle,
  },
}

export const softScale: Variants = {
  hidden: { opacity: 0, scale: 0.96 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: motionTransition.expressive,
  },
}

export const staggerContainer: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.04,
    },
  },
}

export const interactiveMotion = {
  whileHover: { y: -2 },
  whileTap: { scale: 0.98 },
  transition: motionTransition.quick,
} as const
