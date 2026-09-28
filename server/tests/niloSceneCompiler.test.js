import { expect, test } from 'vitest'
import { compilePlannedScene } from '../src/services/niloSceneCompiler.js'
import { compileSceneObject, sanitizeScenePlan } from '../../shared/niloSceneDrawing.mjs'
import { getDrawingIllustration } from '../../shared/niloIllustrations.mjs'
import { sampleProposalGeometry } from '../../shared/niloGeometry.mjs'
import tracing from '../../shared/niloIllustrationTracing.json' with { type: 'json' }
import { connectScenePaths } from '../src/services/niloSceneLayout.js'

const object = (id, subject, role = 'support', extra = {}) => ({ id, name: subject, role, essential: [subject], render: subject === 'house'
  ? { kind: 'illustration', illustrationId: 'illustration-library-cottage-beginner-01' } : { kind: 'recipe', recipeId: `${subject}-0` }, color: '#66729b', ...extra })
const scene = (objects, relations = []) => ({ version: 1, title: '陌生的世界', summary: '花下的小屋和旁边的伙伴', request: '我想画一个魔法世界', objects, relations })
const relation = (subjectId, value, targetId) => ({ subjectId, relation: value, targetId })
const context = { canvasAspect: 1.4, canvasSize: { width: 840, height: 600 } }
function visible(object, aspect = 1.4) {
  const geometry = compileSceneObject(object), image = getDrawingIllustration(object.render.illustrationId)
  const ratio = geometry?.sketch.aspect ?? image.aspect
  let width = object.box.width, height = object.box.height
  if (width * aspect / height > ratio) width = height * ratio / aspect
  else height = width * aspect / ratio
  const x = object.box.x + (object.box.width - width) / 2, y = object.box.y + (object.box.height - height) / 2
  if (image) {
    const original = tracing[image.id], b = object.rotation === 180 ? { left: 1 - original.right, right: 1 - original.left, top: 1 - original.bottom, bottom: 1 - original.top } : original
    return { left: x + width * b.left, right: x + width * b.right, top: y + height * b.top, bottom: y + height * b.bottom }
  }
  const points = sampleProposalGeometry({ template: 'custom', sketch: geometry.sketch, x, y, width, height, rotation: object.rotation ?? 0 }, aspect).flatMap(stroke => stroke.points)
  return { left: Math.min(...points.map(p => p.x)), right: Math.max(...points.map(p => p.x)), top: Math.min(...points.map(p => p.y)), bottom: Math.max(...points.map(p => p.y)) }
}
const physicalSpan = (object, aspect) => { const b = visible(object, aspect); return Math.max((b.right - b.left) * aspect, b.bottom - b.top) }
const box = { x: .4, y: .35, width: .3, height: .3 }

test.each([.6, 1, 1.4, 2])('compiles a giant flower above a tiny house on aspect %s without topic-specific rules', aspect => {
  const input = scene([object('flower', 'flower', 'main'), object('house', 'house')], [relation('house', 'smaller-than', 'flower'), relation('house', 'below', 'flower')])
  const snapshot = structuredClone(input)
  const result = compilePlannedScene(input, { context: { canvasAspect: aspect } })
  expect(result.issues).toEqual([])
  expect(sanitizeScenePlan(result.plan)).not.toBeNull()
  const [flower, house] = result.plan.objects
  expect(visible(house, aspect).top).toBeGreaterThan(visible(flower, aspect).bottom)
  expect(physicalSpan(flower, aspect)).toBeGreaterThan(physicalSpan(house, aspect) * 1.3)
  expect(result.plan).not.toHaveProperty('relations')
  expect(input).toEqual(snapshot)
})

test('supports two constraints on the same object without overwriting its requested size', () => {
  const result = compilePlannedScene(scene([object('house', 'house', 'main'), object('flower', 'flower')], [relation('flower', 'larger-than', 'house'), relation('flower', 'above', 'house')]), { context })
  expect(result.issues).toEqual([])
  const [house, flower] = result.plan.objects
  expect(visible(flower).bottom).toBeLessThan(visible(house).top)
  expect(physicalSpan(flower, 1.4)).toBeGreaterThan(physicalSpan(house, 1.4) * 1.3)
})

test.each([.75, 1.4, 2])('places a house on a default PNG contour, excluding white margins, aspect %s', aspect => {
  const cloud = object('cloud', 'cloud', 'main', { render: { kind: 'illustration', illustrationId: 'illustration-library-cloud-beginner-01' } })
  const result = compilePlannedScene(scene([cloud, object('house', 'house')], [relation('house', 'smaller-than', 'cloud'), relation('house', 'on', 'cloud')]), { context: { canvasAspect: aspect } })
  expect(result.issues).toEqual([])
  expect(sanitizeScenePlan(result.plan)).not.toBeNull()
  const [base, house] = result.plan.objects
  expect(visible(house, aspect).bottom).toBeCloseTo(visible(base, aspect).top, 6)
  expect(visible(house, aspect).bottom).toBeGreaterThan(base.box.y)
})

