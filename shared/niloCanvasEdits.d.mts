import type { CanvasOperation, CanvasStroke } from '../frontend/src/features/child/canvasDocument'
import type { CanvasDocument } from '../frontend/src/features/child/canvasDocument'
import type { VoiceAction } from './niloVoiceActions.mjs'
export type AssistedAction = Extract<VoiceAction, { type: 'color' | 'move' | 'scale' | 'place' }>
export interface StrokeBounds { x: number; y: number; width: number; height: number }
export interface AssistedInverse { groupId: string; index: number; factor: number; dx: number; dy: number; color: string; points: {x:number;y:number}[]; size: number }
export function validateAssistedActions(value: unknown): AssistedAction[] | null
export function strokeBounds(stroke: CanvasStroke): StrokeBounds
export function boundsOfStrokes(strokes: CanvasStroke[]): StrokeBounds | null
export function applyAssistedActions(operations: CanvasOperation[], targetIds: string[], actions: unknown): CanvasOperation[] | null
export function assistedReversal(before: CanvasOperation[], after: CanvasOperation[], targetIds: string[]): AssistedInverse[]
export function applyAssistedReversal(operations: CanvasOperation[], reversal: AssistedInverse[]): CanvasOperation[]
export function resolveDrawingOperations(document: CanvasDocument, options?: {maskErasers?: boolean}): (CanvasStroke | Extract<CanvasOperation, {type:'clear'}>)[]
