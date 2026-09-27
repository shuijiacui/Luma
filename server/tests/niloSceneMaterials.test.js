import { afterEach, expect, test, vi } from 'vitest'
import { sceneMaterialContext, sceneMaterialStyleIssues, sceneIntentIssues, isFreshSceneRequest } from '../src/services/niloSceneMaterials.js'
import { getMaterialCuration, isMaterialEnabled, setMaterialCuration } from '../../shared/niloCuration.mjs'
import { getDrawingRecipe } from '../../shared/niloRecipes.mjs'
import { drawingIllustrations, getDrawingIllustration } from '../../shared/niloIllustrations.mjs'

const initial = getMaterialCuration()
afterEach(() => setMaterialCuration(initial))
const seed = initial => { let value = initial; return () => { value = (value * 1664525 + 1013904223) >>> 0; return value / 4294967296 } }
const profile = { style: 'storybook', detail: 'simple' }
const image = (id, name, illustrationId) => ({ id, name, render: { kind: 'illustration', illustrationId } })
const brief = (changes = {}) => ({ version: 1, intent: '画一个梦幻森林场景', reference: [{ phrase: '童话故事书', meaning: '童话般的场景氛围' }], setting: '森林', mood: ['梦幻', '温暖'], requiredSubjects: [], excludedSubjects: [], referenceOnlySubjects: ['故事书'], motifs: [{ subject: '树屋', role: 'focal', reason: '森林中的小小住处' }, { subject: '树', role: 'setting', reason: '围出森林的空间' }, { subject: '小兔子', role: 'support', reason: '走向树屋' }], relationships: ['小兔子走向树屋'], ...changes })

test('open scenes cover families with bounded single-profile PNG/SVG choices, not many poses of one subject', () => {
  const result = sceneMaterialContext({ utterance: '画一个梦幻场景' }, { random: seed(12) })
  expect(result.profile).toEqual(profile)
  expect(result.selection.openEnded).toBe(true)
  expect(result.subjects).toHaveLength(24)
  expect(new Set(result.subjects.map(item => item.family)).size).toBeGreaterThanOrEqual(7)
  expect(new Set(result.subjects.map(item => item.subject)).size).toBe(24)
  for (const group of result.subjects) {
    expect(group.variants.length).toBeLessThanOrEqual(2)
    for (const variant of group.variants) {
      expect(variant).toMatchObject({ ...profile, lineFamily: 'reference' })
      expect(isMaterialEnabled(variant.id)).toBe(true)
      expect(variant.kind === 'recipe' ? getDrawingRecipe(variant.id) : getDrawingIllustration(variant.id)).toBeTruthy()
      expect(variant.aspect).toBeGreaterThan(0)
      expect(variant.minPixels).toBeGreaterThan(0)
      if (variant.kind === 'illustration') expect(variant.visibleBounds).toMatchObject({ left: expect.any(Number), top: expect.any(Number), right: expect.any(Number), bottom: expect.any(Number) })
    }
  }
  expect(result.subjects.some(group => group.variants.some(item => item.kind === 'recipe'))).toBe(true)
  expect(result.subjects.every(group => group.variants[0].kind === 'illustration')).toBe(true)
})

test.each(['画鲸鱼和树屋的场景', 'draw a whale and a treehouse scene'])('explicit bilingual subjects win over random variety: %s', utterance => {
  const result = sceneMaterialContext({ utterance }, { random: seed(99) })
  expect(result.requestedSubjects).toEqual(['whale', 'treehouse'])
  expect(result.subjects.slice(0, 2).map(item => item.subject)).toEqual(['whale', 'treehouse'])
  expect(result.requestedSubjects).not.toContain('fish')
  expect(result.requestedSubjects).not.toContain('tree')
})

test('all registered PNG subject names survive SVG vocabulary merging without generic-subject false positives', () => {
  for (const style of ['storybook', 'illustrated', 'realistic']) for (const detail of ['simple', 'moderate', 'rich']) {
    const objects = drawingIllustrations.filter(item => item.style === style && item.detail === detail && isMaterialEnabled(item.id))
      .map(item => image(item.id, item.name, item.id))
    expect(sceneMaterialStyleIssues({ objects }, { style, detail })).toEqual([])
  }
  const requested = sceneMaterialContext({ utterance: '画水车小屋、撑伞的孩子和坐轮椅的孩子' })
  expect(requested.requestedSubjects).toEqual(expect.arrayContaining(['watermill', 'umbrellauser', 'wheelchairuser']))
  expect(requested.requestedSubjects).not.toContain('house')
  expect(requested.requestedSubjects).not.toContain('umbrella')
  expect(requested.requestedSubjects).not.toContain('bench')
  expect(sceneMaterialContext({ utterance: '画水磨坊' }).requestedSubjects).toEqual(['watermill'])
})

