import { validateDrawingDocument } from '../../../../shared/niloDocument.mjs'
import { BRUSHES } from './brushes'
import type { CanvasDocument } from './canvasDocument'
import type { ChildDraft } from './draft'

const MAX_LENGTH = 3_000_000
const key = (owner: string, artwork: string | null) => `luma_canvas_draft_v1:${JSON.stringify([owner, artwork])}`
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const number = (value: unknown, min: number, max: number): value is number => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
const color = (value: unknown) => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
const brush = (value: unknown) => BRUSHES.some(item => item.id === value)
const image = (value: unknown): value is string => typeof value === 'string' && value.startsWith('data:image/png;base64,')

function validDocument(value: unknown): value is CanvasDocument { return validateDrawingDocument(value) }

export function discardStoredDraft(owner: string, artwork: string | null): boolean {
  try { sessionStorage.removeItem(key(owner, artwork)); return true } catch { return false }
}

export function persistChildDraft(owner: string, artwork: string | null, draft: ChildDraft): boolean {
  try {
    const document = draft.canvas.document
    const legacyImage = draft.canvas.history.at(-1)
    if (document ? !document.baseImage && !document.operations.length : !legacyImage) return discardStoredDraft(owner, artwork)
    // Do not duplicate the full raster when replayable strokes exist, or store
    // analysis, pending requests, voice, or conversation in a recovery draft.
    const value = { version: 1, owner, artwork, document, image: document ? undefined : legacyImage,
      color: draft.color, brushSize: draft.brushSize, brushKind: draft.brushKind, isEraser: draft.isEraser,
      artworkId: draft.artworkId, artworkRevision: draft.artworkRevision }
    const json = JSON.stringify(value)
    if (json.length > MAX_LENGTH) return false
    sessionStorage.setItem(key(owner, artwork), json)
    return true
  } catch { return false }
}

export function readStoredDraft(owner: string, artwork: string | null): ChildDraft | null {
  try {
    const json = sessionStorage.getItem(key(owner, artwork))
    if (!json || json.length > MAX_LENGTH) return null
    const value: unknown = JSON.parse(json)
    if (!record(value) || value.version !== 1 || value.owner !== owner || value.artwork !== artwork
      || !color(value.color) || !brush(value.brushKind) || !number(value.brushSize, 1, 32) || typeof value.isEraser !== 'boolean'
      || (value.artworkId !== undefined && (typeof value.artworkId !== 'string' || value.artworkId.length > 200))
      || (value.artworkRevision !== undefined && (!number(value.artworkRevision, 0, Number.MAX_SAFE_INTEGER) || !Number.isInteger(value.artworkRevision)))
      || (value.document !== undefined ? !validDocument(value.document) : !image(value.image))) return null
    return { canvas: { history: value.document ? [''] : [value.image as string], document: value.document as CanvasDocument | undefined },
      color: value.color as string, brushSize: value.brushSize, brushKind: value.brushKind as ChildDraft['brushKind'],
      isEraser: value.isEraser, artworkId: value.artworkId as string | undefined, artworkRevision: value.artworkRevision as number | undefined,
      features: null, bubble: null }
  } catch { return null }
}