test('builds a readable focal hierarchy for three to five box-free subjects', () => {
  for (const count of [3, 4, 5]) {
    const input = scene([object('house', 'house', 'main'), object('flower', 'flower'), object('tree', 'tree'), object('cloud', 'cloud', 'atmosphere'), object('moon', 'moon', 'atmosphere')].slice(0, count))
    const result = compilePlannedScene(input, { context })
    expect(result.issues).toEqual([])
    expect(sanitizeScenePlan(result.plan)).not.toBeNull()
    expect(physicalSpan(result.plan.objects[0], 1.4) * 600).toBeGreaterThan(240)
    expect(physicalSpan(result.plan.objects[1], 1.4) * 600).toBeGreaterThan(140)
    expect(result.plan.objects[0].box).not.toEqual(result.plan.objects[1].box)
  }
})

test('moves a connected group away from child ink while retaining both direction and size', () => {
  const childBounds = { x: .36, y: .3, width: .28, height: .35 }
  const input = scene([object('house', 'house', 'main'), object('flower', 'flower')], [relation('flower', 'left-of', 'house'), relation('flower', 'smaller-than', 'house')])
  const result = compilePlannedScene(input, { context: { ...context, scene: { childBounds } } })
  expect(result.issues).toEqual([])
  const [house, flower] = result.plan.objects
  expect(visible(flower).right).toBeLessThan(visible(house).left)
  for (const item of result.plan.objects) {
    const b = visible(item)
    expect(b.right <= childBounds.x || b.left >= childBounds.x + childBounds.width || b.bottom <= childBounds.y || b.top >= childBounds.y + childBounds.height).toBe(true)
  }
})

test('reports occupied paper instead of covering ink or dropping requested objects', () => {
  const input = scene([object('house', 'house', 'main'), object('flower', 'flower')], [relation('flower', 'near', 'house')])
  const result = compilePlannedScene(input, { context: { ...context, scene: { childBounds: { x: 0, y: 0, width: 1, height: 1 } } } })
  expect(result.issues.join(' ')).toContain('child ink')
  expect(result.plan.objects.map(item => item.id)).toEqual(['house', 'flower'])
})

test('retains every old object box exactly when adding one subject, even if the model omits old boxes', () => {
  const house = object('house', 'house', 'main', { box }), cloud = object('cloud', 'cloud', 'atmosphere', { box: { x: .09, y: .09, width: .25, height: .18 } })
  // Existing plans crossing the strict boundary contain no relation metadata.
  const previous = { ...scene([house, cloud]) }; delete previous.relations
  const next = scene([{ ...house, box: undefined }, { ...cloud, box: undefined }, object('flower', 'flower')], [relation('flower', 'left-of', 'house')])
  const result = compilePlannedScene(next, { context, previousPlan: sanitizeScenePlan(previous) })
  expect(result.issues).toEqual([])
  expect(result.plan.objects[0].box).toEqual(house.box)
  expect(result.plan.objects[1].box).toEqual(cloud.box)
  expect(visible(result.plan.objects[2]).right).toBeLessThan(visible(result.plan.objects[0]).left)
})

test('preserves valid legacy geometry and identities without auto-arranging the scene', () => {
  const input = scene([object('house', 'house', 'main', { box }), object('cloud', 'cloud', 'atmosphere', { box: { x: .1, y: .1, width: .3, height: .2 } })])
  delete input.relations
  const result = compilePlannedScene(input, { context })
  expect(result.issues).toEqual([])
  expect(result.repairs).toEqual([])
  expect(result.plan).toEqual(input)
})

test('repairs harmless out-of-bounds frames and color formatting, keeping identity and essential features', () => {
  const input = scene([object('house', 'house', 'main', { box: { x: -.02, y: .85, width: .33, height: .3 }, color: '#abc' })])
  input.palette = { ink: 'blue' }
  const result = compilePlannedScene(input, { context })
  expect(result.issues).toEqual([])
  expect(sanitizeScenePlan(result.plan)).not.toBeNull()
  expect(result.plan.objects[0]).toMatchObject({ id: 'house', essential: ['house'], color: '#aabbcc', render: input.objects[0].render, box: { x: 0, y: .7, width: .33, height: .3 } })
  expect(result.plan.palette.ink).toBe('#0000ff')
})

function slightlyOverflowingScene() {
  const image = (id, subject, role, box) => object(id, subject, role, { box, render: { kind: 'illustration', illustrationId: `illustration-library-${subject}-beginner-01` } })
  return scene([
    image('treehouse_id', 'treehouse', 'main', { x: .35, y: .15, width: .4, height: .6 }),
    image('mushroom_id', 'mushroom', 'support', { x: .15, y: .5, width: .25, height: .3 }),
    image('lantern_id', 'lantern', 'atmosphere', { x: .65, y: .4, width: .2, height: .25 }),
  ], [relation('lantern_id', 'near', 'treehouse_id'), relation('mushroom_id', 'below', 'treehouse_id')])
}

