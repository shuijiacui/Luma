import { getDrawingRecipe } from './niloRecipes.mjs'
import { isMaterialEnabled } from './niloCuration.mjs'
import { validateSketch } from './niloSketch.mjs'
import { getDrawingIllustration } from './niloIllustrations.mjs'

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const text = (value, max) => typeof value === 'string' && value.trim() && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value) ? value.trim() : null
const color = value => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : null
const keys = (value, allowed) => record(value) && Object.keys(value).every(key => allowed.includes(key))
const strings = (value, max, length) => Array.isArray(value) && value.length <= max && value.every(item => text(item, length)) ? [...new Set(value.map(item => item.trim()))] : null
export const sceneDrawingCapabilities = Object.freeze({
  castle: { towers: [2, 3], roof: ['pointed', 'battlement'], windows: [0, 1, 2, 3, 4, 5, 6], wings: [false, true] },
  tree: { canopy: ['round', 'pine'] }, cloud: {},
  stars: { count: [1, 2, 3, 4, 5] }, moon: { phase: ['crescent', 'full'] },
  path: { curve: ['left', 'right'] }, water: { rows: [1, 2, 3, 4, 5] },
})
export const scenePalette = Object.freeze({ sky: '#e6edf9', ground: '#dceadf', ink: '#66729b', accent: '#bc8bba' })

/** Shared trust boundary for persisted plans and model output. No executable SVG or silent part removal. */
export function sanitizeScenePlan(raw) {
  if (!keys(raw, ['version', 'title', 'summary', 'request', 'palette', 'objects', 'preserve', 'materialProfile']) || raw.version !== 1) return null
  const title = text(raw.title, 100), summary = text(raw.summary, 400), request = text(raw.request, 600)
  if (!title || !summary || !request || !Array.isArray(raw.objects) || !raw.objects.length || raw.objects.length > 8) return null
  const preserve = strings(raw.preserve ?? [], 12, 160)
  if (!preserve || (raw.palette !== undefined && (!keys(raw.palette, ['sky', 'ground', 'ink', 'accent']) || Object.values(raw.palette).some(value => !color(value))))) return null
  if (raw.materialProfile !== undefined && (!keys(raw.materialProfile, ['style', 'detail']) || !['storybook', 'illustrated', 'realistic'].includes(raw.materialProfile.style) || !['simple', 'moderate', 'rich'].includes(raw.materialProfile.detail))) return null
  const palette = { ...scenePalette, ...raw.palette }, ids = new Set(), objects = []
  for (const item of raw.objects) {
    if (!keys(item, ['id', 'name', 'aliases', 'role', 'essential', 'render', 'box', 'color', 'connectTo'])) return null
    const id = text(item.id, 64), name = text(item.name, 60), essential = strings(item.essential, 4, 100), aliases = strings(item.aliases ?? [], 6, 100)
    const box = item.box, render = item.render
    const registered = render?.kind === 'recipe' && !!getDrawingRecipe(render.recipeId) || render?.kind === 'illustration' && !!getDrawingIllustration(render.illustrationId)
    if (!id || !/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(id) || ids.has(id) || !name || !essential?.length || !aliases
      || !['main', 'support', 'atmosphere'].includes(item.role)
      || !keys(box, ['x', 'y', 'width', 'height']) || !['x', 'y', 'width', 'height'].every(key => typeof box[key] === 'number' && Number.isFinite(box[key]))
      || box.x < 0 || box.y < 0 || box.width < .025 || box.height < .025 || box.width > (registered ? .9 : .45) || box.height > (registered ? .9 : .45) || box.width * box.height > (registered ? .81 : .16) + 1e-9
      || box.x + box.width > 1 + 1e-9 || box.y + box.height > 1 + 1e-9 || !color(item.color)
      || !keys(render, ['kind', 'recipeId', 'illustrationId', 'primitive', 'parameters']) || !['recipe', 'illustration', 'compose', 'custom'].includes(render.kind)) return null
    let cleanRender
    if (render.kind === 'recipe') {
      if (!keys(render, ['kind', 'recipeId']) || !getDrawingRecipe(render.recipeId)) return null
      cleanRender = { kind: 'recipe', recipeId: render.recipeId }
    } else if (render.kind === 'illustration') {
      if (!keys(render, ['kind', 'illustrationId']) || !getDrawingIllustration(render.illustrationId)) return null
      cleanRender = { kind: 'illustration', illustrationId: render.illustrationId }
    } else if (render.kind === 'compose') {
      if (!keys(render, ['kind', 'primitive', 'parameters']) || !Object.hasOwn(sceneDrawingCapabilities, render.primitive)) return null
      const parameters = render.parameters ?? {}, allowed = sceneDrawingCapabilities[render.primitive]
      if (!record(parameters) || !Object.entries(parameters).every(([key, value]) => Object.hasOwn(allowed, key) && allowed[key].includes(value))) return null
      cleanRender = { kind: 'compose', primitive: render.primitive, parameters: { ...parameters } }
    } else {
      if (!keys(render, ['kind'])) return null
      cleanRender = { kind: 'custom' }
    }
    if (item.connectTo !== undefined && (!text(item.connectTo, 64) || cleanRender.kind !== 'compose' || cleanRender.primitive !== 'path')) return null
    ids.add(id)
    objects.push({ id, name, aliases, role: item.role, essential, render: cleanRender, box: { ...box }, color: color(item.color),
      ...(item.connectTo ? { connectTo: item.connectTo } : {}) })
  }
  if (objects.some(item => item.connectTo && (!ids.has(item.connectTo) || item.connectTo === item.id
    || objects.find(target => target.id === item.connectTo)?.render.primitive === 'path'))) return null
  if (!objects.some(item => item.role === 'main')) return null
  return { version: 1, title, summary, request, palette, objects, preserve, ...(raw.materialProfile ? { materialProfile: { ...raw.materialProfile } } : {}) }
}

