/** Identity relationships, never theme associations or scene templates.
 * Edges are one-way: a rose is a flower, while an arbitrary flower is not a rose.
 * A branch is part of a tree, not another spelling of a whole tree.
 */
const members = {
  cake: ['cupcake'],
  flower: ['rose', 'tulip', 'sunflower', 'daisy', 'poppy', 'orchid', 'hydrangea', 'lavender', 'peony', 'daffodil', 'hibiscus'],
  bird: ['duck', 'penguin', 'owl', 'chick'],
  leaf: ['ginkgoleaf', 'mapleleaf'],
  branch: ['oakbranch'],
  tree: ['palm'],
  plant: ['flower', 'tree', 'cactus', 'bamboo', 'grass', 'fern', 'monstera'],
  animal: ['bird', 'butterfly', 'squirrel', 'cat', 'rabbit', 'fish', 'turtle', 'giraffe', 'horse', 'whale', 'dolphin', 'octopus', 'crab', 'dinosaur', 'bear', 'dog', 'panda', 'capybara', 'hamster', 'otter', 'hedgehog', 'seal', 'redpanda', 'frog', 'jellyfish', 'snail'],
}
const parents = new Map()
for (const [parent, children] of Object.entries(members)) for (const child of children) {
  if (!parents.has(child)) parents.set(child, [])
  parents.get(child).push(parent)
}

export const sceneSubjectConcepts = [
  { subject: 'animal', name: '动物', aliases: ['小动物', '动物们', '小动物们', 'animal', 'animals'] },
  { subject: 'plant', name: '植物', aliases: ['植物们', 'plant', 'plants'] },
  { subject: 'branch', name: '树枝', aliases: ['枝条', '枝干', 'branch', 'branches', 'tree branch', 'tree branches'] },
]

// Explicit component facts are deliberately distinct from is-a. They may aid
// interpretation but must not let a branch fulfill a request for a whole tree.
export const sceneSubjectParts = Object.freeze({ branch: 'tree', leaf: 'plant' })

export function isSceneSubjectSubtype(actual, required) {
  if (actual === required) return true
  const visited = new Set(), pending = [...(parents.get(actual) ?? [])]
  while (pending.length) {
    const parent = pending.pop()
    if (parent === required) return true
    if (visited.has(parent)) continue
    visited.add(parent)
    pending.push(...(parents.get(parent) ?? []))
  }
  return false
}

/** Add only grammatical forms of registered English nouns, not related words. */
export function sceneNounForms(word) {
  if (typeof word !== 'string' || !/^[a-z]+(?:[ -][a-z]+)*$/i.test(word)) return []
  const value = word.toLowerCase(), parts = value.split(/(?<=[ -])/), noun = parts.pop()
  const irregular = { leaf: 'leaves', child: 'children', person: 'people', mouse: 'mice', goose: 'geese', fish: 'fish', sheep: 'sheep', deer: 'deer' }
  const plural = irregular[noun] ?? (/[^aeiou]y$/.test(noun) ? `${noun.slice(0, -1)}ies` : /(?:s|x|z|ch|sh)$/.test(noun) ? `${noun}es` : `${noun}s`)
  return [`${parts.join('')}${plural}`]
}

/** Weather is a scene condition with visible evidence, not an unfamiliar noun.
 * Match a complete condition phrase only: rainy-day castles, snowmen and rain
 * coats remain entities. The unmodified source phrase stays in the scene brief.
 */
export function isSceneConditionRequirement(value) {
  if (typeof value !== 'string') return false
  const phrase = value.trim().toLowerCase().replace(/[。！!？?]+$/u, '')
  return /^(?:(?:一个|一场|有点|很|非常|正在|在|持续|温暖的|寒冷的|有风的|阴冷的|刮风的|下着雨的|下雨的|下雪的)\s*)*(?:下雨天|雨天|下雨|下着雨|雨中|雨夜|下雪天|雪天|下雪|下着雪|晴天|晴朗|阴天|多云|刮风|有风|大风|起雾|有雾|大雾|暴风雨|雷雨|天气)(?:里|中|的天气)?$/u.test(phrase)
    || /^(?:(?:a|an|the|very|slightly|warm|cold|stormy)\s+)*(?:rainy|rain|raining|snowy|snow|snowing|sunny|windy|foggy|misty|cloudy|stormy|storm|thunderstorm)(?:\s+(?:day|night|weather|conditions?))?$/.test(phrase)
}

export const isSceneDrawnObject = object => ['custom', 'generated'].includes(object?.render?.kind)
