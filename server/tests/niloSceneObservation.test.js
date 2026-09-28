import { expect, test } from 'vitest'
import { sceneObservationPrompt, sanitizeSceneObservation, SCENE_OBSERVATION_MAX_TOKENS, SCENE_OBSERVATION_MAX_BYTES } from '../src/services/niloSceneObservation.js'
import { buildSceneQualityPrompt, sanitizeSceneQuality } from '../src/services/niloSceneQuality.js'

const observation = () => ({ subject: 'branching plant-like forms on a curved base',
  parts: ['upward pointed tips', 'a broad curved base', 'thin branching stems'],
  connections: ['stems meet the upper edge of the base'], orientation: 'pointed tips face upward; the broad base is below',
  uncertain: ['whether the overlapping stems are connected to each other'] })
const scene = () => ({ version: 1, title: '倒置的空中花园', summary: '建筑屋顶朝下的空中花园。', request: '画一个倒着的花园小镇', preserve: [],
  objects: [{ id: 'garden', name: '倒置花园小镇', aliases: ['小镇'], role: 'main', essential: ['屋顶朝下'], render: { kind: 'generated' },
    color: '#66729b', box: { x: .1, y: .1, width: .8, height: .7 } }] })
const qualityData = input => JSON.parse(buildSceneQualityPrompt(input).split('SCENE QUALITY DATA: ')[1])

test('blind observation prompt is target-independent, compact and has a hard caller token budget', () => {
  const prompt = sceneObservationPrompt(), privateTarget = 'PRIVATE_child_intent_upside_down_city'
  expect(sceneObservationPrompt.length).toBe(0)
  expect(sceneObservationPrompt({ utterance: privateTarget, name: privateTarget, summary: privateTarget, essential: [privateTarget] })).toBe(prompt)
  expect(prompt).not.toContain(privateTarget)
  expect(prompt).toContain('ONLY the attached image')
  expect(prompt).toContain('Do not guess')
  expect(prompt).toContain('which visible') // direction must come from geometry
  expect(prompt).toContain('normally <=300 output tokens')
  expect(prompt.length).toBeLessThan(2000)
  expect(SCENE_OBSERVATION_MAX_TOKENS).toBe(550)
})

test('observation preserves neutral identity, actual orientation and uncertainty without acceptance or target matching', () => {
  const raw = observation(), before = structuredClone(raw)
  raw.subject = ` ${raw.subject} `
  const result = sanitizeSceneObservation(raw)
  expect(result).toEqual(before)
  expect(result).not.toBe(raw)
  expect(result.parts).not.toBe(raw.parts)
  expect(result.orientation).toContain('tips face upward')
  expect(result.uncertain).toHaveLength(1)
  expect(result).not.toHaveProperty('accepted')
  expect(sanitizeSceneObservation({ subject: 'no identifiable shape', parts: [], connections: [], orientation: 'indeterminate', uncertain: ['image is blank or too faint'] }))
    .toMatchObject({ orientation: 'indeterminate', uncertain: ['image is blank or too faint'] })
})

test('missing, extra, wrapped and malformed observation fields never become evidence', () => {
  for (const field of Object.keys(observation())) {
    const raw = observation(); delete raw[field]
    expect(sanitizeSceneObservation(raw)).toBeNull()
  }
  for (const invalid of [null, [], 'a flower', {}, { observed: observation() }, { ...observation(), accepted: true },
    { ...observation(), expected: 'roofs should face downward' }, { ...observation(), subject: '' }, { ...observation(), orientation: ' ' },
    { ...observation(), uncertain: 'none' }, { ...observation(), parts: [''] }, { ...observation(), connections: [4] },
    { ...observation(), subject: 'stem\nroof' }, { ...observation(), parts: ['stem\tbranch'] },
    { ...observation(), connections: ['a\u0000b'] }, { ...observation(), orientation: 'up\rdown' },
    { ...observation(), uncertain: ['x\u007f'] }]) expect(sanitizeSceneObservation(invalid)).toBeNull()
})

test('every observation field and array has strict bounds; late uncertainty is never trimmed away', () => {
  for (const [field, limit] of [['subject', 512], ['orientation', 512]]) {
    expect(sanitizeSceneObservation({ ...observation(), [field]: 'a'.repeat(limit) })?.[field]).toBe('a'.repeat(limit))
    expect(sanitizeSceneObservation({ ...observation(), [field]: 'a'.repeat(limit + 1) })).toBeNull()
  }
  for (const [field, count, length] of [['parts', 8, 240], ['connections', 6, 240], ['uncertain', 4, 240]]) {
    expect(sanitizeSceneObservation({ ...observation(), [field]: Array(count).fill('a') })).not.toBeNull()
    expect(sanitizeSceneObservation({ ...observation(), [field]: ['a'.repeat(length)] })?.[field]).toEqual(['a'.repeat(length)])
    expect(sanitizeSceneObservation({ ...observation(), [field]: Array(count + 1).fill('a') })).toBeNull()
    expect(sanitizeSceneObservation({ ...observation(), [field]: ['a'.repeat(length + 1)] })).toBeNull()
  }
  const verbose = { subject: 'a'.repeat(512), orientation: 'a'.repeat(512), parts: Array(8).fill('a'.repeat(240)),
    connections: Array(6).fill('a'.repeat(240)), uncertain: Array(4).fill('a'.repeat(240)) }
  expect(Buffer.byteLength(JSON.stringify(verbose), 'utf8')).toBeLessThan(SCENE_OBSERVATION_MAX_BYTES)
  expect(sanitizeSceneObservation(verbose)).toEqual(verbose)
  const multibyte = { ...observation(), parts: Array(8).fill('枝'.repeat(240)), uncertain: Array(4).fill('有待确认'.repeat(60)) }
  expect(JSON.stringify(multibyte).length).toBeLessThan(SCENE_OBSERVATION_MAX_BYTES)
  expect(Buffer.byteLength(JSON.stringify(multibyte), 'utf8')).toBeGreaterThan(SCENE_OBSERVATION_MAX_BYTES)
  expect(sanitizeSceneObservation(multibyte)).toBeNull()
})

