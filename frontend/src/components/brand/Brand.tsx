import { lumaLogo } from '@/assets/brand'
import { cn } from '@/lib/cn'

type BrandSize = 'sm' | 'md' | 'lg' | 'xl' | 'hero'

export interface BrandProps {
  size?: BrandSize
  showName?: boolean
  className?: string
}

const markSizes: Record<BrandSize, string> = {
  sm: 'size-11',
  md: 'size-14',
  lg: 'size-20',
  xl: 'size-24',
  hero: 'size-28 sm:size-32',
}

const nameSizes: Record<BrandSize, string> = {
  sm: 'text-[1.35rem]',
  md: 'text-[1.65rem]',
  lg: 'text-[2.15rem]',
  xl: 'text-[2.55rem]',
  hero: 'text-[3rem] sm:text-[3.5rem]',
}

export function Brand({
  size = 'md',
  showName = true,
  className,
}: BrandProps) {
  return (
    <span className={cn('inline-flex items-center gap-3', className)}>
      <span
        className={cn(
          'relative shrink-0',
          markSizes[size],
        )}
      >
        <img
          src={lumaLogo}
          alt=""
          className="size-full object-contain drop-shadow-[0_6px_10px_rgba(16,90,81,0.14)]"
        />
      </span>

      {showName && (
        <span className="relative inline-flex items-center">
          <span
            className={cn(
              'font-brand font-[720] leading-none tracking-[-0.035em] text-luma-teal-900',
              nameSizes[size],
            )}
          >
            Luma
          </span>
          <span
            className="ml-1.5 mb-[0.65em] size-1.5 rotate-45 rounded-[2px] bg-luma-gold-300 shadow-[0_0_10px_rgba(237,205,112,0.8)]"
            aria-hidden="true"
          />
        </span>
      )}
    </span>
  )
}
