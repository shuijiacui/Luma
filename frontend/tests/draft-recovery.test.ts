import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { clearChildDraft, getChildDraft } from '@/features/child/draft'
import { discardStoredDraft, persistChildDraft, persistChildDraftWithStatus, readStoredDraft } from '@/features/child/draftRecovery'
import { validateTracingGuide } from '@/features/child/companion/tracingGuide'
import type { DrawingProposal } from '@/features/child/companion/proposals'
import { scenePalette } from '../../shared/niloSceneDrawing.mjs'

beforeEach(() => { sessionStorage.clear(); clearChildDraft() })
afterEach(() => vi.restoreAllMocks())
function drawing() {
  const draft = getChildDraft('alice')
  draft.canvas.document = { version:1, baseSource:'child', coCreated:true, operations:[{
    type:'stroke',owner:'nilo',groupId:'group',points:[{x:.2,y:.3}],color:'#20352f',size:8,
    brushKind:'round',eraser:false,referenceWidth:640,referenceHeight:480,
  }] }
  draft.canvas.history = ['data:image/png;base64,duplicate-snapshot']
  draft.bubble = 'private dialogue'
  draft.submission = {image:'private-image',key:'private-key'}
  draft.artworkId = 'work'; draft.artworkRevision = 4
  return draft
}
test('reload recovery preserves editable strokes, authorship, tools and artwork revision without private requests or duplicate rasters', () => {
  const draft = drawing(), document = draft.canvas.document
  expect(persistChildDraft('alice',null,draft)).toBe(true)
  clearChildDraft()
  expect(getChildDraft('alice').canvas.document).toBeUndefined()
  expect(readStoredDraft('alice',null)).toMatchObject({canvas:{document},artworkId:'work',artworkRevision:4,brushKind:'round'})
  const saved = sessionStorage.getItem(sessionStorage.key(0)!)!
  expect(saved).not.toMatch(/private|duplicate-snapshot/)
  expect(readStoredDraft('bob',null)).toBeNull()
  expect(readStoredDraft('alice','different-work')).toBeNull()
})
test('discard only removes the chosen recovery slot and cannot erase saved artwork or another account', () => {
  persistChildDraft('alice',null,drawing()); persistChildDraft('alice','work',drawing()); persistChildDraft('bob',null,drawing())
  expect(discardStoredDraft('alice',null)).toBe(true)
  expect(readStoredDraft('alice',null)).toBeNull()
  expect(readStoredDraft('alice','work')).not.toBeNull()
  expect(readStoredDraft('bob',null)).not.toBeNull()
})
test('quota failure retains the previous recovery and reports failure', () => {
  const draft = drawing()
  persistChildDraft('alice',null,draft)
  vi.spyOn(Storage.prototype,'setItem').mockImplementation(() => { throw new DOMException('full','QuotaExceededError') })
  draft.canvas.document!.operations = []
  draft.canvas.document!.baseImage = 'data:image/png;base64,new-image'
  expect(persistChildDraft('alice',null,draft)).toBe(false)
  expect(readStoredDraft('alice',null)?.canvas.document?.operations).toHaveLength(1)
})
test('corrupt data and unsafe or non-finite document values cannot reach the canvas renderer', () => {
  persistChildDraft('alice',null,drawing())
  const storageKey = sessionStorage.key(0)!, good = sessionStorage.getItem(storageKey)!
  for (const corrupt of ['{bad', JSON.stringify({...JSON.parse(good),version:2}),
    good.replace('"referenceWidth":640','"referenceWidth":0'), good.replace('"x":0.2','"x":null'),
    JSON.stringify({...JSON.parse(good),document:{version:1,baseSource:'unknown',baseImage:'https://external.example/img',operations:[]}})]) {
    sessionStorage.setItem(storageKey,corrupt)
    expect(readStoredDraft('alice',null)).toBeNull()
  }
})


test('a guide-only draft recovers without fabricating ink, and a malformed guide cannot discard child strokes', () => {
  const draft = drawing()
  const document = draft.canvas.document!
  draft.tracingGuide = { aspect: 4 / 3, additions: [], proposal: { template: 'sun', x: .3, y: .3,
    width: .2, height: .2, rotation: 0, color: '#123456', strokeWidth: 4, target: '画纸', relation: '描摹太阳' } }
  document.operations = []
  expect(persistChildDraft('alice', null, draft)).toBe(true)
  expect(readStoredDraft('alice', null)?.tracingGuide).toEqual(draft.tracingGuide)
  expect(readStoredDraft('alice', null)?.canvas.document?.operations).toEqual([])
  const key = sessionStorage.key(0)!, raw = JSON.parse(sessionStorage.getItem(key)!)
  raw.tracingGuide.proposal.width = 10
  sessionStorage.setItem(key, JSON.stringify(raw))
  expect(readStoredDraft('alice', null)?.tracingGuide).toBeUndefined()
  expect(readStoredDraft('alice', null)?.canvas.document).toEqual(document)
})