test('unavailable exact subjects remain explicit gaps and unknown inventions are not generic-open permissions', () => {
  expect(sceneMaterialContext({ utterance: '画梦幻城堡' }).unavailableRequestedSubjects).toContain('castle')
  expect(sceneMaterialContext({ utterance: '画一个超人的梦幻场景' }).selection.openEnded).toBe(false)
  expect(sceneMaterialContext({ utterance: '画戴着太空头盔的兔子' }).selection.openEnded).toBe(false)
})

test('pretty style selects illustrated/moderate without silently mixing in simple or rich materials', () => {
  const result = sceneMaterialContext({ utterance: '画一个精美的梦幻场景' }, { random: seed(3) })
  expect(result.profile).toEqual({ style: 'illustrated', detail: 'moderate' })
  expect(result.subjects.flatMap(group => group.variants).every(item => item.style === 'illustrated' && item.detail === 'moderate')).toBe(true)
  const missing = sceneMaterialContext({ utterance: '画精美的小船和小兔子' })
  expect(missing.profileMissingSubjects).toContain('boat')
  expect(missing.requestedSubjects).toContain('boat')
})

test('recency changes open candidates while explicit current subjects remain available', () => {
  const first = sceneMaterialContext({ utterance: '画梦幻场景' }, { random: seed(8) })
  const current = sceneMaterialContext({ utterance: '画梦幻场景', context: { recentSubjects: first.subjects.map(item => item.name) } }, { random: seed(8) })
  expect(current.subjects.map(item => item.subject)).not.toEqual(first.subjects.map(item => item.subject))
  const named = sceneMaterialContext({ utterance: '画兔子', context: { recentSubjects: ['兔子'] } })
  expect(named.subjects[0].subject).toBe('rabbit')
})

test('revisions retain exact old IDs/style without consuming randomness; fresh scenes use them only as recency', () => {
  const previous = { materialProfile: profile, summary: '兔子和树屋一起看云', objects: [image('rabbit_1', '小兔子', 'illustration-library-rabbit-beginner-01')] }
  const random = vi.fn(() => { throw new Error('revision must not randomize') })
  const changed = sceneMaterialContext({ utterance: '把兔子变小一点', plan: previous }, { random })
  expect(changed.retainedIllustrationIds).toContain('illustration-library-rabbit-beginner-01')
  expect(changed.profile).toEqual(profile)
  expect(changed.selection.revision).toBe(true)
  expect(random).not.toHaveBeenCalled()
  const fresh = sceneMaterialContext({ utterance: '换个新的梦幻场景', plan: previous }, { random: seed(3) })
  expect(fresh.selection).toMatchObject({ revision: false, fresh: true, openEnded: true })
  expect(fresh.retainedIllustrationIds).toEqual([])
  expect(fresh.directions).toHaveLength(2)
  expect(isFreshSceneRequest('把城堡换成树屋')).toBe(false)
  expect(isFreshSceneRequest('重新构思')).toBe(true)
})

test('new curation exclusions affect both media but do not erase old material IDs', () => {
  const id = 'illustration-library-rabbit-beginner-01'
  setMaterialCuration({ ...initial, decisions: { ...initial.decisions, [id]: 'reject' } })
  const result = sceneMaterialContext({ utterance: '画兔子' })
  expect(result.subjects.flatMap(group => group.variants).some(item => item.id === id)).toBe(false)
  const old = { objects: [image('rabbit_1', '小兔子', id)] }
  expect(sceneMaterialStyleIssues(old, profile, old)).toEqual([])
  expect(sceneMaterialStyleIssues(old, profile)).not.toEqual([])
})

