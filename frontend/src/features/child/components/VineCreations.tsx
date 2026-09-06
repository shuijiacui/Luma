import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { motionTransition } from '@/design-system/motion'

interface Work {
  id: string
  title: string
  emoji: string
  date: string
}

interface Props {
  works: Work[]
  onOpen: (workId: string) => void
}

// Fruit positions as % of vine image (left%, top%), measured from 1024×1536 source.
// Order: index 0 = most recent = bottom-left fruit, index 4 = oldest = top-right fruit
const FRUIT_POSITIONS = [
  { left: 14, top: 79 },
  { left: 25, top: 63 },
  { left: 38, top: 46 },
  { left: 53, top: 28 },
  { left: 64, top: 13 },
]

const VISIBLE_COUNT = 3

const fruitVariants = {
  hidden: { opacity: 0, scale: 0, y: 8 },
  visible: (i: number) => ({
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { ...motionTransition.expressive, delay: i * 0.08 },
  }),
  exit: { opacity: 0, scale: 0, transition: motionTransition.quick },
}

const tooltipVariants = {
  hidden: { opacity: 0, scale: 0.9, y: 4 },
  visible: { opacity: 1, scale: 1, y: 0, transition: motionTransition.expressive },
  exit: { opacity: 0, scale: 0.9, transition: motionTransition.quick },
}

export function VineCreations({ works, onOpen }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  const visibleWorks = expanded ? works.slice(0, FRUIT_POSITIONS.length) : works.slice(0, VISIBLE_COUNT)
  const hiddenCount = works.length - VISIBLE_COUNT

  return (
    // Container width = parent width; height driven by image aspect ratio (1024:1536 = 2:3)
    <div className="relative w-full" style={{ aspectRatio: '2 / 3' }}>
      <svg viewBox="0 0 100 150" aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full text-luma-grass-400">
        <path d="M12 140 C10 100 45 75 52 50 S70 25 68 8" fill="none" stroke="currentColor" strokeWidth="2" />
        {[30, 55, 80, 105].map((y, i) => <ellipse key={y} cx={62 - i * 13} cy={y} rx="9" ry="4" fill="currentColor" transform={`rotate(-30 ${62 - i * 13} ${y})`} />)}
      </svg>

      <AnimatePresence>
        {visibleWorks.map((work, i) => {
          const pos = FRUIT_POSITIONS[i]
          return (
            <motion.button
              key={work.id}
              custom={i}
              variants={fruitVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              type="button"
              aria-label={`打开作品：${work.title}`}
              className="absolute flex -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-luma-teal-400"
              style={{ left: `${pos.left}%`, top: `${pos.top}%`, width: '14%', aspectRatio: '1' }}
              onClick={() => onOpen(work.id)}
              onMouseEnter={() => setHoveredId(work.id)}
              onMouseLeave={() => setHoveredId(null)}
              whileHover={{ scale: 1.18, y: -3 }}
              whileTap={{ scale: 0.92 }}
              transition={motionTransition.expressive}
            >
              <span className="text-[clamp(1rem,3vw,1.5rem)] leading-none" aria-hidden="true">
                {work.emoji}
              </span>

              <AnimatePresence>
                {hoveredId === work.id && (
                  <motion.div
                    variants={tooltipVariants}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    className="pointer-events-none absolute bottom-[115%] left-1/2 z-10 w-max max-w-[130px] -translate-x-1/2 rounded-xl border border-white/60 bg-white/85 px-2.5 py-1.5 text-center shadow-luma-sm backdrop-blur-sm"
                  >
                    <div className="truncate text-xs font-bold text-luma-teal-900">{work.title}</div>
                    <div className="mt-0.5 text-[10px] text-luma-muted">{work.date}</div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.button>
          )
        })}

        {!expanded && hiddenCount > 0 && (
          <motion.button
            key="more"
            custom={VISIBLE_COUNT}
            variants={fruitVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            type="button"
            aria-label={`展开更多 ${hiddenCount} 个作品`}
            className="absolute flex -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border-2 border-dashed border-luma-teal-300/70 bg-white/50 text-xs font-bold text-luma-teal-700 backdrop-blur-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-luma-teal-400"
            style={{
              left: `${FRUIT_POSITIONS[VISIBLE_COUNT].left}%`,
              top: `${FRUIT_POSITIONS[VISIBLE_COUNT].top}%`,
              width: '12%',
              aspectRatio: '1',
            }}
            onClick={() => setExpanded(true)}
            whileHover={{ scale: 1.15 }}
            whileTap={{ scale: 0.92 }}
            transition={motionTransition.expressive}
          >
            +{hiddenCount}
          </motion.button>
        )}

        {expanded && (
          <motion.button
            key="collapse"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            type="button"
            className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-white/60 px-3 py-1 text-[10px] text-luma-muted backdrop-blur-sm transition hover:bg-white/80"
            onClick={() => setExpanded(false)}
          >
            收起
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  )
}
