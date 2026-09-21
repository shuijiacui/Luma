import { t, useLocale } from '@/i18n'
import { LanguageSwitcher } from '@/i18n/LanguageSwitcher'
import { AnimatePresence } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Brand } from '@/components/brand'
import { useAuth } from '@/features/auth/AuthContext'
import { AvatarPicker } from '@/features/profile/components/AvatarPicker'
import { analyzeDrawing, type FeatureJSON } from '@/lib/api/lumaApi'
import { ApiError } from '@/lib/api/client'
import { randomId } from '@/lib/randomId'
import { clearChildDraft, getChildDraft, restoreChildArtwork, resumeChildDraft } from '../draft'
import { discardStoredDraft, persistChildDraft, readStoredDraft } from '../draftRecovery'
import { DraftRecovery } from '../components/DraftRecovery'
import { readArtwork, saveArtwork } from '../artworks'
import { getCanvasProvenance, type CanvasProvenance } from '../canvasDocument'
import { DrawingTools } from '../components/DrawingTools'
import { DrawingMusic } from '../components/DrawingMusic'
import type { BrushKind } from '../brushes'
import { DrawingCanvas, type DrawingCanvasHandle } from '../components/DrawingCanvas'
import { WelcomeOverlay } from '../components/WelcomeOverlay'
import { CompanionProjection } from '../components/CompanionProjection'
import { CompanionDock } from '../components/CompanionDock'
import { DrawingSurface } from '../components/DrawingSurface'
import { useCompanion } from '../hooks/useCompanion'
import { recordTurnOutcome } from '../companion/diagnostics'
import { useCompanionVoice } from '../hooks/useCompanionVoice'
import { hasWelcomed, markWelcomed, readMode, saveMemory, saveMode, localCommand } from '../companion/proposals'
import { readNiloVisible, saveNiloVisible } from '../niloCodraw'
import { useOnboardingTour } from '@/features/onboarding/useOnboardingTour'
import { useOnboarding } from '@/features/onboarding/OnboardingContext'
import { canvasSteps } from '@/features/onboarding/steps/childSteps'
import { DrawingGuide } from '../components/DrawingGuide'
import { WARMUP_SHAPES, type WarmupShapeId } from '../components/warmupShapes'
import '../styles/companion.css'

function saveErrorMessage(error: unknown) {
  if (error instanceof Error && /^(浏览器空间不足|这幅画已|画布还在准备|请先登录)/.test(error.message)) return error.message
  if (error instanceof ApiError) {
    if (error.status === 404 || error.status === 405 || error.status >= 500) return '保存服务暂时不可用，请保留画布，稍后再试或先下载。'
    if (error.status === 401) return '登录已过期，请先下载这幅画，再重新登录。'
    if (error.status === 413) return '这幅画太大了，请先下载保存。'
  }
  return '还没保存成功，请再试一次。'
}
export const LATEST_FEATURES_KEY = 'luma_latest_features'
export const LATEST_ANALYSIS_ID_KEY = 'luma_latest_analysis_id'

export function ChildCreatePage() {
  const { session } = useAuth()
  const [params] = useSearchParams()
  const artworkId = params.get('artwork')
  return <DraftRecoveryGate key={`${session?.id}:${artworkId ?? 'new'}`} owner={session?.id ?? 'guest-child'} artworkId={artworkId} />
}

function DraftRecoveryGate({ owner, artworkId }: { owner: string; artworkId: string | null }) {
  const [recovery] = useState(() => readStoredDraft(owner, artworkId))
  const [choice, setChoice] = useState<'continue' | 'discard' | null>(null)
  const [error, setError] = useState(false)
  if (recovery && !choice) return <DraftRecovery savedArtwork={!!artworkId} error={error}
    onContinue={() => { resumeChildDraft(owner, recovery); setChoice('continue') }}
    onDiscard={() => {
      if (!discardStoredDraft(owner, artworkId)) { setError(true); return }
      clearChildDraft(); setChoice('discard')
    }} />
  if (choice === 'continue') return <ChildDrawingEditor draftSlot={artworkId} />
  return <ArtworkLoader artworkId={artworkId} />
}

