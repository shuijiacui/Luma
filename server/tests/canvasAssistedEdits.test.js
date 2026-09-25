import { expect, test } from 'vitest'
import { validateCanvasDocument, canvasProvenance } from '../src/services/canvasDocument.js'
import { resolveDrawingOperations } from '../../shared/niloCanvasEdits.mjs'

const stroke = { owner: 'child', type: 'stroke', groupId: 'sun', points: [{ x: .2, y: .2 }, { x: .3, y: .3 }], color: '#ff0000', size: 8, brushKind: 'round', eraser: false, referenceWidth: 1000, referenceHeight: 600 }
const assist = { owner: 'nilo', type: 'assist', groupId: 'transaction', targetIds: ['sun'], actions: [{ type: 'color', value: '#0000ff' }, { type: 'scale', factor: .8 }, { type: 'place', x: .6, y: .6 }] }
const document = { version: 1, baseSource: 'child', coCreated: true, operations: [stroke, assist] }

test('assisted version-1 documents round-trip and retain original child ink', () => {
  const restored = JSON.parse(JSON.stringify(document))
  expect(validateCanvasDocument(restored)).toBe(true)
  expect(restored.operations[0]).toEqual(stroke)
  expect(resolveDrawingOperations(restored)[0]).toMatchObject({ owner: 'child', color: '#0000ff' })
  expect(canvasProvenance(restored)).toBe('co-created')
  expect(validateCanvasDocument({ ...document, operations: [stroke] })).toBe(true)
})

test.each([
  { ...assist, owner: 'child' }, { ...assist, targetIds: ['missing'] }, { ...assist, targetIds: ['sun', 'sun'] },
  { ...assist, actions: [{ type: 'delete' }] }, { ...assist, actions: [{ type: 'move', dx: -.5, dy: 0 }] },
  { ...assist, actions: [{ type: 'scale', factor: 100 }] }, { ...assist, actions: [{ type: 'color', value: '#0000ff', targetId: 'other' }] },
  { ...assist, groupId: 'sun' },
])('rejects invalid transaction %# without accepting a partial edit', invalid => {
  expect(validateCanvasDocument({ ...document, operations: [stroke, invalid] })).toBe(false)
})

test('cannot edit erased-only identities or identities hidden by clear', () => {
  expect(validateCanvasDocument({ ...document, operations: [{ ...stroke, eraser: true }, assist] })).toBe(false)
  expect(validateCanvasDocument({ ...document, operations: [stroke, { type: 'clear', owner: 'child', groupId: 'clear' }, assist] })).toBe(false)
  expect(validateCanvasDocument({ ...document, operations: [stroke, assist, { ...assist }] })).toBe(false)
})

test('guidance metadata is bounded and never accepted as automatic self-drawn evidence', () => {
  const guided = { ...stroke, guidance: { guideId: 'guide', name: '太阳', subjects: ['太阳'] } }
  expect(validateCanvasDocument({ ...document, guided: true, operations: [guided] })).toBe(true)
  expect(canvasProvenance({ version: 1, baseSource: 'child', guided: true, operations: [] })).toBe('co-created')
  for (const bad of [{ ...guided, guidance: { ...guided.guidance, name: 'x'.repeat(161) } }, { ...guided, eraser: true }, { ...stroke, erasures: [stroke] }]) {
    expect(validateCanvasDocument({ ...document, operations: [bad] })).toBe(false)
  }
})

test('reverted assistance retains history, rejects duplicate or non-sequential reverts, and saves after new edits', () => {
  const revert = { owner: 'nilo', type: 'assist-revert', groupId: 'undo', targetId: 'transaction' }
  const reverted = { ...document, operations: [...document.operations, revert] }
  expect(validateCanvasDocument(reverted)).toBe(true)
  expect(resolveDrawingOperations(reverted)).toEqual([stroke])
  expect(validateCanvasDocument({ ...reverted, operations: [...reverted.operations, { ...revert, groupId: 'twice' }] })).toBe(false)
  expect(validateCanvasDocument({ ...reverted, operations: [stroke, { ...revert, targetId: 'missing' }] })).toBe(false)
  const second = { ...assist, groupId: 'second', actions: [{ type: 'color', value: '#00ff00' }] }
  expect(validateCanvasDocument({ ...reverted, operations: [...document.operations, second, revert] })).toBe(false)
  expect(validateCanvasDocument({ ...reverted, operations: [...reverted.operations, second] })).toBe(true)
})
