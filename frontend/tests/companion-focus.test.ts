import { expect, test } from 'vitest'
import { companionFocusBounds } from '@/features/child/companion/focus'
import type { CompanionScene, CompanionSceneBox } from '@/features/child/companionScene'
const part = (bounds: CompanionSceneBox, owner: 'child' | 'nilo' = 'child') => ({ bounds, owner, brushKind: 'round' as const, color: '#123456', strokeCount: 1 })
const scene = (parts: ReturnType<typeof part>[]): CompanionScene => ({ childBounds: null, niloBounds: null, recentContributions: parts })
test('focus follows the new child subject, not the old subject or Nilo contribution', () => {
  const focus = companionFocusBounds(scene([
    part({x:.05,y:.2,width:.2,height:.3}), part({x:.1,y:.5,width:.05,height:.2},'nilo'),
    part({x:.65,y:.3,width:.15,height:.2}), part({x:.72,y:.24,width:.02,height:.08}),
  ]), 1.5)!
  expect(focus.x).toBeGreaterThan(.5)
  expect(focus.y).toBeLessThan(.24)
  expect(focus.x + focus.width).toBeGreaterThanOrEqual(.8)
  expect(focus.y + focus.height).toBeGreaterThanOrEqual(.5)
})
test.each([.5,1,2.5])('edge detail crop stays in bounds without stretching at aspect %s', aspect => {
  const focus = companionFocusBounds(scene([part({x:.97,y:0,width:.03,height:.04})]), aspect)!
  expect(focus.x).toBeGreaterThanOrEqual(0); expect(focus.y).toBeGreaterThanOrEqual(0)
  expect(focus.x + focus.width).toBeLessThanOrEqual(1)
  expect(focus.y + focus.height).toBeLessThanOrEqual(1)
  expect(focus.width).toBeGreaterThan(.03)
})
test('empty, cleared and whole-page drawings omit redundant crops', () => {
  expect(companionFocusBounds(scene([]), 1)).toBeNull()
  expect(companionFocusBounds(scene([part({x:0,y:0,width:1,height:1})]), 1)).toBeNull()
})
