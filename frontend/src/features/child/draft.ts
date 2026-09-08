import type { FeatureJSON } from '@/lib/api/lumaApi'
import type { BrushKind } from './brushes'

export interface CanvasDraft { history: string[] }
export interface ChildDraft {
  canvas: CanvasDraft
  color: string
  brushSize: number
  brushKind: BrushKind
  isEraser: boolean
  features: FeatureJSON | null
  bubble: string | null
  submission?: { image: string; key: string }
}
// Memory only: no artwork survives a reload, logout or switch to another account.
let current: { owner: string; value: ChildDraft } | null = null
export function getChildDraft(owner: string): ChildDraft {
  if (current?.owner !== owner) {
    current = { owner, value: { canvas: { history: [''] }, color: '#20352f', brushSize: 8, brushKind: 'round', isEraser: false, features: null, bubble: null } }
  }
  return current.value
}
export function clearChildDraft() { current = null }
