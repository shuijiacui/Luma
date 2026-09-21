import { getDrawingRecipe, creativeRecipeCatalogue } from '../../../shared/niloRecipes.mjs'
import { decodeOccupancy, pixelOccupancy } from '../../../shared/niloOccupancy.mjs'
import { proposalFootprint } from '../../../shared/niloCollision.mjs'
import { decodeCanvas } from './niloPreview.js'
import { validateCustomSketch } from './niloSketch.js'
import { normalizeTurnSketch } from './niloCoCreation.js'
import { LLMParseError } from './llmClient.js'

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n))
export function creativeColor(raw, recipe) {
  return typeof raw === 'string' && /^#[0-9a-f]{6}$/i.test(raw) ? raw.toLowerCase() : recipe?.colors?.[0] ?? '#568570'
}
const finite = (n, fallback) => Number.isFinite(n) ? n : fallback

export function creativeSketch(raw) {
  if (!raw || !Array.isArray(raw.paths) || raw.paths.length > 24) return null
  const lengths = { M: 2, L: 2, Q: 4, C: 6, E: 4, Z: 0 }
  const paths = []
  for (const path of raw.paths) {
    if (Array.isArray(path) && Array.isArray(path[0])) { paths.push(path); continue }
    // Some providers serialize commands as data strings. Parse only the finite
    // drawing alphabet; never evaluate SVG/JS or invent missing coordinates.
    let tokens = path
    if (typeof path === 'string') {
      if (path.length > 8000) return null
      tokens = path.match(/[MLQCEZ]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?/gi)
      if (!tokens || path.replace(/[MLQCEZ]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?/gi, '').replace(/[\s,]/g, '')) return null
      tokens = tokens.map(token => Object.hasOwn(lengths, token) ? token : Number(token))
    }
    if (!Array.isArray(tokens) || tokens.length > 224) return null
    const commands = []
    for (let i = 0; i < tokens.length;) {
      const op = tokens[i++], length = lengths[op]
      if (length === undefined || i + length > tokens.length) return null
      const coords = tokens.slice(i, i + length)
      if (!coords.every(n => typeof n === 'number' && Number.isFinite(n))) return null
      commands.push([op, ...coords]); i += length
    }
    paths.push(commands)
  }
  const normalized = normalizeTurnSketch({ aspect: raw.aspect, paths }, 24)
  const valid = validateCustomSketch(normalized)
  if (valid || !normalized) return valid
  // Tiny ellipse/control-point overshoots are representation errors. Reframe
  // the whole object together, preserving physical proportions and all paths.
  let left = 0, top = 0, right = 1, bottom = 1
  for (const path of normalized.paths) for (const [op, ...coords] of path) {
    if (coords.some(n => typeof n !== 'number' || !Number.isFinite(n))) return null
    if (op === 'E') {
      left = Math.min(left, coords[0] - coords[2]); right = Math.max(right, coords[0] + coords[2])
      top = Math.min(top, coords[1] - coords[3]); bottom = Math.max(bottom, coords[1] + coords[3])
    } else for (let i = 0; i < coords.length; i += 2) {
      left = Math.min(left, coords[i]); right = Math.max(right, coords[i]); top = Math.min(top, coords[i + 1]); bottom = Math.max(bottom, coords[i + 1])
    }
  }
  if (left < -.1 || top < -.1 || right > 1.1 || bottom > 1.1) return null
  const width = right - left, height = bottom - top
  return validateCustomSketch({ aspect: raw.aspect * width / height, paths: normalized.paths.map(path => path.map(([op, ...coords]) =>
    op === 'E' ? [op, (coords[0] - left) / width, (coords[1] - top) / height, coords[2] / width, coords[3] / height]
      : [op, ...coords.map((n, i) => i % 2 ? (n - top) / height : (n - left) / width)])) })
}

// A minimal structural check, not another judge of the child's story.
export function hasDrawableIdea(sketch) {
  if (!sketch) return false
  const commands = sketch.paths.flat()
  const count = op => commands.filter(command => command[0] === op).length
  return count('E') > 0 || count('Z') > 0 || count('Q') + count('C') >= 2 || count('L') >= 4
}