test('an illustration draft restores its trusted ID and frame separately from the child drawing', () => {
  const draft = drawing()
  draft.tracingGuide = { aspect: 4 / 3, additions: [], proposal: { template: 'illustration', illustrationId: 'illustration-reading-child', subject: '读书的孩子', x: .2, y: .2,
    width: .25, height: .3, rotation: 12, color: '#123456', strokeWidth: 4, target: '画纸', relation: '观察读书的孩子' } }
  expect(persistChildDraft('alice', null, draft)).toBe(true)
  expect(readStoredDraft('alice', null)?.tracingGuide).toEqual(draft.tracingGuide)
  const key = sessionStorage.key(0)!, saved = sessionStorage.getItem(key)!
  expect(saved).not.toContain('/nilo-illustrations/')
  const untrusted = JSON.parse(saved)
  untrusted.tracingGuide.proposal.illustrationId = 'https://external.test/img.png'
  sessionStorage.setItem(key, JSON.stringify(untrusted))
  expect(readStoredDraft('alice', null)?.tracingGuide).toBeUndefined()
  expect(readStoredDraft('alice', null)?.canvas.document).toEqual(draft.canvas.document)
})

const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAEAAAAAgCAYAAACinX6EAAAAT0lEQVR4AeXBAQ0AIAzAsDH/ng8uTrL2zMOCAwz7ZMnwB4mTOImTOImTOImTOImTOImTOImTOImTOImTOImTOImTOImTOImTOImTOImTOImTuAtPZgY7mG4ntAAAAABJRU5ErkJggg=='
function generatedGuide(dense = false) {
  const proposal: DrawingProposal = { template: 'generated', subject: '太阳', target: '画纸', relation: '参考底图',
    raster: { version: 1, pngBase64, width: 64, height: 32, projection: dense ? 'dashed' : 'gray',
      ...(dense ? { paths: [Array.from({ length: 13000 }, (): [number, number] => [.12345, .54321])] } : {}) },
    x: .2, y: .2, width: .4, height: .3, rotation: 0, color: '#66729b', strokeWidth: 3 }
  const objects = Array.from({ length: dense ? 8 : 1 }, (_, index) => ({ id: `sun_${index}`, name: '太阳', aliases: [],
    role: 'main' as const, essential: ['太阳轮廓'], render: { kind: 'generated' as const },
    box: { x: proposal.x, y: proposal.y, width: proposal.width, height: proposal.height }, color: proposal.color }))
  return { aspect: 4 / 3, proposal, additions: objects.slice(1).map(() => structuredClone(proposal)),
    scene: { objectIds: objects.map(object => object.id), view: 'outline' as const,
      plan: { version: 1 as const, title: '太阳', summary: '太阳参考底图。', request: '画太阳', objects, palette: { ...scenePalette }, preserve: [] } } }
}
function addChildStroke(draft: ReturnType<typeof drawing>, count = 1) {
  draft.canvas.document!.operations.push({ type: 'stroke', owner: 'child', groupId: 'new-child-stroke',
    points: Array.from({ length: count }, () => ({ x: .1234567, y: .2345678 })), color: '#20352f', size: 8,
    brushKind: 'round', eraser: false, referenceWidth: 640, referenceHeight: 480 })
}

test('an oversized valid generated guide cannot prevent newer child strokes from replacing recovery', () => {
  const draft = drawing()
  expect(persistChildDraft('alice', null, draft)).toBe(true)
  addChildStroke(draft, 50000)
  draft.tracingGuide = generatedGuide(true)
  expect(validateTracingGuide(draft.tracingGuide)).not.toBeNull()
  expect(JSON.stringify({ document: draft.canvas.document, tracingGuide: draft.tracingGuide }).length).toBeGreaterThan(3_000_000)
  expect(persistChildDraftWithStatus('alice', null, draft)).toEqual({ saved: true, guideOmitted: true })
  const recovered = readStoredDraft('alice', null)!
  expect(recovered.canvas.document).toEqual(draft.canvas.document)
  expect(recovered.tracingGuide).toBeUndefined()
  expect(recovered.canvas.document!.operations.at(-1)).toMatchObject({ owner: 'child', groupId: 'new-child-stroke' })
  expect(draft.tracingGuide).toBeDefined()
  expect(sessionStorage.getItem(sessionStorage.key(0)!)!.length).toBeLessThan(3_000_000)
})

test('storage quota retries without the reference, preserves new ink, and normal guides still recover when space returns', () => {
  const draft = drawing()
  persistChildDraft('alice', null, draft)
  addChildStroke(draft)
  draft.tracingGuide = generatedGuide()
  const write = Storage.prototype.setItem
  const limited = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
    if (value.includes('"tracingGuide"')) throw new DOMException('full', 'QuotaExceededError')
    write.call(this, key, value)
  })
  expect(persistChildDraftWithStatus('alice', null, draft)).toEqual({ saved: true, guideOmitted: true })
  expect(limited).toHaveBeenCalledTimes(2)
  expect(readStoredDraft('alice', null)?.canvas.document).toEqual(draft.canvas.document)
  expect(readStoredDraft('alice', null)?.tracingGuide).toBeUndefined()
  limited.mockRestore()
  expect(persistChildDraftWithStatus('alice', null, draft)).toEqual({ saved: true, guideOmitted: false })
  expect(readStoredDraft('alice', null)?.tracingGuide).toEqual(draft.tracingGuide)
  expect(readStoredDraft('alice', null)?.canvas.document).toEqual(draft.canvas.document)
})

test('if document-only storage also fails, the prior recovery survives and failure remains visible', () => {
  const draft = drawing()
  persistChildDraft('alice', null, draft)
  const before = readStoredDraft('alice', null)?.canvas.document
  addChildStroke(draft)
  draft.tracingGuide = generatedGuide()
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('full', 'QuotaExceededError') })
  expect(persistChildDraftWithStatus('alice', null, draft)).toEqual({ saved: false, guideOmitted: false })
  expect(readStoredDraft('alice', null)?.canvas.document).toEqual(before)
})
