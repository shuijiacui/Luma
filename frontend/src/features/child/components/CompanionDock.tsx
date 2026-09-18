import { useState } from 'react'
import { t, useLocale } from '@/i18n'
import { niloCompanion } from '@/assets/avatars'
import type { useCompanion } from '../hooks/useCompanion'
import type { CompanionVoiceController } from '../hooks/useCompanionVoice'

interface Props {
  companion: ReturnType<typeof useCompanion>
  voice: CompanionVoiceController
  mode: 'off' | 'together'
  visible: boolean
  enabled: boolean
  isDrawing: boolean
  niloCount: number
  onUndoNilo: () => void
  onVisible: (visible: boolean) => void
}

/** All voice controls live in the bottom strip; no chat window or text input. */
export function CompanionDock({ companion, voice, mode, visible, enabled, isDrawing, niloCount, onUndoNilo, onVisible }: Props) {
  useLocale()
  const [editing, setEditing] = useState(false)
  const [voiceTurn, setVoiceTurn] = useState(false)
  const projected = companion.phase === 'projected' ? companion.projection : null
  const cancellable = voice.status === 'transcribing' || companion.phase === 'thinking'
  const micLabel = cancellable ? '停止' : voice.status === 'listening' ? '说完了' : voice.status === 'speaking' ? '打断并说话' : '和 Nilo 说话'
  function microphone() {
    setVoiceTurn(true)
    if (cancellable) { companion.cancel(); voice.cancel() }
    else if (voice.status === 'listening') voice.stop()
    else voice.start()
  }
  const caption = voice.error ? t(voice.error)
    : voice.status === 'listening' ? t('我在听，点一下说完。')
      : voice.status === 'transcribing' ? t('正在听懂你的话…')
        : [voiceTurn && voice.transcript && `${t('你说：')}${voice.transcript}`, t(companion.message)].filter(Boolean).join(' · ')
  const inviteLabel = visible ? 'Nilo，你来画' : '显示 Nilo'

  return <div className="nilo-footer-companion" role="group" aria-label={t('Nilo 与声音')}>
    {visible && !isDrawing && caption && <p className="nilo-bottom-caption" role="status" title={caption}>{caption}</p>}
    <div className="nilo-footer-icons">
      {projected && <div className="nilo-bottom-projection" role="group" aria-label={t('决定这个小主意')}>
        <button type="button" className="nilo-dock-button bg-luma-teal-700 !text-white" onClick={() => { voice.cancel(); companion.accept({ speak: false }) }}>{t('留下来')}</button>
        <button type="button" className="nilo-footer-mic" onClick={() => { voice.cancel(); companion.alternative({ speak: false }) }} aria-label={t('换一个')} title={t('换一个')}>↻</button>
        <button type="button" className="nilo-footer-mic" onClick={() => { voice.cancel(); setEditing(value => !value) }} aria-expanded={editing} aria-label={t('调整')} title={t('调整')}>✎</button>
        <button type="button" className="nilo-footer-mic" onClick={() => { voice.cancel(); companion.dismiss({ speak: false }) }} aria-label={t('先不要')} title={t('先不要')}>×</button>
        {editing && <div className="nilo-bottom-edit" role="group" aria-label={t('调整投影')}>
          {([['left', '向左', '←'], ['right', '向右', '→'], ['up', '向上', '↑'], ['down', '向下', '↓'], ['smaller', '小一点', '−'], ['larger', '大一点', '+']] as const).map(([command, label, icon]) => <button type="button" key={command} aria-label={t(label)} title={t(label)} onClick={() => { voice.cancel(); companion.receive(command, { speak: false }) }}>{icon}</button>)}
          <input type="color" className="size-9" aria-label={t('投影颜色')} value={projected.proposal.color} onChange={event => { voice.cancel(); companion.edit({ color: event.target.value }) }} />
        </div>}
      </div>}
      {!projected && <button type="button" data-onboarding="canvas-nilo" className="nilo-footer-avatar" aria-label={t(inviteLabel)} title={t(inviteLabel)} disabled={visible && (!enabled || mode !== 'together' || isDrawing || companion.phase !== 'idle')} onClick={() => {
        if (!visible) { onVisible(true); return }
        setVoiceTurn(false); voice.cancel(); void companion.ask(t('我画完这一笔了，轮到你啦。请接着我的画，添一组有关的小主意，多少由画面需要决定。'), true, { speak: false })
      }}><img src={niloCompanion} alt="" draggable={false} className="size-full object-cover" /></button>}
      {visible && <>
        <button type="button" className="nilo-footer-mic nilo-talk-button" aria-label={t(micLabel)} title={t(micLabel)} aria-pressed={voice.status === 'listening'} disabled={!enabled} onClick={microphone}>
          {cancellable ? <span aria-hidden="true">■</span> : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-5" aria-hidden="true"><rect x="9" y="3" width="6" height="12" rx="3" /><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8" /></svg>}
        </button>
        <button type="button" className="nilo-footer-mic" onClick={voice.toggleSound} aria-pressed={voice.soundOn} aria-label={t(voice.soundOn ? '关闭 Nilo 声音' : '开启 Nilo 声音')} title={t(voice.soundOn ? '关闭 Nilo 声音' : '开启 Nilo 声音')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-5" aria-hidden="true"><path d="m11 4-6 5H2v6h3l6 5V4Z" />{voice.soundOn ? <path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" /> : <path d="m16 9 6 6m0-6-6 6" />}</svg>
        </button>
        <button type="button" className="nilo-footer-mic" onClick={() => { setVoiceTurn(true); voice.setContinuous(!voice.continuous) }} disabled={!enabled || !voice.voiceReady || !voice.supported} aria-pressed={voice.continuous} aria-label={t(voice.continuous ? '结束连续对话' : '开启连续对话')} title={t(voice.continuous ? '结束连续对话' : '开启连续对话')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-5" aria-hidden="true"><path d="M19 7H7a4 4 0 0 0-4 4m16-4-4-4m4 4-4 4M5 17h12a4 4 0 0 0 4-4M5 17l4 4m-4-4 4-4" /></svg>
        </button>
        {niloCount > 0 && !projected && <button type="button" className="nilo-footer-mic" disabled={!enabled} onClick={onUndoNilo} aria-label={t('撤销 Nilo 的创作')} title={t('撤销 Nilo 的创作')}>↶</button>}
      </>}
    </div>
  </div>
}
