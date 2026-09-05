import { AnimatePresence, motion, useReducedMotion, type TargetAndTransition } from 'framer-motion'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import niloSprite from '@/assets/images/nilo-companion-v1.png'
import type { NiloSound } from '../hooks/useNiloSound'

type Part = Exclude<NiloSound, 'door'>
const interactions: { id: Part; label: string; message: string; symbol: string; x: number; y: number; width: number; height: number }[] = [
  { id: 'head', label: '摸摸 Nilo 的头', message: '嘿嘿，你的手暖暖的。', symbol: '♡', x: 53, y: 17, width: 35, height: 20 },
  { id: 'nose', label: '点点 Nilo 的鼻子', message: '啵！一个小泡泡送给你。', symbol: '○', x: 46, y: 28, width: 14, height: 13 },
  { id: 'hand', label: '和 Nilo 击掌', message: '啪！和你击个掌！', symbol: '✦', x: 24, y: 25, width: 18, height: 20 },
  { id: 'belly', label: '挠挠 Nilo 的肚子', message: '哈哈，有一点点痒～', symbol: '♫', x: 41, y: 62, width: 22, height: 24 },
  { id: 'tail', label: '碰碰 Nilo 的尾巴', message: '摇一摇，小尾巴打个招呼。', symbol: '✧', x: 78, y: 77, width: 23, height: 17 },
]
const reactions: Record<Part, TargetAndTransition> = {
  head: { rotate: [0, -5, -3, 0], y: [0, 9, 5, 0], scaleY: [1, .97, 1] },
  nose: { scale: [1, 1.035, .985, 1], rotate: [0, 2, -2, 0] },
  hand: { rotate: [0, -7, 3, -4, 0], y: [0, -15, 0] },
  belly: { scaleX: [1, 1.045, .98, 1.035, 1], scaleY: [1, .97, 1.03, .98, 1], rotate: [0, -2, 2, -2, 0] },
  tail: { rotate: [0, 4, -4, 3, -2, 0], x: [0, 5, -5, 3, 0] },
}
export function NiloCharacter({ disabled, playSound }: { disabled: boolean; playSound: (sound: NiloSound) => void }) {
  const reduceMotion = useReducedMotion()
  const [reaction, setReaction] = useState<Part | null>(null)
  const [message, setMessage] = useState('')
  const [showHints, setShowHints] = useState(false)
  const [sequence, setSequence] = useState(0)
  const actionTimer = useRef<number | undefined>(undefined)
  const bubbleTimer = useRef<number | undefined>(undefined)
  const lastAction = useRef(0)
  useEffect(() => {
    bubbleTimer.current = window.setTimeout(() => setMessage(''), 4500)
    return () => { window.clearTimeout(actionTimer.current); window.clearTimeout(bubbleTimer.current) }
  }, [])
  function interact(part: typeof interactions[number]) {
    if (disabled || Date.now() - lastAction.current < 300) return
    lastAction.current = Date.now()
    window.clearTimeout(actionTimer.current)
    window.clearTimeout(bubbleTimer.current)
    setReaction(part.id)
    setMessage(part.message)
    setSequence(value => value + 1)
    playSound(part.id)
    actionTimer.current = window.setTimeout(() => setReaction(null), 1000)
    bubbleTimer.current = window.setTimeout(() => setMessage(''), 3200)
  }
  const activePart = interactions.find(part => part.id === reaction)
  return (
    <div className="nilo-companion">
      <div className="nilo-speech-slot" role="status" aria-live="polite" aria-atomic="true">
        <AnimatePresence mode="wait">
          {!disabled && message && <motion.div className="nilo-speech" key={message} initial={{ opacity: 0, y: reduceMotion ? 0 : 7 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}><span aria-hidden="true">✦</span> {message}</motion.div>}
        </AnimatePresence>
      </div>
      <div className="nilo-character-stage">
        <div className="nilo-ground-shadow" aria-hidden="true" />
        <motion.div className="nilo-character-float" animate={reduceMotion || disabled || reaction ? { y: 0 } : { y: [0, -5, 0] }} transition={{ duration: 4, repeat: reaction || disabled || reduceMotion ? 0 : Infinity, ease: 'easeInOut' }}>
          <motion.div className={`nilo-character${showHints ? ' show-hotspots' : ''}`} animate={reduceMotion || disabled || !reaction ? { rotate: 0, x: 0, y: 0, scale: 1, scaleX: 1, scaleY: 1 } : reactions[reaction]} transition={{ duration: .8, ease: 'easeInOut' }}>
            <img src={niloSprite} alt="提着星星灯、戴着青绿色围巾的 Nilo" draggable={false} className="nilo-sprite" fetchPriority="high" />
            <div className="nilo-magic-trail" aria-hidden="true"><span>✦</span><span>✧</span><span>✦</span><span>✧</span><span>✦</span><span>✦</span></div>
            {interactions.map(part => <button key={part.id} type="button" className={`nilo-hotspot hotspot-${part.id}`} style={{ left: `${part.x}%`, top: `${part.y}%`, width: `${part.width}%`, height: `${part.height}%` }} aria-label={part.label} disabled={disabled} onClick={() => interact(part)}><span className="nilo-hotspot-dot" /><span className="nilo-hotspot-label">{part.label.replace('Nilo 的', '').replace('和 Nilo ', '')}</span></button>)}
            {!disabled && activePart && <div key={sequence} className={`nilo-reaction-particles reaction-${reaction}`} style={{ left: `${activePart.x}%`, top: `${activePart.y}%` }} aria-hidden="true">{Array.from({ length: 6 }, (_, i) => <span key={i} style={{ '--i': i, '--dx': `${Math.cos(i * Math.PI / 3) * 64}px`, '--dy': `${Math.sin(i * Math.PI / 3) * 55 - 35}px` } as CSSProperties}>{activePart.symbol}</span>)}</div>}
          </motion.div>
        </motion.div>
      </div>
      <div className="nilo-companion-caption"><span className="nilo-name">Nilo</span><span className="nilo-caption-dot">·</span>你的想象力伙伴</div>
      <button type="button" className="nilo-touch-hint" aria-pressed={showHints} disabled={disabled} onClick={() => setShowHints(value => !value)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><path d="M8 13V6a2 2 0 0 1 4 0v6-2a2 2 0 0 1 4 0v2a2 2 0 0 1 4 0v4c0 4-3 6-6 6-2 0-4-1-5-3l-4-5a2 2 0 0 1 3-2l2 2" /></svg>{showHints ? '点点亮起的地方，看看我的反应' : '试着摸摸我，会有小惊喜哦'}</button>
    </div>
  )
}