export function creativeObjectSize(raw, sketch, context, observation) {
  const aspect = context.canvasAspect || 1, shortSide = Math.min(1, aspect)
  const bounds = observation.subjects.map(s => s.bounds).filter(Boolean)
  const subjectSpan = bounds.length ? Math.max(...bounds.map(b => Math.max(b.width * aspect, b.height))) : shortSide * .5
  // The model chooses the scale; observed subject size is only a missing-value default.
  const desired = finite(raw?.scale, subjectSpan * .45 / shortSide) * shortSide
  const surfaceHeight = context.canvasSize?.height || 600
  const minor = Math.min(1, sketch.aspect) / Math.max(1, sketch.aspect)
  const readable = Math.max(12, (context.drawingStyle?.brushSize || 4) * 4) / surfaceHeight / minor
  const maximum = Math.min(.44 * aspect / Math.min(1, sketch.aspect), .44 * Math.max(1, sketch.aspect),
    Math.sqrt(.15 * aspect * Math.max(1, sketch.aspect) / Math.min(1, sketch.aspect)))
  const minimum = Math.min(maximum, Math.max(readable, .026 * aspect / Math.min(1, sketch.aspect), .026 * Math.max(1, sketch.aspect)))
  const span = clamp(desired, minimum, maximum)
  return { width: span * Math.min(1, sketch.aspect) / aspect, height: span / Math.max(1, sketch.aspect) }
}

// Empty space is a preference, not a veto on a child's imaginative scene.
export function placeCreativeObject(proposal, occupancy, aspect, size) {
  const n = Math.sqrt(occupancy.length)
  const candidates = [proposal]
  for (const distance of [.06, .12, .18]) for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1],[.7,.7],[-.7,.7],[.7,-.7],[-.7,-.7]]) {
    candidates.push({ ...proposal, x: clamp(proposal.x + dx * distance / aspect, .04, .96 - proposal.width),
      y: clamp(proposal.y + dy * distance, .04, .96 - proposal.height) })
  }
  let best = proposal, bestScore = Infinity
  for (const candidate of candidates) {
    const cells = proposalFootprint(candidate, n, aspect, size)
    if (!cells?.size) continue
    const overlap = [...cells].reduce((sum, cell) => sum + occupancy[cell], 0) / cells.size
    const distance = Math.hypot((candidate.x - proposal.x) * aspect, candidate.y - proposal.y)
    const score = overlap + distance * .35
    if (score < bestScore) { best = candidate; bestScore = score }
    if (score === 0) break
  }
  return best
}

