import { hasCompositeDrawing } from './niloDrawingReferences.js'
import { readFileSync } from 'node:fs'

let cachedExamples
const loadExamples = () => cachedExamples ??= JSON.parse(readFileSync(new URL('../../skills/nilo-cocreate/references/examples.json', import.meta.url), 'utf8'))

/** At most two examples per plan. Selection uses the child's words and actual
 * gesture geometry, never an assistant's guessed subject. */
export function selectCoCreationExamples(context) {
  const text = [context.utterance, ...(context.history ?? []).filter(x => x.role === 'user').map(x => x.text)].join(' ').toLowerCase()
  const points = context.lastStroke?.points ?? []
  const aspect = context.canvasAspect ?? 1
  const span = points.length ? Math.max(...points.map(p => p.x * aspect)) - Math.min(...points.map(p => p.x * aspect))
    + Math.max(...points.map(p => p.y)) - Math.min(...points.map(p => p.y)) : 0
  const closed = points.length >= 6 && span > .03 && Math.hypot((points[0].x - points.at(-1).x) * aspect, points[0].y - points.at(-1).y) < span * .12
  const shape = closed ? 'closed' : 'open'
  const composite = hasCompositeDrawing(context)
  const turns = context.scene?.recentContributions ?? []
  const multiple = turns.some(x => x.owner === 'nilo') && turns.at(-1)?.owner === 'child'
  return loadExamples().map((example, index) => ({ example, index, score:
    example.words.reduce((n, word) => n + ((/^[a-z]+$/.test(word) ? new RegExp(`\\b${word}s?\\b`).test(text) : text.includes(word)) ? 4 : 0), 0)
      + (['closed-to-balloon', 'open-gesture'].includes(example.id) && !composite && example.shape === shape && points.length > 1 ? 2 : 0)
      + (example.shape === 'composite' && composite ? 6 : 0)
      + (example.shape === 'multiple' && multiple ? 7 : 0) }))
    .filter(x => x.score > 0).sort((a, b) => b.score - a.score || a.index - b.index).slice(0, 2).map(x => x.example)
}

export function coCreationExamplesPrompt(context) {
  const selected = selectCoCreationExamples(context)
  return selected.length ? `REFERENCE EXAMPLES (possibilities, not recognition evidence or mandatory actions). Never copy their object identity onto the canvas. Match the child's declared story, current visible geometry and missing details. Example sketches use LOCAL part coordinates; anchor/attachment always use FULL CANVAS coordinates.\n${JSON.stringify(selected)}` : ''
}
