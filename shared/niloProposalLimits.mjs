import { getDrawingRecipe } from './niloRecipes.mjs'

const generatedLimits = Object.freeze({ minSpan: .025, maxSpan: .45, maxArea: .16 })
const referenceLimits = Object.freeze({ minSpan: .025, maxSpan: .9, maxArea: .81 })

/** A catalogue ID alone is not proof of catalogue geometry. Compare the actual
 * commands with the registered sketch, including the proportional padding used
 * when a child switches materials inside an existing frame. Curation affects
 * new selection, not the ability to resize a previously saved picture. */
export function hasRegisteredRecipeGeometry(proposal) {
  if (proposal?.template !== 'custom' || typeof proposal.recipeId !== 'string') return false
  const recipe = getDrawingRecipe(proposal.recipeId), sketch = proposal.sketch
  if (!recipe || !sketch || !Number.isFinite(sketch.aspect) || sketch.aspect < .2 || sketch.aspect > 5
    || !Array.isArray(sketch.paths) || sketch.paths.length !== recipe.sketch.paths.length) return false
  const sx = Math.min(1, recipe.sketch.aspect / sketch.aspect), sy = Math.min(1, sketch.aspect / recipe.sketch.aspect)
  const coordinate = (value, axis) => .5 + (value - .5) * (axis ? sy : sx)
  return recipe.sketch.paths.every((path, index) => {
    const actual = sketch.paths[index]
    return Array.isArray(actual) && actual.length === path.length && path.every(([op, ...values], commandIndex) => {
      const command = actual[commandIndex]
      if (!Array.isArray(command) || command[0] !== op || command.length !== values.length + 1) return false
      return values.every((value, i) => {
        const expected = op === 'E' && i >= 2 ? value * (i === 2 ? sx : sy) : coordinate(value, i % 2)
        return Number.isFinite(command[i + 1]) && Math.abs(command[i + 1] - expected) <= 1e-9
      })
    })
  })
}

/** Scaling a registered SVG adds no paths or commands. Give it the same paper
 * budget as an image reference; keep generated sketches within their budget. */
export function drawingProposalLimits(proposal) {
  return ['illustration', 'generated'].includes(proposal?.template) || hasRegisteredRecipeGeometry(proposal) ? referenceLimits : generatedLimits
}
