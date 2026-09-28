import { drawingRecipes, getDrawingRecipe, recipeCatalogue, requestedRecipeStyle } from '../../../shared/niloRecipes.mjs'
import { drawingIllustrations, getDrawingIllustration, illustrationCatalogue } from '../../../shared/niloIllustrations.mjs'
import { isMaterialEnabled, retiredMaterialIdentities } from '../../../shared/niloCuration.mjs'
import { findRecipeSubjects, recipeSubjectAliases } from '../../../knowledge/nilo/recipes/names.mjs'
import illustrationBounds from '../../../shared/niloIllustrationTracing.json' with { type: 'json' }
import { rankMaterialVariants, sceneSemanticIndex, sceneMaterialGeometry, sceneMaterialTier, sceneMaterialLexicalScore } from './niloSceneSemanticIndex.js'
import { needsCreativeScenePlanning } from '../../../shared/niloSceneScope.mjs'
import { getMaterialGeometry } from './niloMaterialGeometry.js'
import { isSceneConditionRequirement, isSceneDrawnObject, isSceneSubjectSubtype, sceneNounForms, sceneSubjectConcepts } from './niloSceneSubjectTaxonomy.js'
import { isPreservedSubjectPhrase, preservedChildSubjects, preservedOnlySubjects } from './niloScenePreservation.js'

const styles = ['storybook', 'illustrated', 'realistic'], details = ['simple', 'moderate', 'rich']
const list = value => Array.isArray(value) ? value : []
const text = value => typeof value === 'string' ? value.slice(0, 1200) : ''
const key = profile => `${profile.style}/${profile.detail}`
const validProfile = value => value && styles.includes(value.style) && details.includes(value.detail)
const materialId = render => render?.kind === 'recipe' ? render.recipeId : render?.kind === 'illustration' ? render.illustrationId : null
const families = ['fantasy', 'landscape', 'nature', 'animal', 'architecture', 'transport', 'people', 'object']
const vehicles = new Set(['boat', 'rocket', 'car', 'bus', 'truck', 'train', 'airplane', 'helicopter', 'submarine', 'bicycle', 'scooter', 'hotairballoon', 'toytrain'])
const profileOf = material => ({ style: material.style ?? 'storybook', detail: material.kind === 'recipe' ? 'simple' : material.detail })
// The matcher intentionally visits each subject once. Merge every media variant's
// vocabulary first: PNG "水车小屋" and SVG "水车屋" are the same subject, and the
// shorter generic "屋" must not turn the former into an unrelated house.
const subjectVocabulary = [...[...drawingRecipes, ...retiredMaterialIdentities, ...drawingIllustrations].filter(material => !material.completeScene).reduce((subjects, material) => {
  const current = subjects.get(material.subject)
  if (!current) subjects.set(material.subject, { subject: material.subject, name: material.name, aliases: [...new Set([material.name, ...list(material.aliases)])] })
  else current.aliases = [...new Set([...current.aliases, material.name, ...list(material.aliases)])]
  return subjects
}, new Map()).values()]
// Spoken noun forms are identity synonyms, not theme-to-object substitutions.
// Keep these explicit multi-character words rather than reopening unrestricted
// single-character matches (花朵 is a flower; 火花/雪花/花生 are not).
const naturalNounAliases = {
  flower: ['花朵', '花儿', '鲜花'], tree: ['树木'], bird: ['鸟儿'], fish: ['鱼儿'],
  cloud: ['云彩', '云团'], leaf: ['叶片'], grass: ['青草'], boat: ['船只'], house: ['屋子', '房屋'],
}
for (const item of subjectVocabulary) item.aliases = [...new Set([...item.aliases, ...(naturalNounAliases[item.subject] ?? [])])]
// Generic children can be represented by a registered child doing an activity;
// the catalogue's actual labels distinguish them from adult people materials.
subjectVocabulary.push({ subject: 'child', name: '孩子', aliases: ['小孩', '儿童', '小朋友', 'child', 'children'] })
subjectVocabulary.push(...sceneSubjectConcepts)
for (const item of subjectVocabulary) item.aliases = [...new Set([...item.aliases,
  ...[item.subject, item.name, ...item.aliases, ...recipeSubjectAliases(item.subject)].flatMap(sceneNounForms)])]
const vocabularyBySubject = new Map(subjectVocabulary.map(item => [item.subject, item]))
const subjectRecords = new Map()
for (const item of [...drawingRecipes, ...drawingIllustrations]) {
  if (!subjectRecords.has(item.subject)) subjectRecords.set(item.subject, { categories: new Set(), words: new Set() })
  const record = subjectRecords.get(item.subject)
  if (item.category) record.categories.add(item.category)
  for (const word of [item.name, ...list(item.aliases)]) if (typeof word === 'string') record.words.add(word.toLowerCase())
}
const wordSegmenter = new Intl.Segmenter('zh', { granularity: 'word' })
function mentionedSubjects(value) {
  const input = text(value).toLowerCase(), hits = findRecipeSubjects(input, subjectVocabulary)
  if (!hits.length) return []
  // A single-character alias is a word only when it is independent. Without
  // this lexical boundary, 星球 becomes a ball and 海马 becomes a horse. Use the
  // real multi-character names/aliases when available, not a theme blacklist.
  const words = new Set([...wordSegmenter.segment(input)].filter(item => item.isWordLike).map(item => item.segment))
  const matched = hits.filter(subject => {
    const item = vocabularyBySubject.get(subject)
    return [item.subject, item.name, ...item.aliases, ...recipeSubjectAliases(subject)].some(word => {
      const term = word.toLowerCase()
      if (!input.includes(term)) return false
      return !/^\p{Script=Han}$/u.test(term) || words.has(term)
    })
  })
  // Shared generic aliases must not add a second, narrower requirement:
  // cottage's registered alias "小房子" does not mean every house is a cottage.
  // Keep an explicit subtype noun when it contributes its own distinct words.
  const terms = subject => {
    const item = vocabularyBySubject.get(subject)
    return [item.subject, item.name, ...item.aliases, ...recipeSubjectAliases(subject)].map(word => word.toLowerCase())
  }
  return matched.filter(subject => !matched.some(generic => {
    if (subject === generic || !subjectSatisfies(subject, generic) || subjectSatisfies(generic, subject)) return false
    const genericTerms = new Set(terms(generic))
    return !terms(subject).some(term => !genericTerms.has(term) && input.includes(term))
  }))
}
/** Shared identity parser for bounded geometry lookup; never use related tags
 * to turn an unfamiliar invention into an unrelated registered subject. */
export const namedSceneSubjects = value => mentionedSubjects(value)

/** Remove only an existing instance's plain identity requirement. A compound
 * with new attached features is not reduced to its base noun or discarded. */
