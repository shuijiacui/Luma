import { t, useLocale } from '@/i18n'
import { useEffect, useRef, useState, type ChangeEvent } from 'react'

import { defaultAvatars } from '@/assets/avatars'
import { cn } from '@/lib/cn'

interface AvatarPickerProps {
  userId: string
  compact?: boolean
}

export function AvatarPicker({
  userId,
  compact = false,
}: AvatarPickerProps) {
  useLocale()
  const storageKey = `luma_avatar_${userId}`
  const [isOpen, setIsOpen] = useState(false)
  const [selectedAvatar, setSelectedAvatar] = useState(defaultAvatars[0].src)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const savedAvatar = window.localStorage.getItem(storageKey)
    if (savedAvatar) setSelectedAvatar(savedAvatar)
  }, [storageKey])

  function selectAvatar(src: string) {
    setSelectedAvatar(src)
    window.localStorage.setItem(storageKey, src)
    setIsOpen(false)
  }

  function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/') || file.size > 3 * 1024 * 1024) return

    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') selectAvatar(reader.result)
    }
    reader.readAsDataURL(file)
    event.target.value = ''
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((value) => !value)}
        className={cn(
          'luma-avatar-trigger group flex items-center rounded-2xl text-sm font-bold text-luma-teal-900 outline-none transition-transform hover:scale-105 focus-visible:ring-3 focus-visible:ring-luma-gold-300/60',
          compact ? 'gap-0' : 'gap-3 pr-2',
        )}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-label={t("打开头像设置")}
        title={t("头像设置")}
      >
        <span className="relative size-16 shrink-0">
          <img
            src={selectedAvatar}
            alt={t("我的头像")}
            className="size-full object-contain drop-shadow-[0_5px_8px_rgba(16,90,81,0.12)] transition-transform duration-300 group-hover:-rotate-2"
          />
          <span
            className="absolute right-0 bottom-0 flex size-5 items-center justify-center rounded-full border-2 border-white bg-luma-gold-300 text-luma-teal-900 shadow-sm"
            aria-hidden="true"
          >
            <svg viewBox="0 0 20 20" fill="none" className="size-2.5">
              <path
                d="m5 14 1-3 6.8-6.8a1.4 1.4 0 0 1 2 2L8 13l-3 1Z"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        </span>
        {!compact && (
          <span className="text-left leading-tight">
            <span className="block">{t("我的头像")}</span>
            <span className="mt-0.5 block text-[0.68rem] font-medium text-luma-muted">
              {t("点击更换")}</span>
          </span>
        )}
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-label={t("选择头像")}
          className="absolute top-[calc(100%+0.75rem)] right-0 z-50 w-[20rem] max-w-[calc(100vw-2rem)] rounded-luma-md border border-white/90 bg-white/95 p-5 shadow-luma-md backdrop-blur-xl"
        >
          <div className="mb-1 font-display text-lg font-bold text-luma-teal-900">
            {t("选择你的头像")}</div>
          <p className="mb-4 text-xs leading-relaxed text-luma-muted">
            {t("选一个喜欢的 Nilo 表情，也可以上传自己的图片。")}</p>
          <div className="grid grid-cols-3 gap-3">
            {defaultAvatars.map((avatar) => (
              <button
                key={avatar.id}
                type="button"
                onClick={() => selectAvatar(avatar.src)}
                className={cn(
                  'relative aspect-square p-1.5 outline-none transition-all hover:-translate-y-1 focus-visible:rounded-2xl focus-visible:ring-3 focus-visible:ring-luma-gold-300/60',
                  selectedAvatar === avatar.src
                    ? 'scale-105'
                    : 'opacity-75 hover:opacity-100',
                )}
                aria-label={t(`选择${avatar.label}`)}
              >
                <img
                  src={avatar.src}
                  alt=""
                  className="size-full object-contain drop-shadow-[0_4px_7px_rgba(16,90,81,0.10)]"
                />
                {selectedAvatar === avatar.src && (
                  <span
                    className="absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded-full bg-luma-teal-600 text-xs font-bold text-white shadow-sm"
                    aria-hidden="true"
                  >
                    ✓
                  </span>
                )}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="mt-4 min-h-12 w-full rounded-2xl border border-dashed border-luma-teal-300 bg-luma-teal-50 text-sm font-bold text-luma-teal-700 transition hover:border-luma-teal-500 hover:bg-luma-teal-100"
          >
            {t("上传自己的头像")}</button>
          <p className="mt-2 text-center text-xs text-luma-muted">
            {t("PNG、JPG，最大 3MB")}</p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={handleUpload}
            className="sr-only"
          />
        </div>
      )}
    </div>
  )
}
