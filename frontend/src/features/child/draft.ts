import type { FeatureJSON } from '@/lib/api/lumaApi'
import type { BrushKind } from './brushes'
import type { Artwork } from './artworks'
import { cloneCanvasDocument, type CanvasDocument, type CanvasProvenance } from './canvasDocument'

export interface CanvasDraft { history: string[]; document?: CanvasDocument }
export interface ChildDraft {
  canvas: CanvasDraft
  color: string
  brushSize: number
  brushKind: BrushKind
  isEraser: boolean
  features: FeatureJSON | null
  bubble: string | null
  submission?: { image: string; key: string; provenance?: CanvasProvenance }
  artworkId?: string
  artworkRevision?: number
  savedSnapshot?: string
}
// The active document stays in memory. Recovery is explicit and scoped to the
// account + editor URL in this browser tab, so another tab cannot overwrite it.
let current: { owner: string; value: ChildDraft } | null = null
export function getChildDraft(owner: string): ChildDraft {
  if (current?.owner !== owner) {
    current = { owner, value: { canvas: { history: [''] }, color: '#20352f', brushSize: 8, brushKind: 'round', isEraser: false, features: null, bubble: null } }
  }
  return current.value
}
export function clearChildDraft() { current = null }
export function resumeChildDraft(owner: string, value: ChildDraft) { current = { owner, value } }
export function restoreChildArtwork(owner: string, artwork: Artwork): ChildDraft {
  clearChildDraft()
  const draft = getChildDraft(owner)
  draft.canvas.history = [artwork.image]
  draft.canvas.document = artwork.document ? cloneCanvasDocument(artwork.document)
    : { version: 1, baseSource: 'unknown', baseImage: artwork.image, operations: [] }
  draft.artworkId = artwork.id
  draft.artworkRevision = artwork.revision
  draft.savedSnapshot = artwork.image
  return draft
}
