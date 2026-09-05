import { defaultAvatars } from '@/assets/avatars'

/**
 * Nilo（水獭伙伴）形象数据。
 *
 * ⚠️ 想换成「全身水獭素材」（而不是现在的大头贴纸）时：
 * 把全身 PNG（透明背景）放进 frontend/src/assets/images/ 下，然后：
 *   1. import otterWave from '@/assets/images/otter-wave.png'  …等
 *   2. 把下方 NILO_POSES 里对应 key 的 src 换成 import 的变量
 * 每个 key 代表一个姿势，欢迎对话 / 画板鼓励时 Nilo 会切换姿势。
 */
export type PoseKey = 'wave' | 'cheer' | 'curious' | 'gentle' | 'smile'

export interface OtterPose {
  src: string
  alt: string
}

export const NILO_POSES: Record<PoseKey, OtterPose> = {
  wave: { src: defaultAvatars[0].src, alt: 'Nilo 招手打招呼' },
  cheer: { src: defaultAvatars[2].src, alt: 'Nilo 比耶庆祝' },
  curious: { src: defaultAvatars[3].src, alt: 'Nilo 好奇地歪头' },
  gentle: { src: defaultAvatars[4].src, alt: 'Nilo 温柔地鼓励' },
  smile: { src: defaultAvatars[1].src, alt: 'Nilo 微笑陪伴' },
}

/* 画几笔后水獭的鼓励语（轮流播放，像普通画板里的陪伴） */
export const encourageLines = [
  '哇！这一笔好有想法！',
  '我喜欢你选的颜色～',
  '再添几笔，它会变得更精彩！',
  '哈哈，真有创意呀！',
  'Nilo 看到啦，继续画吧！',
  '你画得越来越棒了！',
] as const

/* 回应鼓励时水獭切换的姿势 */
export const strokePoseKeys = ['cheer', 'smile', 'curious', 'gentle'] as const

/* 画笔颜色（与画板一致） */
export const warmupColors = [
  '#20352f',
  '#168a78',
  '#edcd70',
  '#ef7b69',
  '#7a82d8',
  '#4aa5d8',
]

