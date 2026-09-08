import { t, useLocale } from '@/i18n'
import type { ImgHTMLAttributes, SVGProps } from 'react'

import niloCutout from '@/assets/images/nilo-cutout.png'
import { cn } from '@/lib/cn'

type DecoProps = SVGProps<SVGSVGElement> & { tone?: 'green' | 'clay' | 'gold' | 'teal' }

/** 手绘风格的小枝桠（水彩叶片） */
export function LeafSprig({ tone = 'green', className, ...props }: DecoProps) {
  useLocale()
  const palette = {
    green: { stem: '#7a9a5e', leaf: '#a9c68a', wash: '#d9e8c8' },
    clay: { stem: '#b08a5c', leaf: '#c9a878', wash: '#eedfc6' },
    gold: { stem: '#c99a2e', leaf: '#e0b95c', wash: '#f5e5bd' },
    teal: { stem: '#5f988a', leaf: '#8cbcae', wash: '#d4e9e2' },
  }[tone]
  return (
    <svg viewBox="0 0 64 64" fill="none" className={cn('h-6 w-6', className)} aria-hidden="true" {...props}>
      <path d="M50 54C42 40 30 28 14 10" stroke={palette.stem} strokeWidth="2" strokeLinecap="round" />
      <ellipse cx="38" cy="22" rx="11" ry="6.4" transform="rotate(-34 38 22)" fill={palette.wash} />
      <ellipse cx="38" cy="22" rx="11" ry="6.4" transform="rotate(-34 38 22)" stroke={palette.leaf} strokeWidth="1.4" />
      <path d="M43 21c-2-4-6-6-10-6" stroke={palette.stem} strokeWidth="1.3" strokeLinecap="round" />
      <ellipse cx="25" cy="33" rx="9.5" ry="5.4" transform="rotate(28 25 33)" fill={palette.wash} />
      <ellipse cx="25" cy="33" rx="9.5" ry="5.4" transform="rotate(28 25 33)" stroke={palette.leaf} strokeWidth="1.4" />
      <ellipse cx="14" cy="45" rx="8" ry="4.6" transform="rotate(48 14 45)" fill={palette.wash} />
      <ellipse cx="14" cy="45" rx="8" ry="4.6" transform="rotate(48 14 45)" stroke={palette.leaf} strokeWidth="1.4" />
    </svg>
  )
}

/** 细长垂坠枝条：适合页面边角与侧栏底部 */
export function HangingBranch({ tone = 'green', className, ...props }: DecoProps) {
  useLocale()
  const palette = {
    green: { stem: '#7a9a5e', leaf: '#b3cd96', wash: '#e2eed4', dot: '#94b976' },
    clay: { stem: '#b08a5c', leaf: '#cfae82', wash: '#f0e2cd', dot: '#c9a878' },
    gold: { stem: '#c99a2e', leaf: '#e2c271', wash: '#f6e7c5', dot: '#d9b85c' },
    teal: { stem: '#5f988a', leaf: '#8cbcae', wash: '#d4e9e2', dot: '#6fb0a0' },
  }[tone]
  return (
    <svg viewBox="0 0 120 200" fill="none" className={cn('h-40 w-24', className)} aria-hidden="true" {...props}>
      <path d="M64 2C60 42 58 80 66 120c4 24 6 48 2 78" stroke={palette.stem} strokeWidth="2.4" strokeLinecap="round" />
      <ellipse cx="76" cy="34" rx="10" ry="20" transform="rotate(10 76 34)" fill={palette.wash} />
      <ellipse cx="76" cy="34" rx="10" ry="20" transform="rotate(10 76 34)" stroke={palette.leaf} strokeWidth="1.6" />
      <ellipse cx="50" cy="58" rx="9" ry="18" transform="rotate(-12 50 58)" fill={palette.wash} />
      <ellipse cx="50" cy="58" rx="9" ry="18" transform="rotate(-12 50 58)" stroke={palette.leaf} strokeWidth="1.6" />
      <ellipse cx="78" cy="86" rx="9.5" ry="19" transform="rotate(8 78 86)" fill={palette.wash} />
      <ellipse cx="78" cy="86" rx="9.5" ry="19" transform="rotate(8 78 86)" stroke={palette.leaf} strokeWidth="1.6" />
      <ellipse cx="56" cy="118" rx="8" ry="17" transform="rotate(-10 56 118)" fill={palette.wash} />
      <ellipse cx="56" cy="118" rx="8" ry="17" transform="rotate(-10 56 118)" stroke={palette.leaf} strokeWidth="1.6" />
      <ellipse cx="72" cy="152" rx="7.4" ry="15" transform="rotate(14 72 152)" fill={palette.wash} />
      <ellipse cx="72" cy="152" rx="7.4" ry="15" transform="rotate(14 72 152)" stroke={palette.leaf} strokeWidth="1.6" />
      <circle cx="66" cy="196" r="3.4" fill={palette.dot} opacity=".85" />
      <path d="M100 8c-6 8-4 20 2 28M92 56c4-8 2-18-2-26" stroke={palette.leaf} strokeWidth="1.4" strokeLinecap="round" opacity=".8" />
    </svg>
  )
}