test('repairs the real four-pixel overflow by translating the whole new group with its relationships intact', () => {
  const input = slightlyOverflowingScene(), before = structuredClone(input)
  const result = compilePlannedScene(input, { context })
  expect(result.issues).toEqual([])
  expect(sanitizeScenePlan(result.plan)).not.toBeNull()
  const [tree, mushroom, lantern] = result.plan.objects
  expect(mushroom.box.y + mushroom.box.height).toBeCloseTo(.985, 10)
  const shift = tree.box.y - input.objects[0].box.y
  expect(shift).toBeCloseTo(-.0212334, 7)
  expect(mushroom.box.y - .7062334).toBeCloseTo(shift, 7)
  expect(lantern.box.y - .4574429).toBeCloseTo(shift, 7)
  expect(visible(mushroom).top - visible(tree).bottom).toBeCloseTo(.035, 10)
  for (const [index, item] of result.plan.objects.entries()) {
    expect(item.box.width).toBe(input.objects[index].box.width)
    expect(item.box.height).toBe(input.objects[index].box.height)
    expect(item.render).toEqual(input.objects[index].render)
    expect(item.essential).toEqual(input.objects[index].essential)
  }
  expect(result.repairs.join(' ')).toContain('minor overflow of new connected group')
  expect(input).toEqual(before)
})

test('a tiny group overflow never moves a previous anchor or silently clamps its related object', () => {
  const input = slightlyOverflowingScene(), previous = scene([input.objects[0]])
  delete previous.relations
  const result = compilePlannedScene(input, { context, previousPlan: previous })
  expect(result.issues.join(' ')).toContain('available canvas bounds')
  expect(result.plan.objects[0].box).toEqual(previous.objects[0].box)
  expect(result.plan.objects[1].box.y).toBeCloseTo(.7062334, 7)
  expect(result.repairs.join(' ')).not.toContain('minor overflow')
})

test('a slightly wider-than-paper connected group can shrink coherently by less than five percent', () => {
  const input = scene([
    object('base', 'base', 'main', { render: { kind: 'generated' }, box: { x: .005, y: .08, width: .6, height: .84 } }),
    object('neighbor', 'neighbor', 'support', { render: { kind: 'generated' }, box: { x: .3, y: .3, width: .39, height: .546 } }),
  ], [relation('neighbor', 'right-of', 'base')])
  const result = compilePlannedScene(input, { context })
  expect(result.issues).toEqual([])
  expect(sanitizeScenePlan(result.plan)).not.toBeNull()
  const [base, neighbor] = result.plan.objects.map(item => item.box), scale = base.width / .6
  expect(scale).toBeGreaterThanOrEqual(.95)
  expect(scale).toBeLessThan(1)
  expect(base.height / .84).toBeCloseTo(scale, 10)
  expect(neighbor.width / .39).toBeCloseTo(scale, 10)
  expect(neighbor.height / .546).toBeCloseTo(scale, 10)
  expect(neighbor.x - base.x - base.width).toBeCloseTo(.035 / 1.4 * scale, 10)
  expect(base.x).toBeCloseTo(.015, 10)
  expect(neighbor.x + neighbor.width).toBeCloseTo(.985, 10)
  expect(result.repairs.join(' ')).toContain('minor overflow')
})

test('rejects a minor boundary repair when every inward group translation would cover child ink', () => {
  const input = slightlyOverflowingScene()
  const childBounds = { x: 0, y: 0, width: 1, height: visible(input.objects[0]).top }
  const result = compilePlannedScene(input, { context: { ...context, scene: { childBounds } } })
  expect(result.issues.join(' ')).toContain('available canvas bounds')
  expect(result.plan.objects[0].box).toEqual(input.objects[0].box)
  expect(result.repairs.join(' ')).not.toContain('minor overflow')
})

test('a small repair preserves an unrelated previous object while using clear paper beside the child drawing', () => {
  const input = slightlyOverflowingScene(), old = object('old_cloud', 'cloud', 'atmosphere', { box: { x: .02, y: .02, width: .12, height: .12 } })
  input.objects.push({ ...old, box: undefined })
  const childBounds = { x: .02, y: .2, width: .18, height: .5 }
  const result = compilePlannedScene(input, { context: { ...context, scene: { childBounds } }, previousPlan: scene([old]) })
  expect(result.issues).toEqual([])
  expect(result.plan.objects[3].box).toEqual(old.box)
  expect(result.repairs.join(' ')).toContain('minor overflow')
  for (const item of result.plan.objects.slice(0, 3)) expect(visible(item).left).toBeGreaterThanOrEqual(childBounds.x + childBounds.width)
})

test('compiles placement aliases and strips only compiler metadata before strict sanitization', () => {
  const result = compilePlannedScene(scene([object('house', 'house', 'main'), object('flower', 'flower', 'support', { placement: { relation: 'right', targetId: 'house' } })]), { context })
  expect(result.issues).toEqual([])
  expect(sanitizeScenePlan(result.plan)).not.toBeNull()
  expect(result.plan.objects[1]).not.toHaveProperty('placement')
  expect(visible(result.plan.objects[1]).left).toBeGreaterThan(visible(result.plan.objects[0]).right)
})

