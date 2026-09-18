import { t, useLocale } from '@/i18n'
import { motion } from 'framer-motion'
import authOtterCutout from '@/assets/images/auth-otter-clean.png'
import { Button } from '@/components/ui'
import { useRef } from 'react'

interface WelcomeOverlayProps { displayName: string; onEnter: () => void; onSkip: () => void; onBack: () => void }
/** A single real choice; speaking and microphone access remain optional in the canvas. */
export function WelcomeOverlay({ displayName, onEnter, onSkip, onBack }: WelcomeOverlayProps) {
  useLocale()
  const dialog = useRef<HTMLDivElement>(null)
  const name = displayName.length > 12 ? `${displayName.slice(0, 12)}…` : displayName
  return <div ref={dialog} className="nilo-welcome-backdrop" role="dialog" aria-modal="true" aria-labelledby="nilo-welcome-title" onKeyDown={event => {
    if (event.key === 'Escape') { event.preventDefault(); onSkip(); return }
    if (event.key !== 'Tab') return
    const buttons = dialog.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')
    if (!buttons?.length) return
    const first = buttons[0], last = buttons[buttons.length - 1]
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
  }}>
    <motion.div className="nilo-welcome-card" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      <img src={authOtterCutout} alt="Nilo" draggable={false} className="nilo-welcome-character" />
      <div className="min-w-0">
        <p className="mb-2 text-sm font-semibold text-luma-teal-600">{t('嗨～')}{name}</p>
        <h1 id="nilo-welcome-title" className="font-brand text-2xl font-bold leading-snug text-luma-teal-900 sm:text-3xl">{t('今天想自己画，还是和我一起画？')}</h1>
        <p className="mt-3 text-sm leading-relaxed text-luma-muted">{t('我画好的小主意会先投给你看，你喜欢再留下。')}</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button variant="primary" size="lg" onClick={onEnter} autoFocus>{t('和 Nilo 一起画')}</Button>
          <Button variant="ghost" size="lg" onClick={onSkip}>{t('我自己画')}</Button>
        </div>
        <p className="mt-4 text-xs leading-relaxed text-luma-muted">{t('想聊天时再开麦，也可以一直用按钮和我交流。')}</p>
        <button type="button" className="mt-2 min-h-10 text-sm text-luma-teal-700" onClick={onBack}>← {t('回小屋')}</button>
      </div>
    </motion.div>
  </div>
}
