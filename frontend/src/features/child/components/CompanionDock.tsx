import { useState } from 'react'
import { t, useLocale } from '@/i18n'
import { niloCompanion } from '@/assets/avatars'
import type { useCompanion } from '../hooks/useCompanion'
import type { CompanionVoiceController } from '../hooks/useCompanionVoice'
import { MaterialPicker } from './MaterialPicker'

interface Props {
  companion: ReturnType<typeof useCompanion>
  voice: CompanionVoiceController
  mode: 'off' | 'together'
  visible: boolean
  enabled: boolean
  isDrawing: boolean
  onVisible: (visible: boolean) => void
  onInvite: () => void
}

/** All voice controls live in the bottom strip; no chat window or text input. */
export function CompanionDock({ companion, voice, visible, enabled, isDrawing, onVisible, onInvite }: Props) {
  const locale = useLocale()
  const [voiceSettings, setVoiceSettings] = useState(false)
  const projected = companion.projection?.tracing || companion.phase === 'projected' ? companion.projection : null
  const canEdit = enabled && !isDrawing && companion.phase === 'projected'
  const cancellable = voice.status === 'preparing' || voice.status === 'transcribing' || companion.phase === 'thinking' || (companion.phase === 'sketching' && !!companion.projection?.turn)
  const micLabel = cancellable ? '停止' : voice.status === 'listening' ? '说完了' : voice.status === 'speaking' ? '打断并说话' : '和 Nilo 说话'
  function microphone() {
    if (cancellable) { companion.interrupt(); voice.cancel() }
    else if (voice.status === 'listening') voice.stop()
    else voice.start()
  }
  const caption = voice.error ? t(voice.error)
    : voice.status === 'preparing' ? t('麦克风准备中，请稍等…')
      : voice.status === 'listening' ? t('我在听，点一下说完。')
      : voice.status === 'transcribing' ? t('正在听懂你的话…')
        : t(companion.message)
  const inviteLabel = visible ? 'Nilo，你来画' : '显示 Nilo'

  return <div className="nilo-footer-companion" role="group" aria-label={t('Nilo 与声音')}>
    {companion.materialPicker && <MaterialPicker subjects={companion.materialPicker.subjects} initialSubject={companion.materialPicker.subject}
      currentMaterialId={companion.projection?.proposal.illustrationId ?? companion.projection?.proposal.recipeId} busy={companion.materialPicker.busy} error={companion.materialPicker.error}
      onChoose={id => { void companion.chooseMaterial(id) }} onClose={companion.closeMaterialPicker} />}
    {visible && !isDrawing && caption && <p className="nilo-bottom-caption" role="status" title={caption}>{caption}</p>}
    {visible && companion.objectChoices && <div className="nilo-object-choices" role="group" aria-label={t('选择要修改的作品')}>
      {companion.objectChoices.objects.map((object,index)=><button type="button" key={object.id} onClick={()=>companion.chooseObject(object.id)}>{index+1}. {t(object.name)}</button>)}
      <button type="button" onClick={()=>companion.cancel()} aria-label={t('取消')}>×</button>
    </div>}
    <div className="nilo-footer-icons">
      {projected && <div className="nilo-bottom-projection" role="group" aria-label={t(projected.tracing ? '描摹底图' : '决定这个小主意')}>
        {!projected.tracing && <button type="button" disabled={!canEdit} className="nilo-dock-button bg-luma-teal-700 !text-white" onClick={() => { voice.cancel(); companion.accept({ speak: false }) }}>{t(projected.deleting ? '确认移除' : projected.editTargetId ? '确认修改' : '留下来')}</button>}
        <button type="button" disabled={!canEdit} className="nilo-footer-action nilo-guide-action" onClick={() => { voice.cancel(); void companion.openMaterialPicker() }} aria-label={locale === 'en' ? 'Choose another' : '换一个'} title={locale === 'en' ? 'Look at pictures and choose a drawing' : '看看图片，挑一个画法'}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 10a8 8 0 0 0-14-4L3 9m0-5v5h5M4 14a8 8 0 0 0 14 4l3-3m0 5v-5h-5" /></svg><span>{locale === 'en' ? 'Choose another' : '换一个'}</span>
        </button>
        <button type="button" className="nilo-footer-action nilo-guide-action" disabled={!enabled || isDrawing} onClick={() => { voice.cancel(); companion.dismiss({ speak: false }) }} aria-label={t('清除底图')} title={t('清除底图')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="4" strokeDasharray="3 3" /><path d="m9 9 6 6m0-6-6 6" /></svg><span>{t('清除底图')}</span>
        </button>
      </div>}
      {!projected && <button type="button" data-onboarding="canvas-nilo" className="nilo-footer-avatar" aria-label={t(inviteLabel)} title={t(inviteLabel)} disabled={visible && (!enabled || isDrawing || companion.phase !== 'idle')} onClick={() => {
        if (!visible) { onVisible(true); return }
        voice.cancel(); onInvite()
      }}><img src={niloCompanion} alt="" draggable={false} className="nilo-invite-image" /><span className="nilo-invite-label">{t(companion.phase === 'thinking' ? '看画中…' : companion.projection?.turn ? '接画中…' : '轮到 Nilo')}</span></button>}
      {visible && <>
        {!projected && <button type="button" className="nilo-footer-mic" disabled={!enabled || isDrawing || companion.phase!=='idle'} onClick={()=>{voice.cancel();companion.openObjects()}} aria-label={t('修改 Nilo 的作品')} title={t('修改 Nilo 的作品')}>✎</button>}
        <button type="button" className="nilo-footer-mic nilo-talk-button" aria-label={t(micLabel)} title={t(micLabel)} aria-pressed={voice.status === 'listening'} disabled={!enabled} onClick={microphone}>
          {cancellable ? <span aria-hidden="true">■</span> : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-5" aria-hidden="true"><rect x="9" y="3" width="6" height="12" rx="3" /><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8" /></svg>}
        </button>
        <button type="button" className="nilo-footer-mic" onClick={() => setVoiceSettings(value => !value)} aria-expanded={voiceSettings} aria-label={t('声音选项')} title={t('声音选项')}>···</button>
        {voiceSettings && <div className="nilo-voice-options" role="group" aria-label={t('声音选项')}>
        <button type="button" className="nilo-footer-mic" onClick={voice.toggleSound} aria-pressed={voice.soundOn} aria-label={t(voice.soundOn ? '关闭 Nilo 声音' : '开启 Nilo 声音')} title={t(voice.soundOn ? '关闭 Nilo 声音' : '开启 Nilo 声音')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-5" aria-hidden="true"><path d="m11 4-6 5H2v6h3l6 5V4Z" />{voice.soundOn ? <path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" /> : <path d="m16 9 6 6m0-6-6 6" />}</svg>
        </button>
        <button type="button" className="nilo-footer-mic" onClick={() => voice.setContinuous(!voice.continuous)} disabled={!enabled || !voice.voiceReady || !voice.supported} aria-pressed={voice.continuous} aria-label={t(voice.continuous ? '结束连续对话' : '开启连续对话')} title={t(voice.continuous ? '结束连续对话' : '开启连续对话')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-5" aria-hidden="true"><path d="M19 7H7a4 4 0 0 0-4 4m16-4-4-4m4 4-4 4M5 17h12a4 4 0 0 0 4-4M5 17l4 4m-4-4 4-4" /></svg>
        </button>
        </div>}
      </>}
    </div>
  </div>
}