function ArtworkLoader({ artworkId }: { artworkId: string | null }) {
  useLocale()
  const { session } = useAuth()
  const navigate = useNavigate()
  const [ready, setReady] = useState(!artworkId)
  const [error, setError] = useState(false)
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    if (!artworkId || ready) return
    let cancelled = false
    setError(false)
    readArtwork(session, artworkId).then(artwork => {
      if (cancelled) return
      restoreChildArtwork(session?.id ?? 'guest-child', artwork)
      setReady(true)
    }).catch(() => { if (!cancelled) setError(true) })
    return () => { cancelled = true }
  }, [artworkId, session, retry, ready])
  if (!ready) return <main className="flex min-h-screen flex-col items-center justify-center gap-5 bg-luma-ivory-50 text-luma-teal-900"><p role={error ? 'alert' : 'status'}>{t(error ? '这幅画暂时没打开，再试一次吧。' : '正在打开你的画…')}</p>{error && <button type="button" className="min-h-12 rounded-xl bg-white px-6" onClick={() => setRetry(value => value + 1)}>{t('重试')}</button>}<button type="button" className="min-h-12 rounded-xl bg-white px-6" onClick={() => navigate('/child/history')}>{t('返回小画册')}</button></main>
  return <ChildDrawingEditor draftSlot={artworkId} />
}

