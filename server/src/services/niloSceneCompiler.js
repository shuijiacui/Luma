import { compileSceneObject, scenePalette } from '../../../shared/niloSceneDrawing.mjs'
import { getDrawingRecipe } from '../../../shared/niloRecipes.mjs'
import { getDrawingIllustration } from '../../../shared/niloIllustrations.mjs'
import { sampleProposalGeometry } from '../../../shared/niloGeometry.mjs'
import illustrationBounds from '../../../shared/niloIllustrationTracing.json' with { type: 'json' }
import { getMaterialGeometry } from './niloMaterialGeometry.js'
import { constrainExplicitSceneEdit } from './niloSceneEdits.js'

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const finite = value => typeof value === 'number' && Number.isFinite(value)
const clamp = (value, low, high) => Math.max(low, Math.min(high, value))
const fullBounds = { left: 0, top: 0, right: 1, bottom: 1 }
const relationAliases = { left: 'left-of', right: 'right-of', over: 'above', under: 'below', larger: 'larger-than', smaller: 'smaller-than' }
const supported = new Set(['left-of', 'right-of', 'above', 'below', 'on', 'near', 'larger-than', 'smaller-than'])
const colorNames = { red: '#ff0000', blue: '#0000ff', green: '#008000', yellow: '#ffff00', orange: '#ffa500', purple: '#800080', pink: '#ffc0cb', black: '#000000', white: '#ffffff', gray: '#808080', grey: '#808080', brown: '#a52a2a' }
const normalizedColor = value => typeof value === 'string' ? /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase()
  : /^#[0-9a-f]{3}$/i.test(value) ? `#${value.slice(1).split('').map(char => char + char).join('')}`.toLowerCase()
    : colorNames[value.toLowerCase().trim()] : undefined
const overlap = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top))
const boxBounds = box => ({ left: box.x, top: box.y, right: box.x + box.width, bottom: box.y + box.height })
const center = box => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 })
const sizeRelation = relation => relation.endsWith('-than')

function metadata(object, materials) {
  const render = object.render, id = render?.recipeId ?? render?.illustrationId
  const candidate = materials?.subjects?.flatMap(group => group.variants ?? []).find(item => item.id === id)
  const illustration = render?.kind === 'illustration' && getDrawingIllustration(id)
  const recipe = render?.kind === 'recipe' && getDrawingRecipe(id)
  const compiled = render?.kind === 'compose' && compileSceneObject(object)
  const sketch = recipe?.sketch ?? compiled?.sketch
  let bounds = illustration ? illustrationBounds[id] ?? candidate?.visibleBounds : candidate?.visibleBounds
  if (!bounds && sketch) {
    const points = sampleProposalGeometry({ template: 'custom', sketch, x: 0, y: 0, width: 1, height: 1, rotation: 0 }).flatMap(stroke => stroke.points)
    if (points.length) bounds = { left: Math.min(...points.map(p => p.x)), top: Math.min(...points.map(p => p.y)), right: Math.max(...points.map(p => p.x)), bottom: Math.max(...points.map(p => p.y)) }
  }
  return { registered: Boolean(illustration || recipe || render?.kind === 'generated'), aspect: illustration?.aspect ?? sketch?.aspect ?? candidate?.aspect ?? 1,
    geometry: getMaterialGeometry(id),
    visible: bounds && ['left', 'top', 'right', 'bottom'].every(key => finite(bounds[key])) ? bounds : fullBounds }
}

/** Match the renderer's aspect fitting before applying real contour margins. */
function frame(state, aspect) {
  const { box, material } = state
  let width = box.width, height = box.height
  if (width * aspect / height > material.aspect) width = height * material.aspect / aspect
  else height = width * aspect / material.aspect
  const x = box.x + (box.width - width) / 2, y = box.y + (box.height - height) / 2
  return { x, y, width, height }
}

function visible(state, aspect) {
  const { x, y, width, height } = frame(state, aspect), { material } = state
  const local = state.object.rotation === 180 ? { left: 1 - material.visible.right, right: 1 - material.visible.left, top: 1 - material.visible.bottom, bottom: 1 - material.visible.top } : material.visible
  return { left: x + width * local.left, right: x + width * local.right, top: y + height * local.top, bottom: y + height * local.bottom }
}

function pathOpening(state, aspect) {
  const fitted = frame(state, aspect)
  // compose/path always starts with two edges at (.43,.03) and (.56,.03).
  return { x: fitted.x + fitted.width * (state.object.rotation === 180 ? .505 : .495), y: fitted.y + fitted.height * (state.object.rotation === 180 ? .97 : .03) }
}

function supportBounds(state, aspect) {
  const surface = state.material.geometry?.supportSurface
  if (!surface) return visible(state, aspect)
  const fitted = frame(state, aspect), inverted = state.object.rotation === 180
  const y = fitted.y + fitted.height * (inverted ? 1 - surface.y : surface.y)
  return { left: fitted.x + fitted.width * (inverted ? 1 - surface.right : surface.left), right: fitted.x + fitted.width * (inverted ? 1 - surface.left : surface.right), top: y, bottom: y }
}