function castle(parameters) {
  const towers = parameters.towers ?? 3, pointed = parameters.roof !== 'battlement', wings = parameters.wings === true
  const paths = [], left = wings ? .3 : .12, right = wings ? .7 : .88, span = right - left
  const towerWidth = span * .25, wallLeft = left + towerWidth / 2, wallRight = right - towerWidth / 2, wallTop = .58
  // The front wall meets the inside edges of the two towers. Rear tower strokes
  // stop at its top edge, so no hidden base lines cut through the facade.
  paths.push([['M', wallLeft, wallTop], ['L', wallRight, wallTop], ['L', wallRight, .94], ['L', wallLeft, .94], ['Z']])
  for (let i = 0; i < towers; i++) {
    const rear = towers === 3 && i === 1
    const x = left + span * i / (towers - 1), w = towerWidth, top = rear ? .11 : .24
    const x0 = Math.max(.04, x - w / 2), x1 = Math.min(.96, x + w / 2)
    paths.push(rear ? [['M', x0, wallTop], ['L', x0, top + .1], ['L', x1, top + .1], ['L', x1, wallTop]]
      : [['M', x0, top + .1], ['L', x0, .94], ['L', x1, .94], ['L', x1, top + .1]])
    paths.push(pointed ? [['M', x0 - .015, top + .1], ['L', x, top], ['L', x1 + .015, top + .1], ['Z']]
      : [['M', x0, top + .1], ['L', x0, top], ['L', x0 + w / 3, top], ['L', x0 + w / 3, top + .035], ['L', x0 + w * 2 / 3, top + .035], ['L', x0 + w * 2 / 3, top], ['L', x1, top], ['L', x1, top + .1]])
  }
  paths.push([['M', .45, .94], ['L', .45, .8], ['C', .45, .7, .55, .7, .55, .8], ['L', .55, .94]])
  const windows = parameters.windows ?? 4
  const windowPositions = [[left, .49], [right, .49], [towers === 3 ? .5 : wallLeft + .035, towers === 3 ? .36 : .68], [wallLeft + .035, .78], [wallRight - .035, .78], [.5, .65]]
  for (let i = 0; i < windows; i++) {
    const [x, y] = windowPositions[i]
    paths.push([['E', x, y, .016, .03]])
  }
  if (wings) {
    paths.push([['M', .3, .58], ['C', .22, .33, .08, .29, .025, .36], ['Q', .05, .5, .14, .54], ['Q', .07, .53, .06, .58], ['Q', .16, .72, .3, .69]])
    paths.push([['M', .7, .58], ['C', .78, .33, .92, .29, .975, .36], ['Q', .95, .5, .86, .54], ['Q', .93, .53, .94, .58], ['Q', .84, .72, .7, .69]])
  }
  return { aspect: wings ? 1.8 : 1.1, paths }
}

