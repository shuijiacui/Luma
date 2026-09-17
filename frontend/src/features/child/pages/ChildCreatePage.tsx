import { lt, t, useLocale } from '@/i18n'
import { LanguageSwitcher } from '@/i18n/LanguageSwitcher'
import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { getChildDraft, restoreChildArtwork } from '../draft'
import { readArtwork, saveArtwork } from '../artworks'
import { useNavigate, useSearchParams } from 'react-router-dom'

import { niloCompanion } from '@/assets/avatars'
import { Brand } from '@/components/brand'
import { motionTransition } from '@/design-system'
import { useAuth } from '@/features/auth/AuthContext'
import { AvatarPicker } from '@/features/profile/components/AvatarPicker'
import { analyzeDrawing, requestNiloPraise, type FeatureJSON } from '@/lib/api/lumaApi'
import { ApiError } from '@/lib/api/client'
import { cn } from '@/lib/cn'
import { DrawingTools } from '../components/DrawingTools'
import type { BrushKind } from '../brushes'
import {
  DrawingCanvas,
  type DrawingCanvasHandle,
} from '../components/DrawingCanvas'
import { useIdleEncouragement } from '../hooks/useIdleEncouragement'
import { useNiloCodraw } from '../hooks/useNiloCodraw'
import { readCodrawMode, readNiloVisible, saveCodrawMode, saveNiloVisible, type CodrawMode } from '../niloCodraw'
import { describeStrokeLocally, normalizePraise } from '../niloPraise'
import { WelcomeOverlay } from '../components/WelcomeOverlay'
import { useOnboardingTour } from '@/features/onboarding/useOnboardingTour'
import { useOnboarding } from '@/features/onboarding/OnboardingContext'
import { canvasSteps } from '@/features/onboarding/steps/childSteps'
import { DrawingGuide } from '../components/DrawingGuide'
import {
  WARMUP_SHAPES,
  type WarmupShapeId,
} from '../components/warmupShapes'

const niloSaveMessages = [
  '我会记住这幅画的。',
  '好喜欢这里的颜色！',
  '你今天画的这个，我会一直记着。',
  '保存好啦，它现在是你的了。',
  '我们一起完成了这幅画。',
]

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
  return <ArtworkLoader key={`${session?.id}:${artworkId ?? 'new'}`} artworkId={artworkId} />
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
  return <ChildDrawingEditor />
}