function span(state, aspect) {
  const bounds = visible(state, aspect)
  return Math.max((bounds.right - bounds.left) * aspect, bounds.bottom - bounds.top)
}

function boundedBox(box, registered) {
  const limit = registered ? .9 : .45, area = registered ? .81 : .16
  let width = clamp(box.width, .025, limit), height = clamp(box.height, .025, limit)
  if (width * height > area) { const scale = Math.sqrt(area / (width * height)); width *= scale; height *= scale }
  return { x: clamp(box.x, 0, 1 - width), y: clamp(box.y, 0, 1 - height), width, height }
}

function resize(state, scale) {
  const old = center(state.box)
  state.box.width *= scale; state.box.height *= scale
  state.box.x = old.x - state.box.width / 2; state.box.y = old.y - state.box.height / 2
}

function place(subject, target, relation, aspect, align = false) {
  const a = visible(subject, aspect), b = relation === 'on' ? supportBounds(target, aspect) : visible(target, aspect), gap = .035
  // Center/baseline alignment is only an initial suggestion. Later passes solve
  // actual inequalities on their own axes, so above cannot undo left-of.
  if (!align && !['on', 'connect-bottom'].includes(relation) && relationSatisfied(subject, target, relation, aspect)) return
  let dx = 0, dy = 0
  if (relation === 'connect-bottom') {
    const start = pathOpening(subject, aspect)
    dx = (b.left + b.right) / 2 - start.x; dy = b.bottom - start.y
  } else if (relation === 'left-of' || relation === 'right-of') {
    dx = relation === 'left-of' ? b.left - gap / aspect - a.right : b.right + gap / aspect - a.left
    if (align) dy = b.bottom - a.bottom
  } else if (relation === 'above' || relation === 'below' || relation === 'on') {
    if (align || relation === 'on') dx = (b.left + b.right - a.left - a.right) / 2
    // Touch the actual visible upper contour, not the image's white margin.
    dy = relation === 'below' ? b.bottom + gap - a.top : b.top - (relation === 'on' ? 0 : gap) - a.bottom
  } else if (relation === 'near') {
    const toLeft = (a.left + a.right) / 2 < (b.left + b.right) / 2
    dx = toLeft ? b.left - gap / aspect - a.right : b.right + gap / aspect - a.left
    dy = b.bottom - a.bottom
  }
  subject.box.x += dx; subject.box.y += dy
}

function relationSatisfied(subject, target, relation, aspect) {
  const a = visible(subject, aspect), b = relation === 'on' ? supportBounds(target, aspect) : visible(target, aspect), tolerance = .006
  if (relation === 'connect-bottom') {
    const start = pathOpening(subject, aspect)
    return Math.abs(start.x - (b.left + b.right) / 2) < tolerance && Math.abs(start.y - b.bottom) < tolerance
  }
  if (relation === 'larger-than') return span(subject, aspect) >= span(target, aspect) * 1.35 - tolerance
  if (relation === 'smaller-than') return span(subject, aspect) <= span(target, aspect) / 1.35 + tolerance
  if (relation === 'left-of') return a.right <= b.left + tolerance
  if (relation === 'right-of') return a.left >= b.right - tolerance
  if (relation === 'above') return a.bottom <= b.top + tolerance
  if (relation === 'below') return a.top >= b.bottom - tolerance
  if (relation === 'on') return Math.abs(a.bottom - b.top) <= tolerance && (target.material.geometry?.supportSurface
    ? a.left >= b.left - tolerance && a.right <= b.right + tolerance : a.right > b.left && a.left < b.right)
  return Math.hypot(Math.max(0, b.left - a.right, a.left - b.right) * aspect, Math.max(0, b.top - a.bottom, a.top - b.bottom)) <= .12
}

function extent(states) {
  return { left: Math.min(...states.map(s => s.box.x)), top: Math.min(...states.map(s => s.box.y)),
    right: Math.max(...states.map(s => s.box.x + s.box.width)), bottom: Math.max(...states.map(s => s.box.y + s.box.height)) }
}

function collisionAmount(a, b, aspect) {
  if (a.supportTargets?.has(b.object.id) && b.material.geometry?.supportSurface && relationSatisfied(a, b, 'on', aspect)
    || b.supportTargets?.has(a.object.id) && a.material.geometry?.supportSurface && relationSatisfied(b, a, 'on', aspect)) return 0
  const x = visible(a, aspect), y = visible(b, aspect), amount = overlap(x, y)
  const smaller = Math.min((x.right - x.left) * (x.bottom - x.top), (y.right - y.left) * (y.bottom - y.top))
  return amount > .0002 && amount / Math.max(.0001, smaller) > .1 ? amount : 0
}