test.each(['inside', 'behind', 'hanging-from'])('unsupported relationship %s is explicitly reported, not silently discarded', value => {
  const result = compilePlannedScene(scene([object('house', 'house', 'main'), object('flower', 'flower')], [relation('flower', value, 'house')]), { context })
  expect(result.issues.join(' ')).toContain(`Unsupported relation "${value}"`)
  expect(result.plan.objects).toHaveLength(2)
})

test('reports contradictory constraints and missing targets without substituting a subject', () => {
  const result = compilePlannedScene(scene([object('house', 'house', 'main'), object('flower', 'flower')], [relation('house', 'left-of', 'flower'), relation('house', 'right-of', 'flower'), relation('flower', 'on', 'missing')]), { context })
  expect(result.issues.join(' ')).toContain('Conflicting relationship')
  expect(result.issues.join(' ')).toContain('distinct existing object IDs')
  expect(result.plan.objects.map(item => item.name)).toEqual(['house', 'flower'])
})

test('does not move an existing anchor to fit an impossible requested addition', () => {
  const house = object('house', 'house', 'main', { box: { x: .05, y: .02, width: .3, height: .3 } })
  const old = { ...scene([house]) }; delete old.relations
  const result = compilePlannedScene(scene([{ ...house, box: undefined }, object('flower', 'flower')], [relation('flower', 'above', 'house')]), { context, previousPlan: sanitizeScenePlan(old) })
  expect(result.plan.objects[0].box).toEqual(house.box)
  expect(result.issues.join(' ')).toContain('available canvas bounds')
})

test('a real five-object world keeps the child below the treehouse without covering the separate tree canopy', () => {
  const image = (id, subject, role) => object(id, subject, role, { render: { kind: 'illustration', illustrationId: `illustration-library-${subject}-beginner-01` } })
  const input = scene([image('tree', 'tree', 'main'), image('treehouse', 'treehouse', 'main'), image('child', 'hiker', 'main'), image('path', 'forestpath', 'support'), image('mushroom', 'mushroom', 'support')], [
    relation('treehouse', 'on', 'tree'), relation('child', 'below', 'treehouse'), relation('mushroom', 'near', 'child'), relation('tree', 'near', 'path'), relation('child', 'smaller-than', 'tree'),
  ])
  const result = compilePlannedScene(input, { context })
  expect(result.issues).toEqual([])
  expect(sanitizeScenePlan(result.plan)).not.toBeNull()
  const [tree, treehouse, child, , mushroom] = result.plan.objects.map(item => visible(item))
  expect(treehouse.bottom).toBeCloseTo(tree.top, 6)
  expect(child.top).toBeGreaterThan(treehouse.bottom)
  expect(child.left >= tree.right || child.right <= tree.left).toBe(true)
  expect(mushroom.left >= child.right || mushroom.right <= child.left).toBe(true)
  expect(result.repairs.join(' ')).toContain('related silhouettes separate')
})

test('cannot approve mutually overlapping silhouettes merely because their vertical relations are satisfied', () => {
  const images = ['tree', 'treehouse', 'hiker'].map((subject, index) => object(subject, subject, index ? 'support' : 'main', {
    render: { kind: 'illustration', illustrationId: `illustration-library-${subject}-beginner-01` },
  }))
  // The child is pinned on the tree and below the house. Moving it sideways
  // would break contact; this contradictory crowded graph needs model repair.
  const result = compilePlannedScene(scene(images, [relation('treehouse', 'on', 'tree'), relation('hiker', 'below', 'treehouse'), relation('hiker', 'on', 'tree')]), { context })
  expect(result.issues.length).toBeGreaterThan(0)
  expect(result.plan.objects).toHaveLength(3)
})

test('never nudges a fixed old object while separating a new subject from another silhouette', () => {
  const first = object('house', 'house', 'main', { box: { x: .38, y: .1, width: .3, height: .3 } })
  const second = object('flower', 'flower', 'support', { box: { x: .38, y: .43, width: .3, height: .4 } })
  const previous = scene([first, second]); delete previous.relations
  const addition = object('tree', 'tree')
  const result = compilePlannedScene(scene([{ ...first, box: undefined }, { ...second, box: undefined }, addition], [relation('tree', 'below', 'house')]), { context, previousPlan: sanitizeScenePlan(previous) })
  expect(result.plan.objects[0].box).toEqual(first.box)
  expect(result.plan.objects[1].box).toEqual(second.box)
  expect(result.issues).toEqual([])
})

function render(plan, aspect) {
  return plan.objects.map(item => {
    const geometry = compileSceneObject(item), image = getDrawingIllustration(item.render.illustrationId), natural = geometry?.sketch.aspect ?? image.aspect
    let width = item.box.width, height = item.box.height
    if (width * aspect / height > natural) width = height * natural / aspect
    else height = width * aspect / natural
    return { id: item.id, name: item.name, proposal: { ...(image ? { template: 'illustration', illustrationId: image.id } : { template: 'custom', sketch: geometry.sketch, ...(geometry.recipeId ? { recipeId: geometry.recipeId } : {}) }),
      subject: item.name, x: item.box.x + (item.box.width - width) / 2, y: item.box.y + (item.box.height - height) / 2, width, height,
      color: item.color, strokeWidth: 3, rotation: item.rotation ?? 0, target: 'whole picture', relation: 'A path connected to the doorway.' } }
  })
}

