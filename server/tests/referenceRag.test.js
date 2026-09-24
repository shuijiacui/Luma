import { describe, expect, it } from 'vitest'
import { buildReferenceFilterPrompt, referenceRagReady, validateReferenceFilter } from '../src/services/referenceRag.js'

const retrieved = [{
  chunkId: 'li2011-p7-0', sourceId: 'li2011', sourceFile: 'Li2011-KHTP-35features.pdf',
  sourcePage: 7, sourceSha256: 'a'.repeat(64), text: '研究方法与样本说明', role: 'reference_only',
}]

describe('literature retrieval boundaries', () => {
  it('stays disabled until explicitly enabled with an interpreter, index and embedding key', () => {
    expect(referenceRagReady({}, () => true)).toBe(false)
    expect(referenceRagReady({ RAG_ENABLED: '1' }, () => true)).toBe(false)
    expect(referenceRagReady({ RAG_ENABLED: '1', RAG_EMBED_API_KEY: 'configured' }, () => false)).toBe(false)
    expect(referenceRagReady({ RAG_ENABLED: '1', RAG_EMBED_API_KEY: 'configured' }, () => true)).toBe(true)
  })

  it('binds report text to a real retrieved chunk and derives the PDF page from retrieval', () => {
    const output = validateReferenceFilter({ items: [{ chunkId: retrieved[0].chunkId,
      sourceFile: 'invented.pdf', sourcePage: 999, text: '研究对象有限。', limitation: '不能推断单个孩子。' }] }, retrieved)
    expect(output).toEqual([{ chunkId: retrieved[0].chunkId, sourceId: 'li2011',
      sourceFile: retrieved[0].sourceFile, sourcePage: 7, sourceSha256: retrieved[0].sourceSha256,
      text: '研究对象有限。', limitation: '不能推断单个孩子。', role: 'reference_only' }])
    expect(buildReferenceFilterPrompt('研究局限', retrieved)).toContain('chunkId')
  })

  it('rejects invented or duplicate chunks and diagnostic claims', () => {
    expect(validateReferenceFilter({ items: [{ chunkId: 'other', text: '背景', limitation: '局限' }] }, retrieved)).toBeNull()
    expect(validateReferenceFilter({ items: [
      { chunkId: retrieved[0].chunkId, text: '背景', limitation: '局限' },
      { chunkId: retrieved[0].chunkId, text: '背景', limitation: '局限' },
    ] }, retrieved)).toBeNull()
    expect(validateReferenceFilter({ items: [{ chunkId: retrieved[0].chunkId,
      text: '可以诊断孩子', limitation: '样本有限' }] }, retrieved)).toBeNull()
  })
})
