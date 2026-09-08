import { lt, t, useLocale } from '@/i18n'
import { useAuthedImage } from '@/hooks/useAuthedImage'
import { ChildArtwork, type ArtworkKind } from './artworks'

interface Props {
  /** 后端返回的受保护路径（/api/analyses/:id/image）。游客演示数据没有这个字段 */
  path?: string | null
  token?: string
  /** 无真实图片时的矢量占位画 */
  kind?: ArtworkKind
  alt?: string
  className?: string
  emptyText?: string
}

/**
 * 画作图片的唯一渲染入口：真实图片经 useAuthedImage 换成 object URL，
 * 取不到时退回矢量占位画。令牌只走 Authorization 头，不出现在 URL 中。
 */
export function AuthedArtwork({
  path,
  token,
  kind,
  alt = '孩子的画作',
  className = 'absolute inset-0 h-full w-full object-cover',
  emptyText = '等待一幅新画',
}: Props) {
  useLocale()
  const objectUrl = useAuthedImage(path, token)

  if (objectUrl) return <img src={objectUrl} alt={t(alt)} className={className} />
  if (kind) return <ChildArtwork kind={kind} className="absolute inset-0 h-full w-full" />
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-[#faf6ea] text-xs text-[#b7ab92]">
      {lt(emptyText)}
    </div>
  )
}