/** One model choice, optional data-format repair; no semantic approval round. */
export async function generateCreativeTurn({ imageBase64, context, knowledge, call, opts, validateProposal }) {
  const catalogue = creativeRecipeCatalogue([
    {subject:context.utterance}, ...knowledge.observation.subjects,
  ], context.recentRecipeIds)
  const prompt = `You are Nilo, a playful drawing partner for a child. Look at the WHOLE picture and choose ONE most relevant new idea yourself. Draw it; do not ask the child to choose from a menu. Imaginative, impossible, loosely associated scenes are welcome. Uncertain recognition is not a reason to stop: offer your own imaginative addition without claiming what the child intended. You need not continue the last stroke or attach to existing anatomy. Follow an explicit request when present, otherwise prefer a complete related object with a readable silhouette and several distinguishing details. Use a different pose/variant from recent turns when appropriate.
Return ONLY JSON {"subject":"name of your addition","relationship":"brief connection to this picture","recipeId":"an available recipe ID or null","backup":{"recipeId":"most relevant available recipe ID","relationship":"its own connection","at":[0.7,0.6],"scale":0.2},"sketch":null,"color":"#328ab5","at":[0.7,0.5],"scale":0.28}.
COLOR: Choose your OWN #RRGGBB stroke color based on the picture, the new subject and the child's story. You are not locked to the child's current pen color. Use clear, harmonious colors visible on the white paper; avoid near-white ink. The catalogue colors are suggestions, not limits. If the child explicitly requests a color, obey it. The backup should include its own color. Keep the child's brush texture and line thickness.
PATH DATA SCHEMA: paths is an array of strokes; each stroke is an array of command arrays. Example of representation ONLY: [[['M',0.1,0.2],['Q',0.5,0.1,0.9,0.2]],[['E',0.5,0.5,0.1,0.1]]]. Use double quotes for valid JSON. An ellipse's centre minus/plus radius must remain within 0..1. No negative coordinates. backup.recipeId MUST be an EXACT ID from RECIPE CATALOGUE (e.g. boat-0), not a lesson ID or a subject name.
Choose a recipe when it depicts your idea. For anything outside the catalogue, supply sketch:{aspect:physicalWidth/physicalHeight,paths:[...]} and recipeId:null. This is NOT limited to the catalogue. Draw a recognizable silhouette and distinguishing features, not isolated slashes, arbitrary squiggles or a disconnected fragment described as a whole object. A bird needs a coherent body, head/beak and wing; a cup needs a body and handle. Keep the child's simple hand-drawn style, without sacrificing identity. Up to 24 paths and 96 commands; commands M x y, L x y, Q cx cy x y, C c1x c1y c2x c2y x y, Z or a separate ellipse E cx cy rx ry. All local coordinates are 0..1, aspect .2..5; start open paths with M. backup.recipeId is YOUR related alternative if custom drawing data cannot render, never a random system choice. at is the preferred full-canvas centre. scale is the desired LONG physical side divided by the canvas SHORT side: choose it from the scene, NOT a constant. Compare with the visible subject and available space: a butterfly near a large tree should be much smaller than the tree; a companion character may be similar in height to the existing character. Include a brief sizeReason in your JSON. Decide scale and position together so the object fits its role; do not fill all whitespace or always make tiny icons. Prefer clear space but crossing a line is allowed. Coordinates are x left-to-right and y TOP-to-BOTTOM: above means smaller y. Place near the actual visual feature mentioned in the relationship. Round bubbles should be round in physical space: for E, rx * sketch.aspect should equal ry. Separate bubbles should be separate circles rather than one nested oval. Give the backup its OWN size and position appropriate to that object. Do not return empty plans, a refusal or a clarification question just because the drawing is abstract. Do not infer psychology. Name the addition in ${context.locale === 'en' ? 'English' : 'Chinese'}.
RECIPE CATALOGUE (all available IDs and poses, choose freely):
${catalogue.index}
RELEVANT ASSOCIATIONS AND OPTIONAL COLORS: ${JSON.stringify(catalogue.relevant)}
DRAWING KNOWLEDGE: ${JSON.stringify(knowledge.cards)}
OBSERVATION (suggestions, not required identities or regions): ${JSON.stringify(knowledge.observation)}
CHILD CONTEXT: ${JSON.stringify({ utterance: context.utterance, history: context.history, recentSubjects: context.recentSubjects, recentRecipeIds: context.recentRecipeIds, canvasAspect: context.canvasAspect })}`
  for (let attempt = 0; attempt < 2; attempt++) {
    let raw
    try {
      raw = await call(attempt ? `${prompt}\nThe previous response was not renderable data. Choose the most related recipe from the catalogue and return its recipeId with at and scale.` : prompt,
        { ...opts, kind: 'nilo_companion_vision', maxTokens: attempt ? 650 : 2400 })
    } catch (error) { if (!(error instanceof LLMParseError)) throw error }
    opts.signal.throwIfAborted()
    let recipe = getDrawingRecipe(raw?.recipeId)
    let sketch = recipe?.sketch ?? creativeSketch(raw?.sketch)
    if (!hasDrawableIdea(sketch)) {
      recipe = getDrawingRecipe(raw?.backup?.recipeId ?? raw?.backupRecipeId); sketch = recipe?.sketch
      // A different object needs its OWN layout and relationship, never the
      // failed original's anatomy (e.g. a bench must not inherit "held wand").
      raw = raw?.backup ?? { relationship: context.locale === 'en' ? 'A new friend for our imaginary scene' : '想象画面里的新伙伴' }
    }
    if (!sketch) continue
    const aspect = context.canvasAspect || 1
    const { width, height } = creativeObjectSize(raw, sketch, context, knowledge.observation)
    const style = context.drawingStyle ?? { color: '#568570', brushSize: 4, brushKind: 'round' }
    const color = creativeColor(raw?.color, recipe)
    const proposal = validateProposal({ template: 'custom', contribution: 'object', placementPolicy: 'free',
      subject: recipe ? (context.locale === 'en' ? recipe.subject : recipe.name) : raw?.subject,
      ...(recipe ? { recipeId: recipe.id } : {}), sketch, target: 'whole picture',
      relation: typeof raw?.relationship === 'string' && raw.relationship.trim() ? raw.relationship : 'An imaginative addition to our picture',
      x: clamp(finite(raw?.at?.[0], .7) - width / 2, .04, .96 - width),
      y: clamp(finite(raw?.at?.[1], .5) - height / 2, .04, .96 - height), width, height,
      rotation: 0, color, strokeWidth: style.brushSize, brushKind: style.brushKind }, { ...context, takeTurn: false, drawingStyle: { ...style, color }, currentProposal: undefined, rejectedSubjects: [] })
    if (!proposal) continue
    const occupancy = decodeOccupancy(context.collisionMap) ?? pixelOccupancy(decodeCanvas(imageBase64))
    const placed = placeCreativeObject(proposal, occupancy, aspect, context.canvasSize)
    return { status: 'ready', protocolVersion: 3, geometryReviewed: true, proposal: placed,
      drawingMetrics: { plans: attempt + 1, reviews: 0, repairs: attempt },
      reply: context.locale === 'en' ? `Let’s add ${placed.subject}!` : `我来添上${placed.subject}！` }
  }
  return { status: 'unavailable', reason: 'invalid_response', reply: context.locale === 'en'
    ? 'The drawing did not come through. Tap me to try again.' : '这次画笔数据没传好，再点我试试。' }
}
