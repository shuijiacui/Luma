import { expect, test } from 'vitest'
import { getCompanionScene } from '@/features/child/companionScene'
import type { CanvasDocument, CanvasOperation } from '@/features/child/canvasDocument'

type Stroke = Extract<CanvasOperation, { type: 'stroke' }>
const stroke = (patch: Partial<Stroke> = {}): Stroke => ({ owner: 'child', type: 'stroke', groupId: 'private-group',
  points: [{ x: .2, y: .3 }, { x: .3, y: .4 }], color: '#20352f', size: 8, brushKind: 'round', eraser: false,
  referenceWidth: 100, referenceHeight: 100, ...patch })
const document = (operations: CanvasOperation[]): CanvasDocument => ({ version: 1, baseSource: 'child', operations })

test('scene aggregates confirmed multi-path groups and includes conservative brush bounds', () => {
  const scene = getCompanionScene(document([
    stroke(),
    stroke({ owner: 'nilo', groupId: 'private-ai-group', brushKind: 'star', points: [{ x: .7, y: .8 }] }),
    stroke({ owner: 'nilo', groupId: 'private-ai-group', brushKind: 'star', points: [{ x: .85, y: .8 }] }),
  ]))
  expect(scene.childBounds).toEqual({ x: .15, y: .25, width: .2, height: .2 })
  expect(scene.niloBounds).toEqual({ x: .59, y: .69, width: .37, height: .22 })
  expect(scene.recentContributions).toEqual([
    { owner: 'child', bounds: scene.childBounds, brushKind: 'round', color: '#20352f', strokeCount: 1 },
    { owner: 'nilo', bounds: scene.niloBounds, brushKind: 'star', color: '#20352f', strokeCount: 2 },
  ])
  expect(JSON.stringify(scene)).not.toMatch(/private|groupId|points|referenceWidth/)
})

test('clear resets all scene ownership and groups; erasing is not a new object', () => {
  const scene = getCompanionScene({ ...document([
    stroke({ owner: 'nilo' }),
    { owner: 'child', type: 'clear', groupId: 'clear' },
    stroke({ groupId: 'after-clear', color: '#4aa5d8' }),
    stroke({ groupId: 'eraser', eraser: true, points: [{ x: .9, y: .9 }] }),
  ]), baseImage: 'data:image/png;base64,private-base' })
  expect(scene.niloBounds).toBeNull()
  expect(scene.childBounds).toEqual({ x: .15, y: .25, width: .2, height: .2 })
  expect(scene.recentContributions).toHaveLength(1)
  expect(scene.recentContributions[0].color).toBe('#4aa5d8')
})

test('scene keeps twelve most recent groups but aggregate bounds still cover older confirmed ink', () => {
  const scene = getCompanionScene(document(Array.from({ length: 14 }, (_, index) => stroke({ groupId: `group-${index}`, size: 2,
    points: [{ x: .1 + index * .04, y: .4 }], color: index === 0 ? '#000001' : '#4aa5d8' }))))
  expect(scene.recentContributions).toHaveLength(12)
  expect(scene.recentContributions[0].bounds.x).toBe(.16)
  expect(scene.recentContributions.at(-1)?.bounds.x).toBe(.6)
  expect(scene.childBounds?.x).toBe(.08)
  expect(scene.childBounds?.width).toBe(.56)
  expect(scene.niloBounds).toBeNull()
})

test('unknown base PNGs never fabricate ownership; bounds stay within the canvas and contain no source image', () => {
  expect(getCompanionScene({ ...document([]), baseSource: 'unknown', baseImage: 'data:image/png;base64,legacy-private' }))
    .toEqual({ childBounds: null, niloBounds: null, recentContributions: [] })
  const scene = getCompanionScene(document([stroke({ brushKind: 'marker', size: 32, points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] })]))
  expect(scene.childBounds).toEqual({ x: 0, y: 0, width: 1, height: 1 })
  const knownBase = { ...document([]), baseImage: 'data:image/png;base64,known-child' }
  expect(getCompanionScene(knownBase).childBounds).toEqual({ x: 0, y: 0, width: 1, height: 1 })
  knownBase.operations.push({ type: 'clear', owner: 'child', groupId: 'clear' })
  expect(getCompanionScene(knownBase)).toEqual({ childBounds: null, niloBounds: null, recentContributions: [] })
})
