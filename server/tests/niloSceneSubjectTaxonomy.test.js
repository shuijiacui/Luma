import { expect, test } from 'vitest'
import { drawingIllustrations } from '../../shared/niloIllustrations.mjs'
import { isSceneConditionRequirement, isSceneSubjectSubtype, sceneNounForms, sceneSubjectParts } from '../src/services/niloSceneSubjectTaxonomy.js'
import { namedSceneSubjects, sceneIntentIssues, sceneMaterialContext, sceneMaterialStyleIssues } from '../src/services/niloSceneMaterials.js'
import { sceneUnderstandingPrompt } from '../src/services/niloSceneIntent.js'

const profile = { style: 'storybook', detail: 'simple' }
const brief = changes => ({ version: 1, intent: '保留孩子原意的画面', setting: '', mood: [], reference: [], requiredSubjects: [], excludedSubjects: [], referenceOnlySubjects: [], motifs: [], relationships: [], ...changes })
const image = (subject, name) => ({ id: `${subject}_1`, name, essential: [name], render: { kind: 'illustration', illustrationId: `illustration-library-${subject}-beginner-01` } })
const issues = (objects, requiredSubjects, extra = {}) => sceneIntentIssues({ objects }, brief({ requiredSubjects, ...extra }))

test.each(['rose', 'tulip', 'daisy', 'poppy', 'orchid', 'hydrangea', 'lavender', 'peony', 'daffodil', 'hibiscus'])('a real %s can satisfy a flower request, never the converse', subject => {
  const material = drawingIllustrations.find(item => item.subject === subject)
  expect(material).toBeTruthy()
  expect(isSceneSubjectSubtype(subject, 'flower')).toBe(true)
  expect(isSceneSubjectSubtype('flower', subject)).toBe(false)
  expect(issues([image(subject, material.name)], ['巨大的花朵'])).toEqual([])
  expect(sceneMaterialStyleIssues({ objects: [image(subject, '花朵')] }, profile)).toEqual([])
  expect(issues([image('flower', '小花')], [material.name]).join(' ')).toContain(`subject ${subject} is missing`)
})

test('required upper categories bind to true stock members without extra generic custom objects', () => {
  const objects = [image('rabbit', '小兔子'), image('squirrel', '松鼠')]
  const meaning = brief({ requiredSubjects: ['小动物'] })
  const materials = sceneMaterialContext({ utterance: '小动物一起住的村庄', semanticBrief: meaning })
  expect(materials.requestedSubjects).toEqual(['animal'])
  expect(materials.unmappedRequiredSubjects).toEqual([])
  expect(materials.unavailableRequestedSubjects).not.toContain('animal')
  expect(materials.profileMissingSubjects).not.toContain('animal')
  expect(sceneIntentIssues({ objects }, meaning)).toEqual([])
  expect(issues([image('cottage', '乡间小屋')], ['小动物']).join(' ')).toContain('animal is missing')
  expect(issues([image('rabbit', '小动物')], ['松鼠']).join(' ')).toContain('squirrel is missing')
  expect(sceneIntentIssues({ objects, summary: '这里住着一群小动物。' }, meaning)).toEqual([])
})

test('cupcake is a cake in requirements and generated summary components, without turning candy or cups into cakes', () => {
  expect(isSceneSubjectSubtype('cupcake', 'cake')).toBe(true)
  expect(isSceneSubjectSubtype('cake', 'cupcake')).toBe(false)
  expect(issues([image('cupcake', '纸杯蛋糕')], ['蛋糕'])).toEqual([])
  expect(issues([image('cake', '蛋糕')], ['纸杯蛋糕']).join(' ')).toContain('cupcake is missing')
  expect(issues([image('cup', '杯子')], ['蛋糕']).join(' ')).toContain('cake is missing')
  const composite = { id: 'planet', name: '甜甜的星球', aliases: [], essential: ['星球周围环绕几只纸杯蛋糕'], render: { kind: 'generated' } }
  expect(sceneIntentIssues({ objects: [composite], summary: '星球旁有几只蛋糕。' }, brief())).toEqual([])
  expect(sceneMaterialStyleIssues({ objects: [image('cupcake', '软糖')] }, profile).join(' ')).toContain('not 软糖')
})