export function sceneAdditionRequiredSubjects(input = {}) {
  const preserved = preservedOnlySubjects(input), identities = new Set(preserved.flatMap(mentionedSubjects))
  return list(input.semanticBrief?.requiredSubjects).filter(value => {
    if (isPreservedSubjectPhrase(value, preserved)) return false
    const phrase = text(value).trim().toLowerCase()
    return ![...identities].some(subject => {
      const item = vocabularyBySubject.get(subject)
      return [item.subject, item.name, ...item.aliases, ...recipeSubjectAliases(subject)].some(alias => alias.toLowerCase() === phrase)
    })
  })
}

function subjectSatisfies(actual, required) {
  if (isSceneSubjectSubtype(actual, required)) return true
  const record = subjectRecords.get(actual), expected = vocabularyBySubject.get(required)
  if (!record || !expected) return false
  if (required === 'child') return record.categories.has('people')
    && [...record.words].some(word => /孩子|儿童|小孩|小朋友|\bchild(?:ren)?\b/i.test(word))
  // Only an exact registered alias of the generic canonical identity can make
  // a subtype satisfy it. Shared category/tags or substrings are insufficient:
  // a cottage is a house; a bookshop is not a book and a treehouse is not a tree.
  return [expected.subject, expected.name].some(word => record.words.has(word.toLowerCase()))
}
const coversSubject = (actuals, required) => [...actuals].some(actual => subjectSatisfies(actual, required))
const matchingGroups = (groups, required) => [...groups.values()].filter(group => subjectSatisfies(group.subject, required)
  || group.items.some(item => coversSubject(item.visibleSubjects ?? [], required)))
/** Only a registered complete scene's factual caption can establish contents.
 * Proposed names/aliases/essential never create stock identity or cut-out parts. */
function materialVisibleSubjects(material) {
  return [...new Set([material.subject, ...(material.completeScene
    ? mentionedSubjects(getMaterialGeometry(material.id)?.actualPose ?? material.pose ?? material.label ?? '') : [])])]
}
const connectorNames = {
  path: /路|小径|步道|小道|通道|\b(?:paths?|roads?|trails?|walkways?)\b/i,
  water: /水纹|水波|水流|水面|海水|河水|湖水|波纹|波浪|涟漪|海浪|海面|河面|湖面|\b(?:waves?|ripples?|water|sea|ocean|lake|river)\b/i,
}
const connectorGeometry = /线|弯|曲|边|起伏|延伸|变宽|\b(?:lines?|curv\w*|edges?|widen\w*|undulat\w*)\b/i
const closedDecoration = /气泡|泡泡|圆泡|圆圈|圆形|圆点|圆环|\b(?:bubbles?|circles?|rings?|round\s+(?:shapes?|dots?))\b/i

function connectorIssue(object) {
  const primitive = object.render?.kind === 'compose' && object.render.primitive
  if (!['path', 'water'].includes(primitive)) return null
  const own = connectorNames[primitive], other = connectorNames[primitive === 'path' ? 'water' : 'path']
  const name = text(object.name), essential = list(object.essential).map(text)
  if (own.test(name) && !other.test(name) && !closedDecoration.test([name, ...list(object.aliases), ...essential].join(' '))
    && essential.length && essential.every(feature => !other.test(feature) && (own.test(feature) || connectorGeometry.test(feature)))) return null
  return `Object ${object.id}: compose/${primitive} cannot depict its stated name/essential features. compose/path draws ONLY two curved road edges, not water ripples, bubbles or arbitrary shapes; compose/water draws ONLY open horizontal wave/ripple lines (rows 1..5), not bubbles or closed circles. Use the correct water/path geometry for matching line features, or a real matching registered material. An optional decoration not requested by the child may be removed along with its summary claim; an explicitly requested feature must remain with genuinely matching geometry/custom, never be renamed as a connector or silently deleted.`
}
function lineFamilyOf(material) {
  if (material.kind === 'illustration') return 'reference'
  const recipe = getDrawingRecipe(material.id)
  if (!recipe?.style) return 'schematic'
  const curved = recipe.sketch.paths.flat().filter(command => ['C', 'Q', 'E'].includes(command[0])).length
  return recipe.collection === 'studio' || recipe.collection === 'playtime' || curved >= 2 ? 'reference' : 'schematic'
}

function familyOf(material) {
  if (material.category === 'architecture') return 'architecture'
  if (material.category === 'people') return 'people'
  if (material.category === 'fantasy' || ['robot', 'dragon', 'ufo'].includes(material.subject)) return 'fantasy'
  if (material.category === 'vehicle' || vehicles.has(material.subject)) return 'transport'
  if (material.category === 'animal' || material.related?.includes('animal')) return 'animal'
  if (material.category === 'botanical' || material.related?.includes('plant')) return 'nature'
  if (material.category === 'landscape' || material.related?.includes('landscape')) return 'landscape'
  return 'object'
}

function allMaterials(utterance, recent) {
  const recipes = recipeCatalogue([{ subject: utterance }], recent).map(item => ({ ...item, kind: 'recipe', detail: 'simple', style: item.style ?? 'storybook', pose: item.variant }))
  const related = new Map(recipes.map(item => [item.subject, item.related]))
  return [...recipes.map(item => ({ ...item, aspect: getDrawingRecipe(item.id).sketch.aspect, minPixels: getDrawingRecipe(item.id).minPixels ?? 144 })), ...illustrationCatalogue().map(item => ({ ...item, kind: 'illustration', completeScene: getDrawingIllustration(item.id)?.completeScene === true, pose: getDrawingIllustration(item.id)?.label ?? `${item.style}/${item.detail}`, minPixels: getDrawingIllustration(item.id)?.minPixels ?? 180, related: getDrawingIllustration(item.id)?.related ?? related.get(item.subject) ?? [item.category] }))]
    .map(item => ({ ...item, family: familyOf(item), pose: getMaterialGeometry(item.id)?.actualPose ?? item.pose }))
    .map(item => ({ ...item, visibleSubjects: materialVisibleSubjects(item) }))
}

function registeredMaterial(render) {
  if (render?.kind === 'recipe') {
    const recipe = getDrawingRecipe(render.recipeId)
    return recipe ? { ...recipe, kind: 'recipe', detail: 'simple', style: recipe.style ?? 'storybook', label: getMaterialGeometry(recipe.id)?.actualPose ?? recipe.label } : null
  }
  if (render?.kind === 'illustration') {
    const illustration = getDrawingIllustration(render.illustrationId)
    return illustration ? { ...illustration, kind: 'illustration', label: getMaterialGeometry(illustration.id)?.actualPose ?? illustration.label } : null
  }
  return null
}

/** Exact selected-asset caption evidence, never a global alias or a substring.
 * Audited actualPose takes precedence through registeredMaterial; a stale
 * catalogue caption cannot override that correction. Pose checks remain a
 * separate required gate before canonicalizing a model's display name.
 */
