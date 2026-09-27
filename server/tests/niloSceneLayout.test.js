import { expect, test } from 'vitest'
import { compileSceneObject, sanitizeScenePlan } from '../../shared/niloSceneDrawing.mjs'
import { sampleProposalGeometry } from '../../shared/niloGeometry.mjs'
import { connectScenePaths } from '../src/services/niloSceneLayout.js'
import { validateProposal } from '../src/services/niloDialogue.js'
import tracingBounds from '../../shared/niloIllustrationTracing.json' with { type: 'json' }

const castle = { id: 'castle', name: '城堡', role: 'main', essential: ['城堡'], render: { kind: 'compose', primitive: 'castle' }, box: { x: .3, y: .2, width: .3, height: .3 }, color: '#66729b' }
const path = { ...castle, id: 'path', name: '小路', role: 'support', render: { kind: 'compose', primitive: 'path' }, connectTo: 'castle', box: { x: .1, y: .65, width: .3, height: .3 } }
const plan = { version: 1, title: '城堡小路', summary: '一条通向城堡的小路', request: '画城堡和通向它的小路', objects: [castle, path] }
const rendered = objects => objects.map(object => ({ id: object.id, name: object.name, proposal: { ...object.box, template: 'custom', subject: object.name, color: object.color, target: 'whole picture', relation: '通向城堡的小路', rotation: 0, strokeWidth: 3, sketch: compileSceneObject(object).sketch } }))
function expectConnected(result, aspect) {
  const points = sampleProposalGeometry(result[0].proposal, aspect).flatMap(stroke => stroke.points)
  const starts = sampleProposalGeometry(result[1].proposal, aspect).map(stroke => stroke.points[0])
  expect((starts[0].x + starts[1].x) / 2).toBeCloseTo((Math.min(...points.map(p => p.x)) + Math.max(...points.map(p => p.x))) / 2, 6)
  expect(starts[0].y).toBeCloseTo(Math.max(...points.map(p => p.y)), 6)
  expect(validateProposal(result[1].proposal)).not.toBeNull()
}

test('only paths can connect to an existing non-path object', () => {
  expect(sanitizeScenePlan(plan)?.objects[1].connectTo).toBe('castle')
  for (const objects of [[{ ...castle, connectTo: 'path' }, path], [castle, { ...path, connectTo: 'missing' }], [castle, { ...path, connectTo: 'path' }]]) {
    expect(sanitizeScenePlan({ ...plan, objects })).toBeNull()
  }
})

test.each([.6, 1, 1.4, 1.8])('connects the actual path opening without moving the destination at aspect %s', aspect => {
  const source = rendered(plan.objects), snapshot = structuredClone(source)
  const result = connectScenePaths(plan, source, aspect)
  expectConnected(result, aspect)
  expect(result[0]).toEqual(snapshot[0])
  expect(source).toEqual(snapshot)
})

test('shortens a low path coherently and keeps the destination fixed', () => {
  const low = { ...plan, objects: [{ ...castle, box: { ...castle.box, y: .55 } }, path] }
  const source = rendered(low.objects), result = connectScenePaths(low, source, 1)
  expectConnected(result, 1)
  expect(result[1].proposal.height).toBeLessThan(source[1].proposal.height)
  expect(result[1].proposal.y + result[1].proposal.height).toBeLessThanOrEqual(.985 + 1e-9)
})

test('an undeclared path stays where the child put it', () => {
  const independent = { ...plan, objects: [castle, { ...path, connectTo: undefined }] }, source = rendered(independent.objects)
  expect(connectScenePaths(independent, source)).toEqual(source)
})

test('a PNG connection uses its actual traced contour rather than its white image margin', () => {
  const illustrationId = 'illustration-library-tree-beginner-01'
  const destination = { ...castle, name: '树', render: { kind: 'illustration', illustrationId } }
  const objects = [destination, path], source = [
    { id: 'castle', name: '树', proposal: { ...castle.box, template: 'illustration', illustrationId, subject: '树', target: 'whole picture', relation: '树下的小路', color: '#66729b', strokeWidth: 3, rotation: 0 } },
    rendered([path])[0],
  ]
  const result = connectScenePaths({ ...plan, objects }, source, 1)
  expect(result).not.toBeNull()
  const start = sampleProposalGeometry(result[1].proposal).map(stroke => stroke.points[0])
  expect(start[0].y).toBeCloseTo(castle.box.y + castle.box.height * tracingBounds[illustrationId].bottom, 6)
  expect(result[0]).toEqual(source[0])
})
