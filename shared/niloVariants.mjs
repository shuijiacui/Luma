import { drawingRecipes, getDrawingRecipe, matchingRecipeSubjects } from './niloRecipes.mjs'
import { localPaths } from './niloGeometry.mjs'
import { validateSketch } from './niloSketch.mjs'
import { drawingIllustrations, getDrawingIllustration, matchingIllustrationSubjects } from './niloIllustrations.mjs'
import { isMaterialEnabled, getRetiredMaterialIdentity } from './niloCuration.mjs'

const names = {
  waves: ['waves', '水波'], fish: ['fish', '鱼'], leaf: ['leaf', '叶子'], window: ['window', '窗户'],
  stars: ['star', '星星'], cloud: ['cloud', '云朵'], flower: ['flower', '花'], trail: ['trail', '小路'],
  flame: ['flame', '火焰'], rain: ['rain', '雨'], grass: ['grass', '小草'], echo: ['echo', '线条'],
  sun: ['sun', '太阳'], moon: ['moon', '月亮'], tree: ['tree', '树'], mountain: ['mountain', '山'],
  house: ['house', '房子'], boat: ['boat', '小船'], bird: ['bird', '小鸟'], butterfly: ['butterfly', '蝴蝶'], heart: ['heart', '爱心'],
}
const normalized = value => typeof value === 'string' ? value.trim().toLowerCase().replace(/\s+/g, ' ') : ''
const namedSubject = name => {
  const matches = [...new Set([...matchingRecipeSubjects(name, true), ...matchingIllustrationSubjects(name, true)])]
  if (matches.length === 1) return matches[0]
  return Object.values(names).find(values => values.some(value => normalized(value) === normalized(name)))?.[0] ?? `custom:${normalized(name)}`
}

function subjectKey(proposal) {
  if (!proposal || typeof proposal !== 'object') return null
  if (proposal.template === 'illustration') {
    const illustration = getDrawingIllustration(proposal.illustrationId)
    if (!illustration) return null
    const subject = normalized(proposal.subject)
    if (subject && subject !== normalized(illustration.name) && subject !== normalized(illustration.subject)
      && namedSubject(proposal.subject) !== illustration.subject) return null
    return illustration.subject
  }
  const key = proposal.template === 'custom' ? (normalized(proposal.subject) ? namedSubject(proposal.subject) : null) : names[proposal.template]?.[0]
  const recipe = proposal.recipeId ? getDrawingRecipe(proposal.recipeId) ?? getRetiredMaterialIdentity(proposal.recipeId) : null
  // A title saying "sun" must never disguise a moon recipe.
  if (proposal.recipeId && (!recipe || recipe.subject !== key)) return null
  return key ?? null
}

export function sameDrawingSubject(source, candidate) {
  const key = subjectKey(source)
  return !!key && key === subjectKey(candidate)
}

export function variantSubjectName(proposal, locale = 'zh') {
  if (proposal.template === 'illustration') {
    const illustration = getDrawingIllustration(proposal.illustrationId)
    return illustration ? (locale === 'en' ? illustration.subject : illustration.name) : proposal.subject ?? ''
  }
  if (proposal.template === 'custom') return proposal.subject
  return names[proposal.template]?.[locale === 'en' ? 0 : 1] ?? proposal.template
}

/** Fit the new silhouette proportionally INSIDE the user's existing frame.
 * Keeping the frame stable also prevents repeated changes from shrinking it.
 * Never infer a fresh size/position or convert a partial free sketch to stock art.
 */
