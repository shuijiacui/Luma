import { drawingRecipes, getDrawingRecipe, matchingRecipeSubjects } from './niloRecipes.mjs'
import { recipeSubjectAliases } from '../knowledge/nilo/recipes/names.mjs'
import { drawingIllustrations, getDrawingIllustration, matchingIllustrationSubjects } from './niloIllustrations.mjs'
import { isMaterialEnabled, getRetiredMaterialIdentity } from './niloCuration.mjs'
import { validateSketch } from './niloSketch.mjs'

export const materialCategories = Object.freeze({
  animals: '动物', people: '人物', architecture: '建筑', botanical: '植物',
  landscape: '风景与天空', vehicles: '交通工具', food: '食物',
  stilllife: '生活物件', fantasy: '想象伙伴',
})

// Association words describe a scene, not what an object IS. For example,
// a kite is associated with a person, but belongs with everyday objects.
const subjectsByCategory = {
  animals: 'butterfly squirrel bird cat rabbit fish turtle giraffe horse cow sheep duck penguin owl whale dolphin octopus crab dinosaur bear dog panda fox lion elephant pig capybara hamster otter hedgehog seal redpanda chick frog jellyfish axolotl snail',
  botanical: 'flower mushroom tree cactus leaf palm rose tulip sunflower bamboo grass daisy poppy orchid hydrangea lavender peony daffodil hibiscus fern monstera ginkgoleaf mapleleaf oakbranch',
  landscape: 'sun moon cloud rainbow mountain stars waves rain flame trail beachscene riverscene lakescene volcano desert oasis snowmountain forestpath island cavescene countryroad',
  vehicles: 'boat car bus truck train airplane helicopter bicycle submarine scooter hotairballoon rocket',
  food: 'apple pear banana strawberry watermelon cherry grapes pineapple carrot icecream cake cupcake pudding',
  stilllife: 'kite bench balloon umbrella ball drum guitar book pencil crayon paintpalette wateringcan teapot cup clock gift backpack sneaker rainboot strawhat mittens lantern desk lamp bed wardrobe bookshelf window door violin trumpet camera telescope microscope sewingmachine teacupset vase bottle breadbasket',
  fantasy: 'robot ufo dragon sleepycloud mailboxfriend moonboat papercrown toytrain heart',
  people: 'astronaut readingchild paintingchild gardener baker firefighter doctor teacher mailcarrier guitarist ballerina runningchild umbrellauser grandmother wheelchairuser hiker',
  architecture: 'house castle tent windmill school bookshop bakery cottage treehouse watermill clocktower pagoda pavilion archedbridge igloo yurt greenhouse railwaystation apartment',
}
const categoryBySubject = new Map(Object.entries(subjectsByCategory).flatMap(([category, subjects]) => subjects.split(' ').map(subject => [subject, category])))

export function materialCategory(materialOrSubject) {
  const item = typeof materialOrSubject === 'string'
    ? drawingIllustrations.find(value => value.subject === materialOrSubject) ?? drawingRecipes.find(value => value.subject === materialOrSubject) ?? { subject: materialOrSubject }
    : materialOrSubject ?? {}
  return categoryBySubject.get(item.subject) ?? (Object.hasOwn(materialCategories, item.category) ? item.category : 'stilllife')
}

const styles = new Set(['storybook', 'illustrated', 'realistic'])
const difficulties = new Set(['beginner', 'medium', 'detailed'])
const unique = values => [...new Set(values.filter(value => typeof value === 'string' && value.length))]
function describe(raw, kind) {
  if (!raw) return undefined
  return {
    id: raw.id, subject: raw.subject, name: raw.name, label: raw.label ?? raw.name, kind,
    style: styles.has(raw.style) ? raw.style : 'storybook',
    difficulty: kind === 'recipe' ? 'beginner' : difficulties.has(raw.difficulty) ? raw.difficulty : 'medium',
    category: materialCategory(raw),
    aliases: unique([raw.subject, raw.name, ...recipeSubjectAliases(raw.subject), ...(raw.aliases ?? [])]),
    aspect: kind === 'recipe' ? raw.sketch.aspect : raw.aspect,
    minPixels: raw.minPixels,
    ...(kind === 'recipe' ? { sketch: structuredClone(raw.sketch) } : { src: raw.src }),
  }
}

/** Fresh eligible data on every read: a review decision takes effect at once. */
export function getMaterial(id) {
  if (typeof id !== 'string' || !isMaterialEnabled(id)) return undefined
  const illustration = getDrawingIllustration(id)
  return illustration ? describe(illustration, 'illustration') : describe(getDrawingRecipe(id), 'recipe')
}

/** Preferences order alternatives; they never hide another style or infer skill. */
export function rankMaterials(materials, options = {}) {
  // recentIds are explicit child selections, newest first (not merely shown).
  const recent = new Map((options.recentIds ?? []).map((id, index) => [id, index]))
  return materials.map((material, order) => ({ material, order })).sort((a, b) =>
    (recent.get(a.material.id) ?? Number.MAX_SAFE_INTEGER) - (recent.get(b.material.id) ?? Number.MAX_SAFE_INTEGER)
    || Number(b.material.style === options.preferredStyle) - Number(a.material.style === options.preferredStyle)
    || Number(b.material.difficulty === options.preferredDifficulty) - Number(a.material.difficulty === options.preferredDifficulty)
    || a.order - b.order).map(({ material }) => material)
}

