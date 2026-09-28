import { drawingRecipes } from '../../../shared/niloRecipes.mjs'
import { isMaterialEnabled } from '../../../shared/niloCuration.mjs'
import { validateSketch } from '../../../shared/niloSketch.mjs'
import { namedSceneSubjects } from './niloSceneMaterials.js'
import { getMaterialGeometry } from './niloMaterialGeometry.js'

export const SCENE_GEOMETRY_REFERENCE_LIMITS = Object.freeze({ subjects: 2, commands: 72, characters: 3600 })
const text = value => typeof value === 'string' ? value.slice(0, 600) : ''
const strings = value => Array.isArray(value) ? value.slice(0, 8).map(text).filter(Boolean) : []
const segmenter = new Intl.Segmenter('zh', { granularity: 'word' })
const commands = sketch => sketch.paths.reduce((sum, path) => sum + path.length, 0)

function poseScore(recipe, request) {
  const label = getMaterialGeometry(recipe.id)?.actualPose ?? recipe.label ?? ''
  const terms = [...segmenter.segment(label.toLowerCase())].filter(item => item.isWordLike && item.segment.length > 1).map(item => item.segment)
  const exact = label && request.includes(label.toLowerCase()) ? 100 : 0
  const matchedTerms = terms.filter(term => request.includes(term)).length * 10
  // Authored picture-book forms win when available. For otherwise equivalent
  // variants, a reviewed unobstructed contour is more useful as a novel base.
  const geometry = getMaterialGeometry(recipe.id)
  return exact + matchedTerms + Number(recipe.style === 'storybook') * 4
    + Number(geometry?.supportsOn === true) * 2 - Number(geometry?.supportsOn === false)
}

/** Bounded familiar-part examples for ONE custom object, never replacements.
 * Match only explicitly named constituent identities. Unknown inventions get
 * no unrelated fallback; the caller must keep all attached/fused requirements
 * in its drawing contract and run the normal visual verification afterwards.
 */
export function sceneGeometryReferences(object) {
  const phrases = [text(object?.name), ...strings(object?.aliases), ...strings(object?.essential)].filter(Boolean)
  const requested = [...new Set(phrases.flatMap(namedSceneSubjects))]
  if (!requested.length) return []
  const request = phrases.join(' ').toLowerCase(), result = []
  let totalCommands = 0
  for (const subject of requested) {
    if (result.length >= SCENE_GEOMETRY_REFERENCE_LIMITS.subjects) break
    const candidates = drawingRecipes.filter(recipe => recipe.subject === subject && isMaterialEnabled(recipe.id)
      && (recipe.style ?? 'storybook') === 'storybook')
      .map(recipe => ({ recipe, sketch: validateSketch(recipe.sketch), score: poseScore(recipe, request) }))
      .filter(candidate => candidate.sketch)
      .sort((a, b) => b.score - a.score || commands(a.sketch) - commands(b.sketch) || a.recipe.id.localeCompare(b.recipe.id))
    for (const { recipe, sketch } of candidates) {
      const count = commands(sketch), entry = { id: recipe.id, subject: recipe.subject, name: recipe.name, sketch }
      if (totalCommands + count > SCENE_GEOMETRY_REFERENCE_LIMITS.commands
        || JSON.stringify([...result, entry]).length > SCENE_GEOMETRY_REFERENCE_LIMITS.characters) continue
      result.push(entry); totalCommands += count
      break
    }
  }
  return result
}