function ChildDrawingEditor({ draftSlot }: { draftSlot: string | null }) {
  const locale = useLocale()
  const navigate = useNavigate()
  const { session } = useAuth()
  const ownerId = session?.id ?? 'guest-child'
  const draft = getChildDraft(ownerId)
  const mounted = useRef(true)
  const canvasRef = useRef<DrawingCanvasHandle>(null)
  const paperRef = useRef<HTMLDivElement>(null)
  const [color, setColor] = useState(draft.color)
  const [brushSize, setBrushSize] = useState(draft.brushSize)
  const [brushKind, setBrushKind] = useState<BrushKind>(draft.brushKind)
  const [isEraser, setIsEraser] = useState(draft.isEraser)
  const [mode, setMode] = useState(() => readMode(ownerId))
  const [niloVisible, setNiloVisible] = useState(readNiloVisible)
  const [, setCanvasVersion] = useState(0)
  const [features, setFeatures] = useState<FeatureJSON | null>(draft.features)
  const submission = useRef<{ image: string; key: string; provenance?: CanvasProvenance } | null>(draft.submission ?? null)
  const [analysis, setAnalysis] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [isDrawing, setIsDrawing] = useState(false)
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [draftError, setDraftError] = useState(false)
  const [showWelcome, setShowWelcome] = useState(() => !hasWelcomed(ownerId) && !draft.artworkId && !draft.canvas.document?.operations.length && !draft.canvas.history.some(Boolean))
  const [moreOpen, setMoreOpen] = useState(false)
  const [shapeId, setShapeId] = useState<WarmupShapeId | null>(null)
  const startCanvasTour = useOnboardingTour('canvas', 'child')
  const { completeInteraction, active: tourActive } = useOnboarding()
  const busy = saving || analysis === 'loading'
  const companionEnabled = !showWelcome && niloVisible && !busy && !tourActive
  const speakRef = useRef<(message: string) => void>(() => {})
  const voiceCancelRef = useRef<() => void>(() => {})
  const inviteAfterModeChange = useRef(false)
  const companion = useCompanion({
    ownerId, artworkId: draft.artworkId, token: session?.token, locale,
    enabled: companionEnabled, allowDrawing: mode === 'together', canvas: canvasRef,
    aspect: () => { const rect = paperRef.current?.getBoundingClientRect(); return rect?.height ? rect.width / rect.height : 1 },
    surfaceSize: () => { const rect = paperRef.current?.getBoundingClientRect(); return { width: rect?.width ?? 0, height: rect?.height ?? 0 } },
    drawingStyle: () => {
      const recent = canvasRef.current?.getLastDrawingStyle()
      return recent ? { brushKind: recent.brushKind, color: recent.color, brushSize: Math.max(1, Math.min(32, recent.size)) } : { brushKind, color, brushSize }
    },
    onSpeak: message => speakRef.current(message),
    onUnavailable: () => voiceCancelRef.current(),
    onCommitted: invalidateDrawing,
  })
  const voice = useCompanionVoice({ ownerId, token: session?.token, locale, enabled: companionEnabled,
    drawingContext: { theme: companion.memory.theme, subjects: companion.memory.recentSubjects }, onTranscript: text => {
    if (localCommand(text) === 'stop') { companion.cancel(); voiceCancelRef.current() }
    else companion.receive(text)
  } })
  speakRef.current = voice.speak
  voiceCancelRef.current = voice.cancel
  useEffect(() => {
    if (!inviteAfterModeChange.current || mode !== 'together' || !companionEnabled || companion.phase !== 'idle') return
    inviteAfterModeChange.current = false
    void companion.takeTurn()
  }, [mode, companionEnabled, companion.phase, companion.takeTurn])
  useEffect(() => { mounted.current = true; refreshCanvasVersion(); return () => { mounted.current = false } }, [])
  useEffect(() => {
    draft.color = color; draft.features = features; draft.brushSize = brushSize
    draft.brushKind = brushKind; draft.isEraser = isEraser
    setDraftError(!persistChildDraft(ownerId, draftSlot, draft))
  }, [draft, ownerId, draftSlot, color, features, brushSize, brushKind, isEraser])
  useEffect(() => {
    const flush = () => {
      canvasRef.current?.flushDraft()
      return persistChildDraft(ownerId, draftSlot, draft)
    }
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!flush()) { event.preventDefault(); event.returnValue = '' }
    }
    const visibility = () => { if (document.visibilityState === 'hidden') flush() }
    window.addEventListener('beforeunload', beforeUnload)
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', visibility)
    return () => {
      window.removeEventListener('beforeunload', beforeUnload)
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', visibility)
      flush()
    }
  }, [draft, ownerId, draftSlot])
  const cancelProjection = companion.cancel
  useEffect(() => {
    const paper = paperRef.current
    if (!paper) return
    let previous = paper.getBoundingClientRect()
    const observer = new ResizeObserver(() => {
      const next = paper.getBoundingClientRect()
      if (previous.width > 0 && previous.height > 0 && (Math.abs(next.width - previous.width) > 1 || Math.abs(next.height - previous.height) > 1)) {
        cancelProjection(); voiceCancelRef.current()
      }
      previous = next
    })
    observer.observe(paper)
    return () => observer.disconnect()
  }, [cancelProjection])

  function refreshCanvasVersion() { setCanvasVersion(version => version + 1) }
  function invalidateDrawing() {
    refreshCanvasVersion(); setSaveMessage(null); setAnalysis('idle'); setFeatures(null)
    submission.current = null; draft.submission = undefined
    setDraftError(!persistChildDraft(ownerId, draftSlot, draft))
  }
  function handleStrokeStart() {
    setIsDrawing(true)
    // Recording may continue while the child draws; only stale visual proposals are cancelled.
    companion.cancel()
    if (voice.status === 'preparing' || voice.status === 'speaking' || voice.status === 'transcribing') voice.cancel()
  }
  function handleStrokeComplete() {
    setIsDrawing(false); completeInteraction('canvas-stroke'); invalidateDrawing()
  }
  function undoLastStroke() {
    const hasTemporaryDrawing = !!companion.projection
    companion.cancel(); voice.cancel()
    // The visible in-progress/preview drawing is the latest action. Removing
    // that layer must not also remove an earlier committed child contribution.
    if (hasTemporaryDrawing) return
    const owner = canvasRef.current?.getDocument().operations.at(-1)?.owner
    if (canvasRef.current?.undo()) {
      if (owner === 'nilo') recordTurnOutcome('nilo_undone')
      invalidateDrawing()
    }
  }
  function changeMode(next: 'off' | 'together') {
    companion.cancel(); voice.cancel(); setMode(next); saveMode(ownerId, next)
    if (next === 'together') { setNiloVisible(true); saveNiloVisible(true) }
  }
  function inviteNilo() {
    if (mode === 'together') { void companion.takeTurn(); return }
    inviteAfterModeChange.current = true
    changeMode('together')
  }
  function enter(next: 'off' | 'together') { changeMode(next); markWelcomed(ownerId); setShowWelcome(false) }
  function changeNiloVisible(next: boolean) {
    companion.cancel(); voice.cancel(); setNiloVisible(next); saveNiloVisible(next)
  }
  function handleNextShape() {
    const index = shapeId ? WARMUP_SHAPES.findIndex(shape => shape.id === shapeId) : -1
    setShapeId(WARMUP_SHAPES[(index + 1) % WARMUP_SHAPES.length].id)
  }
  async function persistDrawing() {
    const canvas = canvasRef.current, snapshot = canvas?.exportSnapshot()
    if (!canvas || !snapshot) throw new Error('画布还在准备，请稍后再点保存。')
    draft.artworkId ??= randomId()
    const result = await saveArtwork(session, draft.artworkId, draft.artworkRevision ?? 0, snapshot, canvas.getDocument())
    draft.artworkRevision = result.revision; draft.savedSnapshot = snapshot
    setDraftError(!persistChildDraft(ownerId, draftSlot, draft))
    saveMemory(ownerId, draft.artworkId, companion.memory)
    if (mounted.current) setSaveMessage('已保存到历史图画，下次还能继续画')
  }
  async function handleSave() {
    if (savingRef.current || analysis === 'loading') return
    companion.finishTurn()
    companion.cancel(); voice.cancel(); savingRef.current = true; setSaving(true); setSaveMessage(null)
    try { await persistDrawing() }
    catch (error) { if (mounted.current) setSaveMessage(saveErrorMessage(error)) }
    finally { savingRef.current = false; if (mounted.current) setSaving(false) }
  }
  async function handleFinish() {
    const canvas = canvasRef.current
    if (!canvas || analysis === 'loading' || savingRef.current) return
    companion.finishTurn()
    const provenance = getCanvasProvenance(canvas.getDocument())
    const imageBase64 = canvas.exportChildImage()
    companion.cancel(); voice.cancel(); savingRef.current = true; setSaving(true); setSaveMessage(null)
    try { await persistDrawing() }
    catch (error) { if (mounted.current) setSaveMessage(saveErrorMessage(error)); return }
    finally { savingRef.current = false; if (mounted.current) setSaving(false) }
    if (!mounted.current) return
    if (!imageBase64 || provenance === 'unknown') {
      setSaveMessage('画已保存。这幅旧画没有笔迹来源记录，暂不生成成长分析。'); return
    }
    setAnalysis('loading')
    try {
      if (submission.current?.image !== imageBase64 || submission.current?.provenance !== provenance) submission.current = { image: imageBase64, key: randomId(), provenance }
      draft.submission = submission.current
      const result = await analyzeDrawing(imageBase64, null, session?.token, submission.current.key, provenance,
        session?.token ? { artworkId: draft.artworkId, revision: draft.artworkRevision }
          : { displayImageBase64: canvas.exportImage() ?? undefined })
      if (!mounted.current) return
      if (session?.token && !result.analysisId) throw new Error('作品尚未保存')
      setFeatures(result.features)
      window.sessionStorage.setItem(LATEST_FEATURES_KEY, JSON.stringify(result.features))
      if (result.analysisId) window.sessionStorage.setItem(LATEST_ANALYSIS_ID_KEY, result.analysisId)
      else window.sessionStorage.removeItem(LATEST_ANALYSIS_ID_KEY)
      setAnalysis('done')
      companion.say(locale === 'en' && result.feedbackTextEn ? `${result.feedbackTextEn} ${result.followUpEn ?? ''}` : `${result.feedbackText}。${result.followUp}`, false)
    } catch {
      if (mounted.current) { setAnalysis('error'); setSaveMessage('画已经保存好啦！Nilo 暂时没法回应，之后再来聊聊吧。') }
    }
  }
  const currentShapeLabel = WARMUP_SHAPES.find(shape => shape.id === shapeId)?.label ?? '自由画'
  const projected = (companion.phase === 'projected' || companion.projection?.turn) && companion.projection

  return <main className="luma-child-create-shell relative flex min-h-screen flex-col overflow-hidden bg-luma-teal-50">
    <div className="flex min-h-0 flex-1 flex-col" inert={showWelcome}>
      <header className="nilo-create-header relative z-40 flex flex-wrap items-center justify-between border-b border-white/80 bg-luma-ivory-50/85 px-4 backdrop-blur-xl sm:px-6">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => navigate('/child/demo')} className="nilo-dock-button" aria-label={t('返回儿童创作空间')}>← {t('返回')}</button>
          <button type="button" onClick={() => navigate('/child/demo')} className="nilo-header-brand hidden rounded-xl sm:block" aria-label={t('返回儿童空间')}><Brand size="sm" /></button>
        </div>
        <div className="nilo-mode-toggle" role="group" aria-label={t('Nilo 陪伴')}>
          {([['off', '我自己画'], ['together', '和 Nilo 一起画']] as const).map(([value, label]) => <button type="button" key={value} aria-pressed={mode === value} disabled={busy} onClick={() => changeMode(value)}>{t(label)}</button>)}
        </div>
        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <DrawingMusic />
          <div className="nilo-header-extras">
            <button type="button" className="nilo-header-more nilo-dock-button" aria-label={t('更多操作')} aria-expanded={moreOpen} onClick={() => setMoreOpen(value => !value)}>···</button>
            <div className="nilo-header-extra-controls" data-open={moreOpen}>
              <button type="button" disabled={busy} onClick={() => { setMoreOpen(false); companion.cancel(); voice.cancel(); startCanvasTour(canvasSteps, true) }} className="nilo-dock-button" aria-label={t('怎么玩')}>?</button>
              <button type="button" disabled={busy} onClick={() => navigate('/child/history')} className="nilo-dock-button">{t('历史图画')}</button>
              <button type="button" disabled={busy} onClick={() => { setMoreOpen(false); canvasRef.current?.download() }} className="nilo-dock-button">{t('下载')}</button>
            </div>
          </div>
          <LanguageSwitcher /><AvatarPicker userId={ownerId} compact />
        </div>
      </header>
      <DrawingTools color={color} brushKind={brushKind} brushSize={brushSize} isEraser={isEraser} disabled={busy} shapeLabel={currentShapeLabel}
        onColor={value => { setColor(value); setIsEraser(false) }} onBrush={value => { setBrushKind(value); setIsEraser(false) }}
        onSize={setBrushSize} onEraser={() => setIsEraser(value => !value)} onNextShape={handleNextShape} onClearShape={() => setShapeId(null)}
        onUndo={undoLastStroke} onClear={() => { companion.cancel(); voice.cancel(); canvasRef.current?.clear(); invalidateDrawing() }} onSave={handleSave} onFinish={handleFinish}
        footerAddon={<CompanionDock companion={companion} voice={voice} mode={mode} visible={niloVisible} enabled={companionEnabled} isDrawing={isDrawing} onVisible={changeNiloVisible} onInvite={inviteNilo} />}>
        <section className="relative flex min-h-0 min-w-0 w-full flex-1">
          {draftError && <p role="alert" className="absolute bottom-3 left-3 right-3 z-30 mx-auto w-fit rounded-xl bg-white/95 px-4 py-2 text-sm text-red-700">{t('草稿暂存失败，请先保存或下载，再刷新页面。')}</p>}
          {(busy || saveMessage) && <p role="status" className="pointer-events-none absolute top-3 right-3 left-3 z-30 mx-auto w-fit max-w-[90%] rounded-2xl bg-luma-teal-50/95 px-4 py-2 text-center text-sm font-bold text-luma-teal-800 shadow-luma-sm">{t(saving ? '正在保存图画…' : analysis === 'loading' ? 'Nilo 正在仔细看你的画…' : saveMessage!)}</p>}
          <div data-onboarding="canvas-paper" className="relative mx-auto flex min-h-0 min-w-0 w-full flex-col">
            <DrawingSurface surfaceRef={paperRef} document={draft.canvas.document} onReady={refreshCanvasVersion}>
              <DrawingCanvas draft={draft.canvas} disabled={busy} ref={canvasRef} color={color} brushSize={brushSize} brushKind={brushKind} isEraser={isEraser} onStrokeComplete={handleStrokeComplete} onStrokeStart={handleStrokeStart} />
              <DrawingGuide shapeId={shapeId} />
              {projected && <CompanionProjection proposal={projected.proposal} additions={projected.additions} aspect={projected.aspect} turnDuration={projected.turn ? projected.durationMs : undefined} />}
            </DrawingSurface>
          </div>
        </section>
      </DrawingTools>
    </div>
    <AnimatePresence>{showWelcome && <WelcomeOverlay displayName={session?.displayName ?? '小朋友'} onEnter={() => enter('together')} onSkip={() => enter('off')} onBack={() => navigate('/child/demo')} />}</AnimatePresence>
  </main>
}
