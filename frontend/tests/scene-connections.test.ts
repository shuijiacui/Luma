import { expect, test } from 'vitest'
import { syncSceneGuide, validateSceneGuide, type SceneGuide } from '@/features/child/companion/sceneWorkflow'
import type { DrawingProposal } from '@/features/child/companion/proposals'
import { compileSceneObject, scenePalette } from '../../shared/niloSceneDrawing.mjs'

const castle = { id: 'castle', name: '城堡', aliases: ['城堡'], role: 'main' as const, essential: ['塔楼'], render: { kind: 'compose' as const, primitive: 'castle' as const, parameters: {} }, box: { x: .3, y: .2, width: .3, height: .3 }, color: '#66729b' }
const path = { ...castle, id: 'path', name: '小路', role: 'support' as const, render: { kind: 'compose' as const, primitive: 'path' as const, parameters: {} }, box: { x: .3, y: .5, width: .3, height: .3 }, connectTo: 'castle' }
const scene: SceneGuide = { plan: { version: 1, title: '城堡小路', summary: '小路通向城堡', request: '画城堡和小路', palette: { ...scenePalette }, objects: [castle, path], preserve: [] }, objectIds: ['castle', 'path'], view: 'color' }
const proposals: DrawingProposal[] = scene.plan.objects.map(object => ({ ...object.box, template: 'custom', subject: object.name, color: object.color, target: 'whole picture', relation: '小路通向城堡', rotation: 0, strokeWidth: 3, sketch: compileSceneObject(object)!.sketch }))

test('stores actual rendered boxes with declared connections and restores the same complete guide', () => {
  const fitted = proposals.map(p => ({ ...p, width: p.width - .01 }))
  const synced = syncSceneGuide(scene, fitted, scene.objectIds, true)
  expect(synced.plan.objects[1].connectTo).toBe('castle')
  expect(synced.plan.objects[0].box.width).toBe(fitted[0].width)
  expect(validateSceneGuide(JSON.parse(JSON.stringify(synced)), fitted)).toEqual(synced)
})

test('recoloring retains a connection while moving or deleting its destination detaches it', () => {
  const recolored = syncSceneGuide(scene, proposals.map(p => ({ ...p, color: '#9955bb' })))
  expect(recolored.plan.objects[1].connectTo).toBe('castle')
  const moved = syncSceneGuide(scene, [{ ...proposals[0], x: .2 }, proposals[1]])
  expect(moved.plan.objects[1]).not.toHaveProperty('connectTo')
  expect(moved.plan.objects[1].box).toEqual(path.box)
  const deleted = syncSceneGuide(scene, [proposals[1]], ['path'])
  expect(deleted.plan.objects[0]).not.toHaveProperty('connectTo')
  expect(deleted.plan.objects[0].role).toBe('main')
  expect(validateSceneGuide(deleted, [proposals[1]])).not.toBeNull()
})
