import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { PNG } from 'pngjs'
import { drawingIllustrations, getDrawingIllustration, illustrationsForDetail, preferredIllustrationDetail } from '../../shared/niloIllustrations.mjs'
import { getMaterialCuration, setMaterialCuration } from '../../shared/niloCuration.mjs'
import { planIllustrationDrawing } from '../src/services/niloIllustrationDrawing.js'
import { generateCreativeTurn } from '../src/services/niloCreativeTurn.js'
import { validateProposal } from '../src/services/niloDialogue.js'

const originalCuration = getMaterialCuration()
const school = getDrawingIllustration('illustration-medium-school')
const beginner = { ...school, id: 'illustration-test-beginner-school', difficulty: 'beginner', detail: 'simple', minPixels: 160 }
const context = { tracingGuide: true, requestDrawing: true, utterance: '画一所学校', canvasAspect: 1.5,
  canvasSize: { width: 900, height: 600 }, locale: 'zh', drawingStyle: { color: '#36554b', brushSize: 4 } }
const canvas = new PNG({ width: 900, height: 600 }); canvas.data.fill(255)
const imageBase64 = PNG.sync.write(canvas).toString('base64')
beforeEach(() => {
  drawingIllustrations.push(beginner)
  // Isolate this test fixture from new library batches registered in parallel.
  setMaterialCuration({ version: 1, decisions: Object.fromEntries(drawingIllustrations
    .filter(item => item.subject === 'school' && ![school.id, 'illustration-school', beginner.id].includes(item.id)).map(item => [item.id, 'reject'])) })
})
afterEach(() => {
  drawingIllustrations.splice(drawingIllustrations.indexOf(beginner), 1)
  setMaterialCuration(originalCuration)
})

describe('beginner PNG selection with honest availability fallback', () => {
  test.each(['画一所学校', '画简单的学校', 'draw a simple school'])('a named request %s selects an available beginner PNG', utterance => {
    const result = planIllustrationDrawing({ ...context, utterance })
    expect(result.proposal.illustrationId).toBe(beginner.id)
    expect(result.proposal.sketch).toBeUndefined()
  })

  test('simplifying a current reference keeps its frame and uses the genuinely simpler image', () => {
    const currentProposal = { template: 'illustration', illustrationId: 'illustration-school', subject: '学校',
      x: .3, y: .2, width: .3, height: .45, rotation: 5, color: '#36554b', strokeWidth: 4 }
    const result = planIllustrationDrawing({ ...context, utterance: '简单一点', currentProposal })
    expect(result.proposal.illustrationId).toBe(beginner.id)
    for (const key of ['x', 'y', 'width', 'height', 'rotation']) expect(result.proposal[key]).toBe(currentProposal[key])
  })

  test('rejecting the beginner falls back to an eligible same-subject medium, never archived SVG', () => {
    setMaterialCuration({ version: 1, decisions: { ...getMaterialCuration().decisions, [beginner.id]: 'reject' } })
    expect(planIllustrationDrawing({ ...context, utterance: '画简单的学校' }).proposal.illustrationId).toBe(school.id)
    expect(planIllustrationDrawing({ ...context, utterance: '画像真的一样的学校' }).proposal.illustrationId).toBe('illustration-school')
  })

  test('with existing ink and no explicit change request, local selection still defers to the visual planner', () => {
    expect(planIllustrationDrawing({ ...context, scene: { childBounds: { x: .2, y: .2, width: .3, height: .3 } } })).toBeNull()
  })

  test('level filtering does not invent a same-subject beginner or confuse sparse details with low quality', () => {
    expect(preferredIllustrationDetail('简单一点')).toBe('simple')
    const items = [{ subject: 'a', detail: 'simple' }, { subject: 'a', detail: 'moderate' },
      { subject: 'b', detail: 'moderate' }, { subject: 'b', detail: 'rich' }, { subject: 'c', detail: 'rich' }]
    expect(illustrationsForDetail(items, 'simple')).toEqual([items[0], items[2]])
    expect(illustrationsForDetail(items, 'rich')).toEqual([items[1], items[3], items[4]])
    expect(illustrationsForDetail(items)).toEqual(items)
  })

  test('creative planning advertises/accepts beginner images on blank canvas, but existing drawing can use medium', async () => {
    async function run(id, observed = false) {
      const call = vi.fn().mockResolvedValue({ illustrationId: id, subject: '学校', relationship: '故事里的学校', at: [.5, .5], scale: .6 })
      const result = await generateCreativeTurn({ imageBase64, context: { ...context, utterance: '轮到你了' },
        knowledge: { observation: { subjects: observed ? [{ subject: 'school' }] : [] }, cards: [] },
        call, opts: { signal: new AbortController().signal }, validateProposal })
      return { result, call }
    }
    const initial = await run(beginner.id)
    expect(initial.result.proposal?.illustrationId).toBe(beginner.id)
    expect(initial.call.mock.calls[0][0]).toContain('difficulty=beginner/detail=simple')
    expect((await run(school.id)).result.proposal).toBeUndefined()
    expect((await run(school.id, true)).result.proposal?.illustrationId).toBe(school.id)
  })
})

// One-object language is accepted without swallowing a more specific subject.
test.each([['画一只小熊猫','redpanda'],['画一只小猫','cat'],['画一朵牡丹','peony'],['draw a red panda please','redpanda']])('named PNG request preserves the exact subject: %s',(utterance,subject)=>{
  expect(planIllustrationDrawing({...context,utterance}).proposal.illustrationId).toBe(`illustration-library-${subject}-beginner-01`)
})
test.each(['画两只小猫','画半个小猫','画一只小猫和一只小狗','画一只长翅膀的小猫'])('compound or partial requests remain with the visual planner: %s',utterance=>{
  expect(planIllustrationDrawing({...context,utterance})).toBeNull()
})
