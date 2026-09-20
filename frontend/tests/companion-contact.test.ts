import { expect, test } from 'vitest'
import { drawingPlanFits, prepareProposal, prepareTurnProposal, projectionFits, validateProposal, type DrawingProposal } from '@/features/child/companion/proposals'
import { projectionFits as serverProjectionFits } from '../../shared/niloCollision.mjs'

const size = { width: 800, height: 800 }
const hat: DrawingProposal = {
  template: 'custom', x: .3, y: .25, width: .3, height: .2, rotation: 0, color: '#234536', strokeWidth: 3,
  target: '人物', subject: '帽子', relation: '帽子的两个底端连接头顶', placement: 'near',
  anchor: { x: .25, y: .4, width: .4, height: .3 },
  sketch: { aspect: 1.5, paths: [[['M', 0, 1], ['L', .5, 0], ['L', 1, 1]]] },
  contact: { kind: 'points', points: [{ x: .3, y: .45 }, { x: .6, y: .45 }] },
}
function canvas() {
  const grid = Array<number>(256 * 256).fill(0)
  for (let x = 64; x <= 166; x++) grid[Math.floor(.45 * 256) * 256 + x] = 1
  return grid
}

test('contact survives client validation as a deep copy and freezes reviewed geometry', () => {
  const validated = validateProposal(hat)!
  expect(validated.contact).toEqual(hat.contact)
  expect(validated.contact).not.toBe(hat.contact)
  expect(validated.contact?.points[0]).not.toBe(hat.contact?.points[0])
  expect(prepareProposal(hat, canvas(), 1, size)).toEqual(hat)
  expect(prepareTurnProposal(hat, canvas(), 1, size)).toEqual(hat)
  expect(drawingPlanFits([hat], canvas(), 1, size)).toBe(true)
  const detached = { ...hat, y: hat.y - .02 }
  expect(prepareProposal(detached, canvas(), 1, size)).toBeNull()
  expect(prepareTurnProposal(detached, canvas(), 1, size)).toBeNull()
})

test('browser and server share exact contact collision decisions, including unrelated ink', () => {
  for (const grid of [canvas(), Array<number>(256 * 256).fill(0), Array<number>(256 * 256).fill(1)]) {
    expect(projectionFits(hat, grid, 1, size)).toBe(serverProjectionFits(hat, grid, 1, size))
  }
  const protectedInk = canvas()
  for (let y = 64; y < 112; y++) protectedInk[y * 256 + 113] = 1
  expect(projectionFits(hat, protectedInk, 1, size)).toBe(false)
  expect(prepareTurnProposal(hat, protectedInk, 1, size)).toBeNull()
})

test('client rejects contact permissions that escape the target or add an arbitrary radius', () => {
  expect(validateProposal({ ...hat, contact: { ...hat.contact, radius: .4 } })).toBeNull()
  expect(validateProposal({ ...hat, attachment: { x: .3, y: .45 } })).toBeNull()
  expect(validateProposal({ ...hat, anchor: undefined })).toBeNull()
  expect(validateProposal({ ...hat, rotation: 1 })).toBeNull()
  expect(validateProposal({ ...hat, contact: { kind: 'points', points: [{ x: .1, y: .1 }, { x: .6, y: .45 }] } })).toBeNull()
})