export function canonicalIllustrationCaptionName(object) {
  const material = registeredMaterial(object?.render)
  return material?.kind === 'illustration' && typeof material.label === 'string'
    && object?.name === material.label ? material.name : null
}

const topics = [
  [/梦幻|童话|梦境|魔法|奇妙|神奇|\b(?:dream\w*|fairy\w*|enchanted|magical|fantasy)\b/i, ['fantasy', 'sky', 'garden', 'nature']],
  [/海|水底|水下|游泳|湖|河|\b(?:ocean|sea|underwater|swim\w*|river|lake)\b/i, ['water', 'sea', 'ocean', 'river', 'lake']],
  [/森林|树林|林间|\b(?:forest|woodland|woods)\b/i, ['forest', 'tree', 'nature']],
  [/花园|花海|春天|\b(?:garden|spring|flower\w*)\b/i, ['garden', 'flower', 'plant', 'nature']],
  [/太空|宇宙|星空|星球|\b(?:space|cosmic|galaxy|planet\w*)\b/i, ['space', 'sky', 'moon', 'star']],
  [/天空|云端|飞行|飞翔|\b(?:sky|flying|floating)\b/i, ['sky', 'cloud', 'air']],
  [/雪|冬天|冰|\b(?:snow|winter|ice)\b/i, ['snow', 'winter', 'ice']],
  [/城市|街道|建筑|\b(?:city|street|building\w*)\b/i, ['architecture', 'home', 'vehicle']],
]

const directions = [
  { id: 'depth', prompt: 'Give the chosen subjects a clear near/far relationship and leave space for the child to continue.', pattern: /远近|远处|近景|远景|near|far|depth/i },
  { id: 'journey', prompt: 'Let the requested subjects participate in one understandable movement or journey; choose the subjects from the child’s theme.', pattern: /旅行|旅程|出发|前进|journey|travel/i },
  { id: 'gathering', prompt: 'Build a small interaction around one focal subject instead of distributing disconnected stickers evenly.', pattern: /聚会|一起|围着|gather|together/i },
  { id: 'height', prompt: 'Use a few different heights and sizes to make a coherent composition, without changing any size the child specified.', pattern: /高低|上下|高度|height|above|below/i },
  { id: 'quiet', prompt: 'Use one clear focal area and a small number of meaningful supporting subjects; let quiet space carry the mood.', pattern: /安静|留白|quiet|calm/i },
  { id: 'discovery', prompt: 'Create a place for the chosen subjects to discover or approach something; invent their relationship, not a fixed scene template.', pattern: /发现|探险|探索|discover|explore/i },
]

