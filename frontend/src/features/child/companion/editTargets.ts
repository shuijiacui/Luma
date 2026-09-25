import type { EditableNiloObject } from './objects'
import { matchingRecipeSubjects } from '../../../../../shared/niloRecipes.mjs'

export interface CanvasEditTarget {
  id: string
  name: string
  groupIds: string[]
  bounds: { x: number; y: number; width: number; height: number }
  /** Unclipped brush footprint used by the ink engine's exact transform. */
  transformBounds?: { x: number; y: number; width: number; height: number }
  source: 'child' | 'guided' | 'nilo'
  subjects: string[]
  guideId?: string
}

/** Choices share a label and bounds; only legacy Nilo objects contain proposals. */
export type CompanionEditChoice = CanvasEditTarget | EditableNiloObject

export function namedEditTargets(text: string, targets: CanvasEditTarget[]) {
  const sentence = text.toLowerCase()
  const subjects=matchingRecipeSubjects(sentence)
  return targets.filter(target => [target.name, ...target.subjects].some(name => {
    const value = name.trim().toLowerCase()
    // Generic labels are not semantic recognition of an arbitrary child drawing.
    return value.length >= 2 && !/^(选中的笔迹|我的画|孩子的画|自主创作|child drawing|selected strokes|drawing|canvas)$/i.test(value)
      && (sentence.includes(value)||subjects.includes(value))
  }))
}

/** A named but unknown noun must reach interpretation, never silently use selection. */
export function hasUnresolvedEditName(text: string) {
  const prefix=text.trim().match(/^(.*?)(?:改成|换成|变成)/)?.[1]
  if(prefix===undefined)return false
  return !!prefix.replace(/^(?:请|帮我|给我|我想|把|让它|让这个)+/u,'')
    .replace(/^(?:这个|那个|它|选中的|选中的部分|这部分|那部分|刚才那个|刚才的)$/u,'').trim()
}