export function fitVariantToFrame(source, candidate, canvasAspect = 1) {
  if (!sameDrawingSubject(source, candidate) || !Number.isFinite(canvasAspect) || canvasAspect <= 0) return null
  if ((candidate.recipeId && !isMaterialEnabled(candidate.recipeId))
    || (candidate.illustrationId && !isMaterialEnabled(candidate.illustrationId))) return null
  if (source.template === 'custom' && !source.recipeId && (candidate.template !== 'custom' || candidate.recipeId)) return null
  if (candidate.template === 'illustration') {
    // The bitmap renderer contains the illustration inside this stable frame.
    // Keeping its original pixels avoids tracing or flattening it into strokes.
    const next = { ...source, template: 'illustration', illustrationId: candidate.illustrationId,
      subject: source.subject ?? variantSubjectName(candidate) }
    delete next.sketch
    delete next.recipeId
    delete next.echoPoints
    return next
  }
  let sketch = candidate.template === 'custom' ? validateSketch(candidate.sketch) : null
  if (!sketch && candidate.template !== 'custom' && candidate.template !== 'echo') {
    const paths = localPaths(candidate.template)
    if (!paths?.length || paths.length > 24) return null
    const count = Math.min(32, Math.floor(96 / paths.length))
    sketch = validateSketch({ aspect: candidate.width * canvasAspect / candidate.height,
      paths: paths.map(path => {
        const length = Math.min(count, path.length)
        return Array.from({ length }, (_, i) => {
          const point = path[Math.round(i * (path.length - 1) / Math.max(1, length - 1))]
          return [i ? 'L' : 'M', point.x, point.y]
        })
      }) })
  }
  if (!sketch) return null
  const frameAspect = source.width * canvasAspect / source.height
  if (!Number.isFinite(frameAspect) || frameAspect < .2 || frameAspect > 5) return null
  const sx = Math.min(1, sketch.aspect / frameAspect), sy = Math.min(1, frameAspect / sketch.aspect)
  const x = value => .5 + (value - .5) * sx, y = value => .5 + (value - .5) * sy
  const fitted = validateSketch({ aspect: frameAspect, paths: sketch.paths.map(path => path.map(([op, ...coords]) =>
    op === 'E' ? [op, x(coords[0]), y(coords[1]), coords[2] * sx, coords[3] * sy]
      : [op, ...coords.map((value, i) => i % 2 ? y(value) : x(value))])) })
  if (!fitted) return null
  const next = { ...source, template: 'custom', subject: source.subject ?? candidate.subject ?? variantSubjectName(source), sketch: fitted }
  delete next.echoPoints
  delete next.illustrationId
  delete next.recipeId
  if (candidate.recipeId) next.recipeId = candidate.recipeId
  return next
}

/** Library lookup is allowed for explicit built-ins or known recipe IDs only.
 * A free custom "太阳" might be half a sun or a child's special design.
 */
export function nextDrawingVariant(source, canvasAspect = (source.sketch?.aspect ?? getDrawingIllustration(source.illustrationId)?.aspect) * source.height / source.width || 1) {
  if (source.attachment || source.contact) return null
  if (source.template === 'custom' && !source.recipeId) return null
  const key = subjectKey(source)
  if (!key) return null
  if (source.template === 'illustration') {
    const choices = drawingIllustrations.filter(illustration => illustration.subject === key && isMaterialEnabled(illustration.id))
    if (!choices.length || (choices.length === 1 && choices[0].id === source.illustrationId)) return null
    const index = choices.findIndex(illustration => illustration.id === source.illustrationId)
    const next = choices[(index + 1) % choices.length]
    return fitVariantToFrame(source, { ...source, illustrationId: next.id, subject: next.name }, canvasAspect)
  }
  const choices = drawingRecipes.filter(recipe => recipe.subject === key && isMaterialEnabled(recipe.id))
  if (!choices.length || (choices.length === 1 && choices[0].id === source.recipeId)) return null
  const index = choices.findIndex(recipe => recipe.id === source.recipeId)
  const next = choices[(index + 1) % choices.length]
  return fitVariantToFrame(source, { ...source, template: 'custom', subject: source.subject ?? next.name,
    recipeId: next.id, sketch: next.sketch }, canvasAspect)
}
