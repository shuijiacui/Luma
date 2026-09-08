import { lt, t, useLocale } from '@/i18n'
import { motion } from 'framer-motion'
import { useState } from 'react'

import authOtterCutout from '@/assets/images/auth-otter-clean.png'
import { Button } from '@/components/ui'
import { motionTransition } from '@/design-system'
import { NiloStand, SpeechBubble } from './otterUI'
import type { PoseKey } from './otter'

interface WelcomeOverlayProps {
  displayName: string
  /** 答应一起画：关掉蒙版，进入 My Creative Space 画板 */
  onEnter: () => void
  /** 跳过欢迎：直接关掉蒙版 */
  onSkip: () => void
  /** 回小屋 */
  onBack: () => void
}

interface WelcomeLine {
  text: string
  poseKey: PoseKey
}

/**
 * 覆盖在 My Creative Space 之上的欢迎蒙版（整体居中显示）：
 * - 左侧：抠图水獭（auth-parent.png 抠出），全程静止无动画；
 * - 右侧：第一句气泡在上；第二句出现前已预留好它的位置（虚线占位），
 *   出现时只填充占位、不会顶动第一句；
 * - 气泡下方是按钮。
 */
export function WelcomeOverlay({
  displayName,
  onEnter,
  onSkip,
  onBack,
}: WelcomeOverlayProps) {
  useLocale()
  const shortName =
    displayName.length > 8 ? displayName.slice(0, 8) + '…' : displayName

  const allLines: readonly WelcomeLine[] = [
    { poseKey: 'wave', text: t('嗨～') + shortName + t('，我是 Nilo！我一直在等你哦。') },
    { poseKey: 'cheer', text: '你想跟我一起完成一幅画吗？' },
  ]
  const [isSecondShown, setIsSecondShown] = useState(false)

  return (
    <div className="fixed inset-x-0 bottom-0 top-[var(--language-bar-height)] z-50 overflow-y-auto bg-luma-teal-50/45 backdrop-blur-[3px]">
      {/* 右上角：回小屋 */}
      <button
        type="button"
        onClick={onBack}
        className="absolute top-4 right-4 inline-flex min-h-9 items-center gap-1 rounded-xl px-3 text-sm font-bold text-luma-teal-700 outline-none transition-colors hover:bg-white/80 hover:text-luma-teal-900 focus-visible:ring-3 focus-visible:ring-luma-gold-300/60 sm:top-5 sm:right-6"
        aria-label={t("返回小屋")}
      >
        <svg viewBox="0 0 20 20" fill="none" className="size-4" aria-hidden="true">
          <path
            d="M16 10H4m0 0 5-5m-5 5 5 5"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {t("回小屋")}</button>

      {/* 整体内容垂直、水平居中在屏幕中间 */}
      <div className="flex min-h-full items-center justify-center px-5 py-8">
        <div className="flex w-full max-w-4xl translate-y-[4vh] flex-col items-center gap-8 sm:flex-row sm:items-start sm:gap-12">
          {/* 左：抠图水獭（静止） */}
          <div className="relative shrink-0">
            <div
              className="absolute -inset-6 rounded-full bg-luma-gold-200/50 blur-2xl sm:-inset-8"
              aria-hidden="true"
            />
            <NiloStand
              poseKey={allLines[0].poseKey}
              src={authOtterCutout}
              motionless
              className="h-44 w-44 sm:h-80 sm:w-80"
            />
            <div
              className="absolute -bottom-3 left-1/2 h-4 w-32 -translate-x-1/2 rounded-[100%] bg-luma-teal-900/10 blur-[7px] sm:h-5 sm:w-56"
              aria-hidden="true"
            />
          </div>

          {/* 右：两句话的气泡列（第二句位置始终保留） + 按钮 */}
          <div className="flex w-full min-w-0 flex-1 flex-col items-center gap-5 sm:items-start">
            <div className="flex w-full flex-col items-center gap-3 sm:items-start">
              {/* 第一句：固定在上方 */}
              <div className="w-full max-w-lg sm:w-auto">
                <SpeechBubble tail="left" className="w-full sm:w-auto">
                  <p
                    className="luma-body-lg font-semibold whitespace-normal text-luma-teal-900"
                    role="status"
                  >
                    {lt(allLines[0].text)}
                  </p>
                </SpeechBubble>
              </div>

              {/* 第二句：未出现时用虚线占位保留位置，出现时原位填充 */}
              {isSecondShown ? (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={motionTransition.expressive}
                  className="w-full max-w-lg sm:w-auto"
                >
                  <SpeechBubble tail="left" className="w-full sm:w-auto">
                    <p
                      className="luma-body-lg font-semibold whitespace-normal text-luma-teal-900 sm:whitespace-nowrap"
                      role="status"
                    >
                      {lt(allLines[1].text)}
                    </p>
                  </SpeechBubble>
                </motion.div>
              ) : (
                // 占位：保留第二句的位置，但不显示任何气泡
                <div className="invisible w-full max-w-lg sm:w-auto" aria-hidden="true">
                  <SpeechBubble tail="left" className="w-full sm:w-auto">
                    <p className="luma-body-lg font-semibold whitespace-normal sm:whitespace-nowrap">
                      {lt(allLines[1].text)}
                    </p>
                  </SpeechBubble>
                </div>
              )}
            </div>

            {/* 按钮 */}
            <div className="flex flex-col items-center gap-2 sm:flex-row">
              {isSecondShown ? (
                <>
                  <Button variant="primary" size="lg" onClick={onEnter}>
                    {t("好呀，一起画！")}</Button>
                  <Button variant="ghost" size="lg" onClick={onSkip}>
                    {t("跳过，直接去画板")}</Button>
                </>
              ) : (
                <Button
                  variant="gold"
                  size="lg"
                  onClick={() => setIsSecondShown(true)}
                >
                  {t("继续听～")}</Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