function onGroups(states, relations) {
  const byId = new Map(states.map(state => [state.object.id, state])), groups = new Map()
  for (const relation of relations.filter(item => item.relation === 'on')) {
    const children = groups.get(relation.targetId) ?? []
    if (!children.includes(byId.get(relation.subjectId))) children.push(byId.get(relation.subjectId))
    groups.set(relation.targetId, children)
  }
  return [...groups].filter(([id, children]) => children.length > 1 || byId.get(id).material.geometry?.supportSurface).map(([id, children]) => ({ target: byId.get(id), children }))
}

function sizeOnGroups(states, relations, aspect, repairs) {
  for (const { target, children } of onGroups(states, relations)) {
    if (children.some(child => child.locked)) continue
    const needed = children.reduce((sum, child) => { const b = visible(child, aspect); return sum + b.right - b.left }, 0) + (children.length - 1) * .018 / aspect
    const base = supportBounds(target, aspect), available = base.right - base.left
    if (needed <= available) continue
    // Several houses on a whale share its back instead of every house occupying
    // the same center point. Grow a free support before reducing readable parts.
    if (!target.locked) {
      const maximum = target.material.registered ? .9 : .45, area = target.material.registered ? .81 : .16
      const grow = Math.min(needed / available, maximum / target.box.width, maximum / target.box.height, Math.sqrt(area / (target.box.width * target.box.height)))
      if (grow > 1) { resize(target, grow); repairs.push(`Enlarged ${target.object.id} to support its related subjects.`) }
    }
    const enlarged = supportBounds(target, aspect), fit = (enlarged.right - enlarged.left - (children.length - 1) * .018 / aspect) / (needed - (children.length - 1) * .018 / aspect)
    // A larger semantic repair is needed when the chosen composition would turn
    // detailed reference subjects into tiny marks; do not silently miniaturize.
    if (fit < 1 && fit >= .65) {
      for (const child of children) resize(child, fit)
      repairs.push(`Sized the subjects on ${target.object.id} as a readable group.`)
    }
  }
}

function distributeOnGroups(states, relations, aspect, repairs) {
  const byId = new Map(states.map(state => [state.object.id, state]))
  for (const { target, children } of onGroups(states, relations)) {
    if (children.some(child => child.locked)) continue
    const before = (a, b) => relations.some(item => item.subjectId === a.object.id && item.targetId === b.object.id && item.relation === 'left-of'
      || item.subjectId === b.object.id && item.targetId === a.object.id && item.relation === 'right-of')
    children.sort((a, b) => before(a, b) ? -1 : before(b, a) ? 1 : 0)
    const gap = .018 / aspect, base = supportBounds(target, aspect)
    const total = children.reduce((sum, child) => { const b = visible(child, aspect); return sum + b.right - b.left }, 0) + gap * (children.length - 1)
    if (total > base.right - base.left + .005) continue
    let nextLeft = (base.left + base.right - total) / 2
    for (const child of children) {
      const b = visible(child, aspect), dx = nextLeft - b.left, moving = new Set([child])
      for (let scan = 0; scan < states.length; scan++) for (const relation of relations.filter(item => !sizeRelation(item.relation))) {
        const dependent = byId.get(relation.subjectId)
        if (moving.has(byId.get(relation.targetId)) && dependent !== target && !children.includes(dependent)) moving.add(dependent)
      }
      if (![...moving].some(state => state.locked)) for (const state of moving) state.box.x += dx
      nextLeft += b.right - b.left + gap
    }
    repairs.push(`Distributed the subjects across the visible top of ${target.object.id}.`)
  }
}

/** Solve directional differences across free anchors, not only their subjects.
 * Contacts form rigid groups; old boxes pin those groups. Each axis uses bounded
 * relaxation of p[to] >= p[from] + distance, so a subject between two freely
 * placed targets can separate the targets instead of oscillating forever.
 */