function ChildDrawingEditor() {
  const locale = useLocale()
  const navigate = useNavigate()
  const { session } = useAuth()
  const draft = getChildDraft(session?.id ?? 'guest-child')
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const canvasRef = useRef<DrawingCanvasHandle>(null)
  const [color, setColor] = useState(draft.color)
  const [brushSize, setBrushSize] = useState(draft.brushSize)
  const [brushKind, setBrushKind] = useState<BrushKind>(draft.brushKind)
  const [isEraser, setIsEraser] = useState(draft.isEraser)
  // Nilo 陪伴作画：off=保持原来的样子；turn=一人一笔；ask=停笔后询问
  const [codrawMode, setCodrawMode] = useState<CodrawMode>(() => readCodrawMode())
  const [codrawSpeech, setCodrawSpeech] = useState<string | null>(null)
  const [codrawAsk, setCodrawAsk] = useState(false)
  const [companionDrawn, setCompanionDrawn] = useState(false)
  // 两套撤销各自可撤销的笔数（孩子自己 / Nilo）
  const [undoCounts, setUndoCounts] = useState({ child: 0, nilo: 0 })
  // 右下角 Nilo 是否显示：隐藏后图标消失、也不再说话
  const [niloVisible, setNiloVisible] = useState(() => readNiloVisible())
  // 已画多少笔：给"看图夸奖"和建议做参考
  const strokeCountRef = useRef(0)
  const {
    line: idleLine,
    lineKind: idleLineKind,
    onStrokeStart: onIdleStrokeStart,
    onStrokeEnd: onIdleStrokeEnd,
    reset: resetEncouragement,
  } = useIdleEncouragement({
    enabled: codrawMode === 'off' && niloVisible,
    // 先本地看懂这一笔（波浪线→像小路），立刻有回应
    describe: () => describeStrokeLocally(canvasRef.current?.getLastStroke() ?? null, {
      strokes: strokeCountRef.current,
      inkGrid: canvasRef.current?.getInkGrid(4) ?? null,
    }),
    // 再让模型看图给更贴合画面的夸奖 + 下一步建议（慢/失败就保留本地那句）
    requestPraise: async () => {
      if (!niloVisible || codrawMode !== 'off') return null
      const snapshot = canvasRef.current?.exportSnapshot()
      if (!snapshot) return null
      const base64 = snapshot.includes(',') ? (snapshot.split(',')[1] ?? '') : snapshot
      try {
        const result = await requestNiloPraise(base64, {
          token: session?.token,
          strokes: strokeCountRef.current,
          lastStroke: canvasRef.current?.getLastStroke() ?? null,
          inkGrid: canvasRef.current?.getInkGrid(4) ?? null,
          signal: typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(9000) : undefined,
        })
        return normalizePraise(result.praise, result.suggestion)
      } catch {
        return null
      }
    },
  })

  const codraw = useNiloCodraw({
    mode: codrawMode,
    token: session?.token,
    getSnapshot: () => canvasRef.current?.exportSnapshot() ?? null,
    drawStroke: spec => canvasRef.current?.drawCompanionStroke(spec) ?? Promise.resolve(),
    getLastStroke: () => canvasRef.current?.getLastStroke() ?? null,
    getInkGrid: () => canvasRef.current?.getInkGrid(4) ?? null,
    onSpeech: setCodrawSpeech,
    onAsk: setCodrawAsk,
    onDrawn: () => { setCompanionDrawn(true); refreshUndoCounts() },
    silent: !niloVisible,
  })
  const [features, setFeatures] = useState<FeatureJSON | null>(draft.features)
  const submission = useRef<{ image: string; key: string } | null>(draft.submission ?? null)
  const [analysis, setAnalysis] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [serverBubble, setServerBubble] = useState<string | null>(null)
  const [serverBubbleEn, setServerBubbleEn] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  // 进入画板后先显示欢迎蒙版，蒙版盖在 My Creative Space 之上
  const [showWelcome, setShowWelcome] = useState(!draft.artworkId)
  const startCanvasTour = useOnboardingTour('canvas', 'child')
  const { completeInteraction } = useOnboarding()
  useEffect(() => {
    if (showWelcome) return
    const timer = window.setTimeout(() => startCanvasTour(canvasSteps), 450)
    return () => window.clearTimeout(timer)
  }, [showWelcome, startCanvasTour])
  // 欢迎询问阶段画板保持「清除图形」状态；点「好呀一起画」后才出现半圆
  const [shapeId, setShapeId] = useState<WarmupShapeId | null>(null)

  function refreshUndoCounts() {
    setUndoCounts(canvasRef.current?.getUndoCounts() ?? { child: 0, nilo: 0 })
  }

  function handleStrokeStart() {
    onIdleStrokeStart()
    codraw.onStrokeStart()
  }

  /** 撤销孩子自己的一笔（可连续点） */
  function undoChildStroke() {
    if (!canvasRef.current?.undo()) return
    codraw.reset()
    resetEncouragement()
    setCodrawSpeech(null)
    refreshUndoCounts()
  }

  /** 撤销 Nilo 的一笔（可连续点，与孩子的撤销互不影响） */
  function undoCompanionStroke() {
    if (!canvasRef.current?.undoCompanionStroke()) return
    // 撤销后先不要让 Nilo 立刻再画，等孩子下一次落笔再继续回合
    codraw.reset()
    setCodrawSpeech(null)
    refreshUndoCounts()
  }

  function handleStrokeComplete() {
    completeInteraction('canvas-stroke')
    strokeCountRef.current += 1
    refreshUndoCounts()
    setSaveMessage(null)
    setAnalysis('idle')
    setFeatures(null)
    setServerBubble(null)
    setServerBubbleEn(null)
    // 连续作画时保持安静：停笔一小会儿（空闲）才说一句
    onIdleStrokeEnd()
    // 共创回合：一人一笔 / 停笔询问
    codraw.onStrokeEnd()
  }
  useEffect(() => {
    draft.color = color; draft.features = features; draft.brushSize = brushSize
    draft.brushKind = brushKind; draft.isEraser = isEraser
  }, [draft, color, features, brushSize, brushKind, isEraser])

  function handleNextShape() {
    const baseIndex = shapeId
      ? WARMUP_SHAPES.findIndex((shape) => shape.id === shapeId)
      : -1
    setShapeId(WARMUP_SHAPES[(baseIndex + 1) % WARMUP_SHAPES.length].id)
  }

  function handleClearShape() {
    setShapeId(null)
  }

  async function persistDrawing() {
    const snapshot = canvasRef.current?.exportSnapshot()
    if (!snapshot) throw new Error('画布还在准备，请稍后再点保存。')
    draft.artworkId ??= crypto.randomUUID()
    const result = await saveArtwork(session, draft.artworkId, draft.artworkRevision ?? 0, snapshot)
    draft.artworkRevision = result.revision
    draft.savedSnapshot = snapshot
    if (mounted.current) setSaveMessage('已保存到历史图画，下次还能继续画')
  }

  async function handleSave() {
    if (savingRef.current || analysis === 'loading') return
    resetEncouragement()
    codraw.reset()
    savingRef.current = true; setSaving(true); setSaveMessage(null)
    try {
      await persistDrawing()
      if (!mounted.current) return
      setServerBubbleEn(null)
      setServerBubble(niloSaveMessages[Math.floor(Math.random() * niloSaveMessages.length)])
      setSaved(true)
    } catch (error) {
      if (mounted.current) setSaveMessage(saveErrorMessage(error))
    } finally { savingRef.current = false; if (mounted.current) setSaving(false) }
  }

  async function handleFinish() {
    const imageBase64 = canvasRef.current?.exportImage()
    if (!imageBase64 || analysis === 'loading' || savingRef.current) return
    resetEncouragement()
    codraw.reset()
    savingRef.current = true; setSaving(true); setSaveMessage(null)
    try { await persistDrawing() }
    catch (error) {
      if (mounted.current) setSaveMessage(saveErrorMessage(error))
      return
    } finally { savingRef.current = false; if (mounted.current) setSaving(false) }
    if (!mounted.current) return
    setAnalysis('loading')
    try {
      // 上传当前完整快照；重试同一快照复用 submissionKey，避免重复落库。
      // 登录孩子带 token：server 落库并返回 analysisId（游客不落库）
      if (submission.current?.image !== imageBase64) submission.current = { image: imageBase64, key: crypto.randomUUID() }
      draft.submission = submission.current
      const result = await analyzeDrawing(imageBase64, null, session?.token, submission.current.key)
      if (!mounted.current) return
      if (session?.token && !result.analysisId) throw new Error('作品尚未保存')
      setFeatures(result.features)
      window.sessionStorage.setItem(LATEST_FEATURES_KEY, JSON.stringify(result.features))
      if (result.analysisId) {
        window.sessionStorage.setItem(LATEST_ANALYSIS_ID_KEY, result.analysisId)
      } else {
        window.sessionStorage.removeItem(LATEST_ANALYSIS_ID_KEY)
      }
      setAnalysis('done')
      setServerBubble(`${result.feedbackText}。${result.followUp}`)
      setServerBubbleEn(result.feedbackTextEn ? `${result.feedbackTextEn} ${result.followUpEn ?? ''}` : null)
    } catch {
      if (!mounted.current) return
      setAnalysis('error')
      setServerBubbleEn(null)
      setServerBubble('画已经保存好啦！Nilo 暂时没法回应，之后再来聊聊吧。')
    }
  }

  function changeCodrawMode(next: CodrawMode) {
    if (next === codrawMode) return
    setCodrawMode(next)
    saveCodrawMode(next)
    resetEncouragement()
    codraw.reset()
    setCodrawSpeech(null)
    setCodrawAsk(false)
  }

  function changeNiloVisible(next: boolean) {
    setNiloVisible(next)
    saveNiloVisible(next)
    resetEncouragement()
    codraw.reset()
    setCodrawSpeech(null)
    setCodrawAsk(false)
  }

  const currentShapeLabel = shapeId
    ? (WARMUP_SHAPES.find((shape) => shape.id === shapeId)?.label ?? '图形')
    : '自由画'

  const bubbleText =
    analysis === 'loading'
      ? 'Nilo 正在仔细看你的画…'
      : ((locale === 'en' && serverBubbleEn ? serverBubbleEn : serverBubble) ?? codrawSpeech ?? idleLine)

  return (
    <main className="luma-child-create-shell relative flex min-h-screen flex-col overflow-hidden bg-luma-teal-50">
      <header className="relative z-40 flex flex-wrap items-center justify-between gap-2 border-b border-white/80 bg-luma-ivory-50/85 px-4 py-3 backdrop-blur-xl sm:px-6">
        <div className="flex items-center gap-2 sm:gap-4">
          <button
            type="button"
            onClick={() => navigate('/child/demo')}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-xl px-2.5 text-sm font-bold text-luma-teal-700 outline-none transition-colors hover:bg-white hover:text-luma-teal-900 focus-visible:ring-3 focus-visible:ring-luma-gold-300/60"
            aria-label={t("返回儿童创作空间")}
          >
            <svg
              viewBox="0 0 20 20"
              fill="none"
              className="size-4"
              aria-hidden="true"
            >
              <path
                d="M16 10H4m0 0 5-5m-5 5 5 5"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {t("返回")}</button>
          <button
            type="button"
            onClick={() => navigate('/child/demo')}
            className="hidden rounded-2xl outline-none focus-visible:ring-3 focus-visible:ring-luma-gold-300/60 sm:block"
            aria-label={t("返回儿童空间")}
          >
            <Brand size="sm" />
          </button>
        </div>
        <div className="hidden text-center lg:block">
          <div className="font-brand text-lg font-bold text-luma-teal-900">
            {t('我的创作空间')}
          </div>
          <div className="text-xs text-luma-muted">{t('让想象从这里开始')}</div>
        </div>
        <div className="order-3 flex w-full flex-wrap items-center justify-center gap-1 rounded-2xl border border-white/80 bg-white/75 p-1 text-xs font-bold sm:order-none sm:w-auto">
          <span className="px-2 text-luma-muted">{t('Nilo 陪伴')}</span>
          {([['off', '独自画'], ['turn', '一人一笔'], ['ask', '停笔问问']] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={codrawMode === value}
              disabled={saving || analysis === 'loading'}
              onClick={() => changeCodrawMode(value)}
              className={cn(
                'min-h-9 rounded-xl px-3 transition',
                codrawMode === value ? 'bg-luma-grass-100 text-luma-grass-700' : 'text-luma-muted hover:bg-white',
              )}
            >
              {t(label)}
            </button>
          ))}
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <button
            type="button"
            disabled={saving || analysis === 'loading'}
            aria-pressed={!niloVisible}
            onClick={() => changeNiloVisible(!niloVisible)}
            className="min-h-10 rounded-xl px-3 text-sm text-luma-teal-700"
          >
            {t(niloVisible ? '隐藏 Nilo' : '显示 Nilo')}
          </button>
          <button type="button" disabled={showWelcome || saving} onClick={() => startCanvasTour(canvasSteps, true)} className="min-h-10 rounded-xl px-3 text-sm text-luma-teal-700" aria-label={t('怎么玩')}>?</button>
          <button type="button" disabled={saving} onClick={() => navigate('/child/history')} className="min-h-10 rounded-xl px-3 text-sm font-bold text-luma-teal-700">{t('历史图画')}</button>
          <button type="button" disabled={saving} onClick={() => canvasRef.current?.download()} className="min-h-10 rounded-xl px-3 text-sm text-luma-teal-700">{t('下载')}</button>
          <LanguageSwitcher />
          <AvatarPicker userId={session?.id ?? 'guest-child'} compact />
        </div>
      </header>

      <DrawingTools
        color={color} brushKind={brushKind} brushSize={brushSize} isEraser={isEraser}
        disabled={saving || analysis === 'loading'} shapeLabel={currentShapeLabel}
        onColor={value => { setColor(value); setIsEraser(false) }}
        onBrush={value => { setBrushKind(value); setIsEraser(false) }}
        onSize={setBrushSize} onEraser={() => setIsEraser(value => !value)}
        onNextShape={handleNextShape} onClearShape={handleClearShape}
        onUndo={undoChildStroke}
        onClear={() => {
          canvasRef.current?.clear()
          draft.submission = undefined
          submission.current = null
          codraw.reset()
          resetEncouragement()
          refreshUndoCounts()
        }}
        onSave={handleSave} onFinish={handleFinish}
      >
      <section className="relative flex min-h-0 flex-1">
        {(saving || saveMessage) && <p role="status" className="pointer-events-none absolute top-3 right-3 left-3 z-30 mx-auto w-fit max-w-[90%] rounded-2xl bg-luma-teal-50/95 px-4 py-2 text-center text-sm font-bold text-luma-teal-800 shadow-luma-sm">{t(saving ? '正在保存图画…' : saveMessage!)}</p>}
        <div data-onboarding="canvas-paper" className="relative mx-auto w-full max-w-7xl overflow-hidden rounded-luma-lg border border-white/90 bg-white p-2 shadow-luma-md sm:p-3">
          <DrawingCanvas
            draft={draft.canvas}
            disabled={saving || analysis === 'loading'}
            ref={canvasRef}
            color={color}
            brushSize={brushSize}
            brushKind={brushKind}
            isEraser={isEraser}
            onStrokeComplete={handleStrokeComplete}
            onStrokeStart={handleStrokeStart}
          />
          <DrawingGuide shapeId={shapeId} />
          {companionDrawn && (
            <div className="absolute bottom-5 left-4 z-20 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-white/92 px-3 py-1 text-[0.68rem] font-bold text-luma-teal-700 shadow-luma-sm">
                {t('含 Nilo 添笔 · AI 生成')}
              </span>
              {undoCounts.nilo > 0 && (
                <button
                  type="button"
                  onClick={undoCompanionStroke}
                  className="pointer-events-auto rounded-full bg-white/92 px-3 py-1 text-[0.68rem] font-bold text-luma-teal-700 shadow-luma-sm transition hover:bg-white"
                >
                  {t('撤销 Nilo 这一笔')}
                </button>
              )}
            </div>
          )}

          {niloVisible && (
          <div className="pointer-events-none absolute right-4 bottom-5 z-20 flex items-end gap-2 sm:right-7 sm:bottom-6">
            <AnimatePresence mode="wait">
              {bubbleText && (
                <motion.div
                  key={bubbleText}
                  initial={{ opacity: 0, y: 10, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 5 }}
                  transition={motionTransition.expressive}
                  className="mb-16 max-w-52 rounded-[1.4rem] rounded-br-md border border-luma-teal-100 bg-white/95 px-4 py-3 text-sm font-semibold leading-relaxed text-luma-teal-900 shadow-luma-md backdrop-blur"
                  role="status"
                >
                  {bubbleText === idleLine && idleLineKind === 'suggestion' && (
                    <span className="mb-1 block text-[0.66rem] font-bold tracking-wide text-luma-muted">
                      {t('试试看：')}
                    </span>
                  )}
                  {lt(bubbleText)}
                </motion.div>
              )}
            </AnimatePresence>
            <AnimatePresence>
              {codrawAsk && (
                <motion.div
                  key="nilo-ask"
                  initial={{ opacity: 0, y: 10, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 5 }}
                  transition={motionTransition.expressive}
                  className="pointer-events-auto mb-16 max-w-56 rounded-[1.4rem] rounded-br-md border border-luma-teal-100 bg-white/97 px-4 py-3 text-sm font-semibold leading-relaxed text-luma-teal-900 shadow-luma-md backdrop-blur"
                  role="dialog"
                  aria-label={t('要我帮你接下一笔吗？')}
                >
                  <p>{t('要我帮你接下一笔吗？')}</p>
                  <div className="mt-2.5 flex gap-2">
                    <button
                      type="button"
                      onClick={codraw.accept}
                      className="min-h-9 rounded-xl bg-luma-grass-600 px-3 text-xs font-bold text-white transition hover:bg-luma-grass-700"
                    >
                      {t('好呀，接一笔')}
                    </button>
                    <button
                      type="button"
                      onClick={codraw.decline}
                      className="min-h-9 rounded-xl bg-luma-ivory-100 px-3 text-xs font-bold text-luma-muted transition hover:bg-white"
                    >
                      {t('先不用啦')}
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            <motion.div
              animate={saved ? { y: [0, -22, 0], scale: [1, 1.15, 1] } : { y: [0, -5, 0] }}
              transition={saved
                ? { duration: 0.5, ease: 'easeOut' }
                : { duration: 3, repeat: Infinity, ease: 'easeInOut' }
              }
              className="size-20 overflow-hidden rounded-full border-4 border-white bg-luma-gold-100 shadow-luma-md sm:size-24"
              aria-label={t("Nilo 正陪你创作")}
            >
              <img
                src={niloCompanion}
                alt="Nilo"
                className="size-full object-cover"
              />
            </motion.div>
          </div>
          )}
        </div>
      </section>
      </DrawingTools>

      {/* 欢迎蒙版：盖在 My Creative Space 上，左侧水獭 + 右侧气泡与按钮 */}
      <AnimatePresence>
        {showWelcome && (
          <WelcomeOverlay
            displayName={session?.displayName ?? '小朋友'}
            onEnter={() => {
              setShapeId('semicircle')
              setShowWelcome(false)
            }}
            onSkip={() => {
              setShapeId(null)
              setShowWelcome(false)
            }}
            onBack={() => navigate('/child/demo')}
          />
        )}
      </AnimatePresence>
    </main>
  )
}