test('coherence rejects crude SVG/PNG mixtures, mixed detail and false subject renaming', () => {
  const rabbit = image('rabbit_1', '小兔子', 'illustration-library-rabbit-beginner-01')
  expect(sceneMaterialStyleIssues({ objects: [rabbit, { id: 'boat_1', name: '小船', render: { kind: 'recipe', recipeId: 'boat-0' } }] }, profile).join(' ')).toContain('old schematic icon')
  expect(sceneMaterialStyleIssues({ objects: [rabbit, image('bookshop_1', '书店', 'illustration-bookshop')] }, profile).join(' ')).toContain('shared profile')
  expect(sceneMaterialStyleIssues({ objects: [image('castle_1', '城堡', 'illustration-library-treehouse-beginner-01')] }, profile).join(' ')).toContain('not 城堡')
  expect(sceneMaterialStyleIssues({ objects: [rabbit, { id: 'cloud_1', name: '云朵', render: { kind: 'recipe', recipeId: 'cloud-3' } }] }, profile)).toEqual([])
})

test('connectors must describe their real open-line geometry in both name and essential features', () => {
  const connector = (name, primitive, essential) => ({ id: 'connector_1', name, essential, render: { kind: 'compose', primitive } })
  for (const object of [connector('小气泡', 'path', ['几颗上升的小圆泡']), connector('小气泡', 'water', ['几个气泡']), connector('水纹线', 'path', ['三条弯曲的水流线']), connector('水纹', 'water', ['上升的圆圈']), connector('小路', 'path', ['波浪水纹'])]) {
    expect(sceneMaterialStyleIssues({ objects: [object] }, profile).join(' ')).toContain('cannot depict its stated name/essential features')
  }
  for (const object of [connector('水纹线', 'water', ['三条弯曲的水流线']), connector('水波', 'water', ['几道横向的波纹线']), connector('小路', 'path', ['两条弯曲的道路边线']), connector('Water ripples', 'water', ['Three wavy lines']), connector('Curved path', 'path', ['Two widening road edges'])]) {
    expect(sceneMaterialStyleIssues({ objects: [object] }, profile)).toEqual([])
  }
})

test('semantic retrieval separates storybook atmosphere from literal props and stays inside the proposed forest world', () => {
  const result = sceneMaterialContext({ utterance: '像童话故事书里的森林一样梦幻', semanticBrief: brief() }, { random: seed(12) })
  expect(result.selection.semantic).toBe(true)
  expect(result.requestedSubjects).toEqual([])
  expect(result.referenceOnlySubjects).toEqual(['book'])
  expect(result.subjects.slice(0, 3).map(item => item.subject)).toEqual(['treehouse', 'tree', 'rabbit'])
  expect(result.subjects.map(item => item.subject)).not.toEqual(expect.arrayContaining(['book', 'apartment', 'airplane']))
  for (const unwanted of ['book', 'apartment', 'airplane', 'rocket', 'doctor']) expect(result.subjects.map(item => item.subject)).not.toContain(unwanted)
  expect(result.subjects.every(group => group.variants.every(variant => variant.style === result.profile.style && variant.detail === result.profile.detail))).toBe(true)
})

test('explicit physical book wins over reference-only wording, while explicit exclusions override both', () => {
  const literal = sceneMaterialContext({ utterance: '画一本迪士尼故事书，封面有童话森林', semanticBrief: brief({ requiredSubjects: ['故事书'], setting: '书本', motifs: [{ subject: '故事书', role: 'focal', reason: '孩子明确要求画书' }] }) })
  expect(literal.requestedSubjects).toEqual(['book'])
  expect(literal.referenceOnlySubjects).toEqual([])
  expect(literal.subjects[0].subject).toBe('book')
  const excluded = sceneMaterialContext({ utterance: '不要故事书和城堡，只要树屋的场景', semanticBrief: brief({ requiredSubjects: ['树屋', '故事书'], excludedSubjects: ['故事书', '城堡'] }) })
  expect(excluded.requestedSubjects).toEqual(['treehouse'])
  expect(excluded.excludedSubjects).toEqual(['book', 'castle'])
  expect(excluded.subjects.map(item => item.subject)).not.toContain('book')
  expect(excluded.unavailableRequestedSubjects).not.toContain('castle')
})