test('is-a remains one-way and never follows related tags or a part-of edge', () => {
  expect(isSceneSubjectSubtype('owl', 'animal')).toBe(true)
  expect(isSceneSubjectSubtype('whale', 'fish')).toBe(false)
  expect(isSceneSubjectSubtype('panda', 'cat')).toBe(false)
  expect(isSceneSubjectSubtype('moonboat', 'moon')).toBe(false)
  expect(isSceneSubjectSubtype('treehouse', 'tree')).toBe(false)
  expect(isSceneSubjectSubtype('bookshop', 'book')).toBe(false)
  expect(isSceneSubjectSubtype('oakbranch', 'tree')).toBe(false)
  expect(isSceneSubjectSubtype('leaf', 'plant')).toBe(false)
  expect(isSceneSubjectSubtype('mushroom', 'plant')).toBe(false)
  expect(sceneSubjectParts.branch).toBe('tree')
  expect(sceneSubjectParts.leaf).toBe('plant')
})

test('superclass exclusions block subtypes, while a specific exclusion leaves other species available', () => {
  expect(issues([image('rabbit', '兔子')], [], { excludedSubjects: ['动物'] }).join(' ')).toContain('explicitly excluded')
  expect(issues([image('daisy', '雏菊')], [], { excludedSubjects: ['花朵'] }).join(' ')).toContain('explicitly excluded')
  expect(issues([image('daisy', '雏菊')], [], { excludedSubjects: ['玫瑰'] })).toEqual([])
  const materials = sceneMaterialContext({ utterance: '不要动物的地方', semanticBrief: brief({ excludedSubjects: ['动物'] }) })
  const subjects = materials.semanticIndex.rows.map(row => row[materials.semanticIndex.columns.indexOf('subject')])
  expect(subjects).not.toContain('rabbit')
  expect(subjects).not.toContain('owl')
  expect(subjects).toContain('cottage')
  expect(subjects).toContain('flower')
})

test.each(['树枝', '树枝之间', '一根弯弯的枝条', 'tree branches'])('a requested part has its own identity rather than requiring its whole: %s', phrase => {
  expect(namedSceneSubjects(phrase)).toEqual(['branch'])
  expect(issues([image('oakbranch', '橡树枝')], [phrase])).toEqual([])
  expect(issues([image('cottage', '树枝')], [phrase]).join(' ')).toContain('branch is missing')
  const materials = sceneMaterialContext({ utterance: phrase, semanticBrief: brief({ requiredSubjects: [phrase] }) })
  expect(materials.requestedSubjects).toEqual(['branch'])
  expect(materials.unmappedRequiredSubjects).toEqual([])
  expect(materials.subjects[0].subject).toBe('oakbranch')
})

test('a branch cannot substitute for an explicitly requested whole tree, nor does a tree prove a visible branch', () => {
  expect(issues([image('oakbranch', '橡树枝')], ['小树']).join(' ')).toContain('tree is missing')
  expect(issues([image('tree', '小树')], ['树枝']).join(' ')).toContain('branch is missing')
  expect(namedSceneSubjects('橡树枝旁的一棵树')).toEqual(expect.arrayContaining(['oakbranch', 'tree']))
})

test.each(['下雨天', '下雪天', '有雾', '晴天', 'a rainy day', 'snowy weather'])('weather stays a mandatory scene condition without forcing a physical custom noun: %s', phrase => {
  const meaning = brief({ intent: `画一个${phrase}的温暖地方`, setting: phrase, requiredSubjects: [phrase, '小房子'] })
  const materials = sceneMaterialContext({ utterance: meaning.intent, semanticBrief: meaning })
  expect(materials.conditionRequirements).toEqual([phrase])
  expect(materials.requestedSubjects).toEqual(['house'])
  expect(materials.unmappedRequiredSubjects).toEqual([])
  expect(meaning.requiredSubjects).toEqual([phrase, '小房子'])
  // Identity validation does not pretend that this proves the weather; the
  // unchanged intent/setting and conditionRequirements reach rendered review.
  expect(sceneIntentIssues({ objects: [image('cottage', '乡间小屋')] }, meaning)).toEqual([])
})

test.each(['晴天娃娃', '雨天的城堡', '雪人', '雨靴', 'rain coat', 'rainy castle', 'snow globe', 'snow leopard'])('a weather substring never exempts a concrete object: %s', phrase => {
  expect(isSceneConditionRequirement(phrase)).toBe(false)
})

