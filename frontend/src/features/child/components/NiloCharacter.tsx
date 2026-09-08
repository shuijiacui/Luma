import { t, useLocale } from '@/i18n'
import { AnimatePresence, motion, useMotionValue, useReducedMotion, useSpring } from 'framer-motion'
import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import type { NiloSound } from '../hooks/useNiloSound'
import { NiloIllustration, type NiloPose } from './NiloIllustration'
import '../styles/nilo-character.css'

type Part = Exclude<NiloSound, 'door'>
type Phase = 'anticipate' | 'respond' | 'settle'
type Reaction = { part: Part; sequence: number; phase: Phase }
const interactions: Record<Part, { label: string; short: string; messages: string[]; duration: number; x: number; y: number; w: number; h: number }> = {
  head: { label: '摸摸 Nilo 的头', short: '摸摸头', messages: ['嘿嘿，你的手暖暖的。', '嗯～再轻轻摸一下。'], duration: 1700, x: 54, y: 16, w: 25, h: 13 },
  nose: { label: '点点 Nilo 的鼻子', short: '点鼻子', messages: ['啵！一个小泡泡送给你。', '咦，泡泡飞到哪里去了？'], duration: 1300, x: 46, y: 25.2, w: 12, h: 10 },
  hand: { label: '和 Nilo 击掌', short: '击个掌', messages: ['啪！和你击个掌！', '这一掌，送给你的奇思妙想！'], duration: 1600, x: 57.5, y: 56.8, w: 17, h: 11 },
  belly: { label: '挠挠 Nilo 的肚子', short: '挠肚子', messages: ['哈哈，有一点点痒～', '嘿嘿，笑得肚子都动啦。'], duration: 1800, x: 40.5, y: 65.5, w: 18, h: 21 },
  tail: { label: '碰碰 Nilo 的尾巴', short: '碰尾巴', messages: ['摇一摇，小尾巴打个招呼。', '小尾巴也很高兴见到你。'], duration: 1700, x: 78, y: 77, w: 23, h: 13 },
  lantern: { label: '点亮 Nilo 的星星灯', short: '点亮星星', messages: ['一颗小星星，照亮你的想象。', '带上这束光，我们去画画吧。'], duration: 2400, x: 22.5, y: 41.5, w: 17, h: 23 },
}

function Spark({ kind }: { kind: Part }) {
  return <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
    {kind === 'head' ? <path d="M16 27S3 19 3 10C3 2 13 2 16 9C19 2 29 2 29 10C29 19 16 27 16 27Z" fill="currentColor" />
      : kind === 'nose' ? <><circle cx="16" cy="16" r="12" stroke="currentColor" strokeWidth="1.6" fill="#fffdf4" fillOpacity=".45" /><path d="M9 13Q10 8 15 8" stroke="white" strokeWidth="2.4" strokeLinecap="round" /></>
        : <path d="m16 2 4.1 9.6L30 16l-9.9 4.4L16 30l-4.1-9.6L2 16l9.9-4.4L16 2Z" fill="currentColor" />}
  </svg>
}

