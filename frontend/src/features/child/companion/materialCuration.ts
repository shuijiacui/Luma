import { apiClient } from '@/lib/api/client'
import { setMaterialCuration } from '../../../../../shared/niloCuration.mjs'

let pending: Promise<void> | null = null

/** Refresh reviewer decisions before choosing another guide. Offline use keeps
 * the last validated snapshot; it must never erase known rejections. */
export function refreshMaterialCuration(): Promise<void> {
  if (pending) return pending
  const controller = new AbortController()
  let timeout: ReturnType<typeof setTimeout>
  const expired = new Promise<undefined>(resolve => {
    timeout = setTimeout(() => { controller.abort(); resolve(undefined) }, 1500)
  })
  pending = Promise.race([apiClient('/nilo/materials/curation', { signal: controller.signal, cache: 'no-store' }), expired])
    .then(value => { if (value !== undefined) setMaterialCuration(value) })
    .catch(() => { /* Keep the bundled or most recently downloaded decisions. */ })
    .finally(() => { clearTimeout(timeout); pending = null })
  return pending
}
