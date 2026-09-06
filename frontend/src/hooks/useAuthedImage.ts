import { useEffect, useState } from 'react'

import { fetchAuthedObjectUrl } from '@/lib/api/authedImage'

/**
 * 把受保护的图片路径换成可直接喂给 <img src> 的 object URL。
 * 负责撤销 blob：依赖变化或组件卸载时都会 revoke，避免内存里堆积图片。
 * 无 path / 无 token（游客）时返回 null，交由调用方渲染占位内容。
 */
export function useAuthedImage(path?: string | null, token?: string): string | null {
  const [objectUrl, setObjectUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!path || !token) {
      setObjectUrl(null)
      return
    }
    let cancelled = false
    let created: string | null = null

    fetchAuthedObjectUrl(path, token)
      .then((url) => {
        // 依赖已变化/已卸载：立刻撤销这次的结果，不再写入 state
        if (cancelled) {
          URL.revokeObjectURL(url)
          return
        }
        created = url
        setObjectUrl(url)
      })
      .catch(() => {
        if (!cancelled) setObjectUrl(null)
      })

    return () => {
      cancelled = true
      if (created) URL.revokeObjectURL(created)
      setObjectUrl(null)
    }
  }, [path, token])

  return objectUrl
}
