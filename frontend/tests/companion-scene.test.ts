import { expect, test } from 'vitest'
import { getCompanionScene } from '@/features/child/companionScene'
import type { CanvasDocument, CanvasOperation } from '@/features/child/canvasDocument'
import { isCompositeDrawingRequest, needsSceneIdea } from '@/features/child/companion/sceneWorkflow'

type Stroke = Extract<CanvasOperation, { type: 'stroke' }>
const stroke = (patch: Partial<Stroke> = {}): Stroke => ({ owner: 'child', type: 'stroke', groupId: 'private-group',
  points: [{ x: .2, y: .3 }, { x: .3, y: .4 }], color: '#20352f', size: 8, brushKind: 'round', eraser: false,
  referenceWidth: 100, referenceHeight: 100, ...patch })
const document = (operations: CanvasOperation[]): CanvasDocument => ({ version: 1, baseSource: 'child', operations })

test.each([
  '我想画一个魔法世界', '画一个糖果星球', '我想画住在鲸鱼背上的小镇',
  '画一个安静而神奇的地方', '画一个全是透明蘑菇的国度', '画一片倒着生长的森林',
  '画一个热闹的海底城市', '一片没有人的星系', '糖果星球', '童话故事里的森林',
  '画一个魔法世界，里面的房子会飞', '画一幅勇敢出发去冒险的画', 'draw a world with floating houses',
  '画一个太阳、一只兔子和一座房子', 'create a quiet but surprising world',
  'draw a village on the back of a whale', 'a world made of paper', 'draw a dragon and a rabbit and a tree',
])('open settings and multi-subject arrangements reach general scene planning: %s', utterance => {
  expect(needsSceneIdea(utterance)).toBe(true)
})

test.each([
  '画一个太阳', '在左上角画一个太阳', '我想画一只麒麟', '画一座长着翅膀的城堡',
  '画一只戴着宇航员头盔的兔子', '画一朵会走路的花', '画一本魔法世界的故事书',
  '画一只森林里的猫', '画一个太阳，不要改变世界', '不要画魔法世界',
  '你知道魔法世界吗？', '把小镇移到右边', '删除这个世界', '我今天看了一本故事书',
  '画一只猫在森林里', 'draw a cat in the forest', 'draw a Disney storybook', 'draw a flying castle', 'draw a sun in the top left corner',
  "draw a sun, don't change the world", "don't draw a candy planet", 'move the village',
])('literal objects, editing and dialogue do not acquire unnecessary scene confirmation: %s', utterance => {
  expect(needsSceneIdea(utterance)).toBe(false)
})

test.each(['画一座房子旁边有一棵树', '在房子旁边画一棵树', 'draw a tree next to a house'])('explicit two-object relationships retain direct composition: %s', utterance => {
  expect(needsSceneIdea(utterance)).toBe(false)
  expect(isCompositeDrawingRequest(utterance)).toBe(true)
})

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