function relaxDirectionGraph(states, relations, aspect, repairs, issues) {
  const remaining = new Set(states), groups = [], byId = new Map(states.map(state => [state.object.id, state]))
  const contacts = relations.filter(relation => ['on', 'connect-bottom'].includes(relation.relation))
  while (remaining.size) {
    const group = [remaining.values().next().value]; remaining.delete(group[0])
    for (let i = 0; i < group.length; i++) for (const relation of contacts) {
      const id = group[i].object.id, otherId = relation.subjectId === id ? relation.targetId : relation.targetId === id ? relation.subjectId : null
      const other = byId.get(otherId)
      if (remaining.has(other)) { group.push(other); remaining.delete(other) }
    }
    groups.push(group)
  }
  const groupOf = new Map(groups.flatMap((group, index) => group.map(state => [state, index])))
  let moved = false
  for (const axis of ['x', 'y']) {
    const initial = groups.map(group => group[0].box[axis]), positions = [...initial, 0], locked = groups.map(group => group.some(state => state.locked))
    const edges = []
    const edge = (from, to, fromEdge, toEdge, gap = 0) => {
      const a = groupOf.get(from), b = groupOf.get(to)
      edges.push({ from: a, to: b, distance: fromEdge - initial[a] - (toEdge - initial[b]) + gap })
    }
    for (const relation of relations) {
      const subject = byId.get(relation.subjectId), target = byId.get(relation.targetId), a = visible(subject, aspect), b = visible(target, aspect)
      if (axis === 'x' && relation.relation === 'left-of') edge(subject, target, a.right, b.left)
      if (axis === 'x' && relation.relation === 'right-of') edge(target, subject, b.right, a.left)
      if (axis === 'y' && relation.relation === 'above') edge(subject, target, a.bottom, b.top)
      if (axis === 'y' && relation.relation === 'below') edge(target, subject, b.bottom, a.top)
      if (relation.relation === 'near') {
        // Keep each axis within a distance whose diagonal also satisfies near.
        const gap = .08 / (axis === 'x' ? aspect : 1), low = axis === 'x' ? 'left' : 'top', high = axis === 'x' ? 'right' : 'bottom'
        edge(subject, target, a[low], b[high], -gap)
        edge(target, subject, b[low], a[high], -gap)
      }
    }
    // A shared origin expresses fixed coordinates as two inequalities. Letting
    // the origin move during relaxation propagates a fixed upper bound through
    // an arbitrary free chain; subtract it afterwards to restore exact boxes.
    const origin = groups.length
    locked.forEach((fixed, index) => {
      if (fixed) edges.push({ from: origin, to: index, distance: initial[index] }, { from: index, to: origin, distance: -initial[index] })
    })
    const anchored = new Set([origin])
    for (let pass = 0; pass < groups.length; pass++) for (const { from, to } of edges) {
      if (anchored.has(from) || anchored.has(to)) { anchored.add(from); anchored.add(to) }
    }
    for (let pass = 0; pass < positions.length; pass++) {
      let changed = false
      for (const constraint of edges) {
        const { from, to, distance } = constraint, deficit = positions[from] + distance - positions[to]
        if (deficit <= 1e-7) continue
        positions[to] += deficit
        changed = true
      }
      if (!changed) break
    }
    if (edges.some(({ from, to, distance }) => positions[from] + distance - positions[to] > 1e-6)) {
      issues.push(`The ${axis === 'x' ? 'horizontal' : 'vertical'} relationship graph contains a contradiction or cannot fit between fixed previous objects. Keep old boxes fixed and correct only the requested arrangement.`)
      continue
    }
    groups.forEach((group, index) => {
      if (locked[index]) return
      const shift = positions[index] - (anchored.has(index) ? positions[origin] : 0) - initial[index]
      if (Math.abs(shift) < 1e-9) return
      for (const state of group) state.box[axis] += shift
      moved = true
    })
  }
  if (moved) repairs.push('Solved relative order by moving free anchors while preserving fixed boxes and contacts.')
}

function clearInternalOverlaps(states, relations, aspect, repairs) {
  const byId = new Map(states.map(state => [state.object.id, state]))
  const collisionScore = () => states.reduce((score, a, index) => score + states.slice(index + 1).reduce((sum, b) => sum + (a.locked && b.locked ? 0 : collisionAmount(a, b, aspect)), 0), 0)
  for (let pass = 0; pass < states.length * 2; pass++) {
    const current = collisionScore()
    if (current < .0002) return
    let best
    for (const subject of states.filter(state => !state.locked)) {
      const own = relations.filter(relation => relation.subjectId === subject.object.id && !sizeRelation(relation.relation))
      // Direction constraints are inequalities, not center-line pins. A left-of
      // neighbor can move further left instead of forcing a whole row to float.
      // Contacts remain pinned; the complete graph is checked after every move.
      if (own.some(item => ['on', 'connect-bottom'].includes(item.relation))) continue
      const moving = new Set([subject])
      for (let scan = 0; scan < states.length; scan++) for (const relation of relations.filter(item => !sizeRelation(item.relation))) {
        if (moving.has(byId.get(relation.targetId))) moving.add(byId.get(relation.subjectId))
      }
      if ([...moving].some(state => state.locked)) continue
      for (const obstacle of states.filter(state => !moving.has(state) && collisionAmount(subject, state, aspect))) {
        const a = visible(subject, aspect), b = visible(obstacle, aspect)
        const offsets = [[b.left - .025 / aspect - a.right, 0], [b.right + .025 / aspect - a.left, 0], [0, b.top - .025 - a.bottom], [0, b.bottom + .025 - a.top]]
        for (const [dx, dy] of offsets) {
          for (const state of moving) { state.box.x += dx; state.box.y += dy }
          const satisfied = relations.every(item => relationSatisfied(byId.get(item.subjectId), byId.get(item.targetId), item.relation, aspect))
          const bounds = extent(states)
          // Do not fix one collision by spreading a tiny composition over many
          // pages. The later group fit can absorb a modest amount of overflow.
          const feasible = bounds.right - bounds.left < 1.3 && bounds.bottom - bounds.top < 1.3
          const score = satisfied && feasible ? collisionScore() : Infinity
          const movement = (Math.abs(dx) * aspect + Math.abs(dy) * 2) * moving.size
          const tier = dy ? 1 : 0
          // First clear a grounded row sideways, even when that needs two small
          // moves. One big upward move must not win solely by clearing it all.
          if (score + .00001 < current && (!best || tier < best.tier || tier === best.tier && (score < best.score - .00001 || Math.abs(score - best.score) < .00001 && movement < best.movement))) best = { score, tier, movement, dx, dy, moving: [...moving] }
          for (const state of moving) { state.box.x -= dx; state.box.y -= dy }
        }
      }
    }
    if (!best) return
    for (const state of best.moving) { state.box.x += best.dx; state.box.y += best.dy }
    repairs.push(`Shifted ${best.moving.map(state => state.object.id).join(', ')} to keep related silhouettes separate.`)
  }
}

