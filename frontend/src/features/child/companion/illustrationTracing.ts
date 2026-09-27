import { getDrawingIllustration } from '../../../../../shared/niloIllustrations.mjs'
import type { DrawingProposal } from './proposals'

export interface IllustrationTrace {
  version: 1
  aspect: number
  projection?: 'dashed' | 'gray'
  paths: [number, number][][]
}

/** Static centerlines have a fixed budget; no image or model-provided URL is executable. */
export function validateIllustrationTrace(value: unknown): IllustrationTrace | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as IllustrationTrace
  if (raw.version !== 1 || !Number.isFinite(raw.aspect) || raw.aspect <= 0 || raw.aspect > 100
    || (raw.projection !== undefined && raw.projection !== 'dashed' && raw.projection !== 'gray')
    || !Array.isArray(raw.paths) || !raw.paths.length || raw.paths.length > 1500) return null
  let points = 0
  for (const path of raw.paths) {
    if (!Array.isArray(path) || path.length < 2 || (points += path.length) > 50000) return null
    if (path.some(point => !Array.isArray(point) || point.length !== 2
      || point.some(coordinate => typeof coordinate !== 'number' || !Number.isFinite(coordinate) || coordinate < 0 || coordinate > 1))) return null
  }
  return { version: 1, aspect: raw.aspect, paths: raw.paths, ...(raw.projection ? { projection: raw.projection } : {}) }
}

export function createIllustrationTraceLoader(fetchTrace: typeof fetch) {
  const pending = new Map<string, Promise<IllustrationTrace | null>>()
  return (id: string): Promise<IllustrationTrace | null> => {
    const asset = getDrawingIllustration(id)
    if (!asset) return Promise.resolve(null)
    const cached = pending.get(asset.id)
    if (cached) return cached
    const request = (async () => {
      try {
        // Revalidate after a reload so a refreshed density decision replaces older guides.
        const response = await fetchTrace(`/nilo-tracing/${encodeURIComponent(asset.id)}.json`, { cache: 'no-cache' })
        return response.ok ? validateIllustrationTrace(await response.json()) : null
      } catch {
        return null
      }
    })().then(trace => {
      if (!trace) pending.delete(asset.id)
      return trace
    })
    pending.set(asset.id, request)
    return request
  }
}

export const loadIllustrationTrace = createIllustrationTraceLoader((...args) => fetch(...args))

/** Match the original image's contain frame and rotate in physical canvas coordinates. */
export function illustrationTracePaths(trace: IllustrationTrace, proposal: DrawingProposal, canvasAspect: number) {
  const width = Math.min(proposal.width, proposal.height * trace.aspect / canvasAspect)
  const height = width * canvasAspect / trace.aspect
  const angle = proposal.rotation * Math.PI / 180, cosine = Math.cos(angle), sine = Math.sin(angle)
  const centerX = proposal.x + proposal.width / 2, centerY = proposal.y + proposal.height / 2
  return trace.paths.map(path => path.map(([x, y]) => {
    const dx = (x - .5) * width * canvasAspect, dy = (y - .5) * height
    return { x: centerX + (dx * cosine - dy * sine) / canvasAspect, y: centerY + dx * sine + dy * cosine }
  }))
}
