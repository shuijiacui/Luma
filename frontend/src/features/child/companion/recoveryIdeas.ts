import type { BrushKind } from '../brushes'
import { drawingPlanFits, validateProposal, type DrawingProposal } from './proposals'

export interface RecoveryIdea { id: 'leaf' | 'cloud'; label: string; proposal: DrawingProposal }

/** Explicit child choices, not recognition guesses. Preview only, with the same
 * collision checks and brush as all other contributions. Works offline. */
export function recoveryIdeas(occupancy: number[], aspect: number,
  style: { color: string; brushSize: number; brushKind: BrushKind },
  surfaceSize?: { width: number; height: number }): RecoveryIdea[] {
  if (!Number.isFinite(aspect) || aspect <= 0) return []
  const height = surfaceSize?.height ?? 600, width = surfaceSize?.width ?? height * aspect
  if (!(width > 0 && height > 0)) return []
  const definitions = [
    { id: 'leaf' as const, label: '一片叶子', sketch: { aspect: 1.4, paths: [
      [['M', .08, .88], ['Q', .06, .14, .92, .12], ['Q', .94, .86, .08, .88], ['Z']],
      [['M', .08, .88], ['Q', .48, .52, .8, .24]],
    ] } },
    { id: 'cloud' as const, label: '一朵云', sketch: { aspect: 1.8, paths: [
      [['M', .2, .82], ['C', 0, .82, 0, .4, .25, .42], ['C', .22, .05, .62, .04, .65, .38],
        ['C', .93, .12, 1, .68, .86, .82], ['Q', .54, .94, .2, .82], ['Z']],
    ] } },
  ]
  const result: RecoveryIdea[] = []
  for (const definition of definitions) {
    let found: DrawingProposal | null = null
    for (const factor of [.18, .14, .1]) {
      const size = Math.max(44, style.brushSize * 5, Math.min(width, height) * factor)
      const w = size / width, h = size / definition.sketch.aspect / height
      // Bounded search: do not move or overwrite a single child stroke.
      for (const cy of [.5, .35, .65, .2, .8]) {
        for (const cx of [.5, .65, .35, .8, .2, .9, .1]) {
          const p = validateProposal({ template: 'custom', subject: definition.label, sketch: definition.sketch,
            target: '孩子选择的小主意', relation: '先在空白处预览，由孩子决定位置',
            x: cx - w / 2, y: cy - h / 2, width: w, height: h, rotation: 0,
            color: style.color, strokeWidth: style.brushSize, brushKind: style.brushKind })
          if (p && drawingPlanFits([p], occupancy, aspect, { width, height })) { found = p; break }
        }
        if (found) break
      }
      if (found) break
    }
    if (found) result.push({ id: definition.id, label: definition.label, proposal: found })
  }
  return result
}
