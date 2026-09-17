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

/**
 * 画画时 Nilo 的鼓励语：只在孩子停笔一小会儿（空闲）时说一句，
 * 按顺序轮流播放，避免连续作画时反复打断。
 */
export const encourageLines = [
  '哇！这一笔好有想法！',
  '我喜欢你选的颜色～',
  '再添几笔，它会变得更精彩！',
  '哈哈，真有创意呀！',
  'Nilo 看到啦，继续画吧！',
  '你画得越来越棒了！',
  '这条线弯弯的，好像一条小路～',
  '咦，这个形状让我想到一朵云！',
  '你慢慢画，Nilo 一直陪着你。',
  '画错了也没关系，改一改就是新主意！',
  '这里再加一点点，会不会更有趣？',
  '你专心画画的样子真好看～',
  '这块颜色暖暖的，像晒过太阳一样！',
  '哇，画面里好像藏着一个故事！',
  '想画什么都可以，你的画你做主～',
  '休息一下也没关系，Nilo 在这里等你。',
  '这一笔轻轻柔柔的，很舒服呢～',
  '你的小手越来越灵巧啦！',
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
