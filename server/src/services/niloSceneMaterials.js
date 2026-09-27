import { drawingRecipes, getDrawingRecipe, recipeCatalogue, requestedRecipeStyle } from '../../../shared/niloRecipes.mjs'
import { drawingIllustrations, getDrawingIllustration, illustrationCatalogue } from '../../../shared/niloIllustrations.mjs'
import { isMaterialEnabled, retiredMaterialIdentities } from '../../../shared/niloCuration.mjs'
import { findRecipeSubjects } from '../../../knowledge/nilo/recipes/names.mjs'
import illustrationBounds from '../../../shared/niloIllustrationTracing.json' with { type: 'json' }

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
const subjectVocabulary = [...[...drawingRecipes, ...retiredMaterialIdentities, ...drawingIllustrations].reduce((subjects, material) => {
  const current = subjects.get(material.subject)
  if (!current) subjects.set(material.subject, { subject: material.subject, name: material.name, aliases: [...new Set([material.name, ...list(material.aliases)])] })
  else current.aliases = [...new Set([...current.aliases, material.name, ...list(material.aliases)])]
  return subjects
}, new Map()).values()]
const mentionedSubjects = value => findRecipeSubjects(value, subjectVocabulary)
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
  return [...recipes.map(item => ({ ...item, aspect: getDrawingRecipe(item.id).sketch.aspect, minPixels: getDrawingRecipe(item.id).minPixels ?? 144 })), ...illustrationCatalogue().map(item => ({ ...item, kind: 'illustration', pose: getDrawingIllustration(item.id)?.label ?? `${item.style}/${item.detail}`, minPixels: getDrawingIllustration(item.id)?.minPixels ?? 180, related: getDrawingIllustration(item.id)?.related ?? related.get(item.subject) ?? [item.category] }))]
    .map(item => ({ ...item, family: familyOf(item) }))
}