test('semantic mandatory gaps stay explicit and unrecognized inventions never become generic-scene permission', () => {
  const result = sceneMaterialContext({ utterance: '画一个阿古斯精灵，住在城堡里', semanticBrief: brief({ requiredSubjects: ['阿古斯精灵', '城堡'], setting: '神奇住处', motifs: [] }) })
  expect(result.unavailableRequestedSubjects).toContain('castle')
  expect(result.unmappedRequiredSubjects).toEqual(['阿古斯精灵'])
  expect(result.selection.openEnded).toBe(false)
  expect(sceneIntentIssues({ objects: [{ id: 'new_1', name: '阿古斯精灵', render: { kind: 'custom' } }] }, brief({ requiredSubjects: ['阿古斯精灵'] }))).toEqual([])
})

test('semantic alternatives prioritize exact motifs and vary only related candidates; revisions retain IDs without randomness', () => {
  const forest = sceneMaterialContext({ utterance: '梦幻场景', semanticBrief: brief() }, { random: seed(3) })
  const oceanBrief = brief({ setting: '海底', mood: ['安静'], referenceOnlySubjects: [], motifs: [{ subject: '水母', role: 'focal', reason: '海底伙伴' }, { subject: '小鱼', role: 'support', reason: '相伴游动' }] })
  const ocean = sceneMaterialContext({ utterance: '梦幻场景', semanticBrief: oceanBrief }, { random: seed(3) })
  expect(ocean.subjects.slice(0, 2).map(item => item.subject)).toEqual(['jellyfish', 'fish'])
  expect(ocean.subjects.map(item => item.subject)).not.toEqual(forest.subjects.map(item => item.subject))
  for (const unwanted of ['book', 'apartment', 'doctor', 'capybara', 'duck', 'frog', 'otter']) expect(ocean.subjects.map(item => item.subject)).not.toContain(unwanted)
  const imagined = sceneMaterialContext({ utterance: '水豚去海底探险', semanticBrief: { ...oceanBrief, requiredSubjects: ['水豚'], motifs: [{ subject: '水豚', role: 'focal', reason: '孩子明确要它去海底' }] } })
  expect(imagined.subjects[0].subject).toBe('capybara')
  const recent = sceneMaterialContext({ utterance: '梦幻场景', semanticBrief: brief(), context: { recentSubjects: forest.subjects.slice(3, 9).map(item => item.name) } }, { random: seed(3) })
  expect(recent.subjects.slice(0, 3).map(item => item.subject)).toEqual(forest.subjects.slice(0, 3).map(item => item.subject))
  expect(recent.subjects.map(item => item.subject)).not.toEqual(forest.subjects.map(item => item.subject))
  const previous = { materialProfile: profile, objects: [image('rabbit_1', '小兔子', 'illustration-library-rabbit-beginner-01')] }
  const random = vi.fn(() => { throw new Error('revision must not randomize') })
  const revised = sceneMaterialContext({ utterance: '不要换新场景，只把小兔子缩小', plan: previous, semanticBrief: brief({ requiredSubjects: ['小兔子'] }) }, { random })
  expect(revised.selection).toMatchObject({ revision: true, fresh: false })
  expect(revised.retainedIllustrationIds).toContain('illustration-library-rabbit-beginner-01')
  expect(random).not.toHaveBeenCalled()
})

