import { expect, test, vi } from 'vitest'
import { getDrawingIllustration } from '../../shared/niloIllustrations.mjs'
import { scenePalette } from '../../shared/niloSceneDrawing.mjs'
import { getMaterialGeometry } from '../src/services/niloMaterialGeometry.js'
import { canonicalIllustrationCaptionName, sceneMaterialStyleIssues } from '../src/services/niloSceneMaterials.js'
import { generateNiloScene } from '../src/services/niloScene.js'

const profile = { style: 'storybook', detail: 'simple' }
const object = (subject, name, essential = ['完整轮廓']) => ({ id: `${subject}_1`, name, aliases: [], role: 'main', essential,
  render: { kind: 'illustration', illustrationId: `illustration-library-${subject}-beginner-01` },
  box: { x: .2, y: .2, width: .4, height: .4 }, color: '#66729b' })
const plan = item => ({ version: 1, title: '小草', summary: '草丛在这里。', request: '画三片小草', palette: { ...scenePalette }, objects: [item], preserve: [] })
const input = () => ({ stage: 'plan', utterance: '画三片小草', context: { canvasAspect: 1.4, requestScope: 'object' } })

test('an exact authoritative caption of the selected ID can identify its canonical material', () => {
  const grass = object('grass', '三片小草', ['简单的草丛线条'])
  expect(getDrawingIllustration(grass.render.illustrationId).label).toBe(grass.name)
  expect(canonicalIllustrationCaptionName(grass)).toBe('草丛')
  expect(sceneMaterialStyleIssues({ objects: [grass] }, profile)).toEqual([])
})

test.each(['flower', 'icecream', 'leaf'])('another ID cannot claim the grass caption: %s', subject => {
  const counterfeit = object(subject, '三片小草')
  expect(canonicalIllustrationCaptionName(counterfeit)).toBeNull()
  expect(sceneMaterialStyleIssues({ objects: [counterfeit] }, profile).join(' ')).toContain('not 三片小草')
})

test('caption matching is exact and cannot confer an unregistered meaning or a copied partial caption', () => {
  for (const name of ['三片小草围成的城堡', '三片', '小草', '三片小草 ', '能走路的三片小草']) {
    expect(canonicalIllustrationCaptionName(object('grass', name))).toBeNull()
  }
  const lollipop = object('icecream', '棒棒糖', ['圆形糖果头', '细长棍子'])
  expect(canonicalIllustrationCaptionName(lollipop)).toBeNull()
  expect(sceneMaterialStyleIssues({ objects: [lollipop] }, profile).join(' ')).toContain('not 棒棒糖')
})

test('audited visible captions override incorrect legacy labels for this identity exception', () => {
  const id = 'illustration-library-boat-beginner-01'
  const actualPose = getMaterialGeometry(id).actualPose, legacy = getDrawingIllustration(id).label
  expect(actualPose).not.toBe(legacy)
  expect(canonicalIllustrationCaptionName(object('boat', actualPose))).toBe(getDrawingIllustration(id).name)
  expect(canonicalIllustrationCaptionName(object('boat', legacy))).toBeNull()
})

test('an exact caption never suppresses a contradictory requested open/closed pose', () => {
  const material = getDrawingIllustration('illustration-library-book-beginner-01')
  expect(material.label).toContain('合上')
  const contradictory = object('book', material.label, ['打开的书页'])
  expect(canonicalIllustrationCaptionName(contradictory)).toBe(material.name)
  expect(sceneMaterialStyleIssues({ objects: [contradictory] }, profile).join(' ')).toContain('contradicts the requested open/closed state')
})

test('planning canonicalizes the exact caption before compilation without changing its required features', async () => {
  const grass = object('grass', '三片小草', ['简单的草丛线条']), chatText = vi.fn(async () => ({ plan: plan(grass) }))
  const result = await generateNiloScene(input(), { chatText })
  expect(result.status).toBe('proposed')
  expect(chatText).toHaveBeenCalledOnce()
  expect(result.plan.objects[0]).toMatchObject({ name: '草丛', aliases: ['三片小草'], essential: grass.essential, render: grass.render })
  expect(grass.name).toBe('三片小草')
})

test('planning does not canonicalize away an explicit contradictory pose', async () => {
  const material = getDrawingIllustration('illustration-library-book-beginner-01')
  const book = object('book', material.label, ['打开的书页']), diagnostics = []
  const result = await generateNiloScene({ ...input(), utterance: '画一本打开的书' }, {
    chatText: async () => ({ plan: { ...plan(book), request: '画一本打开的书', summary: '书页摊开。' } }),
    onPlanDiagnostics: value => diagnostics.push(value),
  })
  expect(result).toMatchObject({ status: 'unavailable', reason: 'invalid_plan' })
  expect(diagnostics).toHaveLength(2)
  expect(diagnostics.every(item => item.plan.objects[0].name === material.label)).toBe(true)
  expect(diagnostics[0].issues.join(' ')).toContain('contradicts the requested open/closed state')
})
