import { expect, test, vi } from 'vitest'
import { createIllustrationTraceLoader, illustrationTracePaths, validateIllustrationTrace, type IllustrationTrace } from '@/features/child/companion/illustrationTracing'
import { validateProposal, type DrawingProposal } from '@/features/child/companion/proposals'

const trace: IllustrationTrace = { version: 1, aspect: 1, paths: [[[0, 0], [.5, 1], [1, 0]]] }
const id = 'illustration-library-boat-beginner-01'
const proposal: DrawingProposal = { template: 'illustration', illustrationId: id, subject: '小船', x: .2, y: .3,
  width: .4, height: .2, rotation: 0, color: '#999999', strokeWidth: 3, target: '小船', relation: '场景中的参考轮廓' }

test('centerline validation accepts finite normalized paths and rejects invalid or excessive geometry', () => {
  expect(validateIllustrationTrace(trace)).toEqual(trace)
  expect(validateIllustrationTrace({ ...trace, projection: 'gray' })).toEqual({ ...trace, projection: 'gray' })
  expect(validateIllustrationTrace({ ...trace, projection: 'dashed' })).toEqual({ ...trace, projection: 'dashed' })
  for (const invalid of [null, {}, { ...trace, version: 2 }, { ...trace, aspect: Infinity }, { ...trace, paths: [] },
    { ...trace, projection: 'original' }, { ...trace, projection: 'https://untrusted.example/image.png' },
    { ...trace, paths: [[[0, 0]]] }, { ...trace, paths: [[[0, 0], [1.01, 0]]] },
    { ...trace, paths: [[[0, 0], [Number.NaN, 0]]] }, { ...trace, paths: [[[0, 0], ['1', 0]]] },
    { ...trace, paths: Array.from({ length: 1501 }, () => [[0, 0], [1, 1]]) },
    { ...trace, paths: [Array.from({ length: 50001 }, () => [0, 0])] },
  ]) expect(validateIllustrationTrace(invalid)).toBeNull()
})

test('only registered IDs load fixed centerline files, sharing in-flight and completed requests', async () => {
  let finish!: (response: Response) => void
  const fetchTrace = vi.fn<typeof fetch>(() => new Promise(resolve => { finish = resolve }))
  const load = createIllustrationTraceLoader(fetchTrace)
  expect(await load('https://untrusted.example/picture.json')).toBeNull()
  expect(await load('../untrusted')).toBeNull()
  expect(fetchTrace).not.toHaveBeenCalled()
  const first = load(id), second = load(id)
  expect(second).toBe(first)
  expect(fetchTrace).toHaveBeenCalledOnce()
  expect(fetchTrace).toHaveBeenCalledWith(`/nilo-tracing/${id}.json`, { cache: 'no-cache' })
  finish({ ok: true, json: async () => trace } as Response)
  expect(await first).toEqual(trace)
  expect(await load(id)).toEqual(trace)
  expect(fetchTrace).toHaveBeenCalledOnce()
})

test('failed or malformed centerlines stay absent and can be retried without a raster fallback', async () => {
  const fetchTrace = vi.fn<typeof fetch>()
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce({ ok: true, json: async () => ({ ...trace, paths: [] }) } as Response)
    .mockResolvedValueOnce({ ok: true, json: async () => trace } as Response)
  const load = createIllustrationTraceLoader(fetchTrace)
  expect(await load(id)).toBeNull()
  expect(await load(id)).toBeNull()
  expect(await load(id)).toEqual(trace)
  expect(fetchTrace).toHaveBeenCalledTimes(3)
})

test('image centerlines preserve contain proportions and rotate using the canvas aspect', () => {
  const diagonal: IllustrationTrace = { version: 1, aspect: 1, paths: [[[0, 0], [1, 1]]] }
  const unrotated = illustrationTracePaths(diagonal, proposal, 2)[0]
  expect(unrotated[0].x).toBeCloseTo(.35)
  expect(unrotated[0].y).toBeCloseTo(.3)
  expect(unrotated[1].x).toBeCloseTo(.45)
  expect(unrotated[1].y).toBeCloseTo(.5)
  const rotated = illustrationTracePaths(diagonal, { ...proposal, rotation: 90 }, 2)[0]
  expect(rotated[0].x).toBeCloseTo(.45)
  expect(rotated[0].y).toBeCloseTo(.3)
  expect(rotated[1].x).toBeCloseTo(.35)
  expect(rotated[1].y).toBeCloseTo(.5)
})

test('an illustration proposal cannot supply a model-controlled image URL or replace its registered ID', () => {
  expect(validateProposal(proposal)).not.toBeNull()
  expect(validateProposal({ ...proposal, imageURL: 'https://untrusted.example/picture.png' })).toBeNull()
  expect(validateProposal({ ...proposal, src: 'https://untrusted.example/picture.png' })).toBeNull()
  expect(validateProposal({ ...proposal, illustrationId: 'https://untrusted.example/picture.png' })).toBeNull()
})