function registeredMaterial(render) {
  if (render?.kind === 'recipe') {
    const recipe = getDrawingRecipe(render.recipeId)
    return recipe ? { ...recipe, kind: 'recipe', detail: 'simple', style: recipe.style ?? 'storybook' } : null
  }
  if (render?.kind === 'illustration') {
    const illustration = getDrawingIllustration(render.illustrationId)
    return illustration ? { ...illustration, kind: 'illustration' } : null
  }
  return null
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
  const excluded = collect(brief.excludedSubjects), blocked = new Set(excluded)
  const requested = collect(brief.requiredSubjects).filter(subject => !blocked.has(subject))
  const referenceOnly = collect(brief.referenceOnlySubjects).filter(subject => !requested.includes(subject))
  return { requested, excluded, referenceOnly, blocked: new Set([...excluded, ...referenceOnly]),
    unmappedRequired: list(brief.requiredSubjects).map(text).filter(value => value && !mentionedSubjects(value).length) }
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

function chooseProfile(materials, requested, utterance, previousPlan) {
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
  const profiles = [...new Map(materials.map(item => [key(profileOf(item)), profileOf(item)])).values()]
  const eligible = profiles.filter(profile => (!requestedStyle || profile.style === requestedStyle) && (!requestedDetail || profile.detail === requestedDetail))
  if (!eligible.length) return { style: requestedStyle ?? inherited?.style ?? 'storybook', detail: requestedDetail ?? inherited?.detail ?? 'simple' }
  const score = profile => {
    const items = materials.filter(item => key(profileOf(item)) === key(profile)), subjects = new Set(items.map(item => item.subject))
    const covered = requested.filter(subject => subjects.has(subject)).length
    return covered * 1000 + (profile.style === 'storybook' && profile.detail === 'simple' ? 30 : profile.style === 'illustrated' && profile.detail === 'moderate' ? 25 : 0)
      + new Set(items.map(item => item.family)).size * 2 + Math.min(20, new Set(items.filter(item => item.kind === 'illustration').map(item => item.subject)).size / 10)
  }
  return { ...eligible.sort((a, b) => score(b) - score(a))[0] }
}

/** Compact, diverse, single-profile candidates. This is retrieval, never a scene template. */
export function sceneMaterialContext(input = {}, { random = Math.random } = {}) {
  const utterance = text(input.utterance), context = input.context ?? {}, suppliedPlan = input.plan ?? input.previousPlan
  const brief = input.semanticBrief && typeof input.semanticBrief === 'object' && !Array.isArray(input.semanticBrief) ? input.semanticBrief : null
  const semantic = brief ? briefSubjects(brief) : null
  const fresh = isFreshSceneRequest(utterance), previousPlan = fresh ? undefined : suppliedPlan
  const revision = !!previousPlan, history = [...list(context.history).slice(-8).map(item => text(item?.text ?? item?.content)), ...(fresh ? [text(suppliedPlan?.summary), ...list(suppliedPlan?.objects).map(object => text(object.name))] : [])].join(' ')
  const recentIds = [...list(context.recentRecipeIds), ...(fresh ? list(suppliedPlan?.objects).map(object => materialId(object.render)) : [])].filter(id => typeof id === 'string').slice(-32)
  const requestedSubjects = semantic ? semantic.requested : mentionedSubjects(utterance)
  const openEnded = semantic ? !revision && context.requestScope !== 'object' && !semantic.unmappedRequired.length : isOpenEnded(utterance, requestedSubjects, revision, context)
  const retrievalText = brief ? [text(brief.setting), ...list(brief.mood).map(text), ...list(brief.requiredSubjects).map(text), ...list(brief.motifs).map(motif => text(motif?.subject))].join(' ') : utterance
  const materials = allMaterials(retrievalText, recentIds), availableSubjects = new Set(materials.map(item => item.subject))
  const profile = chooseProfile(materials, requestedSubjects, utterance, previousPlan)
  const retained = list(previousPlan?.objects).map(object => registeredMaterial(object.render)).filter(Boolean)
  const retainedIds = new Set(retained.map(item => item.id))
  const recentSubjects = new Set([...mentionedSubjects(history), ...list(context.recentSubjects).flatMap(value => mentionedSubjects(text(value)))])
  const recent = new Set(recentIds)
  // Old unstyled polygon icons are not visually equivalent to complete picture
  // book references just because both have a small command count. Keep them out
  // of new coherent scenes; existing documents and the ordinary library retain them.
  const sameProfile = materials.filter(item => key(profileOf(item)) === key(profile) && lineFamilyOf(item) === 'reference' && !semantic?.blocked.has(item.subject))
  const groups = new Map()
  for (const item of sameProfile) {
    if (!groups.has(item.subject)) groups.set(item.subject, { subject: item.subject, name: item.name, family: item.family, tags: new Set(), items: [] })
    const group = groups.get(item.subject)
    if (item.kind === 'illustration') group.family = item.family
    for (const tag of [...list(item.related), item.family, item.category].filter(Boolean)) group.tags.add(tag)
    group.items.push(item)
  }
  const focusTags = new Set(topics.filter(([pattern]) => pattern.test(utterance)).flatMap(([, tags]) => tags))
  const namedTags = new Set(requestedSubjects.flatMap(subject => [...(groups.get(subject)?.tags ?? [])]))
  const relevance = brief ? semanticAffinity(brief, groups, requestedSubjects, semantic.blocked) : null
  const sample = () => { const value = random(); return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(.999999, value)) : 0 }
  for (const group of groups.values()) {
    group.affinity = relevance ? group.semanticPriority : [...group.tags].reduce((score, tag) => score + Number(focusTags.has(tag)) * 4 + Number(namedTags.has(tag)), 0)
    group.rank = group.affinity * (relevance ? 100 : 10) + (relevance ? group.semanticMood * 10 : 0) - Number(recentSubjects.has(group.subject)) * 25 + (openEnded ? sample() * 6 : 0)
  }
  const selected = [], selectedIds = new Set()
  const add = group => { if (group && !selectedIds.has(group.subject) && selected.length < 24) { selected.push(group); selectedIds.add(group.subject) } }
  // Exact child subjects and retained identities always precede diversity.
  for (const subject of requestedSubjects) add(groups.get(subject))
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
    const variants = [...group.items].sort((a, b) => Number(retainedIds.has(b.id)) - Number(retainedIds.has(a.id))
      || Number(recent.has(a.id)) - Number(recent.has(b.id)) || Number(b.kind === 'illustration') - Number(a.kind === 'illustration'))
      .slice(0, 2).map(item => {
        const bounds = item.kind === 'illustration' ? illustrationBounds[item.id] : null
        return { kind: item.kind, id: item.id, pose: item.pose, style: item.style, detail: item.detail, lineFamily: 'reference', aspect: item.aspect, minPixels: item.minPixels,
          ...(bounds ? { visibleBounds: { left: bounds.left, top: bounds.top, right: bounds.right, bottom: bounds.bottom } } : {}),
          ...(item.colors?.length ? { colors: item.colors.slice(0, 2) } : {}) }
      })
    return { subject: group.subject, name: group.name, family: group.family, tags: [...group.tags].slice(0, 5), variants }
  })
  const suggestions = openEnded ? directions.map(direction => ({ ...direction, rank: Number(direction.pattern.test(history)) * -10 + sample() }))
    .sort((a, b) => b.rank - a.rank).slice(0, 2).map(({ id, prompt }) => ({ id, prompt })) : []
  return { profile, lineFamily: 'reference', subjects, requestedSubjects,
    excludedSubjects: semantic?.excluded ?? [], referenceOnlySubjects: semantic?.referenceOnly ?? [], unmappedRequiredSubjects: semantic?.unmappedRequired ?? [],
    unavailableRequestedSubjects: requestedSubjects.filter(subject => !availableSubjects.has(subject)),
    profileMissingSubjects: requestedSubjects.filter(subject => availableSubjects.has(subject) && !groups.has(subject)),
    retainedRecipeIds: [...new Set(retained.filter(item => item.kind === 'recipe').map(item => item.id))],
    retainedIllustrationIds: [...new Set(retained.filter(item => item.kind === 'illustration').map(item => item.id))],
    directions: suggestions,
    selection: { subjectCount: subjects.length, variantCount: subjects.reduce((sum, group) => sum + group.variants.length, 0), openEnded, revision, fresh, semantic: !!brief },
  }
}