/** 手绘小蝴蝶 */
export function Butterfly({ className, ...props }: SVGProps<SVGSVGElement>) {
  useLocale()
  return (
    <svg viewBox="0 0 48 40" fill="none" className={cn('h-7 w-8', className)} aria-hidden="true" {...props}>
      <ellipse cx="24" cy="24" rx="3.2" ry="12" fill="#d9b1c8" opacity=".55" />
      <ellipse cx="12" cy="13" rx="8.6" ry="6.4" transform="rotate(-18 12 13)" fill="#e8c7a8" opacity=".85" />
      <ellipse cx="12" cy="13" rx="8.6" ry="6.4" transform="rotate(-18 12 13)" stroke="#b98c59" strokeWidth="1.2" opacity=".8" />
      <ellipse cx="36" cy="13" rx="8.6" ry="6.4" transform="rotate(18 36 13)" fill="#d5c3e2" opacity=".85" />
      <ellipse cx="36" cy="13" rx="8.6" ry="6.4" transform="rotate(18 36 13)" stroke="#8a75a8" strokeWidth="1.2" opacity=".7" />
      <ellipse cx="10" cy="26" rx="7" ry="5" transform="rotate(10 10 26)" fill="#ecd3b0" opacity=".9" />
      <ellipse cx="10" cy="26" rx="7" ry="5" transform="rotate(10 10 26)" stroke="#b98c59" strokeWidth="1.1" opacity=".75" />
      <ellipse cx="38" cy="26" rx="7" ry="5" transform="rotate(-10 38 26)" fill="#d9c2e6" opacity=".9" />
      <ellipse cx="38" cy="26" rx="7" ry="5" transform="rotate(-10 38 26)" stroke="#8a75a8" strokeWidth="1.1" opacity=".7" />
      <circle cx="24" cy="18" r="1.1" fill="#6e5b45" />
    </svg>
  )
}

/** 柔和四芒星光点 */
export function SparkleDot({ className, ...props }: SVGProps<SVGSVGElement>) {
  useLocale()
  return (
    <svg viewBox="0 0 24 24" fill="none" className={cn('h-4 w-4', className)} aria-hidden="true" {...props}>
      <path
        d="M12 2.6c.5 3.3 1.7 5 5.4 5.4-3.7.4-4.9 2.1-5.4 5.4-.5-3.3-1.7-5-5.4-5.4 3.7-.4 4.9-2.1 5.4-5.4Z"
        fill="currentColor"
        stroke="none"
      />
      <path
        d="M19.6 14.8c.3 2 1 3 3 3.2-2 .2-2.7 1.2-3 3.2-.3-2-1-3-3-3.2 2-.2 2.7-1.2 3-3.2Z"
        fill="currentColor"
        stroke="none"
      />
    </svg>
  )
}

/** 手写感波浪下划线 */
export function Squiggle({ className, ...props }: SVGProps<SVGSVGElement>) {
  useLocale()
  return (
    <svg viewBox="0 0 120 12" fill="none" className={cn('h-3 w-28', className)} aria-hidden="true" {...props}>
      <path
        d="M3 8C14 3 20 3 30 8s17 5 28 0 16-5 27 0 17 5 29 0"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        opacity=".55"
      />
    </svg>
  )
}

/** Nilo 水獭小形象（透明抠图），用于氛围装饰 */
export function OtterDeco({
  className,
  alt = 'Nilo 水獭',
  ...props
}: Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'alt' | 'draggable'> & { alt?: string }) {
  useLocale()
  return (
    <img
      src={niloCutout}
      alt={t(alt)}
      draggable={false}
      className={cn('select-none object-contain', className)}
      {...props}
    />
  )
}