test.each([.6, 1, 1.4, 2])('compiles path contact before rendering so connectScenePaths does not relocate it at aspect %s', aspect => {
  const path = object('path', '小路', 'support', { render: { kind: 'compose', primitive: 'path', parameters: { curve: 'left' } }, connectTo: 'house' })
  const result = compilePlannedScene(scene([object('house', 'house', 'main'), path]), { context: { canvasAspect: aspect } })
  expect(result.issues).toEqual([])
  expect(sanitizeScenePlan(result.plan)).not.toBeNull()
  const before = render(result.plan, aspect), after = connectScenePaths(result.plan, before, aspect)
  expect(after).not.toBeNull()
  for (const key of ['x', 'y', 'width', 'height']) expect(after[1].proposal[key]).toBeCloseTo(before[1].proposal[key], 6)
  expect(after[0]).toEqual(before[0])
})

test('shortens a new connected path beside a low fixed building before collision checks', () => {
  const house = object('house', 'house', 'main', { box: { x: .3, y: .6, width: .3, height: .3 } })
  const previous = scene([house]); delete previous.relations
  const path = object('path', '小路', 'support', { render: { kind: 'compose', primitive: 'path' }, connectTo: 'house' })
  const result = compilePlannedScene(scene([{ ...house, box: undefined }, path]), { context, previousPlan: sanitizeScenePlan(previous) })
  expect(result.issues).toEqual([])
  expect(result.plan.objects[0].box).toEqual(house.box)
  const before = render(result.plan, 1.4), after = connectScenePaths(result.plan, before, 1.4)
  expect(after).not.toBeNull()
  for (const key of ['x', 'y', 'width', 'height']) expect(after[1].proposal[key]).toBeCloseTo(before[1].proposal[key], 6)
  expect(before[1].proposal.height).toBeLessThan(.2)
})

test('does not reflow an unchanged previous path or alter its render contract', () => {
  const house = object('house', 'house', 'main', { box }), path = object('path', '小路', 'support', { render: { kind: 'compose', primitive: 'path', parameters: { curve: 'right' } }, connectTo: 'house', box: { x: .25, y: .66, width: .3, height: .3 } })
  const previous = scene([house, path]); delete previous.relations
  const result = compilePlannedScene(scene([{ ...house, box: undefined }, { ...path, box: undefined }, object('cloud', 'cloud', 'atmosphere')]), { context, previousPlan: sanitizeScenePlan(previous) })
  expect(result.issues).toEqual([])
  expect(result.plan.objects[1]).toEqual(path)
})

test('omitting default path parameters during an unrelated edit does not turn it into a new connection', () => {
  const house = object('house', 'house', 'main', { box }), path = object('path', '小路', 'support', { render: { kind: 'compose', primitive: 'path' }, connectTo: 'house', box: { x: .25, y: .66, width: .3, height: .3 } })
  const previous = scene([house, path]); delete previous.relations
  const result = compilePlannedScene(scene([{ ...house, box: undefined }, { ...path, box: undefined }]), { context, previousPlan: sanitizeScenePlan(previous) })
  expect(result.issues).toEqual([])
  expect(result.plan.objects[1].box).toEqual(path.box)
  expect(result.repairs.join(' ')).not.toContain('Connected path')
})

test('separates a common left/right neighbor conflict horizontally without making the focal row float', () => {
  const image = (id, subject, role) => object(id, subject, role, { render: { kind: 'illustration', illustrationId: `illustration-library-${subject}-beginner-01` } })
  const result = compilePlannedScene(scene([image('door', 'door', 'main'), image('tree', 'tree', 'support'), image('dino', 'dinosaur', 'support'), image('mushroom', 'mushroom', 'support')],
    [relation('door', 'right-of', 'tree'), relation('dino', 'left-of', 'door'), relation('mushroom', 'near', 'tree')]), { context })
  expect(result.issues).toEqual([])
  const bounds = result.plan.objects.slice(0, 3).map(item => visible(item))
  expect(Math.max(...bounds.map(b => b.bottom)) - Math.min(...bounds.map(b => b.bottom))).toBeLessThan(.1)
})

test.each([2, 3])('distributes %s houses sharing a cloud support without piling them at its center', count => {
  const cloud = object('cloud', 'cloud', 'main', { render: { kind: 'illustration', illustrationId: 'illustration-library-cloud-beginner-01' } })
  const houses = Array.from({ length: count }, (_, i) => object(`house_${i}`, 'house'))
  const result = compilePlannedScene(scene([cloud, ...houses], houses.map(house => relation(house.id, 'on', 'cloud'))), { context })
  expect(result.issues).toEqual([])
  expect(sanitizeScenePlan(result.plan)).not.toBeNull()
  const [base, ...roofs] = result.plan.objects.map(item => visible(item))
  for (const roof of roofs) {
    expect(roof.bottom).toBeCloseTo(base.top, 6)
    expect(roof.left).toBeGreaterThanOrEqual(base.left - 1e-8)
    expect(roof.right).toBeLessThanOrEqual(base.right + 1e-8)
  }
  for (let i = 1; i < roofs.length; i++) expect(roofs[i].left).toBeGreaterThan(roofs[i - 1].right)
})

