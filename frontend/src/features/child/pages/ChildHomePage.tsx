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
import '../styles/child-home.css'

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
      <section className="nilo-home-intro" aria-labelledby="nilo-home-title">
        <div className="nilo-welcome-sign">
          <svg className="nilo-welcome-wood" viewBox="0 0 640 104" preserveAspectRatio="none" fill="none" aria-hidden="true">
            <defs>
              <linearGradient id="nilo-sign-wood" x1="300" y1="0" x2="330" y2="104" gradientUnits="userSpaceOnUse">
                <stop stopColor="#eddfbb" /><stop offset=".48" stopColor="#f2e6c9" /><stop offset="1" stopColor="#e3d1a7" />
              </linearGradient>
            </defs>
            <path d="M22 10Q111 6 202 9T392 8Q509 4 616 10Q629 11 628 23L631 78Q632 92 618 94Q492 98 381 95T181 97L23 94Q10 94 11 82L8 26Q8 11 22 10Z" fill="url(#nilo-sign-wood)" stroke="#c4ac7d" strokeOpacity=".38" />
            <path d="M22 14Q161 10 292 13T617 13" stroke="#fff8e4" strokeWidth="2" strokeOpacity=".65" />
            <path d="M22 89Q130 94 260 91T617 90" stroke="#bfa16a" strokeOpacity=".2" />
            <g stroke="#a88d58" strokeOpacity=".12" strokeLinecap="round">
              <path d="M30 27Q100 20 172 25T300 25M351 23Q482 17 608 26M20 73Q98 65 152 72M453 78Q518 68 619 73M29 81Q178 76 250 83T407 81M438 32Q529 26 612 33" />
              <path d="M31 51Q63 39 94 48T158 52M31 57Q65 44 94 55T181 58M540 57Q570 44 597 52T619 55" />
              <ellipse cx="66" cy="50" rx="12" ry="3" /><ellipse cx="578" cy="53" rx="8" ry="2" />
            </g>
            <g fill="#b49a69" opacity=".45"><circle cx="28" cy="23" r="2.5" /><circle cx="611" cy="23" r="2.5" /></g>
          </svg>
          <svg className="nilo-sign-sprig" viewBox="0 0 68 60" fill="none" aria-hidden="true">
            <path d="M11 55Q38 31 52 7" stroke="#8f9c75" strokeWidth="1.5" />
            <path d="M27 39Q6 39 13 25Q29 24 27 39ZM36 29Q25 10 39 9Q49 21 36 29ZM38 27Q57 29 60 16Q44 11 38 27ZM24 43Q40 49 49 36Q34 28 24 43Z" fill="#a5b497" fillOpacity=".65" />
          </svg>
          <h1 id="nilo-home-title">欢迎来到 <span>Nilo</span> 的小屋</h1>
        </div>
        <p>嗨，{session?.displayName || '小小创作者'}。和 Nilo 打个招呼，或推开门，画一个新世界。</p>
      </section>
      <section className="nilo-room" aria-label="Nilo 和通往画布的门">
        <div className="nilo-room-spark spark-one" aria-hidden="true">✧</div>
        <div className="nilo-room-spark spark-two" aria-hidden="true">✦</div>
        <div className="nilo-room-spark spark-three" aria-hidden="true">✧</div>
        <div className="nilo-door-area" data-onboarding="child-door">
          <div className="nilo-door-note">你的奇妙世界，就在门后 <span aria-hidden="true">↴</span></div>
          <CreationDoor opening={opening} onOpen={openDoor} />
          <p className="nilo-door-caption"><span aria-hidden="true">✧</span> 推开门，让想象开始</p>
        </div>
        <div className="nilo-companion-area" data-onboarding="child-hero"><NiloCharacter disabled={opening} playSound={play} /></div>
        <div className="nilo-floor-line" aria-hidden="true" />
      </section>
      <footer className="nilo-home-footer">
        <span className="nilo-footer-flower" aria-hidden="true">✳</span>
        <p>在这里，慢慢来，画什么都可以。</p>
        {session?.isGuest && <span className="nilo-guest-note">游客体验 · 画作可下载，刷新后草稿会清除</span>}
      </footer>
      {opening && <motion.div className="nilo-door-transition" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: reduceMotion ? 0 : .7, duration: reduceMotion ? .1 : .4 }} aria-hidden="true" />}
    </main>
  )
}
