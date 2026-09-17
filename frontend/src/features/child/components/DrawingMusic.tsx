import { useEffect, useId, useRef, useState } from 'react'
import { t, useLocale } from '@/i18n'
import { useDrawingMusic } from '../hooks/useDrawingMusic'
import { musicTracks } from '../musicTracks'

export function DrawingMusic() {
  useLocale()
  const music = useDrawingMusic()
  const [expanded, setExpanded] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const settingsButton = useRef<HTMLButtonElement>(null)
  const id = useId()
  useEffect(() => {
    if (!expanded) return
    function outside(event: PointerEvent) {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setExpanded(false)
    }
    function escape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      setExpanded(false)
      settingsButton.current?.focus()
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', escape)
    }
  }, [expanded])

  return <div ref={root} data-onboarding="canvas-music" className="relative flex items-center rounded-xl border border-luma-teal-100 bg-white/80 text-luma-teal-700">
    <button type="button" onClick={music.toggle} aria-pressed={music.status !== 'off'}
      aria-label={t(music.status === 'off' ? '开启背景音乐' : '关闭背景音乐')}
      className="inline-flex min-h-10 items-center gap-1.5 rounded-l-xl px-2.5 text-sm font-bold outline-none hover:bg-luma-teal-50 focus-visible:ring-3 focus-visible:ring-luma-gold-300/60">
      <svg viewBox="0 0 20 20" fill="none" className="size-4 shrink-0" aria-hidden="true"><path d="M8 14V5l8-2v9M8 7l8-2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /><ellipse cx="5.5" cy="14.5" rx="2.5" ry="2" fill="currentColor" /><ellipse cx="13.5" cy="12.5" rx="2.5" ry="2" fill="currentColor" /></svg>
      {t(music.status === 'off' ? '音乐：关' : music.status === 'loading' ? '音乐：加载中' : '音乐：开')}
    </button>
    <button ref={settingsButton} type="button" onClick={() => setExpanded(value => !value)} aria-label={t('选择音乐和音量')} aria-expanded={expanded} aria-controls={`${id}-panel`}
      className="flex min-h-10 min-w-10 items-center justify-center rounded-r-xl border-l border-luma-teal-100 outline-none hover:bg-luma-teal-50 focus-visible:ring-3 focus-visible:ring-luma-gold-300/60">
      <svg viewBox="0 0 20 20" fill="none" className="size-4" aria-hidden="true"><path d="m5 8 5 5 5-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </button>
    {(expanded || music.error) && <div id={`${id}-panel`} className="absolute top-full right-0 z-40 mt-2 w-64 max-w-[90vw] rounded-2xl border border-luma-teal-100 bg-white p-4 shadow-luma-md">
      {expanded && <>
        <label htmlFor={`${id}-track`} className="mb-2 block text-sm font-bold">{t('选择背景音乐')}</label>
        <select id={`${id}-track`} value={music.trackId} onChange={event => music.selectTrack(event.target.value)} className="min-h-11 w-full rounded-xl border border-luma-teal-100 bg-luma-teal-50 px-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-luma-gold-300/60">
          {musicTracks.map(track => <option key={track.id} value={track.id}>{t(track.label)} · {t(track.mood)}</option>)}
        </select>
        <label htmlFor={`${id}-volume`} className="mt-4 mb-2 flex justify-between text-sm font-bold"><span>{t('音乐音量')}</span><span>{music.volume}%</span></label>
        <input id={`${id}-volume`} type="range" min="0" max="100" value={music.volume} onChange={event => music.changeVolume(Number(event.target.value))} className="min-h-8 w-full accent-luma-teal-600" />
        <p className="mt-2 text-xs leading-relaxed text-luma-muted">{t('选一首喜欢的，轻轻陪你画画。')}</p>
      </>}
      {music.error && <p role="status" className="text-sm leading-relaxed">{t('音乐暂时没播放成功，点开启再试一次吧。')}</p>}
    </div>}
  </div>
}
