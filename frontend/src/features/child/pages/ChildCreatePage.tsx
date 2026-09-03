import { AnimatePresence, motion } from 'framer-motion'
import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { niloCompanion } from '@/assets/avatars'
import { Brand } from '@/components/brand'
import { Button } from '@/components/ui'
import { motionTransition } from '@/design-system'
import { useAuth } from '@/features/auth/AuthContext'
import { AvatarPicker } from '@/features/profile/components/AvatarPicker'
import { analyzeDrawing, type FeatureJSON } from '@/lib/api/lumaApi'
import { cn } from '@/lib/cn'
import {
  DrawingCanvas,
  type DrawingCanvasHandle,
} from '../components/DrawingCanvas'

const colors = ['#20352f', '#168a78', '#edcd70', '#ef7b69', '#7a82d8', '#4aa5d8']
const niloPrompts = [
  'I noticed something new.',
  'Keep going!',
] as const

const niloSaveMessages = [
  '我会记住这幅画的。',
  '好喜欢这里的颜色！',
  '你今天画的这个，我会一直记着。',
  '保存好啦，它现在是你的了。',
  '我们一起完成了这幅画。',
]

export const LATEST_FEATURES_KEY = 'luma_latest_features'
export const LATEST_ANALYSIS_ID_KEY = 'luma_latest_analysis_id'

export function ChildCreatePage() {
  const navigate = useNavigate()
  const { session } = useAuth()
  const canvasRef = useRef<DrawingCanvasHandle>(null)
  const [color, setColor] = useState(colors[0])
  const [brushSize, setBrushSize] = useState(8)
  const [isEraser, setIsEraser] = useState(false)
  const [promptIndex, setPromptIndex] = useState(-1)
  const [features, setFeatures] = useState<FeatureJSON | null>(null)
  const [analysis, setAnalysis] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [serverBubble, setServerBubble] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  function handleStrokeComplete() {
    setPromptIndex((current) => (current + 1) % niloPrompts.length)
  }

  function handleSave() {
    canvasRef.current?.download()
    const msg = niloSaveMessages[Math.floor(Math.random() * niloSaveMessages.length)]
    setServerBubble(msg)
    setSaved(true)
    window.setTimeout(() => setSaved(false), 2200)
  }

  async function handleFinish() {
    const imageBase64 = canvasRef.current?.exportImage()
    if (!imageBase64 || analysis === 'loading') return
    setAnalysis('loading')
    try {
      // priorFeatures 传入上一轮特征：孩子继续画 = 补充绘画，特征由 server 合并
      // 登录孩子带 token：server 落库并返回 analysisId（游客不落库）
      const result = await analyzeDrawing(imageBase64, features, session?.token)
      setFeatures(result.features)
      window.sessionStorage.setItem(LATEST_FEATURES_KEY, JSON.stringify(result.features))
      if (result.analysisId) {
        window.sessionStorage.setItem(LATEST_ANALYSIS_ID_KEY, result.analysisId)
      } else {
        window.sessionStorage.removeItem(LATEST_ANALYSIS_ID_KEY)
      }
      setAnalysis('done')
      setServerBubble(`${result.feedbackText}。${result.followUp}`)
    } catch {
      setAnalysis('error')
      setServerBubble('哎呀，Nilo 走神了，点「完成」再试一次吧')
    }
  }

  const bubbleText =
    analysis === 'loading'
      ? 'Nilo 正在仔细看你的画…'
      : (serverBubble ?? (promptIndex >= 0 ? niloPrompts[promptIndex] : null))

  return (
    <main className="flex min-h-screen flex-col overflow-x-hidden bg-luma-teal-50">
      <header className="relative z-40 flex items-center justify-between gap-4 border-b border-white/80 bg-luma-ivory-50/85 px-4 py-3 backdrop-blur-xl sm:px-6">
        <div className="flex items-center gap-2 sm:gap-4">
          <button
            type="button"
            onClick={() => navigate('/child/demo')}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-xl px-2.5 text-sm font-bold text-luma-teal-700 outline-none transition-colors hover:bg-white hover:text-luma-teal-900 focus-visible:ring-3 focus-visible:ring-luma-gold-300/60"
            aria-label="返回儿童创作空间"
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
            返回
          </button>
          <button
            type="button"
            onClick={() => navigate('/child/demo')}
            className="hidden rounded-2xl outline-none focus-visible:ring-3 focus-visible:ring-luma-gold-300/60 sm:block"
            aria-label="返回儿童空间"
          >
            <Brand size="sm" />
          </button>
        </div>
        <div className="hidden text-center sm:block">
          <div className="font-brand text-lg font-bold text-luma-teal-900">
            My Creative Space
          </div>
          <div className="text-xs text-luma-muted">Anything can begin here</div>
        </div>
        <AvatarPicker userId={session?.id ?? 'guest-child'} />
      </header>

      <section className="relative flex min-h-0 flex-1 p-3 pb-20 sm:p-5 sm:pb-24">
        <div className="relative mx-auto w-full max-w-7xl overflow-hidden rounded-luma-lg border border-white/90 bg-white p-2 shadow-luma-md sm:p-3">
          <DrawingCanvas
            ref={canvasRef}
            color={color}
            brushSize={brushSize}
            isEraser={isEraser}
            onStrokeComplete={handleStrokeComplete}
          />

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
                  {bubbleText}
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
              aria-label="Nilo 正陪你创作"
            >
              <img
                src={niloCompanion}
                alt="Nilo"
                className="size-full object-cover"
              />
            </motion.div>
          </div>
        </div>
      </section>

      <div className="fixed inset-x-0 bottom-4 z-30 flex justify-center px-3">
        <div className="flex max-w-full items-center gap-2 overflow-x-auto rounded-[1.4rem] border border-white/90 bg-luma-ivory-50/92 p-2.5 shadow-luma-md backdrop-blur-xl sm:gap-3 sm:px-4">
          <div className="flex items-center gap-1.5 border-r border-luma-ivory-200 pr-2 sm:pr-3">
            {colors.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => {
                  setColor(item)
                  setIsEraser(false)
                }}
                className={cn(
                  'size-8 shrink-0 rounded-full border-2 border-white shadow-sm outline-none transition hover:scale-110 focus-visible:ring-3 focus-visible:ring-luma-gold-300/60',
                  color === item && !isEraser
                    ? 'ring-2 ring-luma-teal-500 ring-offset-2'
                    : '',
                )}
                style={{ backgroundColor: item }}
                aria-label={`选择颜色 ${item}`}
              />
            ))}
          </div>

          <label className="flex shrink-0 items-center gap-2 text-xs font-semibold text-luma-muted">
            <span className="hidden sm:inline">笔触</span>
            <input
              type="range"
              min="3"
              max="30"
              value={brushSize}
              onChange={(event) => setBrushSize(Number(event.target.value))}
              className="w-20 accent-luma-teal-600"
              aria-label="调整笔触粗细"
            />
          </label>

          <div className="flex shrink-0 items-center gap-1 border-l border-luma-ivory-200 pl-2 sm:pl-3">
            <Button
              size="sm"
              variant={isEraser ? 'gold' : 'ghost'}
              onClick={() => setIsEraser((value) => !value)}
            >
              橡皮
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => canvasRef.current?.undo()}
            >
              撤销
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => canvasRef.current?.clear()}
            >
              清空
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleSave}
            >
              保存
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={handleFinish}
              disabled={analysis === 'loading'}
            >
              {analysis === 'loading' ? 'Nilo 在看…' : '完成'}
            </Button>
          </div>
        </div>
      </div>
    </main>
  )
}
