import type { DrawingSketch } from './niloSketch.mjs'
interface VariantProposal {
  template: string; subject?: string; recipeId?: string; illustrationId?: string; sketch?: DrawingSketch;
  x: number; y: number; width: number; height: number; rotation: number;
  attachment?: unknown; contact?: unknown;
}
export function sameDrawingSubject(source: VariantProposal, candidate: VariantProposal): boolean
export function variantSubjectName(proposal: VariantProposal, locale?: 'zh' | 'en'): string
export function fitVariantToFrame<T extends VariantProposal>(source: T, candidate: VariantProposal, canvasAspect?: number): T | null
export function nextDrawingVariant<T extends VariantProposal>(source: T, canvasAspect?: number): T | null