test('refuses unreadable objects on a narrow fixed support instead of shrinking away the requested scene', () => {
  const cloud = object('cloud', 'cloud', 'main', { render: { kind: 'illustration', illustrationId: 'illustration-library-cloud-beginner-01' }, box: { x: .4, y: .5, width: .15, height: .15 } })
  const previous = scene([cloud]); delete previous.relations
  const houses = Array.from({ length: 4 }, (_, i) => object(`house_${i}`, 'house'))
  const result = compilePlannedScene(scene([{ ...cloud, box: undefined }, ...houses], houses.map(house => relation(house.id, 'on', 'cloud'))), { context, previousPlan: sanitizeScenePlan(previous) })
  expect(result.plan.objects[0].box).toEqual(cloud.box)
  expect(result.plan.objects).toHaveLength(5)
  expect(result.issues.join(' ')).toContain('overlapping visible silhouettes')
})

test.each(['illustration-library-whale-beginner-01', 'illustration-library-whale-medium-01'])('does not mistake a spout or breaching snout for the back of %s', illustrationId => {
  const whale = object('whale', 'whale', 'main', { render: { kind: 'illustration', illustrationId } })
  const result = compilePlannedScene(scene([whale, object('house', 'house')], [relation('house', 'on', 'whale')]), { context })
  expect(result.issues.join(' ')).toContain('cannot stand on material')
  expect(result.plan.objects).toHaveLength(2)
  expect(result.plan.objects[0].render).toEqual(whale.render)
})

test('uses a reviewed support segment rather than the entire SVG silhouette', () => {
  const whale = object('whale', 'whale', 'main', { render: { kind: 'recipe', recipeId: 'whale-1' } })
  const result = compilePlannedScene(scene([whale, object('house', 'house')], [relation('house', 'on', 'whale')]), { context })
  expect(result.issues).toEqual([])
  const [base, house] = result.plan.objects
  const shape = render(result.plan, 1.4)[0].proposal, roof = visible(house)
  expect(roof.bottom).toBeCloseTo(shape.y + shape.height * .25, 6)
  expect(roof.left).toBeGreaterThanOrEqual(shape.x + shape.width * .24 - .006)
  expect(roof.right).toBeLessThanOrEqual(shape.x + shape.width * .4 + .006)
  expect(base.render.recipeId).toBe('whale-1')
})

test('positions a house below the actual reflected contour of an upside-down flower', () => {
  const flower = object('flower', 'flower', 'main', { rotation: 180 }), house = object('house', 'house')
  const result = compilePlannedScene(scene([flower, house], [relation('house', 'below', 'flower')]), { context })
  expect(result.issues).toEqual([])
  const [base, addition] = result.plan.objects
  expect(visible(addition).top).toBeCloseTo(visible(base).bottom + .035, 6)
  expect(base.rotation).toBe(180)
})

test('connects a path to the real bottom of an inverted PNG instead of its original bottom', () => {
  const tree = object('tree', 'tree', 'main', { rotation: 180, render: { kind: 'illustration', illustrationId: 'illustration-library-tree-beginner-01' } })
  const path = object('path', '小路', 'support', { render: { kind: 'compose', primitive: 'path' }, connectTo: 'tree' })
  const result = compilePlannedScene(scene([tree, path]), { context })
  expect(result.issues).toEqual([])
  const before = render(result.plan, 1.4), after = connectScenePaths(result.plan, before, 1.4)
  expect(after).not.toBeNull()
  for (const key of ['x', 'y', 'width', 'height']) expect(after[1].proposal[key]).toBeCloseTo(before[1].proposal[key], 6)
})

test('an unrelated revision that omits rotation preserves the previous half-turn', () => {
  const flower = object('flower', 'flower', 'main', { rotation: 180, box })
  const previous = scene([flower]); delete previous.relations
  const result = compilePlannedScene(scene([{ ...flower, rotation: undefined, box: undefined }, object('cloud', 'cloud', 'atmosphere')]), { context, previousPlan: previous })
  expect(result.issues).toEqual([])
  expect(result.plan.objects[0].rotation).toBe(180)
  expect(result.plan.objects[0].box).toEqual(box)
})