/** New model-supplied boxes are preferred anchors, not immutable child edits.
 * A tiny overflow caused by placing a related subject can move as a whole,
 * provided no previous object moves and every constraint still holds. */
function fitMinorGroupOverflow(members, states, relations, aspect, child, repairs) {
  if (!members.some(state => state.locked) || members.some(state => state.old)) return
  const bounds = extent(members)
  const overflow = Math.max(0, -bounds.left, -bounds.top, bounds.right - 1, bounds.bottom - 1)
  if (overflow <= 1e-7 || overflow > .03) return
  const fit = Math.min(1, .97 / (bounds.right - bounds.left), .97 / (bounds.bottom - bounds.top))
  if (fit < .95) return
  const originals = members.map(state => ({ ...state.box })), memberSet = new Set(members)
  const localRelations = relations.filter(item => members.some(state => state.object.id === item.subjectId))
  const byId = new Map(states.map(state => [state.object.id, state]))
  const others = states.filter(state => !memberSet.has(state))
  members.forEach((state, index) => {
    const original = originals[index]
    state.box = { x: bounds.left + (original.x - bounds.left) * fit, y: bounds.top + (original.y - bounds.top) * fit,
      width: original.width * fit, height: original.height * fit }
  })
  const fitted = members.map(state => ({ ...state.box })), current = extent(members)
  const minX = .015 - current.left, maxX = .985 - current.right, minY = .015 - current.top, maxY = .985 - current.bottom
  const xs = [clamp(0, minX, maxX), minX, maxX], ys = [clamp(0, minY, maxY), minY, maxY]
  if (child) for (const state of members) {
    const rect = visible(state, aspect)
    xs.push(child.left - rect.right, child.right - rect.left)
    ys.push(child.top - rect.bottom, child.bottom - rect.top)
  }
  let best
  for (const dx of xs) for (const dy of ys) {
    if (dx < minX - 1e-9 || dx > maxX + 1e-9 || dy < minY - 1e-9 || dy > maxY + 1e-9
      || Math.abs(dx) > .05 || Math.abs(dy) > .05) continue
    members.forEach((state, index) => { state.box = { ...fitted[index], x: fitted[index].x + dx, y: fitted[index].y + dy } })
    if (members.some(state => {
      const bounded = boundedBox(state.box, state.material.registered)
      return Object.keys(bounded).some(key => Math.abs(bounded[key] - state.box[key]) > 1e-7)
        || child && overlap(visible(state, aspect), child) > .0001
        || others.some(other => collisionAmount(state, other, aspect))
    }) || localRelations.some(item => !relationSatisfied(byId.get(item.subjectId), byId.get(item.targetId), item.relation, aspect))) continue
    const score = Math.hypot(dx * aspect, dy)
    if (!best || score < best.score) best = { score, boxes: members.map(state => ({ ...state.box })) }
  }
  members.forEach((state, index) => { state.box = best ? best.boxes[index] : originals[index] })
  if (best) repairs.push(`Fitted minor overflow of new connected group ${members.map(state => state.object.id).join(', ')} without changing its relationships.`)
}

/** Compile relationships into bounded geometry without changing subject identity.
 * Issues MUST be handled by the caller; this function never deletes an object or
 * silently ignores unsupported/impossible relationships to make a plan pass.
 */
