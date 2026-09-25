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
  selection?: { active: boolean; count: number; onToggle: () => void; onClear: () => void; onComplete?: () => void }
}

/** All voice controls live in the bottom strip; no chat window or text input. */
export function CompanionDock({ companion, voice, mode, visible, enabled, isDrawing, onVisible, onInvite, selection }: Props) {
  const locale = useLocale()
  const canCoCreate = enabled && mode === 'together'
  const drawingOnlyTitle = mode === 'off' ? t('切换到“和 Nilo 一起画”后使用') : undefined
  const projected = companion.projection?.tracing || companion.phase === 'projected' ? companion.projection : null
  const canEdit = canCoCreate && !isDrawing && companion.phase === 'projected'
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
    {selection?.active ? <p className="nilo-selection-hint" role="status">{t(selection.count ? '圈住可以补选，点笔迹可以取消。选好后点“选好了”。' : '圈住或点一下想修改的笔迹，再点“选好了”。')}</p>
      : visible && !isDrawing && caption && <p className="nilo-bottom-caption" role="status" title={caption}>{caption}</p>}
    {visible && companion.objectChoices && <div className="nilo-object-choices" role="group" aria-label={t('选择要修改的作品')}>
      {companion.objectChoices.objects.map((object,index)=><button type="button" key={object.id} onClick={()=>{companion.chooseObject(object.id);selection?.onComplete?.()}}>{index+1}. {t(object.name)}</button>)}
      <button type="button" onClick={()=>companion.cancel()} aria-label={t('取消')}>×</button>
    </div>}
    <div className="nilo-footer-icons">
      {selection && <div className="nilo-selection-controls" role="group" aria-label={t('选择画作内容')}>
        <button type="button" className="nilo-dock-button nilo-selection-toggle" aria-pressed={selection.active} disabled={!canCoCreate || isDrawing} onClick={selection.onToggle}
          aria-label={t(selection.active ? '选好了' : selection.count ? '调整选区' : '圈选修改')} title={drawingOnlyTitle ?? t(selection.active ? '选好了' : selection.count ? '调整选区' : '圈选修改')}>
          {selection.active ? '✓' : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M8 19c-4-1-6-4-5-8S8 4 13 4s8 3 8 7-5 6-10 6-7 2-5 4c1 2 5 0 4-3" strokeDasharray="3 2" strokeLinecap="round" /></svg>}
          <span>{t(selection.active ? '选好了' : '圈选')}</span>
        </button>
        {selection.count > 0 && <button type="button" className="nilo-footer-mic" disabled={!canCoCreate || isDrawing} onClick={selection.onClear} aria-label={t('取消选中')} title={drawingOnlyTitle ?? t('取消选中')}>×</button>}
      </div>}
      {projected && !selection?.active && <div className="nilo-bottom-projection" role="group" aria-label={t(projected.tracing ? '描摹底图' : '决定这个小主意')}>
        <button type="button" disabled={!canEdit} className="nilo-footer-action nilo-guide-action" onClick={() => { voice.cancel(); void companion.openMaterialPicker() }} aria-label={locale === 'en' ? 'Choose another' : '换一个'} title={locale === 'en' ? 'Look at pictures and choose a drawing' : '看看图片，挑一个画法'}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 10a8 8 0 0 0-14-4L3 9m0-5v5h5M4 14a8 8 0 0 0 14 4l3-3m0 5v-5h-5" /></svg><span>{locale === 'en' ? 'Choose another' : '换一个'}</span>
        </button>
        <button type="button" className="nilo-footer-action nilo-guide-action" disabled={!canCoCreate || isDrawing} onClick={() => { voice.cancel(); companion.dismiss({ speak: false }) }} aria-label={t('清除底图')} title={drawingOnlyTitle ?? t('清除底图')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="4" strokeDasharray="3 3" /><path d="m9 9 6 6m0-6-6 6" /></svg><span>{t('清除底图')}</span>
        </button>
      </div>}
      {!projected && <button type="button" data-onboarding="canvas-nilo" className="nilo-footer-avatar" aria-label={t(inviteLabel)} title={drawingOnlyTitle ?? t(inviteLabel)} disabled={mode === 'off' || isDrawing || (visible && (!enabled || companion.phase !== 'idle'))} onClick={() => {
        if (!visible) { onVisible(true); return }
        voice.cancel(); onInvite()
      }}><img src={niloCompanion} alt="" draggable={false} className="nilo-invite-image" /><span className="nilo-invite-label">{t(companion.phase === 'thinking' ? '看画中…' : companion.projection?.turn ? '接画中…' : '轮到 Nilo')}</span></button>}
      {visible && <>
        {!projected && !selection && <button type="button" className="nilo-footer-mic" disabled={!canCoCreate || isDrawing || companion.phase!=='idle'} onClick={()=>{voice.cancel();companion.openObjects()}} aria-label={t('修改 Nilo 的作品')} title={drawingOnlyTitle ?? t('修改 Nilo 的作品')}>✎</button>}
        <button type="button" className="nilo-footer-action nilo-talk-button" aria-label={t(micLabel)} title={t(micLabel)} aria-pressed={voice.status === 'listening'} disabled={!enabled} onClick={microphone}>
          {cancellable ? <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2" /></svg> : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="9" y="3" width="6" height="12" rx="3" /><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8" /></svg>}
          <span>{t(cancellable ? '停止' : voice.status === 'listening' ? '说完了' : '说话')}</span>
        </button>
        <button type="button" className="nilo-footer-action" onClick={voice.toggleSound} aria-pressed={voice.soundOn} aria-label={t(voice.soundOn ? '关闭 Nilo 声音' : '开启 Nilo 声音')} title={t(voice.soundOn ? '关闭 Nilo 声音' : '开启 Nilo 声音')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-5" aria-hidden="true"><path d="m11 4-6 5H2v6h3l6 5V4Z" />{voice.soundOn ? <path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" /> : <path d="m16 9 6 6m0-6-6 6" />}</svg>
          <span>{t('声音')}</span>
        </button>
        <button type="button" className="nilo-footer-action nilo-continuous-button" onClick={() => voice.setContinuous(!voice.continuous)} disabled={!enabled || !voice.voiceReady || !voice.supported} aria-pressed={voice.continuous} aria-label={t(voice.continuous ? '结束连续对话' : '开启连续对话')} title={t(voice.continuous ? '结束连续对话' : '开启连续对话')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 15a8 8 0 1 0-14 3l-2 4 5-2a8 8 0 0 0 11-5Z" /><path d="M12 10c-1.7-2.5-4-2.5-4 0s2.3 2.5 4 0 4-2.5 4 0-2.3 2.5-4 0Z" /></svg>
          <span>{t('连续对话')}</span>
        </button>
      </>}
    </div>
  </div>
}