test.each([false, true])('orthogonal constraints do not reset each other when their order is reversed=%s', reverse => {
  const image = (id, subject, role = 'support') => object(id, subject, role, { render: { kind: 'illustration', illustrationId: `illustration-library-${subject}-beginner-01` } })
  const axes = [relation('explorer', 'left-of', 'tree'), relation('explorer', 'above', 'path')]
  const result = compilePlannedScene(scene([image('tree', 'tree', 'main'), image('explorer', 'hiker'), image('path', 'forestpath'), image('mushroom', 'mushroom'), image('ball', 'ball', 'atmosphere')],
    [...(reverse ? axes.reverse() : axes), relation('tree', 'larger-than', 'explorer'), relation('mushroom', 'near', 'path')]), { context })
  expect(result.issues).toEqual([])
  const [tree, explorer, path] = result.plan.objects.map(item => visible(item))
  expect(explorer.right).toBeLessThanOrEqual(tree.left)
  expect(explorer.bottom).toBeLessThanOrEqual(path.top)
})

test('an inverted reviewed back surface is not accepted as a new top support inside the animal', () => {
  const whale = object('whale', 'whale', 'main', { rotation: 180, render: { kind: 'recipe', recipeId: 'whale-1' } })
  const result = compilePlannedScene(scene([whale, object('house', 'house')], [relation('house', 'on', 'whale')]), { context })
  expect(result.issues.join(' ')).toContain('verified back becomes an underside')
  expect(result.plan.objects).toHaveLength(2)
  expect(result.plan.objects[0].rotation).toBe(180)
})

const orderings = [['middle', 'first', 'last'], ['middle', 'last', 'first'], ['first', 'middle', 'last'], ['first', 'last', 'middle'], ['last', 'middle', 'first'], ['last', 'first', 'middle']]
test.each(orderings.map(order => [order.join(','), order]))('solves a subject between two free anchors independently of object order %s', (_label, order) => {
  for (const axis of ['x', 'y']) for (const reverse of [false, true]) {
    const objects = order.map(id => object(id, id === 'middle' ? 'tree' : 'cloud', id === 'middle' ? 'main' : 'support', {
      render: { kind: 'illustration', illustrationId: `illustration-library-${id === 'middle' ? 'tree' : 'cloud'}-beginner-01` },
    }))
    const relations = [relation('middle', axis === 'x' ? 'left-of' : 'above', 'last'), relation('middle', axis === 'x' ? 'right-of' : 'below', 'first')]
    const result = compilePlannedScene(scene(objects, reverse ? relations.reverse() : relations), { context })
    expect(result.issues, `${axis}, reverse=${reverse}`).toEqual([])
    expect(sanitizeScenePlan(result.plan)).not.toBeNull()
    const b = Object.fromEntries(result.plan.objects.map(item => [item.id, visible(item)])), high = axis === 'x' ? 'right' : 'bottom', low = axis === 'x' ? 'left' : 'top'
    expect(b.first[high]).toBeLessThanOrEqual(b.middle[low] + 1e-7)
    expect(b.middle[high]).toBeLessThanOrEqual(b.last[low] + 1e-7)
    expect(result.plan.objects.map(item => item.id)).toEqual(order)
  }
})

test('propagates a fixed upper bound backwards through free objects without moving old boxes', () => {
  const first = object('first', 'cloud', 'atmosphere', { box: { x: .1, y: .05, width: .2, height: .12 } })
  const last = object('last', 'cloud', 'atmosphere', { box: { x: .1, y: .82, width: .2, height: .12 } })
  const previous = scene([first, last]); delete previous.relations
  const objects = [{ ...first, box: undefined }, { ...last, box: undefined }, object('a', 'flower', 'support', { box: { x: .15, y: .65, width: .15, height: .15 } }), object('b', 'tree', 'support', { box: { x: .15, y: .65, width: .15, height: .15 } })]
  const relations = [relation('a', 'below', 'first'), relation('b', 'below', 'a'), relation('b', 'above', 'last')]
  const result = compilePlannedScene(scene(objects, relations), { context, previousPlan: previous })
  expect(result.issues).toEqual([])
  expect(result.plan.objects[0].box).toEqual(first.box)
  expect(result.plan.objects[1].box).toEqual(last.box)
  const [top, bottom, a, b] = result.plan.objects.map(item => visible(item))
  expect(a.top).toBeGreaterThanOrEqual(top.bottom - 1e-7)
  expect(b.top).toBeGreaterThanOrEqual(a.bottom - 1e-7)
  expect(b.bottom).toBeLessThanOrEqual(bottom.top + 1e-7)
})

test('reports an impossible interval between fixed old anchors without moving them or shrinking the subject', () => {
  const first = object('first', 'cloud', 'atmosphere', { box: { x: .3, y: .35, width: .2, height: .12 } })
  const last = object('last', 'cloud', 'atmosphere', { box: { x: .3, y: .47, width: .2, height: .12 } })
  const middle = object('middle', 'tree', 'main')
  const previous = scene([first, last]); delete previous.relations
  const result = compilePlannedScene(scene([{ ...first, box: undefined }, { ...last, box: undefined }, middle], [relation('middle', 'below', 'first'), relation('middle', 'above', 'last')]), { context, previousPlan: previous })
  expect(result.issues.join(' ')).toContain('cannot fit between fixed previous objects')
  expect(result.plan.objects[0].box).toEqual(first.box)
  expect(result.plan.objects[1].box).toEqual(last.box)
  expect(result.plan.objects).toHaveLength(3)
  expect(physicalSpan(result.plan.objects[2], 1.4)).toBeGreaterThan(.3)
})

