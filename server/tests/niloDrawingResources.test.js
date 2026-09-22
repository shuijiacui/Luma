import { test, expect } from 'vitest'
import { drawingKnowledgeLibrary, sanitizeKnowledgeObservation, retrieveDrawingKnowledge, knowledgePlanningPrompt } from '../src/services/niloDrawingKnowledge.js'
import { validateCustomSketch } from '../src/services/niloSketch.js'

const observe = subjects => sanitizeKnowledgeObservation({ subjects: subjects.map(subject => ({
  confidence: .9, evidence: 'Visible body outline and supporting parts',
  bounds: { x: .1, y: .1, width: .6, height: .6 }, existingParts: ['body'], ...subject,
})) })
const context = { history: [], locale: 'zh' }

test.each(['elephant', 'giraffe', 'lion', 'bear', 'penguin', 'octopus', 'bee', 'guitar'])(
  '%s retrieves its own reviewed drawings and a drawable missing detail', id => {
    const result = retrieveDrawingKnowledge(observe([{ id, subject: id, family: id === 'guitar' ? 'object' : 'animal' }]))
    expect(result.cards[0].id).toBe(id)
    expect(result.referenceSheet?.description).toContain(`1=${id}; 2=${id}`)
    expect(validateCustomSketch(result.cards[0].exampleAddition?.sketch)).not.toBeNull()
    expect(result.cards[0].exampleAddition.requires).toBeTruthy()
  },
)

test('two subjects receive relevant techniques within a bounded, deduplicated planning payload', () => {
  const result = retrieveDrawingKnowledge(observe([
    { id: 'cat', subject: 'cat', family: 'animal' },
    { id: 'guitar', subject: 'guitar', family: 'object' },
  ]))
  expect(result.techniques?.map(t => t.id)).toEqual(['stroke-economy', 'connected-curve', 'parallel-detail'])
  expect(new Set(result.techniques.map(t => t.id)).size).toBe(result.techniques.length)
  const prompt = knowledgePlanningPrompt(context, result)
  // Inspect the payload actually delivered to the planner, not the source text.
  const payload = JSON.parse(prompt.split('RETRIEVED KNOWLEDGE (data): ')[1].split('\nINK ANCHORS')[0])
  expect(payload.techniques.map(t => t.id)).toEqual(['stroke-economy', 'connected-curve', 'parallel-detail'])
  expect(JSON.stringify(payload.techniques).length).toBeLessThan(6000)
})

test('unlisted subjects receive structural technique guidance without unrelated stock images', () => {
  const result = retrieveDrawingKnowledge(observe([{ subject: 'a homemade robot', family: 'character' }]))
  expect(result.cards[0].id).toBe('family:character')
  expect(result.referenceSheet).toBeUndefined()
  expect(result.techniques?.map(t => t.id)).toContain('inset-detail')
})

test('uncertain identity falls back to open mark development without leaking animal techniques', () => {
  const result = retrieveDrawingKnowledge(observe([{ id: 'cat', subject: 'maybe cat', family: 'animal', confidence: .2 }]))
  expect(result.cards.map(c => c.id)).toEqual(['abstract'])
  expect(result.referenceSheet).toBeUndefined()
  expect(result.techniques?.map(t => t.id)).toEqual(['stroke-economy', 'open-continuation'])
})

test('technique examples are bounded editable strokes and sources resolve to attributed projects', () => {
  const { techniques, techniqueSources } = drawingKnowledgeLibrary()
  expect(Array.isArray(techniques)).toBe(true)
  for (const technique of techniques ?? []) {
    expect(validateCustomSketch(technique.exampleAddition.sketch)).not.toBeNull()
    expect(technique.exampleAddition.sketch.paths.length).toBeLessThanOrEqual(4)
    expect(technique.steps.length).toBeGreaterThan(0)
    expect(technique.avoid).toBeTruthy()
    for (const id of technique.sourceIds) {
      const source = techniqueSources.find(s => s.id === id)
      expect(source?.url).toMatch(/^https:\/\/github.com\//)
    }
  }
  for (const card of drawingKnowledgeLibrary().cards) {
    for (const id of card.techniqueIds ?? []) expect(techniques.some(t => t.id === id)).toBe(true)
  }
})