/** The child intent is authoritative; catalogue references cannot redefine it. */
export function sceneIntentIssues(plan, brief, previousPlan) {
  if (!brief || typeof brief !== 'object') return []
  const semantic = briefSubjects(brief), issues = [], present = new Set()
  for (const object of list(plan?.objects)) {
    if (!object || typeof object !== 'object') continue
    const material = registeredMaterial(object.render)
    // A registered ID is the subject truth, even if the proposed display name
    // tries to call a book a castle. Unknown custom inventions stay possible.
    const subjects = material ? [material.subject] : mentionedSubjects([text(object.name), ...list(object.aliases).map(text)].join(' '))
    for (const subject of subjects) present.add(subject)
    const previous = list(previousPlan?.objects).find(item => item.id === object.id)
    if (previous && previous.name === object.name && JSON.stringify(previous.render) === JSON.stringify(object.render) && JSON.stringify(previous.essential) === JSON.stringify(object.essential)) continue
    for (const subject of subjects) {
      const name = material?.name ?? subjectVocabulary.find(item => item.subject === subject)?.name ?? object.name
      if (semantic.excluded.includes(subject)) issues.push(`Object ${object.id}: ${name}/${subject} is explicitly excluded by the child. Remove this newly introduced subject; preserve the positive requested scene and unrelated existing objects.`)
      else if (semantic.referenceOnly.includes(subject)) issues.push(`Object ${object.id}: ${name}/${subject} is only a reference/source/metaphor, not a requested physical object. Express the intended setting, mood and relationships instead of drawing the source as a prop. A storybook-like world must not collapse into a literal book unless the child explicitly requests a book.`)
    }
  }
  for (const subject of semantic.requested) if (!present.has(subject)) issues.push(`The explicitly required subject ${subject} is missing. Keep it as a genuinely matching registered subject or faithful custom object; a different catalogue subject, title or summary does not satisfy it. Existing matching objects retained in the plan already count.`)
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
    if (material) covered.add(material.subject)
    const objectLabels = [text(object?.name), ...list(object?.aliases).map(text)]
    labels.push(...objectLabels.filter(Boolean))
    const descriptors = [...objectLabels, ...list(object?.essential).map(text), text(material?.name), text(material?.label)].join(' ')
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
        if (covered.has(subject) || reported.has(subject)) continue
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
    if (!mentionedSubjects(object.name).includes(material.subject)) issues.push(`Object ${object.id}: material ${material.id} depicts ${material.name}/${material.subject}, not ${object.name}. Use its true subject name; never rename a different subject to hide a missing requested material.`)
    const actual = profileOf(material)
    if (key(actual) !== key(profile)) issues.push(`Object ${object.id} uses ${key(actual)} but the shared profile is ${key(profile)}. Select the SAME SUBJECT in the chosen profile, or retain the requested subject as an explicit unsupported requirement; never rename another subject or mix coarse/simple and detailed references.`)
  }
  return issues
}