test('rejects a positive directional cycle after bounded relaxation', () => {
  const objects = [object('a', 'tree', 'main'), object('b', 'flower'), object('c', 'cloud')]
  const result = compilePlannedScene(scene(objects, [relation('a', 'left-of', 'b'), relation('b', 'left-of', 'c'), relation('c', 'left-of', 'a')]), { context })
  expect(result.issues.join(' ')).toContain('horizontal relationship graph contains a contradiction')
  expect(result.plan.objects.map(item => item.id)).toEqual(['a', 'b', 'c'])
})

test.each([undefined, 'house'])('promotes a misplaced path connection when the object-level value is %s and renders exact contact', connectTo => {
  const path = object('path', '小路', 'support', { render: { kind: 'compose', primitive: 'path', parameters: { curve: 'left', connectTo: 'house' } }, ...(connectTo ? { connectTo } : {}) })
  const input = scene([object('house', 'house', 'main'), path]), original = structuredClone(input)
  const result = compilePlannedScene(input, { context })
  expect(result.issues).toEqual([])
  expect(sanitizeScenePlan(result.plan)).not.toBeNull()
  const compiled = result.plan.objects[1]
  expect(compiled.connectTo).toBe('house')
  expect(compiled.render).toEqual({ kind: 'compose', primitive: 'path', parameters: { curve: 'left' } })
  expect(input).toEqual(original)
  const before = render(result.plan, 1.4), after = connectScenePaths(result.plan, before, 1.4)
  expect(after).not.toBeNull()
  for (const key of ['x', 'y', 'width', 'height']) expect(after[1].proposal[key]).toBeCloseTo(before[1].proposal[key], 6)
  const house = visible(result.plan.objects[0]), proposal = after[1].proposal
  expect(proposal.x + proposal.width * .495).toBeCloseTo((house.left + house.right) / 2, 6)
  expect(proposal.y + proposal.height * .03).toBeCloseTo(house.bottom, 6)
})

test.each([
  { nested: 'house', top: 'flower' },
  { nested: 'missing' },
  { nested: 'path' },
  { nested: 'another_path' },
  { nested: 3 },
  { nested: 'house', top: null },
])('does not repair a conflicting or invalid nested connection: %j', ({ nested, top }) => {
  const renderSpec = { kind: 'compose', primitive: 'path', parameters: { curve: 'left', connectTo: nested } }
  const path = object('path', '小路', 'support', { render: renderSpec, ...(top !== undefined ? { connectTo: top } : {}) })
  const other = object('another_path', '小路', 'atmosphere', { render: { kind: 'compose', primitive: 'path' } })
  const input = scene([object('house', 'house', 'main'), object('flower', 'flower'), path, other]), original = structuredClone(input)
  const result = compilePlannedScene(input, { context })
  expect(result.plan.objects[2].render).toEqual(renderSpec)
  expect(result.plan.objects[2].connectTo).toBe(top)
  expect(sanitizeScenePlan(result.plan)).toBeNull()
  expect(input).toEqual(original)
})

test('path connection promotion does not accept other unknown parameters or wrong primitive contracts', () => {
  for (const renderSpec of [
    { kind: 'compose', primitive: 'path', parameters: { curve: 'left', connectTo: 'house', invented: true } },
    { kind: 'compose', primitive: 'path', parameters: { curve: 'sideways', connectTo: 'house' } },
    { kind: 'compose', primitive: 'water', parameters: { rows: 2, connectTo: 'house' } },
  ]) {
    const result = compilePlannedScene(scene([object('house', 'house', 'main'), object('path', '小路', 'support', { render: renderSpec })]), { context })
    expect(sanitizeScenePlan(result.plan)).toBeNull()
  }
})

test('generated source-image coordinates survive compilation and saved-plan rotation restoration without rewriting the final idea', () => {
  const generated = object('whole', '倒置图案', 'main', {
    essential: ['完整图案绕自身中心倒转'], rotation: 180,
    render: { kind: 'generated', sourceDescription: '一幅朝向正常、结构完整的图案。' },
    box: { x: .06, y: .08, width: .88, height: .82 },
  })
  const input = { ...scene([generated]), request: '把完整图案倒过来', summary: '完整图案上下和左右都翻转。' }
  const snapshot = structuredClone(input), compiled = compilePlannedScene(input, { context })
  expect(compiled.issues).toEqual([])
  const saved = sanitizeScenePlan(compiled.plan)
  expect(saved).toMatchObject({ request: input.request, summary: input.summary,
    objects: [{ ...generated, aliases: [] }],
  })
  const restored = compilePlannedScene({ ...input, objects: [{ ...generated, box: undefined, rotation: undefined }] }, { context, previousPlan: saved })
  expect(restored.issues).toEqual([])
  expect(sanitizeScenePlan(restored.plan)).toEqual(saved)
  expect(input).toEqual(snapshot)
})