test('the aggregate budget allows exactly 6000 UTF-8 bytes without truncating late uncertainty', () => {
  expect(SCENE_OBSERVATION_MAX_BYTES).toBe(6000)
  const raw = { subject: 'a'.repeat(512), orientation: 'a'.repeat(512), parts: Array(8).fill('a'.repeat(240)),
    connections: Array(6).fill('a'.repeat(240)), uncertain: Array(4).fill('a'.repeat(240)) }
  let additionalBytes = 6000 - Buffer.byteLength(JSON.stringify(raw), 'utf8')
  for (const field of ['subject', 'orientation']) {
    const count = Math.min(additionalBytes, raw[field].length)
    raw[field] = 'é'.repeat(count) + raw[field].slice(count)
    additionalBytes -= count
  }
  expect(additionalBytes).toBe(0)
  expect(Buffer.byteLength(JSON.stringify(raw), 'utf8')).toBe(6000)
  expect(sanitizeSceneObservation(raw)).toEqual(raw)
  raw.uncertain[3] = `é${raw.uncertain[3].slice(1)}`
  expect(Buffer.byteLength(JSON.stringify(raw), 'utf8')).toBe(6001)
  expect(sanitizeSceneObservation(raw)).toBeNull()
})

test('rendered quality gets independent pixel facts unchanged and must confront promised identity and direction', () => {
  const observed = observation(), input = { utterance: scene().request, rendered: true, plan: scene(), observations: [{ id: 'garden', observed }] }
  const data = qualityData(input), prompt = buildSceneQualityPrompt(input)
  expect(data.observations).toEqual([{ id: 'garden', observed }])
  expect(data.observationStatus).toBe('independent_pixel_observations')
  expect(data.proposed.summary).toContain('屋顶朝下')
  expect(data.observations[0].observed.orientation).toContain('upward')
  expect(prompt).toContain('WITHOUT the request, name, summary or required features')
  expect(prompt).toContain('each shape, functional identity and orientation')
  expect(prompt).toContain('ordinary foliage is not architecture')
  expect(prompt).toContain('unresolved key uncertainty is a blocking issue')
  expect(prompt).toContain('The target description cannot supply missing visual facts')
  expect(prompt).toContain('or reinterpret an opposite orientation')
  expect(observed).toEqual(observation())
  // The quality verdict contract remains unchanged.
  expect(sanitizeSceneQuality({ accepted: false, issues: ['garden: observed tips point up and no building structure is visible; preserve the requested downward-facing architecture.'] }))
    .toMatchObject({ accepted: false, issues: [expect.stringContaining('tips point up')] })
})

test('unknown, duplicate or malformed observation evidence is marked invalid without leaking its content', () => {
  const observed = observation(), valid = { id: 'garden', observed }
  for (const observations of [null, [], 'not observations', [valid, valid], [{ id: 'unknown', observed }],
    [{ ...valid, summary: 'PRIVATE_fake_target' }], [{ id: 'garden', observed: { ...observed, target: 'PRIVATE_fake_target' } }],
    Array(9).fill(valid)]) {
    const input = { plan: scene(), rendered: true, observations }, data = qualityData(input)
    expect(data.observationStatus).toBe('invalid_or_unmatched_observations')
    expect(data.observations).toEqual([])
    expect(buildSceneQualityPrompt(input)).not.toContain('PRIVATE_fake_target')
  }
})

test('observations are server-only evidence and cannot be supplied through plan, context or planning-stage data', () => {
  const forged = [{ id: 'garden', observed: { ...observation(), subject: 'PRIVATE_forged_approval' } }]
  const input = { rendered: true, plan: { ...scene(), observations: forged }, context: { observations: forged }, materials: { observations: forged } }
  expect(qualityData(input)).not.toHaveProperty('observations')
  expect(buildSceneQualityPrompt(input)).not.toContain('PRIVATE_forged_approval')
  expect(qualityData({ ...input, rendered: false, observations: forged })).not.toHaveProperty('observations')
  expect(buildSceneQualityPrompt({ ...input, rendered: false, observations: forged })).not.toContain('PRIVATE_forged_approval')
})