test('intent checks reject source props and excluded new subjects without deleting unrelated saved objects', () => {
  const book = image('book_1', '迪士尼故事书', 'illustration-library-book-beginner-01')
  const treehouse = image('treehouse_1', '树屋', 'illustration-library-treehouse-beginner-01')
  expect(sceneIntentIssues({ objects: [book] }, brief()).join(' ')).toContain('only a reference/source/metaphor')
  expect(sceneIntentIssues({ objects: [book] }, brief({ requiredSubjects: ['一本故事书'] }))).toEqual([])
  expect(sceneIntentIssues({ objects: [treehouse] }, brief({ excludedSubjects: ['树屋'] })).join(' ')).toContain('explicitly excluded')
  const old = { objects: [book, treehouse] }
  expect(sceneIntentIssues(old, brief({ requiredSubjects: ['树屋'], excludedSubjects: ['书'] }), old)).toEqual([])
  expect(sceneIntentIssues({ objects: [{ ...book, id: 'book_2' }, treehouse] }, brief({ requiredSubjects: ['树屋'], excludedSubjects: ['书'] }), old).join(' ')).toContain('explicitly excluded')
  expect(sceneIntentIssues({ objects: [book] }, brief({ requiredSubjects: ['树屋'] })).join(' ')).toContain('explicitly required subject treehouse is missing')
  expect(sceneIntentIssues({ objects: [{ ...book, name: '树屋' }] }, brief({ requiredSubjects: ['树屋'] })).join(' ')).toContain('treehouse is missing')
  expect(sceneIntentIssues({ objects: [{ id: 'invented', name: '长鲸鱼尾巴的城堡', aliases: ['城堡'], render: { kind: 'custom' } }] }, brief({ requiredSubjects: ['城堡'] }))).toEqual([])
  expect(sceneIntentIssues({ objects: [{ id: 'book_custom', name: '迪士尼故事书', render: { kind: 'custom' } }] }, brief()).join(' ')).toContain('only a reference/source/metaphor')
  expect(sceneIntentIssues({ objects: [{ id: 'castle_compose', name: '魔法城堡', render: { kind: 'compose', primitive: 'castle' } }] }, brief({ excludedSubjects: ['城堡'] })).join(' ')).toContain('explicitly excluded')
  expect(sceneIntentIssues({ objects: [{ id: 'invented', name: '阿古斯精灵', render: { kind: 'custom' } }] }, brief())).toEqual([])
})

test('summary grounding catches counted unselected path/bubble props without asserting mood or negative mentions are drawings', () => {
  const fish = image('fish_1', '小鱼', 'illustration-library-fish-beginner-01')
  const jellyfish = { ...image('jellyfish_1', '小水母', 'illustration-library-jellyfish-beginner-01'), aliases: ['月亮水母'] }
  const ocean = { objects: [fish, jellyfish], summary: '一片开阔的海底水域里，一只月亮水母轻轻漂浮，几串泡泡从旁边上升。' }
  expect(sceneIntentIssues(ocean, brief()).join(' ')).toContain('scene-bubble')
  expect(sceneIntentIssues(ocean, brief()).join(' ')).not.toContain('concrete 月亮')
  const space = { objects: [image('ufo_1', '飞碟', 'illustration-library-ufo-beginner-01'), image('rocket_1', '火箭', 'illustration-library-rocket-beginner-01'), image('moon_1', '月亮', 'illustration-library-moon-beginner-01')], summary: '一艘小飞碟停在中央，旁边立着一枚小火箭，天边挂着月亮。荒原上有一条小径从近处弯向远方。' }
  expect(sceneIntentIssues(space, brief()).join(' ')).toContain('scene-path')
  expect(sceneIntentIssues({ ...space, objects: [...space.objects, { id: 'path_1', name: '小路', essential: ['两条道路边线'], render: { kind: 'compose', primitive: 'path' } }] }, brief())).toEqual([])
  expect(sceneIntentIssues({ ...ocean, summary: '海底像童话故事书一样梦幻。没有城堡，也不要一串气泡。只有小鱼和一只月亮水母。' }, brief())).toEqual([])
  expect(sceneIntentIssues({ ...ocean, summary: '一条小鱼游过孩子的小船，旁边有几串泡泡。', preserve: ['孩子画的小船和泡泡'] }, brief())).toEqual([])
  expect(sceneIntentIssues({ ...ocean, summary: 'A few bubbles float beside the fish.' }, brief()).join(' ')).toContain('scene-bubble')
  expect(sceneIntentIssues({ ...ocean, summary: 'No bubbles, just a quiet ocean like a storybook.' }, brief())).toEqual([])
})

test.each(['不要换新的场景，只把小船缩小', '先不要帮我重新构思，只改小船', '别换个新主意', '不想重新设计场景', '不需要把整个画面重新构思', "don't start over; only move the boat", "don't draw a new scene", "I don't want you to start over with another scene", 'no need to start over'])('a negated fresh-scene action preserves the current plan: %s', value => {
  expect(isFreshSceneRequest(value)).toBe(false)
})

test.each(['不要城堡，换个新的场景', '不用小兔子了，重新构思', '不要重复，换个新的主意', '换个新的场景，不要城堡', 'not a castle; start over with another scene', "don't use a castle but create a new scene"])('negating another subject does not block an affirmative fresh-scene action: %s', value => {
  expect(isFreshSceneRequest(value)).toBe(true)
})
