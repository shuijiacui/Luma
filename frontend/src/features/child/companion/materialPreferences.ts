import type { Material } from '../../../../../shared/niloMaterialLibrary.mjs'

export interface MaterialChoice {
  subject: string
  materialId: string
  style: Material['style']
  difficulty: Material['difficulty']
  chosenAt: number
}

export const MATERIAL_CHOICE_LIMIT = 32
const key = (childId?: string) => childId?.trim() ? `luma_material_choices:v1:${encodeURIComponent(childId)}` : null

function validChoice(value: unknown): value is MaterialChoice {
  if (!value || typeof value !== 'object') return false
  const choice = value as MaterialChoice
  return [choice.subject, choice.materialId, choice.style, choice.difficulty]
    .every(item => typeof item === 'string' && item.length > 0 && item.length <= 160)
    && ['storybook', 'illustrated', 'realistic'].includes(choice.style)
    && ['beginner', 'medium', 'detailed'].includes(choice.difficulty)
    && Number.isFinite(choice.chosenAt) && choice.chosenAt > 0
}

/** The caller supplies a verified child account ID; guests stay in the hook's session. */
export function readMaterialChoices(childId?: string): MaterialChoice[] {
  const storageKey = key(childId)
  if (!storageKey) return []
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) ?? 'null')
    return value?.version === 1 && Array.isArray(value.choices)
      ? value.choices.filter(validChoice).slice(-MATERIAL_CHOICE_LIMIT) : []
  } catch { return [] }
}

export function saveMaterialChoices(childId: string | undefined, choices: MaterialChoice[]) {
  const storageKey = key(childId)
  if (!storageKey) return
  try {
    localStorage.setItem(storageKey, JSON.stringify({ version: 1, choices: choices.filter(validChoice).slice(-MATERIAL_CHOICE_LIMIT) }))
  } catch { /* Optional preferences must never prevent drawing. */ }
}

export function appendMaterialChoice(choices: MaterialChoice[], material: Material, chosenAt = Date.now()): MaterialChoice[] {
  return [...choices, { subject: material.subject, materialId: material.id, style: material.style,
    difficulty: material.difficulty, chosenAt }].slice(-MATERIAL_CHOICE_LIMIT)
}

/** An explicit choice can reorder its own subject, never remove other options. */
export function preferredMaterials(choices: MaterialChoice[], subject: string) {
  const recent = choices.filter(choice => choice.subject === subject).slice().reverse()
  return { recentIds: [...new Set(recent.map(choice => choice.materialId))],
    preferredStyle: recent[0]?.style, preferredDifficulty: recent[0]?.difficulty }
}