export function listMaterialSubjects(options = {}) {
  const grouped = new Map()
  for (const [kind, source] of [['recipe', drawingRecipes], ['illustration', drawingIllustrations]]) {
    for (const raw of source) {
      if (!isMaterialEnabled(raw.id)) continue
      const material = describe(raw, kind)
      if (!grouped.has(raw.subject)) grouped.set(raw.subject, {
        subject: raw.subject, name: raw.name, category: material.category, aliases: [], materials: [],
      })
      const group = grouped.get(raw.subject)
      group.aliases = unique([...group.aliases, ...material.aliases])
      group.materials.push(material)
    }
  }
  return [...grouped.values()].map(group => ({ ...group, materials: rankMaterials(group.materials, options) }))
}

function matchingSubjects(value) {
  return unique([...matchingRecipeSubjects(value, true), ...matchingIllustrationSubjects(value, true)])
}

export function getMaterialChoices(subjectOrAlias, options = {}) {
  const subjects = matchingSubjects(subjectOrAlias)
  return subjects.length === 1 ? listMaterialSubjects(options).find(group => group.subject === subjects[0])?.materials ?? [] : []
}

/** Identity can be read from a retired guide; retirement must not restore its art. */
export function materialSubjectForProposal(proposal) {
  if (!proposal || typeof proposal !== 'object') return null
  const raw = proposal.template === 'illustration' ? getDrawingIllustration(proposal.illustrationId)
    : proposal.recipeId ? getDrawingRecipe(proposal.recipeId) ?? getRetiredMaterialIdentity(proposal.recipeId) : undefined
  if (raw) return raw.subject
  const named = matchingSubjects(proposal.subject ?? proposal.template)
  return named.length === 1 ? named[0] : null
}

function fitSketch(sketch, frameAspect) {
  if (!Number.isFinite(frameAspect) || frameAspect < .2 || frameAspect > 5) return null
  const sx = Math.min(1, sketch.aspect / frameAspect), sy = Math.min(1, frameAspect / sketch.aspect)
  const x = value => .5 + (value - .5) * sx, y = value => .5 + (value - .5) * sy
  return validateSketch({ aspect: frameAspect, paths: sketch.paths.map(path => path.map(([op, ...coords]) =>
    op === 'E' ? [op, x(coords[0]), y(coords[1]), coords[2] * sx, coords[3] * sy]
      : [op, ...coords.map((value, i) => i % 2 ? y(value) : x(value))])) })
}

/** Explicit child selection may change subject and medium. Never call this to
 * reinterpret an unfinished child sketch or to silently cycle a guide. */
export function createMaterialProposal(id, source, canvasAspect = 1) {
  const material = getMaterial(id)
  if (!material || !Number.isFinite(canvasAspect) || canvasAspect <= 0) return null
  let frame = source && ['x', 'y', 'width', 'height', 'rotation'].every(key => Number.isFinite(source[key]))
    ? { x: source.x, y: source.y, width: source.width, height: source.height, rotation: source.rotation }
    : null
  if (!frame) {
    const span = material.kind === 'illustration' ? .62 : .38
    const height = span * Math.min(1, canvasAspect) / Math.max(1, material.aspect)
    const width = height * material.aspect / canvasAspect
    frame = { x: (1 - width) / 2, y: (1 - height) / 2, width, height, rotation: 0 }
  }
  if (frame.width < .025 || frame.height < .025 || Math.abs(frame.rotation) > 180) return null
  // A large PNG frame may exceed the committed-vector protocol. Keep its
  // centre, rotation and proportions while fitting the existing vector budget.
  const maxSpan = material.kind === 'recipe' ? .45 : .9
  const maxArea = material.kind === 'recipe' ? .16 : .81
  const factor = Math.min(1, maxSpan / frame.width, maxSpan / frame.height, Math.sqrt((maxArea - 1e-12) / (frame.width * frame.height)))
  if (factor < 1) {
    const width = frame.width * factor, height = frame.height * factor
    frame = { ...frame, x: frame.x + (frame.width - width) / 2, y: frame.y + (frame.height - height) / 2, width, height }
  }
  if (frame.width < .025 || frame.height < .025) return null
  const centerX = frame.x + frame.width / 2, centerY = frame.y + frame.height / 2
  const radians = frame.rotation * Math.PI / 180
  const halfWidth = (Math.abs(Math.cos(radians)) * frame.width + Math.abs(Math.sin(radians)) * frame.height / canvasAspect) / 2
  const halfHeight = (Math.abs(Math.sin(radians)) * frame.width * canvasAspect + Math.abs(Math.cos(radians)) * frame.height) / 2
  if (centerX - halfWidth < -1e-9 || centerX + halfWidth > 1 + 1e-9 || centerY - halfHeight < -1e-9 || centerY + halfHeight > 1 + 1e-9) return null
  const proposal = {
    ...frame, subject: material.name, color: /^#[0-9a-f]{6}$/i.test(source?.color) ? source.color : '#568570',
    strokeWidth: Number.isFinite(source?.strokeWidth) && source.strokeWidth >= 1 && source.strokeWidth <= 32 ? source.strokeWidth : 4,
    ...(source?.brushKind ? { brushKind: source.brushKind } : {}),
    target: material.name, relation: '孩子选择的参考图', contribution: 'object', placementPolicy: 'free',
  }
  if (material.kind === 'illustration') return { ...proposal, template: 'illustration', illustrationId: material.id }
  const sketch = fitSketch(material.sketch, frame.width * canvasAspect / frame.height)
  return sketch ? { ...proposal, template: 'custom', recipeId: material.id, sketch } : null
}

export const proposalForMaterial = createMaterialProposal
