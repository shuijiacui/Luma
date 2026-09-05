import { useEffect, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { Brand } from '@/components/brand'
import { useAuth } from '@/features/auth/AuthContext'
import { AvatarPicker } from '@/features/profile/components/AvatarPicker'
import { useOnboarding } from '@/features/onboarding/OnboardingContext'
import { childSteps } from '@/features/onboarding/steps/childSteps'
import { NiloCharacter } from '../components/NiloCharacter'
import { CreationDoor } from '../components/CreationDoor'
import { useNiloSound } from '../hooks/useNiloSound'
import '../styles/child-storybook.css'

export function ChildHomePage() {
  const { session, logout } = useAuth()
  const navigate = useNavigate()
  const { start } = useOnboarding()
  const reduceMotion = useReducedMotion()
  const [opening, setOpening] = useState(false)
  const openingRef = useRef(false)
  const navigationTimer = useRef<number | undefined>(undefined)
  const { soundOn, toggleSound, play } = useNiloSound()
  useEffect(() => () => window.clearTimeout(navigationTimer.current), [])

  function openDoor() {
    if (openingRef.current) return
    openingRef.current = true
    setOpening(true)
    play('door')
    // Navigation also works if animation events or images fail to load.
    navigationTimer.current = window.setTimeout(() => navigate('/child/create'), reduceMotion ? 160 : 1100)
  }

  return (
    <main className={`nilo-home${opening ? ' is-entering' : ''}`}>
      <header className="nilo-home-header">
        <div className="nilo-home-brand"><Brand size="md" /><span>想象力在这里发芽</span></div>
        <nav className="nilo-home-nav" aria-label="小屋设置">
          <button type="button" className="nilo-icon-button" aria-label={soundOn ? '关闭声音' : '打开声音'} aria-pressed={soundOn} onClick={toggleSound}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5Z" strokeLinejoin="round" />{soundOn ? <path d="M15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14" strokeLinecap="round" /> : <path d="m16 9 5 6m0-6-5 6" strokeLinecap="round" />}</svg>
          </button>
          <button type="button" className="nilo-icon-button" aria-label="怎么玩" onClick={() => start(childSteps)}>?</button>
          <span className="nilo-nav-divider" />
          <div data-onboarding="child-avatar"><AvatarPicker userId={session?.id ?? 'guest-child'} compact /></div>
          <button type="button" className="nilo-leave" onClick={() => { logout(); navigate('/auth?role=child&mode=login') }}>下次见 <span aria-hidden="true">↗</span></button>
        </nav>
      </header>
      <h1 className="sr-only">Nilo 的创作世界</h1>
      <section className="nilo-room" aria-label="Nilo 和通往画布的门">
        <div className="nilo-tree-sign" aria-hidden="true">更大的<br />想象世界<br />在这里<span>✦</span></div>
        <div className="nilo-room-spark spark-one" aria-hidden="true">✧</div>
        <div className="nilo-room-spark spark-two" aria-hidden="true">✦</div>
        <div className="nilo-room-spark spark-three" aria-hidden="true">✧</div>
        <div className="nilo-door-area" data-onboarding="child-door">
          <CreationDoor opening={opening} onOpen={openDoor} />
        </div>
        <div className="nilo-companion-area" data-onboarding="child-hero"><NiloCharacter disabled={opening} playSound={play} /></div>
        <div className="nilo-field-note note-head" aria-hidden="true">点点我的<br />脑袋吧！<svg viewBox="0 0 70 48" fill="none"><path d="M60 3C66 22 34 40 26 30S48 20 39 34C32 44 16 40 7 40m0 0 8-6m-8 6 9 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg></div>
        <div className="nilo-field-note note-adventure" aria-hidden="true">和我<br />一起去探险！<svg viewBox="0 0 70 48" fill="none"><path d="M60 3C66 22 34 40 26 30S48 20 39 34C32 44 16 40 7 40m0 0 8-6m-8 6 9 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg></div>
        <div className="nilo-butterfly" aria-hidden="true"><i /><i /><i /><i /></div>
      </section>
      {opening && <motion.div className="nilo-door-transition" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: reduceMotion ? 0 : .7, duration: reduceMotion ? .1 : .4 }} aria-hidden="true" />}
    </main>
  )
}