function compose(primitive, p) {
  if (primitive === 'castle') return castle(p)
  if (primitive === 'cloud') return { aspect: 2, paths: [[['M', .16, .75], ['C', .01, .77, .01, .46, .2, .44], ['C', .2, .12, .55, .07, .62, .38], ['C', .81, .24, .94, .4, .91, .53], ['C', 1, .67, .87, .83, .73, .77], ['Q', .4, .89, .16, .75], ['Z']]] }
  if (primitive === 'tree') return { aspect: .7, paths: [
    [['M', .44, .62], ['L', .43, .97], ['L', .58, .97], ['L', .56, .62]],
    p.canopy === 'pine' ? [['M', .5, .03], ['L', .23, .35], ['L', .33, .35], ['L', .11, .62], ['L', .23, .62], ['L', .04, .81], ['L', .96, .81], ['L', .77, .62], ['L', .89, .62], ['L', .67, .35], ['L', .77, .35], ['Z']]
      : [['M', .29, .73], ['C', .01, .76, .01, .46, .14, .4], ['C', .04, .17, .31, .02, .46, .13], ['C', .66, .01, .93, .12, .89, .38], ['C', 1, .55, .88, .8, .68, .73], ['Q', .48, .86, .29, .73], ['Z']],
  ] }
  if (primitive === 'moon') return { aspect: 1, paths: [p.phase === 'full' ? [['E', .5, .5, .43, .43]] : [['M', .67, .07], ['C', .17, .02, .01, .72, .44, .91], ['C', .69, 1, .88, .82, .93, .67], ['C', .38, .82, .24, .31, .67, .07], ['Z']]] }
  if (primitive === 'path') {
    const bend = p.curve === 'left' ? .18 : .82
    return { aspect: 1, paths: [[['M', .43, .03], ['C', bend, .33, bend, .59, .08, .97]], [['M', .56, .03], ['C', bend + (bend < .5 ? .2 : -.2), .33, .92, .7, .88, .97]]] }
  }
  if (primitive === 'water') return { aspect: 2.5, paths: Array.from({ length: p.rows ?? 3 }, (_, i) => { const y = .15 + i * .7 / Math.max(1, (p.rows ?? 3) - 1); return [['M', .03, y], ['Q', .18, y - .08, .34, y], ['Q', .5, y + .08, .66, y], ['Q', .82, y - .08, .97, y]] }) }
  if (primitive === 'stars') return { aspect: 1, paths: Array.from({ length: p.count ?? 3 }, (_, i) => {
    const count = p.count ?? 3, cx = count === 1 ? .5 : .16 + (i % 3) * .33, cy = count === 1 ? .5 : .23 + Math.floor(i / 3) * .53, radius = count === 1 ? .43 : .13
    return [...Array.from({ length: 10 }, (_, k) => { const a = -Math.PI / 2 + k * Math.PI / 5, r = k % 2 ? radius * .43 : radius; return [k ? 'L' : 'M', cx + Math.cos(a) * r, cy + Math.sin(a) * r] }), ['Z']]
  }) }
  return null
}

/** Compiles approved geometry; new semantic features must use custom, never disappear here. */
export function compileSceneObject(object, _options = {}) {
  const r = object?.render
  if (!record(r)) return null
  if (r.kind === 'recipe' && keys(r, ['kind', 'recipeId'])) {
    const recipe = getDrawingRecipe(r.recipeId)
    const sketch = recipe && isMaterialEnabled(recipe.id) && validateSketch(recipe.sketch)
    return sketch ? { sketch, recipeId: recipe.id } : null
  }
  if (r.kind !== 'compose' || !keys(r, ['kind', 'primitive', 'parameters']) || !Object.hasOwn(sceneDrawingCapabilities, r.primitive)) return null
  const p = r.parameters ?? {}, allowed = sceneDrawingCapabilities[r.primitive]
  if (!record(p) || !Object.entries(p).every(([key, value]) => Object.hasOwn(allowed, key) && allowed[key].includes(value))) return null
  const sketch = validateSketch(compose(r.primitive, p))
  return sketch ? { sketch } : null
}
