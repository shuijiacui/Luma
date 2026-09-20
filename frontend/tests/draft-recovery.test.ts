import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { clearChildDraft, getChildDraft } from '@/features/child/draft'
import { discardStoredDraft, persistChildDraft, readStoredDraft } from '@/features/child/draftRecovery'

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