export function NiloCharacter({ disabled, playSound }: { disabled: boolean; playSound: (sound: NiloSound) => void }) {
  useLocale()
  const initialReducedMotion = Boolean(useReducedMotion())
  const [liveReducedMotion, setLiveReducedMotion] = useState<boolean | null>(null)
  const reduceMotion = liveReducedMotion ?? initialReducedMotion
  const [reaction, setReaction] = useState<Reaction | null>(null)
  const [message, setMessage] = useState('')
  const [showHints, setShowHints] = useState(false)
  const [blinking, setBlinking] = useState(false)
  const [pose, setPose] = useState<NiloPose>('idle')
  const [visible, setVisible] = useState(() => !document.hidden)
  const stage = useRef<HTMLDivElement>(null)
  const timers = useRef<number[]>([])
  const lastAction = useRef(-Infinity)
  const serial = useRef(0)
  const visits = useRef<Record<Part, number>>({ head: 0, nose: 0, hand: 0, belly: 0, tail: 0, lantern: 0 })
  const gazeX = useMotionValue(0)
  const lookX = useSpring(gazeX, { stiffness: 65, damping: 18 })
  const cancelTimers = useCallback(() => { timers.current.forEach(window.clearTimeout); timers.current = [] }, [])
  const resetGaze = useCallback(() => gazeX.set(0), [gazeX])
  const resting = !disabled && visible && !reduceMotion && !reaction
  const active = !disabled && visible ? reaction?.part : undefined

  useEffect(() => () => cancelTimers(), [cancelTimers])
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setLiveReducedMotion(preference.matches)
    update()
    preference.addEventListener('change', update)
    return () => preference.removeEventListener('change', update)
  }, [])
  useEffect(() => { if (reduceMotion) resetGaze() }, [reduceMotion, resetGaze])
  useEffect(() => {
    const update = () => setVisible(!document.hidden)
    document.addEventListener('visibilitychange', update)
    return () => document.removeEventListener('visibilitychange', update)
  }, [])
  useEffect(() => {
    if (disabled || !visible) {
      cancelTimers(); setReaction(null); setMessage(''); resetGaze()
      lastAction.current = -Infinity
    }
  }, [disabled, visible, cancelTimers, resetGaze])
  useEffect(() => {
    if (!resting) { setBlinking(false); return }
    let timer: number
    const blink = () => {
      setBlinking(true)
      timer = window.setTimeout(() => {
        setBlinking(false)
        timer = window.setTimeout(blink, 3400 + Math.random() * 2500)
      }, 155)
    }
    timer = window.setTimeout(blink, 2800 + Math.random() * 1800)
    return () => window.clearTimeout(timer)
  }, [resting])

  function interact(part: Part) {
    if (disabled || !visible || Date.now() - lastAction.current < 220) return
    lastAction.current = Date.now()
    cancelTimers(); resetGaze()
    const sequence = ++serial.current
    const spec = interactions[part]
    setReaction({ part, sequence, phase: 'anticipate' })
    setMessage(spec.messages[visits.current[part]++ % spec.messages.length])
    playSound(part)
    const later = (fn: () => void, delay: number) => timers.current.push(window.setTimeout(fn, delay))
    later(() => setReaction({ part, sequence, phase: 'respond' }), reduceMotion ? 0 : 90)
    later(() => setReaction({ part, sequence, phase: 'settle' }), spec.duration - 320)
    later(() => setReaction(null), spec.duration)
    later(() => setMessage(''), 3500)
  }
  function lookAt(event: PointerEvent<HTMLDivElement>) {
    if (!resting || event.pointerType === 'touch' || event.buttons) return
    const rect = stage.current?.getBoundingClientRect()
    if (!rect) return
    gazeX.set(Math.max(-3.5, Math.min(3.5, (event.clientX - rect.x - rect.width * .51) / rect.width * 9)))
  }
  function hotspot(part: Part) {
    const spec = interactions[part]
    const raised = pose === 'highfive' && part === 'hand'
    return <button key={part} type="button" className={'nilo-touch-target hotspot-' + part} aria-label={t(spec.label)} disabled={disabled}
      style={{ left: (raised ? 66 : spec.x) + '%', top: (raised ? 36 : spec.y) + '%', width: spec.w + '%', height: (raised ? 15 : spec.h) + '%' }}
      onClick={() => interact(part)} onFocus={resetGaze}>
      <span className="nilo-target-aura" /><span className="nilo-target-dot" /><span className="nilo-target-label">{t(spec.short)}</span>
    </button>
  }
  const still = reduceMotion || disabled || !visible
  const spec = active ? interactions[active] : undefined
  return <div className={'nilo-companion nilo-painted' + (showHints ? ' show-hotspots' : '')} data-reaction={active ?? 'idle'} data-phase={reaction?.phase ?? 'idle'} data-pose={pose} data-reduced-motion={reduceMotion} data-paused={still}>
    <div className="nilo-speech-slot" role="status" aria-live="polite" aria-atomic="true">
      <AnimatePresence>{!disabled && message && <motion.div className="nilo-speech" key={message}
        initial={{ opacity: 0, y: reduceMotion ? 0 : 6, scale: reduceMotion ? 1 : .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: .18 }}>
        <span className="nilo-speech-star" aria-hidden="true">✦</span><span>{t(message)}</span>
      </motion.div>}</AnimatePresence>
    </div>
    <div ref={stage} className="nilo-character-stage" onPointerMove={lookAt} onPointerLeave={resetGaze}>
      <div className="nilo-ground-shadow" aria-hidden="true" />
      <div className="nilo-lantern-spill" aria-hidden="true" />
      <div className="nilo-lamp-aura" aria-hidden="true" />
      <NiloIllustration part={active} phase={reaction?.phase ?? 'idle'} blinking={blinking && resting} paused={still} gaze={lookX} sequence={reaction?.sequence ?? 0} onPoseChange={setPose} />
      <div className="nilo-face-warmth" aria-hidden="true" />
      <div className="nilo-touch-plane">{(Object.keys(interactions) as Part[]).map(part => hotspot(part))}</div>
      {!disabled && spec && reaction && <div className={'nilo-particles particles-' + active} key={reaction.sequence} style={{ left: (active === 'hand' && pose === 'highfive' ? 66 : spec.x) + '%', top: (active === 'hand' && pose === 'highfive' ? 36 : spec.y) + '%' }} aria-hidden="true">
        {Array.from({ length: reduceMotion ? 1 : 6 }, (_, i) => <motion.span key={i} style={{ '--spark-index': i } as CSSProperties}
          initial={{ opacity: 0, x: 0, y: 0, scale: reduceMotion ? 1 : .35 }} animate={{ opacity: [0, .95, 0], x: reduceMotion ? 0 : Math.cos(i * 2.4) * (32 + i * 6), y: reduceMotion ? 0 : -30 - i * 13, scale: reduceMotion ? 1 : [.35, 1, .65], rotate: reduceMotion ? 0 : i * 12 - 25 }}
          transition={{ duration: reduceMotion ? 1.2 : 1.65, delay: reduceMotion ? 0 : .12 + i * .055, ease: 'easeOut' }}><Spark kind={active!} /></motion.span>)}
      </div>}
      <div className="nilo-ambient-motes" aria-hidden="true"><i /><i /><i /></div>
    </div>
    <button type="button" className="nilo-touch-hint" aria-pressed={showHints} disabled={disabled} onClick={() => setShowHints(value => !value)}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M8 13V6a2 2 0 0 1 4 0v6-2a2 2 0 0 1 4 0v2a2 2 0 0 1 4 0v4c0 4-3 6-6 6-2 0-4-1-5-3l-4-5a2 2 0 0 1 3-2l2 2" strokeLinecap="round" strokeLinejoin="round" /></svg>
      <span>{t(showHints ? '点点亮起的地方，看看我的反应' : '试着摸摸我，会有小惊喜哦')}</span>
    </button>
  </div>
}