export function isFreshSceneRequest(utterance) {
  const value = text(utterance)
  const requests = /重新(?:构思|设计|想)(?:一下|一个|个|一幅|一张|新的)?(?:[^，。！？]{0,12}(?:场景|画面|主意))?|换(?:个|一个|一幅|一张)?(?:新(?:的)?|另一个|不同(?:的)?)[^，。！？]{0,12}(?:场景|画面|主意)|\b(?:new|another|different)\s+(?:dreamy\s+)?(?:scene|idea|composition)\b|\bstart (?:over|afresh)\b/gi
  const negatedClauses = new Set()
  for (const match of value.matchAll(requests)) {
    const prefix = value.slice(0, match.index).split(/[，。！？,!?;.；]|\b(?:but|however|instead)\b|但是|不过|而是/i).at(-1), clauseStart = match.index - prefix.length
    if (negatedClauses.has(clauseStart)) continue
    // Negate this action, not the whole utterance: "不要城堡，换个新场景"
    // still requests a fresh idea, while "不要换新场景，只改小船" does not.
    if (/(?:不(?:要|用|必|想|需要|打算|准备)?|别|无需|不是(?:让你|要)?)(?:再|现在|帮我|给我|直接|急着|马上|就|先|把整个(?:画面|场景)|\s)*$/i.test(prefix)
      || /\b(?:do not|don't|not|never|no need to)\s+(?:please\s+|just\s+|actually\s+|a\s+|another\s+|give me\s+|want\s+|you to\s+|draw\s+|create\s+|make\s+|plan\s+)*$/i.test(prefix)) { negatedClauses.add(clauseStart); continue }
    return true
  }
  return false
}

function briefSubjects(brief) {
  const collect = values => [...new Set(list(values).flatMap(value => mentionedSubjects(text(value))))]
  const conditionRequirements = list(brief.requiredSubjects).map(text).filter(isSceneConditionRequirement)
  const entityPhrases = list(brief.requiredSubjects).filter(value => !conditionRequirements.includes(value))
  const excluded = collect(brief.excludedSubjects), blocked = new Set(excluded)
  const requested = collect(entityPhrases).filter(subject => ![...blocked].some(excluded => subjectSatisfies(subject, excluded)))
  const referenceOnly = collect(brief.referenceOnlySubjects).filter(subject => !coversSubject(requested, subject))
  const unmapped = entityPhrases.map(text).filter(value => value && !mentionedSubjects(value).length)
  // Understanding occasionally places the entire requested world in this
  // array. A setting is realized by a composition, not one invented object.
  // Keep the original brief untouched and expose these requirements separately;
  // concrete subjects found inside longer phrases still remain requested above.
  const sceneRequirements = unmapped.filter(needsCreativeScenePlanning)
  return { requested, excluded, referenceOnly, blocked: new Set([...excluded, ...referenceOnly]),
    sceneRequirements, conditionRequirements, unmappedRequired: unmapped.filter(value => !sceneRequirements.includes(value)) }
}

const broadAssociationTags = new Set(['animal', 'plant', 'nature', 'landscape', 'object', 'stilllife', 'people', 'person', 'character', 'play', 'architecture', 'building', 'town', 'transport', 'vehicle'])
function concreteTags(tags) {
  const specific = tags.filter(tag => !broadAssociationTags.has(tag))
  return specific.length ? specific : tags
}

function placeTags(value) {
  return topics.slice(1).filter(([pattern]) => pattern.test(value)).flatMap(([, tags]) => {
    if (tags[0] === 'water') {
      if (/海|\b(?:ocean|sea|underwater)\b/i.test(value)) return ['sea', 'ocean']
      if (/河|溪|\b(?:river|stream)\b/i.test(value)) return ['river', 'stream']
      if (/湖|池|\b(?:lake|pond)\b/i.test(value)) return ['lake', 'pond']
      return ['water']
    }
    if (tags[0] === 'forest') return ['forest', 'tree']
    if (tags[0] === 'garden') return ['garden', 'flower', 'plant']
    if (tags[0] === 'space') return ['space', 'moon', 'star']
    return tags
  })
}

function semanticAffinity(brief, groups, requested, blocked) {
  const setting = text(brief.setting)
  // A place constrains the candidate world. Dreamy forest does not make every
  // sky vehicle relevant merely because sky also appears in fantasy metadata.
  const settingTags = new Set(placeTags(setting))
  const moodTags = new Set(topics.filter(([pattern]) => pattern.test(list(brief.mood).map(text).join(' '))).map(([, tags]) => tags[0]))
  const motifRanks = new Map()
  for (const motif of list(brief.motifs)) for (const subject of mentionedSubjects(text(motif?.subject))) {
    if (!blocked.has(subject)) motifRanks.set(subject, Math.max(motifRanks.get(subject) ?? 0, ({ focal: 8, setting: 7, support: 6 })[motif.role] ?? 6))
  }
  const anchors = [...new Set([...requested, ...motifRanks.keys()])]
  const relatedTags = new Set(anchors.flatMap(subject => concreteTags([...(groups.get(subject)?.tags ?? [])])).filter(tag => !broadAssociationTags.has(tag)))
  const settingSubjects = new Set(mentionedSubjects(setting).filter(subject => !blocked.has(subject)))
  for (const group of groups.values()) {
    const tags = new Set([...group.tags, group.subject])
    // Some PNG landscape records only have category tags; their real subject
    // names still distinguish a forest from an otherwise identical beach tag.
    for (const tag of placeTags(`${group.name} ${group.subject}`)) tags.add(tag)
    const inSetting = settingSubjects.has(group.subject) || [...tags].some(tag => settingTags.has(tag))
    // Generic shared "water" must not pull pond/river animals into a specified
    // ocean. Outside the setting, accept an explicit motif or direct subject
    // relation, not merely a broad association shared by two unrelated worlds.
    const inRelation = settingTags.size ? relatedTags.has(group.subject) : [...tags].some(tag => relatedTags.has(tag))
    const inMood = [...tags].some(tag => moodTags.has(tag))
    group.semanticPriority = motifRanks.get(group.subject) ?? (inSetting ? 4 : inRelation ? 2 : !settingTags.size && inMood ? 1 : 0)
    group.semanticMood = Number(inMood)
  }
  return { motifs: [...motifRanks.keys()].sort((a, b) => motifRanks.get(b) - motifRanks.get(a)) }
}

function isOpenEnded(utterance, requested, revision, context) {
  if (revision || context.requestScope === 'object') return false
  if (!isFreshSceneRequest(utterance) && !/场景|风景|画面|梦幻|童话|梦境|魔法|\b(?:scene|landscape|dream\w*|fairy\w*|fantasy|magical)\b/i.test(utterance)) return false
  if (/长着|长出|戴着|穿着|尾巴|翅膀|改成|变成|\b(?:wearing|attached|tail|wings?|turn into)\b/i.test(utterance)) return false
  if (requested.length) return true // concrete subjects are separately locked and prioritized
  // Conservative gate: an unknown specific name must not become permission to
  // replace it with stock objects merely because the sentence also says dreamy.
  const remainder = utterance.toLowerCase().replace(/重新构思|重新设计|重新想|迪士尼|disney|帮我|给我|请|一起|我想要?|想画|画出?|做|来|一个|一幅|一张|一点|那样|那种|一样|这样|美丽|漂亮|好看|精美|可爱|温暖|柔和|安静|新的|不同|另外|另一个|换|个|不要重复|梦幻|童话|梦境|魔法|奇妙|神奇|场景|风景|画面|图画|主意|森林|花园|天空|海底|太空|的|吧|呀/g, '')
    .replace(/\b(?:please|draw|make|create|me|us|a|an|the|some|new|another|like|beautiful|pretty|cute|warm|soft|quiet|dream\w*|fairy\w*|fantasy|magical|scene|landscape|picture|forest|garden|sky|underwater|space)\b/g, '')
    .replace(/[\s,.!?:;，。！？、：；“”"'()-]/g, '')
  return !remainder
}

function chooseProfile(materials, requested, utterance, previousPlan, brief) {
  const requestedStyle = requestedRecipeStyle(utterance)
  // "Pretty/illustrated" names a style, not automatically the richest detail
  // level (which has only a few subjects). Explicit detail instructions win.
  const requestedDetail = /更多细节|细节多|精细|\b(?:rich|detailed|more detail)\b/i.test(utterance) ? 'rich'
    : /中等细节|适中细节|\bmoderate\b/i.test(utterance) ? 'moderate'
      : /简单|少.*细节|细节.*少|太难|\b(?:simple|simpler|less detail)\b/i.test(utterance) ? 'simple' : undefined
  const existing = list(previousPlan?.objects).map(object => registeredMaterial(object.render)).filter(Boolean)
  const inherited = validProfile(previousPlan?.materialProfile) ? previousPlan.materialProfile : existing.length
    ? [...new Map(existing.map(item => [key(profileOf(item)), profileOf(item)])).values()].sort((a, b) => existing.filter(item => key(profileOf(item)) === key(b)).length - existing.filter(item => key(profileOf(item)) === key(a)).length)[0] : null
  if (inherited && !requestedStyle && !requestedDetail) return { ...inherited }
  // A topic is not a profile. Compare the actual subjects the brief proposes,
  // so a new world can use whichever coherent family depicts its key ideas.
  const motifWeights = new Map()
  for (const motif of list(brief?.motifs)) for (const subject of mentionedSubjects(text(motif?.subject))) {
    motifWeights.set(subject, Math.max(motifWeights.get(subject) ?? 0, ({ focal: 120, setting: 90, support: 60 })[motif.role] ?? 60))
  }
  const profiles = [...new Map(materials.map(item => [key(profileOf(item)), profileOf(item)])).values()]
  const eligible = profiles.filter(profile => (!requestedStyle || profile.style === requestedStyle) && (!requestedDetail || profile.detail === requestedDetail))
  if (!eligible.length) return { style: requestedStyle ?? inherited?.style ?? 'storybook', detail: requestedDetail ?? inherited?.detail ?? 'simple' }
  const score = profile => {
    const items = materials.filter(item => key(profileOf(item)) === key(profile)), subjects = new Set(items.map(item => item.subject))
    const covered = requested.filter(subject => coversSubject(subjects, subject)).length
    const motifCoverage = [...motifWeights].reduce((sum, [subject, weight]) => sum + (coversSubject(subjects, subject) ? weight : 0), 0)
    return covered * 10000 + motifCoverage + (profile.style === 'storybook' && profile.detail === 'simple' ? 30 : profile.style === 'illustrated' && profile.detail === 'moderate' ? 25 : 0)
      + new Set(items.map(item => item.family)).size * 2 + Math.min(20, new Set(items.filter(item => item.kind === 'illustration').map(item => item.subject)).size / 10)
  }
  return { ...eligible.sort((a, b) => score(b) - score(a))[0] }
}

/** Compact, diverse, single-profile candidates. This is retrieval, never a scene template. */
export function sceneMaterialContext(input = {}, { random = Math.random } = {}) {
  const utterance = text(input.utterance), context = input.context ?? {}, suppliedPlan = input.plan ?? input.previousPlan
  const brief = input.semanticBrief && typeof input.semanticBrief === 'object' && !Array.isArray(input.semanticBrief)
    ? { ...input.semanticBrief, requiredSubjects: sceneAdditionRequiredSubjects(input) } : null
  const semantic = brief ? briefSubjects(brief) : null
  const fresh = isFreshSceneRequest(utterance), previousPlan = fresh ? undefined : suppliedPlan
  const revision = !!previousPlan, history = [...list(context.history).slice(-8).map(item => text(item?.text ?? item?.content)), ...(fresh ? [text(suppliedPlan?.summary), ...list(suppliedPlan?.objects).map(object => text(object.name))] : [])].join(' ')
  const recentIds = [...list(context.recentRecipeIds), ...(fresh ? list(suppliedPlan?.objects).map(object => materialId(object.render)) : [])].filter(id => typeof id === 'string').slice(-32)
  const requestedSubjects = semantic ? semantic.requested : mentionedSubjects(utterance)
  const openEnded = semantic ? !revision && context.requestScope !== 'object' && !semantic.unmappedRequired.length : isOpenEnded(utterance, requestedSubjects, revision, context)
  const retrievalText = brief ? [text(brief.setting), ...list(brief.mood).map(text), ...list(brief.requiredSubjects).map(text), ...list(brief.motifs).map(motif => text(motif?.subject))].join(' ') : utterance
  const materials = allMaterials(retrievalText, recentIds), availableSubjects = new Set(materials.map(item => item.subject))
  const preservedIdentities = new Set(preservedOnlySubjects(input).flatMap(mentionedSubjects))
  const compatibleMaterials = materials.filter(item => lineFamilyOf(item) === 'reference'
    && ![...(semantic?.blocked ?? [])].some(blocked => coversSubject(item.visibleSubjects, blocked))
    && !(item.completeScene && [...preservedIdentities].some(subject => coversSubject(item.visibleSubjects, subject))))
  const profile = chooseProfile(compatibleMaterials, requestedSubjects, utterance, previousPlan, brief)
  const retained = list(previousPlan?.objects).map(object => registeredMaterial(object.render)).filter(Boolean)
  const retainedIds = new Set(retained.map(item => item.id))
  const recentSubjects = new Set([...mentionedSubjects(history), ...list(context.recentSubjects).flatMap(value => mentionedSubjects(text(value)))])
  const recent = new Set(recentIds)
  // Old unstyled polygon icons are not visually equivalent to complete picture
  // book references just because both have a small command count. Keep them out
  // of new coherent scenes; existing documents and the ordinary library retain them.
  const sameProfile = compatibleMaterials.filter(item => key(profileOf(item)) === key(profile))
  const groups = new Map()
  for (const item of sameProfile) {
    if (!groups.has(item.subject)) groups.set(item.subject, { subject: item.subject, name: item.name, family: item.family, tags: new Set(), items: [] })
    const group = groups.get(item.subject)
    if (item.kind === 'illustration') group.family = item.family
    for (const tag of [...list(item.related), item.family, item.category].filter(Boolean)) group.tags.add(tag)
    group.items.push(item)
  }
  const focusTags = new Set(topics.filter(([pattern]) => pattern.test(utterance)).flatMap(([, tags]) => tags))
  const namedTags = new Set(requestedSubjects.flatMap(subject => matchingGroups(groups, subject).flatMap(group => [...group.tags])))
  const relevance = brief ? semanticAffinity(brief, groups, requestedSubjects, semantic.blocked) : null
  const sample = () => { const value = random(); return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(.999999, value)) : 0 }
  for (const group of groups.values()) {
    group.affinity = relevance ? group.semanticPriority : [...group.tags].reduce((score, tag) => score + Number(focusTags.has(tag)) * 4 + Number(namedTags.has(tag)), 0)
    group.rank = group.affinity * (relevance ? 100 : 10) + (relevance ? group.semanticMood * 10 : 0) - Number(recentSubjects.has(group.subject)) * 25 + (openEnded ? sample() * 6 : 0)
  }
  const selected = [], selectedIds = new Set()
  const add = group => { if (group && !selectedIds.has(group.subject) && selected.length < 24) { selected.push(group); selectedIds.add(group.subject) } }
  // Exact child subjects and retained identities always precede diversity.
  for (const subject of requestedSubjects) {
    add(groups.get(subject))
    for (const group of matchingGroups(groups, subject)) add(group)
  }
  for (const item of retained) add(groups.get(item.subject))
  if (relevance) for (const subject of relevance.motifs) add(groups.get(subject))
  let pool = [...groups.values()].filter(group => !selectedIds.has(group.subject))
  if (relevance) {
    // Diversity is among semantically related options. No unrelated category is
    // backfilled just to fill 24 rows, and random jitter cannot outrank meaning.
    for (const group of pool.filter(group => group.affinity > 0).sort((a, b) => b.rank - a.rank || a.subject.localeCompare(b.subject))) add(group)
  } else {
    if (!openEnded && (focusTags.size || namedTags.size)) pool = pool.filter(group => group.affinity > 0)
    const buckets = families.map(family => pool.filter(group => group.family === family).sort((a, b) => b.rank - a.rank || a.subject.localeCompare(b.subject)))
    // Legacy callers without a semantic brief retain their previous retrieval.
    while (selected.length < 24 && buckets.some(bucket => bucket.length)) for (const bucket of buckets) if (bucket.length) add(bucket.shift())
  }
  const subjects = selected.map(group => {
    const variants = rankMaterialVariants(group.items, retainedIds, recent)
      .slice(0, 2).map(item => {
        const bounds = item.kind === 'illustration' ? illustrationBounds[item.id] : null
        return { kind: item.kind, id: item.id, pose: item.pose, style: item.style, detail: item.detail, lineFamily: 'reference', aspect: item.aspect, minPixels: item.minPixels,
          tier: sceneMaterialTier(item), geometry: sceneMaterialGeometry(item), contents: item.visibleSubjects, completeScene: item.completeScene === true,
          ...getMaterialGeometry(item.id),
          ...(item.completeScene ? { supportsOn: false, supportReason: 'Complete scene; internal parts cannot be independently targeted or used as a support surface.' } : {}),
          ...(bounds ? { visibleBounds: { left: bounds.left, top: bounds.top, right: bounds.right, bottom: bounds.bottom } } : {}),
          ...(item.colors?.length ? { colors: item.colors.slice(0, 2) } : {}) }
      })
    return { subject: group.subject, name: group.name, family: group.family, tags: [...group.tags].slice(0, 5), variants }
  })
  const suggestions = openEnded ? directions.map(direction => ({ ...direction, rank: Number(direction.pattern.test(history)) * -10 + sample() }))
    .sort((a, b) => b.rank - a.rank).slice(0, 2).map(({ id, prompt }) => ({ id, prompt })) : []
  const semanticIndex = sceneSemanticIndex(groups, { retainedIds, recentIds: recent, query: retrievalText })
  // A single whole illustration is internally one profile. Offer same-style
  // complete scenes separately instead of mixing their detail into components.
  // Explicit detail requests and inherited local-edit profiles remain binding.
  const explicitDetail = /更多细节|细节多|精细|中等细节|适中细节|简单|少.*细节|细节.*少|太难|\b(?:rich|detailed|more detail|moderate|simple|simpler|less detail)\b/i.test(utterance)
  const completeSceneAlternatives = !revision && context.requestScope !== 'object' ? compatibleMaterials
    .filter(item => item.completeScene && item.style === profile.style && (!explicitDetail || item.detail === profile.detail))
    .sort((a, b) => sceneMaterialLexicalScore(b, utterance) - sceneMaterialLexicalScore(a, utterance) || a.id.localeCompare(b.id))
    .slice(0, 16).map(item => ({ id: item.id, subject: item.subject, name: item.name, pose: item.pose,
      profile: profileOf(item), contents: item.visibleSubjects, tier: 'scene', geometry: 'complete-scene',
      support: 'no: complete setting; internal parts cannot carry separate objects or be cut out', aspect: item.aspect, minPixels: item.minPixels })) : []
  const inventory = { components: [], combinations: [], completeScenes: [] }
  for (const row of semanticIndex.rows) inventory[({ component: 'components', combination: 'combinations', scene: 'completeScenes' })[row[9] ?? 'component']].push(row[1])
  for (const item of completeSceneAlternatives) if (!inventory.completeScenes.includes(item.id)) inventory.completeScenes.push(item.id)
  const result = { profile, lineFamily: 'reference', subjects, semanticIndex, inventory, completeSceneAlternatives, requestedSubjects,
    preservedSubjects: preservedChildSubjects(input),
    excludedSubjects: semantic?.excluded ?? [], referenceOnlySubjects: semantic?.referenceOnly ?? [], unmappedRequiredSubjects: semantic?.unmappedRequired ?? [], sceneRequirements: semantic?.sceneRequirements ?? [], conditionRequirements: semantic?.conditionRequirements ?? [],
    unavailableRequestedSubjects: requestedSubjects.filter(subject => !coversSubject(availableSubjects, subject)),
    profileMissingSubjects: requestedSubjects.filter(subject => coversSubject(availableSubjects, subject) && !coversSubject(groups.keys(), subject)),
    retainedRecipeIds: [...new Set(retained.filter(item => item.kind === 'recipe').map(item => item.id))],
    retainedIllustrationIds: [...new Set(retained.filter(item => item.kind === 'illustration').map(item => item.id))],
    directions: suggestions,
    selection: { subjectCount: subjects.length, variantCount: subjects.reduce((sum, group) => sum + group.variants.length, 0), indexedSubjectCount: semanticIndex.rows.length, openEnded, revision, fresh, semantic: !!brief },
  }
  result.generationPolicy = sceneGenerationPolicy(input, result)
  return result
}

/** The server, not the model, permits a whole registered scene to use its own
 * coherent detail profile. This exception never permits mixed-profile parts. */
export function sceneMaterialProfileForPlan(plan, materials) {
  const objects = list(plan?.objects)
  if (objects.length === 1 && objects[0]?.render?.kind === 'illustration') {
    const id = objects[0].render.illustrationId
    const alternative = list(materials?.completeSceneAlternatives).find(item => item.id === id)
    const actual = getDrawingIllustration(id)
    if (alternative && actual?.completeScene && isMaterialEnabled(id) && actual.style === materials.profile?.style
      && key(profileOf(actual)) === key(alternative.profile)) return profileOf(actual)
  }
  return materials?.profile
}

// These describe physical operations/relations, never a theme's required cast.
// They license a geometry gap; they do not decide that stock actually lacks it.
const geometryRequirement = /长(?:着|出)|带(?:着|有).{0,12}(?:翅膀|尾巴|角|触手)|戴着|穿着|倒着|倒立|颠倒|上下颠倒|折纸|(?:纸|玻璃|金属|木头|冰|糖果)做|由.{1,16}(?:组成|做成|制成)|用.{1,12}(?:做|折|搭)|.{1,8}形状|(?:瓶|罐|盒|杯|洞|肚子).{0,5}(?:里|内)|(?:背|头|顶部|表面|肩膀).{0,3}上|藏在|躲在|住在|包住|围住|托着|抱着|悬浮|漂浮|牵着|骑着|\b(?:upside[ -]down|inverted|wearing|wings?|made (?:of|from)|shaped like|inside|within|containing|enclosing|carrying|holding|riding|floating|suspended|on (?:the |a |its )?(?:back|head)|underneath)\b/i

function attachedFeaturePhrases(brief, utterance) {
  return list(brief.requiredSubjects).filter(phrase => {
    if (typeof phrase !== 'string' || !utterance.toLowerCase().includes(phrase.toLowerCase())) return false
    const subjects = mentionedSubjects(phrase)
    if (!subjects.length) return false // unknown concrete nouns have a separate gap
    let remainder = phrase.toLowerCase()
    const aliases = subjects.flatMap(subject => {
      const item = vocabularyBySubject.get(subject)
      return item ? [item.subject, item.name, ...item.aliases, ...recipeSubjectAliases(subject)] : []
    }).sort((a, b) => b.length - a.length)
    for (const alias of aliases) remainder = remainder.split(alias.toLowerCase()).join(' ')
    // Basic scale, position and pleasant appearance can be expressed with
    // stock. Other literal modifiers remain visible feature requirements;
    // unknown modifiers are never silently downgraded to a familiar base noun.
    remainder = remainder.replace(/(?:[一二两三四五六七八九十几]|一些|许多)(?:个|只|条|座|颗|串|本|艘|枚|片|朵|棵|群)|巨大|巨型|高高|小小|漂亮|美丽|可爱|安静|温暖|简单|普通|大|小|高|矮|的|在|左上角|右上角|左下角|右下角|左边|右边|上方|下方|旁边/g, ' ')
      .replace(/\b(?:a|an|the|one|two|three|some|several|big|small|giant|tiny|tall|short|pretty|beautiful|cute|quiet|warm|simple|ordinary|at|left|right|above|below|corner)\b/g, ' ')
      .replace(/[\s，、,.!?:;。！？：；“”"'()-]/g, '')
    return remainder.length > 0
  })
}

export function sceneGenerationPolicy(input = {}, materials = {}) {
  const utterance = text(input.utterance), brief = input.semanticBrief ?? {}
  const clauses = utterance.split(/[，。！？;；!?]|\b(?:but|however)\b/i).map(value => value.trim()).filter(Boolean)
  const nonpositive = /^(?:不要|别|不需要|不用|无需|不画|\s*(?:don't|do not|without|no)\b)/i
  const explicitRequirements = clauses.filter(clause => !nonpositive.test(clause) && geometryRequirement.test(clause))
  for (const phrase of attachedFeaturePhrases(brief, utterance)) if (!explicitRequirements.includes(phrase)) explicitRequirements.push(phrase)
  // A grounded semantic relation may be paraphrased, but it cannot invent a
  // relation absent from the child's words. Retain exact original spans only.
  for (const phrase of list(brief.relationships)) if (typeof phrase === 'string' && utterance.includes(phrase)
    && !nonpositive.test(phrase) && !explicitRequirements.includes(phrase)) explicitRequirements.push(phrase)
  const unfulfilledSubjects = [...new Set([...list(materials.unmappedRequiredSubjects), ...list(materials.unavailableRequestedSubjects)])]
  const requestedConditions = [...new Set([...list(materials.conditionRequirements), text(brief.setting)])]
    .filter(value => value && utterance.includes(value) && isSceneConditionRequirement(value))
  return { mode: 'inventory-first', allowGenerated: !!(unfulfilledSubjects.length || explicitRequirements.length || requestedConditions.length),
    explicitRequirements, unfulfilledSubjects, requestedConditions,
    rule: 'A broad atmosphere or setting is a choice among honest stock ideas. Only an explicit subject, pose, material or physical relation gap may need one minimal generated focal object. Keep every original requirement; candidate availability is never permission to delete one.' }
}

/** Deterministic boundary: the planner cannot invent a feature to justify an
 * image call for a vague mood. Existing approved generated objects stay valid. */
export function sceneGenerationIssues(plan, input = {}, materials = {}) {
  const generated = list(plan?.objects).filter(object => ['generated', 'custom'].includes(object?.render?.kind)
    && !list(input.plan?.objects).some(old => old.id === object.id && old.render?.kind === object.render.kind))
  if (!generated.length) return []
  const policy = sceneGenerationPolicy(input, materials)
  if (!policy.allowGenerated) return ['This request supplies a broad setting/mood or ordinary available subjects, not an explicit missing geometry requirement. Choose a coherent idea from the registered components, inseparable combinations or complete scenes. Do not invent a new pose or material in the summary to justify generation; preserve the original request and offer an honest stock-based idea for confirmation.']
  if (generated.length > 1) return ['Generate only the smallest inseparable focal subject/interaction needed by the explicit request. Reuse compatible registered surroundings; do not separately generate several ordinary components or redraw an entire setting unnecessarily.']
  return []
}

/** The child intent is authoritative; catalogue references cannot redefine it. */
export function sceneIntentIssues(plan, brief, previousPlan, input) {
  if (!brief || typeof brief !== 'object') return []
  const preserved = input ? preservedOnlySubjects(input) : []
  const preservedIdentities = new Set(preserved.flatMap(mentionedSubjects))
  const semantic = briefSubjects(input ? { ...brief, requiredSubjects: sceneAdditionRequiredSubjects(input) } : brief), issues = [], present = new Set()
  for (const object of list(plan?.objects)) {
    if (!object || typeof object !== 'object') continue
    const material = registeredMaterial(object.render)
    // A registered ID is the subject truth, even if the proposed display name
    // tries to call a book a castle. Unknown custom inventions stay possible.
    const subjects = material ? materialVisibleSubjects(material) : mentionedSubjects([text(object.name), ...list(object.aliases).map(text)].join(' '))
    for (const subject of subjects) present.add(subject)
    const previous = list(previousPlan?.objects).find(item => item.id === object.id)
    if (previous && previous.name === object.name && JSON.stringify(previous.render) === JSON.stringify(object.render) && JSON.stringify(previous.essential) === JSON.stringify(object.essential)) continue
    const newlyDrawn = material ? materialVisibleSubjects(material) : mentionedSubjects([text(object.name), ...list(object.essential).map(text)].join(' '))
    const repeated = newlyDrawn.filter(subject => preservedIdentities.has(subject))
    const repeatedUnknown = material ? [] : preserved.filter(value => !mentionedSubjects(value).length
      && [text(object.name), ...list(object.essential).map(text)].some(feature => feature.includes(value)))
    if (repeated.length || repeatedUnknown.length) issues.push(`Object ${object.id} duplicates preserved child content ${JSON.stringify([...repeated, ...repeatedUnknown])}. These subjects already exist in the child's ink and are spatial anchors, not newly drawable parts. Keep them in plan.preserve; draw ONLY the requested addition and describe its placement relative to the existing drawing. Do not put an old subject in a generated name/essential contract unless the child explicitly requests another instance.`)
    for (const subject of subjects) {
      const name = material?.name ?? subjectVocabulary.find(item => item.subject === subject)?.name ?? object.name
      if (semantic.excluded.some(excluded => subjectSatisfies(subject, excluded))) issues.push(`Object ${object.id}: ${name}/${subject} is explicitly excluded by the child. Remove this newly introduced subject; preserve the positive requested scene and unrelated existing objects.`)
      else if (semantic.referenceOnly.some(reference => subjectSatisfies(subject, reference))) issues.push(`Object ${object.id}: ${name}/${subject} is only a reference/source/metaphor, not a requested physical object. Express the intended setting, mood and relationships instead of drawing the source as a prop. A storybook-like world must not collapse into a literal book unless the child explicitly requests a book.`)
    }
  }
  for (const subject of semantic.requested) if (!coversSubject(present, subject)) issues.push(`The explicitly required subject ${subject} is missing. Keep it as a genuinely matching registered subject or faithful custom object; a different catalogue subject, title or summary does not satisfy it. Existing matching objects retained in the plan already count.`)
  const normalizedPhrase = value => text(value).toLowerCase().replace(/\s+/g, ' ').trim()
  for (const required of semantic.unmappedRequired) {
    const phrase = normalizedPhrase(required)
    const carried = list(plan?.objects).some(object => isSceneDrawnObject(object)
      && [object.name, ...list(object.aliases)].some(value => normalizedPhrase(value).includes(phrase))
      && list(object.essential).some(value => normalizedPhrase(value).includes(phrase)))
    if (!carried) issues.push(`The explicitly required unfamiliar subject ${JSON.stringify(required)} is missing from a faithful custom object. Keep the child's exact phrase in that object's name or aliases AND in an essential feature so the rendered geometry will be visually checked. Mentioning it only in the title, request or summary, or relabeling a stock material, cannot satisfy this requirement. Preserve an existing matching custom object when it is already present.`)
  }
  issues.push(...summaryGroundingIssues(plan))
  return issues
}

// Deliberately conservative: explicit counted concrete props, not a general
// semantic scorer. Settings, mood, comparisons and negated clauses stay free.
const summaryConcepts = [
  { subject: 'scene-path', name: '小径/道路', pattern: /小径|小路|道路|路径|\b(?:paths?|roads?|trails?)\b/i },
  { subject: 'scene-bubble', name: '气泡', pattern: /泡泡|气泡|圆泡|\bbubbles?\b/i },
]
function summaryGroundingIssues(plan) {
  const objects = list(plan?.objects), covered = new Set(), labels = []
  const claims = value => [...mentionedSubjects(value), ...summaryConcepts.filter(item => item.pattern.test(value)).map(item => item.subject)]
  for (const object of objects) {
    const material = registeredMaterial(object?.render)
    const objectLabels = [text(object?.name), ...list(object?.aliases).map(text)]
    let descriptors
    if (material) {
      // Registered pixels are authoritative. A planner cannot make a flower
      // cover a promised house by adding "house" to its alias or essential.
      for (const subject of materialVisibleSubjects(material)) covered.add(subject)
      descriptors = [text(material.name), text(material.label)].join(' ')
      labels.push(text(material.name), ...objectLabels.filter(label => mentionedSubjects(label).some(required => subjectSatisfies(material.subject, required))))
    } else {
      // Generated pixels are commissioned from BOTH the target name and its
      // essential features, then checked for recognizable identity. A name
      // such as "whale" need not be mechanically repeated in "broad back".
      // Aliases still cannot invent additional component identities. Authored
      // custom components retain their stricter explicit feature-map contract.
      descriptors = [object?.render?.kind === 'generated' ? text(object.name) : '', ...list(object?.essential).map(text)].join(' ')
      const depicted = new Set(claims(descriptors))
      if (object?.render?.kind === 'compose') {
        for (const subject of claims(text(object.render.primitive))) depicted.add(subject)
        descriptors += ` ${text(object.render.primitive)}`
      }
      labels.push(...objectLabels.filter(label => {
        const named = claims(label)
        return named.length && named.every(required => coversSubject(depicted, required))
      }))
    }
    for (const subject of claims(descriptors)) covered.add(subject)
    if (object?.render?.kind === 'compose' && object.render.primitive === 'path') covered.add('scene-path')
  }
  for (const value of list(plan?.preserve)) for (const subject of claims(text(value))) covered.add(subject)
  const issues = [], reported = new Set()
  for (const clause of text(plan?.summary).split(/[，。！？;；,.!?]|\b(?:but|however)\b|但是|不过|而是/i)) {
    if (/没有|不要|不画|别画|不含|不包括|不是|并非|无需|\b(?:no|not|without|don't|doesn't|isn't)\b/i.test(clause)
      || /像|那样|一样|般|仿佛|\b(?:like|inspired|resembling)\b/i.test(clause)) continue
    const counted = [...clause.matchAll(/(?:[一二两三四五六七八九十几]|一些|许多)(?:个|只|条|座|颗|串|本|艘|枚|片|朵|棵|道|群)([^，。！？;；,.!?]{1,40})|\b(?:a few|a|an|one|two|three|some|several)\s+([^,.;!?]{1,60})/gi)]
    for (const match of counted) {
      let described = match[1] ?? match[2]
      // A named moon jellyfish does not assert a second, separate moon. Mask
      // exact existing labels before looking for additional concrete props.
      for (const label of [...labels].sort((a, b) => b.length - a.length)) described = described.split(label).join(' ')
      for (const subject of claims(described)) {
        if (coversSubject(covered, subject) || reported.has(subject)) continue
        const material = [...drawingIllustrations, ...drawingRecipes].find(item => item.subject === subject)
        if (material?.category === 'landscape') continue
        reported.add(subject)
        const name = summaryConcepts.find(item => item.subject === subject)?.name ?? material?.name ?? subject
        issues.push(`The summary promises a concrete ${name}/${subject}, but no final object or preserved child content depicts it. Rewrite the summary from the FINAL objects; do not copy an unselected motif from the semantic brief. Add actual matching geometry only if this is a required child feature, never rename another primitive to pretend it exists.`)
      }
    }
  }
  return issues
}

/** Existing references keep their appearance; new material must use the chosen profile. */
export function sceneMaterialStyleIssues(plan, profile, previousPlan) {
  if (!validProfile(profile)) return ['A valid shared material profile (style and detail) is required.']
  const issues = []
  for (const object of list(plan?.objects)) {
    if (!object || typeof object !== 'object') continue
    const previous = list(previousPlan?.objects).find(item => item.id === object.id)
    const unchangedMeaning = previous && previous.name === object.name && JSON.stringify(previous.essential) === JSON.stringify(object.essential)
    if (!(unchangedMeaning && JSON.stringify(previous.render) === JSON.stringify(object.render))) {
      const mismatch = connectorIssue(object)
      if (mismatch) issues.push(mismatch)
    }
    if (previous && JSON.stringify(previous.render) === JSON.stringify(object.render)) continue
    if (object?.render?.kind === 'compose' && !['path', 'water'].includes(object.render.primitive) && profile.detail !== 'simple') {
      issues.push(`Object ${object.id}: a simple primitive would clash with the ${key(profile)} references. Choose a same-profile registered subject, without dropping a specifically requested feature.`)
      continue
    }
    if (!['recipe', 'illustration'].includes(object?.render?.kind)) continue
    const material = registeredMaterial(object.render)
    if (!material || !isMaterialEnabled(material.id)) { issues.push(`Object ${object.id}: choose an available registered material ID; unknown or retired material cannot be newly selected.`); continue }
    if (material.kind === 'illustration') {
      const featureText = [text(object.name), ...list(object.essential).map(text)].join(' ')
      const closed = /合上|合拢|闭合|\bclosed\b/i, open = /打开|展开|摊开|\bopen(?:ed)?\b/i
      if (closed.test(material.label ?? '') && open.test(featureText) || open.test(material.label ?? '') && closed.test(featureText)) {
        issues.push(`Object ${object.id}: the registered illustration pose is ${JSON.stringify(material.label)}, which contradicts the requested open/closed state. Choose a genuinely matching same-profile material or faithful custom geometry; do not rename this image or delete the requested feature.`)
      }
    }
    if (lineFamilyOf(material) !== 'reference') issues.push(`Object ${object.id}: ${material.id} is an old schematic icon, not the same line family as the picture-book references. Choose a compatible registered PNG or authored SVG of the SAME subject; do not mix a few primitive lines with full detailed silhouettes.`)
    if (object.name !== material.name && !canonicalIllustrationCaptionName(object) && !mentionedSubjects(object.name).some(required => subjectSatisfies(material.subject, required))) issues.push(`Object ${object.id}: material ${material.id} depicts ${material.name}/${material.subject}, not ${object.name}. Use its true subject name; never rename a different subject to hide a missing requested material.`)
    const actual = profileOf(material)
    if (key(actual) !== key(profile)) issues.push(`Object ${object.id} uses ${key(actual)} but the shared profile is ${key(profile)}. Select the SAME SUBJECT in the chosen profile, or retain the requested subject as an explicit unsupported requirement; never rename another subject or mix coarse/simple and detailed references.`)
  }
  return issues
}
