import { expect, test } from 'vitest'
import { projectionTransform } from '@/features/child/companion/projectionTransform'
import type { DrawingProposal } from '@/features/child/companion/proposals'

const p: DrawingProposal = {template:'cloud',x:.2,y:.3,width:.2,height:.1,rotation:0,color:'#4aa5d8',strokeWidth:4}
test.each([.6,1,2])('drag clamps the entire group to the paper at aspect %s', aspect => {
  const second={...p,x:.6,y:.5}
  const patch=projectionTransform([p,second],{dx:20,dy:20},aspect)!
  expect(patch.x!+.6).toBeLessThanOrEqual(.975000001)
  expect(patch.y!+.3).toBeLessThanOrEqual(.975000001)
  expect(patch.width).toBe(p.width)
  expect(projectionTransform([p],{dx:-20,dy:-20},aspect)).toMatchObject({x:.025,y:.025})
})
test('resize keeps aspect and limits the largest member without losing the group',()=>{
  const patch=projectionTransform([p,{...p,x:.5,width:.3}],{scale:20},1.5)!
  expect(patch.width! / patch.height!).toBeCloseTo(p.width/p.height)
  expect(patch.width! / p.width * .3).toBeLessThanOrEqual(.45)
  expect(patch.width).toBeGreaterThan(p.width)
  const tiny=projectionTransform([p],{scale:-3},1.5)!
  expect(tiny.height).toBeGreaterThanOrEqual(.025)
})
test('invalid input never emits NaN; rotated groups remain inside the paper',()=>{
  expect(projectionTransform([p],{dx:NaN},1)).toBeNull()
  expect(projectionTransform([],{},1)).toBeNull()
  const moved=projectionTransform([{...p,rotation:90}],{dx:10},1.5)!
  expect(moved.x!+p.width/2+p.height/1.5/2).toBeLessThanOrEqual(.97500001)
})