test.each([
  ['leaves', 'leaf'], ['maple leaves', 'mapleleaf'], ['flowers', 'flower'], ['rabbits', 'rabbit'],
  ['birds', 'bird'], ['tree branches', 'branch'], ['children', 'child'],
])('registered English noun forms preserve identity: %s', (phrase, subject) => {
  expect(namedSceneSubjects(phrase)).toEqual([subject])
  expect(sceneMaterialContext({ utterance: phrase, semanticBrief: brief({ requiredSubjects: [phrase] }) }).unmappedRequiredSubjects).toEqual([])
})

test('morphology does not reopen substring identities or remove unknown concrete requirements', () => {
  expect(sceneNounForms('leaf')).toEqual(['leaves'])
  expect(sceneNounForms('maple leaf')).toEqual(['maple leaves'])
  expect(namedSceneSubjects('cupboard')).toEqual([])
  expect(namedSceneSubjects('moonlight')).toEqual([])
  expect(namedSceneSubjects('starfish')).toEqual([])
  expect(namedSceneSubjects('海马')).toEqual([])
  expect(issues([image('horse', '小马')], ['海马']).join(' ')).toContain('required unfamiliar subject')
})

test.each(['custom', 'generated'])('%s preserves unfamiliar concrete and fused requirements through its actual feature contract', kind => {
  const required = '戴着星环的阿古斯精灵'
  const object = { id: 'new_1', name: required, aliases: [], essential: [`${required}的完整主体与连接着的星环`], render: { kind } }
  expect(issues([object], [required])).toEqual([])
  expect(issues([{ ...object, essential: ['圆形身体'] }], [required]).join(' ')).toContain('required unfamiliar subject')
  expect(issues([{ ...image('rabbit', required), aliases: [required], essential: [required] }], [required]).join(' ')).toContain('required unfamiliar subject')
  expect(issues([], [required]).join(' ')).toContain('required unfamiliar subject')
})

test('generated known subjects are counted without requiring a stock ID, and cannot evade exclusions', () => {
  const object = { id: 'fused_1', name: '鲸鱼背上的小镇', essential: ['鲸鱼完整身体', '背上连接着小房子'], render: { kind: 'generated' } }
  expect(sceneIntentIssues({ objects: [object], summary: '一只鲸鱼背上有一座小房子。' }, brief({ requiredSubjects: ['鲸鱼'] }))).toEqual([])
  expect(issues([object], [], { excludedSubjects: ['鲸鱼'] }).join(' ')).toContain('explicitly excluded')
})

test('a generated identity need not repeat its target noun in every visible feature, while aliases cannot invent parts', () => {
  const whale = { id: 'whale_1', name: '鲸鱼', aliases: ['城堡'], essential: ['巨大的海洋生物', '宽阔平坦的背部', '喷出水柱'], render: { kind: 'generated' } }
  expect(sceneIntentIssues({ objects: [whale], summary: '一只巨大的鲸鱼在海上游动。' }, brief({ requiredSubjects: ['鲸鱼'] }))).toEqual([])
  expect(sceneIntentIssues({ objects: [whale], summary: '一座城堡在这里。' }, brief()).join(' ')).toContain('castle')
  const composite = { ...whale, essential: [...whale.essential, '背上连着几座尖顶小屋'] }
  expect(sceneIntentIssues({ objects: [composite], summary: '一只鲸鱼背上有一座小房子。' }, brief())).toEqual([])
  const disguised = { ...image('flower', '鲸鱼'), aliases: ['鲸鱼'], essential: ['鲸鱼'] }
  expect(sceneIntentIssues({ objects: [disguised], summary: '一只鲸鱼。' }, brief()).join(' ')).toContain('whale')
})

test('understanding separates scene conditions and categories while retaining concrete fused features', () => {
  const prompt = sceneUnderstandingPrompt({ utterance: '雨天里长翅膀的兔子', locale: 'zh', context: { history: [] } })
  expect(prompt).toContain('weather, time, mood and material/style conditions belong in intent/setting')
  expect(prompt).toContain('faithful specific members')
  expect(prompt).toContain('branches is not a demand for a whole tree')
  expect(prompt).toContain('omitting its wings')
})
