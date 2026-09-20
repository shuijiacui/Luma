import { useRef } from 'react'
import { t, useLocale } from '@/i18n'
import { Button } from '@/components/ui'

export function DraftRecovery({ savedArtwork, error, onContinue, onDiscard }: {
  savedArtwork: boolean; error: boolean; onContinue: () => void; onDiscard: () => void
}) {
  useLocale()
  const dialog = useRef<HTMLDivElement>(null)
  return <main className="min-h-screen bg-luma-teal-50">
    <div ref={dialog} className="nilo-welcome-backdrop" role="dialog" aria-modal="true" aria-labelledby="draft-recovery-title" aria-describedby="draft-recovery-description"
      onKeyDown={event => {
        if (event.key !== 'Tab') return
        const buttons = dialog.current?.querySelectorAll<HTMLButtonElement>('button')
        if (!buttons?.length) return
        const first = buttons[0], last = buttons[buttons.length - 1]
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
      }}>
      <section className="w-full max-w-lg rounded-3xl bg-white p-7 shadow-luma-lg sm:p-10">
        <p className="mb-3 text-sm font-bold text-luma-teal-600">Nilo · {t('画布草稿')}</p>
        <h1 id="draft-recovery-title" className="text-2xl font-bold text-luma-teal-900">{t('要接着上次的画继续吗？')}</h1>
        <p id="draft-recovery-description" className="mt-4 leading-relaxed text-luma-muted">{t('上次的画已在这个标签页暂存。你和 Nilo 的笔迹都还在。')}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button autoFocus size="lg" onClick={onContinue}>{t('继续上次画布')}</Button>
          <Button variant="ghost" size="lg" onClick={onDiscard}>{t(savedArtwork ? '打开已保存版本' : '重新开始')}</Button>
        </div>
        <p className="mt-4 text-xs leading-relaxed text-luma-muted">{t(savedArtwork ? '打开已保存版本会放弃这次尚未保存的修改。' : '重新开始会清除这份草稿，已保存的图画不受影响。')}</p>
        {error && <p role="alert" className="mt-4 text-sm text-red-700">{t('暂时无法清除草稿，请先继续画布。')}</p>}
      </section>
    </div>
  </main>
}