export function compilePlannedScene(raw, { context = {}, previousPlan, materials } = {}) {
  const constrained = constrainExplicitSceneEdit(raw, { context, previousPlan })
  raw = constrained.plan
  const repairs = [...constrained.repairs], issues = [...constrained.issues]
  if (!record(raw) || !Array.isArray(raw.objects)) return { plan: raw, repairs, issues: ['Return a plan with an objects array.'] }
  if (raw.objects.length > 8) return { plan: raw, repairs, issues: ['Keep all required subjects within the eight-object scene budget.'] }
  const aspect = finite(context.canvasAspect) && context.canvasAspect > 0 ? context.canvasAspect : 1
  const plan = { ...raw }, prior = new Map((previousPlan?.objects ?? []).map(object => [object.id, object]))
  const relations = []
  if (raw.relations !== undefined && !Array.isArray(raw.relations)) issues.push('relations must be an array of subjectId, relation and targetId.')
  for (const relation of Array.isArray(raw.relations) ? raw.relations : []) relations.push(relation)
  delete plan.relations
  const states = raw.objects.filter(record).map((source, index) => {
    const object = { ...source }, old = prior.get(object.id)
    // A path connection has the same meaning when placed one level too deep.
    // Promote only a valid, unambiguous target; leave all other schema errors
    // intact for strict validation, and never mutate the caller's render data.
    if (object.render?.kind === 'compose' && object.render.primitive === 'path' && record(object.render.parameters)
      && Object.hasOwn(object.render.parameters, 'connectTo')) {
      const connection = object.render.parameters.connectTo
      const target = typeof connection === 'string' && connection !== object.id && raw.objects.find(item => record(item) && item.id === connection)
      if (target && !(target.render?.kind === 'compose' && target.render.primitive === 'path')
        && (object.connectTo === undefined || object.connectTo === connection)) {
        const parameters = { ...object.render.parameters }; delete parameters.connectTo
        object.render = { ...object.render, parameters }; object.connectTo = connection
        repairs.push(`Promoted path ${object.id} connection to its object-level field.`)
      }
    }
    if (object.rotation === undefined && old?.rotation !== undefined) object.rotation = old.rotation
    if (object.placement !== undefined) {
      const placements = Array.isArray(object.placement) ? object.placement : [object.placement]
      for (const placement of placements) relations.push(record(placement) ? { ...placement, subjectId: object.id } : placement)
      delete object.placement
    }
    if (object.role === 'focal') object.role = 'main'
    if (object.role === 'setting') object.role = 'support'
    const material = metadata(object, materials)
    // A revision may omit geometry. Restore it before considering any placement;
    // unrelated previous objects are fixed anchors, never globally rearranged.
    const sourceBox = record(object.box) ? object.box : old?.box
    const hasBox = record(sourceBox) && ['x', 'y', 'width', 'height'].every(key => finite(sourceBox[key]))
    let box
    if (hasBox) {
      box = boundedBox(sourceBox, material.registered)
      if (JSON.stringify(box) !== JSON.stringify(sourceBox)) repairs.push(`Bounded box for ${object.id}.`)
    } else {
      const roleSpan = object.role === 'main' ? .55 : object.role === 'atmosphere' ? .23 : .34
      const scale = roleSpan * (object.role === 'main' ? 1 : 1 - (index % 2) * .08)
      const width = scale * Math.min(1, material.aspect) / aspect, height = scale / Math.max(1, material.aspect)
      const anchor = object.role === 'main' ? [.5, .55] : object.role === 'atmosphere' ? [index % 2 ? .77 : .23, .19] : [index % 2 ? .22 : .78, .69]
      box = boundedBox({ x: anchor[0] - width / 2, y: anchor[1] - height / 2, width, height }, material.registered)
      repairs.push(`Compiled box for ${object.id} from its material aspect and role.`)
    }
    const color = normalizedColor(object.color) ?? normalizedColor(raw.palette?.ink) ?? scenePalette.ink
    if (color !== object.color) repairs.push(`Normalized guide color for ${object.id}.`)
    object.color = color
    return { object, material, box, locked: hasBox, old: Boolean(old), explicitEdit: object.id === constrained.editedObjectId }
  })
  if (states.length !== raw.objects.length) issues.push('Each scene object must be an object; no requested objects were discarded.')
  const byId = new Map(states.map(state => [state.object.id, state]))
  if (byId.size !== states.length) issues.push('Every object needs a distinct stable ID.')
  const compiledRelations = []
  for (const relation of relations.slice(0, 32)) {
    const name = relationAliases[relation?.relation] ?? relation?.relation
    if (!record(relation) || !supported.has(name)) { issues.push(`Unsupported relation ${JSON.stringify(relation?.relation)}. Use left-of, right-of, above, below, on, near, larger-than or smaller-than; preserve the requested meaning.`); continue }
    if (!byId.has(relation.subjectId) || !byId.has(relation.targetId) || relation.subjectId === relation.targetId) { issues.push(`Relation ${name} needs two distinct existing object IDs.`); continue }
    if (name === 'on') {
      const target = byId.get(relation.targetId)
      if (target.material.geometry?.supportsOn === false) {
        issues.push(`Object ${relation.subjectId} cannot stand on material ${target.object.render.recipeId ?? target.object.render.illustrationId}: ${target.material.geometry.supportReason} Choose a genuinely usable same-subject pose, or draw the required connected subjects as one faithful custom focal object. Preserve the requested support relationship; do not pretend that near/above satisfies on.`)
        continue
      }
      if (target.object.rotation === 180 && target.material.geometry?.supportSurface) {
        issues.push(`Object ${relation.subjectId} cannot stand on the reviewed surface of inverted ${relation.targetId}: the verified back becomes an underside after rotation. Use a genuinely supported upright pose or a faithful custom connected object; keep the required support relationship.`)
        continue
      }
      const subject = byId.get(relation.subjectId)
      subject.supportTargets ??= new Set(); subject.supportTargets.add(relation.targetId)
    }
    if (Object.keys(relation).some(key => !['subjectId', 'relation', 'targetId'].includes(key))) issues.push(`Relation ${name} has unsupported parameters; express its requested meaning with supported relations.`)
    const next = { subjectId: relation.subjectId, targetId: relation.targetId, relation: name }
    if (!compiledRelations.some(value => JSON.stringify(value) === JSON.stringify(next))) compiledRelations.push(next)
    byId.get(relation.subjectId).locked = false
  }
  if (relations.length > 32) issues.push('At most 32 scene relationships can be compiled at once.')
  for (const state of states) {
    const object = state.object, old = prior.get(object.id)
    if (object.render?.kind !== 'compose' || object.render.primitive !== 'path' || !object.connectTo) continue
    // Reopening an existing scene must not reflow a child-positioned path.
    const unchanged = old?.connectTo === object.connectTo && old.render.kind === 'compose' && old.render.primitive === 'path'
      && JSON.stringify(old.render.parameters ?? {}) === JSON.stringify(object.render.parameters ?? {})
      && ['x', 'y', 'width', 'height'].every(key => old.box?.[key] === state.box[key])
      && !compiledRelations.some(item => item.subjectId === object.id)
    if (unchanged) continue
    const target = byId.get(object.connectTo)
    if (!target || target === state || target.object.render?.primitive === 'path') { issues.push(`Path ${object.id} needs a valid non-path connection target.`); continue }
    state.locked = false
    compiledRelations.push({ subjectId: object.id, relation: 'connect-bottom', targetId: object.connectTo })
    repairs.push(`Connected path ${object.id} to the visible bottom of ${object.connectTo}.`)
  }
  // Complete all scale constraints before positioning, so a second relationship
  // cannot reset the size hierarchy (e.g. tiny house BELOW a giant flower).
  for (let pass = 0; pass < Math.max(1, states.length); pass++) {
    let changed = false
    for (const relation of compiledRelations.filter(item => sizeRelation(item.relation))) {
      const subject = byId.get(relation.subjectId), target = byId.get(relation.targetId)
      if (relationSatisfied(subject, target, relation.relation, aspect)) continue
      const desired = span(target, aspect) * (relation.relation === 'larger-than' ? 1.5 : 1 / 1.5)
      resize(subject, clamp(desired / Math.max(.001, span(subject, aspect)), .1, 10)); changed = true
    }
    if (!changed) break
  }
  sizeOnGroups(states, compiledRelations, aspect, repairs)
  for (const relation of compiledRelations.filter(item => !sizeRelation(item.relation))) place(byId.get(relation.subjectId), byId.get(relation.targetId), relation.relation, aspect, true)
  for (let pass = 0; pass < Math.max(1, states.length); pass++) for (const relation of compiledRelations.filter(item => !sizeRelation(item.relation))) {
    if (relation.relation === 'connect-bottom' && byId.get(relation.targetId).locked) {
      const subject = byId.get(relation.subjectId), target = byId.get(relation.targetId)
      const available = (.985 - visible(target, aspect).bottom) / .97
      const scale = Math.min(1, available / frame(subject, aspect).height)
      if (scale > 0 && scale < 1) resize(subject, scale)
    }
    place(byId.get(relation.subjectId), byId.get(relation.targetId), relation.relation, aspect)
  }
  distributeOnGroups(states, compiledRelations, aspect, repairs)
  relaxDirectionGraph(states, compiledRelations, aspect, repairs, issues)
  clearInternalOverlaps(states, compiledRelations, aspect, repairs)
  // Connected subjects move as one composition. This preserves contact, relative
  // size and direction when keeping the group on paper or away from child ink.
  const remaining = new Set(states), components = []
  while (remaining.size) {
    const members = [remaining.values().next().value]; remaining.delete(members[0])
    for (let i = 0; i < members.length; i++) for (const relation of compiledRelations) {
      const id = members[i].object.id, neighbor = relation.subjectId === id ? relation.targetId : relation.targetId === id ? relation.subjectId : undefined
      if (neighbor !== undefined && remaining.has(byId.get(neighbor))) { members.push(byId.get(neighbor)); remaining.delete(byId.get(neighbor)) }
    }
    components.push(members)
  }
  const childBox = context.scene?.childBounds ?? context.childBounds
  const child = childBox && ['x', 'y', 'width', 'height'].every(key => finite(childBox[key])) ? boxBounds(childBox) : null
  for (const state of states.filter(state => state.explicitEdit)) if (child && overlap(visible(state, aspect), child) > .0001) {
    issues.push(`The requested edit of ${state.object.id} would cover existing child ink. Keep the original drawing unchanged and choose a clear destination.`)
  }
  const placed = states.filter(state => state.locked)
  for (const members of components.sort((a, b) => Number(b.some(s => s.locked)) - Number(a.some(s => s.locked)))) {
    fitMinorGroupOverflow(members, states, compiledRelations, aspect, child, repairs)
    if (members.every(state => state.locked)) continue
    if (!members.some(state => state.locked)) {
      let bounds = extent(members)
      const limits = members.map(state => Math.min((state.material.registered ? .9 : .45) / state.box.width,
        (state.material.registered ? .9 : .45) / state.box.height, Math.sqrt((state.material.registered ? .81 : .16) / (state.box.width * state.box.height))))
      const scale = Math.min(1, .94 / (bounds.right - bounds.left), .94 / (bounds.bottom - bounds.top), ...limits)
      if (scale < 1) {
        for (const state of members) { state.box.x = bounds.left + (state.box.x - bounds.left) * scale; state.box.y = bounds.top + (state.box.y - bounds.top) * scale; state.box.width *= scale; state.box.height *= scale }
        repairs.push(`Fitted connected group ${members.map(s => s.object.id).join(', ')} to the paper.`)
      }
      bounds = extent(members)
      const originals = members.map(state => ({ ...state.box }))
      let best
      // A modest coherent shrink can use an empty corner; never shrink all the
      // way to unreadable icons simply to declare an occupied page successful.
      for (const fit of child ? [1, .9, .8, .7] : [1]) {
        members.forEach((state, index) => {
          const original = originals[index]
          state.box = { x: bounds.left + (original.x - bounds.left) * fit, y: bounds.top + (original.y - bounds.top) * fit, width: original.width * fit, height: original.height * fit }
        })
        const current = extent(members)
        const minX = .015 - current.left, maxX = .985 - current.right, minY = .015 - current.top, maxY = .985 - current.bottom
        const candidates = [[clamp(0, minX, maxX), clamp(0, minY, maxY)]]
        for (let x = 0; x <= 12; x++) for (let y = 0; y <= 12; y++) candidates.push([minX + (maxX - minX) * x / 12, minY + (maxY - minY) * y / 12])
        for (const [dx, dy] of candidates) {
          let score = Math.hypot(dx * aspect, dy) * .008 + (1 - fit) * .025, inkOverlap = 0
          for (const state of members) {
            const rect = visible(state, aspect), shifted = { left: rect.left + dx, right: rect.right + dx, top: rect.top + dy, bottom: rect.bottom + dy }
            if (child) inkOverlap += overlap(shifted, child)
            for (const other of placed) if (!members.includes(other)) score += overlap(shifted, visible(other, aspect)) * 4
          }
          score += inkOverlap * 1000
          if (!best || score < best.score) best = { score, inkOverlap, fit, boxes: members.map(state => ({ ...state.box, x: state.box.x + dx, y: state.box.y + dy })) }
        }
      }
      members.forEach((state, index) => { state.box = best.boxes[index] })
      if (best.fit < 1) repairs.push(`Resized group ${members.map(s => s.object.id).join(', ')} together to leave child ink clear.`)
      if (child && best.inkOverlap > .0001) issues.push(`Group ${members.map(s => s.object.id).join(', ')} cannot fit without covering existing child ink. Choose a smaller arrangement or ask for free space; do not remove the child's work.`)
    } else {
      for (const state of members.filter(state => !state.locked)) if (child && overlap(visible(state, aspect), child) > .0001) issues.push(`Object ${state.object.id} would cover child ink beside a fixed previous object. Preserve the old positions and adjust only the requested addition.`)
    }
    placed.push(...members.filter(state => !placed.includes(state)))
  }
  for (const relation of compiledRelations) if (!relationSatisfied(byId.get(relation.subjectId), byId.get(relation.targetId), relation.relation, aspect)) issues.push(`Conflicting relationship: ${relation.subjectId} ${relation.relation} ${relation.targetId}. Keep its meaning and correct the relationship graph.`)
  for (let index = 0; index < states.length; index++) for (const other of states.slice(index + 1)) {
    const state = states[index]
    if (!(state.locked && other.locked && !state.explicitEdit && !other.explicitEdit) && collisionAmount(state, other, aspect)) issues.push(`Objects ${state.object.id} and ${other.object.id} have overlapping visible silhouettes. Keep every required subject and use a clearer spatial arrangement; labels alone cannot express occlusion.`)
  }
  for (const state of states) {
    const repaired = boundedBox(state.box, state.material.registered)
    if (['x', 'y', 'width', 'height'].some(key => Math.abs(state.box[key] - repaired[key]) > 1e-7)) issues.push(`Object ${state.object.id} cannot satisfy its relationships inside the available canvas bounds.`)
    state.object.box = { ...state.box }
  }
  if (record(plan.palette)) plan.palette = Object.fromEntries(Object.entries(plan.palette).map(([key, value]) => [key, normalizedColor(value) ?? scenePalette[key] ?? value]))
  // Keep invalid objects for the strict sanitizer to reject; never reduce scope.
  plan.objects = raw.objects.map(object => record(object) ? states.find(state => state.object.id === object.id)?.object ?? object : object)
  return { plan, repairs, issues: [...new Set(issues)] }
}
