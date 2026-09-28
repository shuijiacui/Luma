import { afterEach, expect, test, vi } from 'vitest'
import { createSceneRequests, createSceneImageGate, createSceneOwner } from '../src/services/niloSceneRequests.js'

afterEach(() => vi.useRealTimers())
const args = overrides => ({ owner: 'child:one', scopeKey: 'scope_12345', artworkId: 'canvas_12345', requestId: 'request_12345',
  stage: 'render', input: { plan: { title: 'same idea' }, context: { revision: 1 } }, policy: 'version-1', ...overrides })
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }

test('same operation shares in-flight work, then replays an isolated ready result without another image request', async () => {
  const jobs = createSceneRequests(), next = deferred(), generate = vi.fn(() => next.promise)
  const first = jobs.run(args(), generate), second = jobs.run(args(), generate)
  await vi.waitFor(() => expect(generate).toHaveBeenCalledOnce())
  next.resolve({ status: 'ready', objects: [{ id: 'whale' }] })
  const a = await first, b = await second
  a.objects[0].id = 'changed'; expect(b.objects[0].id).toBe('whale')
  expect(await jobs.run(args(), generate)).toEqual(b)
  expect(generate).toHaveBeenCalledOnce()
})

test('operation IDs cannot be reused with different geometry, revision, locale or policy', async () => {
  const jobs = createSceneRequests(), work = vi.fn(async () => ({ status: 'ready' }))
  await jobs.run(args(), work)
  for (const change of [{ input: { plan: { rotation: 180 } } }, { input: { context: { revision: 2 } } }, { input: { locale: 'en' } }, { policy: 'version-2' }]) {
    await expect(jobs.run(args(change), work)).rejects.toMatchObject({ status: 409 })
  }
  expect(work).toHaveBeenCalledOnce()
})

test('children, artwork workspaces and deliberate new variants do not share ready results', async () => {
  const jobs = createSceneRequests(), work = vi.fn(async () => ({ status: 'ready' }))
  for (const change of [{}, { owner: 'child:two' }, { artworkId: 'canvas_67890' }, { scopeKey: 'scope_67890' }, { requestId: 'request_67890' }]) {
    await jobs.run(args(change), work)
  }
  expect(work).toHaveBeenCalledTimes(5)
})

test('one cancellation detaches only that waiter; immediate reconnect reuses still-running work', async () => {
  const jobs = createSceneRequests(), next = deferred(), controller = new AbortController()
  const work = vi.fn(signal => { expect(signal.aborted).toBe(false); return next.promise })
  const first = jobs.run(args({ signal: controller.signal }), work)
  const rejected = expect(first).rejects.toMatchObject({ code: 'scene_cancelled' })
  controller.abort(); await rejected
  const second = jobs.run(args(), work)
  next.resolve({ status: 'ready' })
  expect(await second).toEqual({ status: 'ready' })
  expect(work).toHaveBeenCalledOnce()
})

test('abandoned work aborts after a bounded reconnect grace, and cannot be replayed as a ready success', async () => {
  vi.useFakeTimers()
  const jobs = createSceneRequests(), next = deferred(), controller = new AbortController()
  let jobSignal
  const work = vi.fn(signal => { jobSignal = signal; return next.promise })
  const first = jobs.run(args({ signal: controller.signal }), work)
  await vi.advanceTimersByTimeAsync(0)
  const rejected = expect(first).rejects.toMatchObject({ code: 'scene_cancelled' })
  controller.abort(); await rejected
  await vi.advanceTimersByTimeAsync(1001)
  expect(jobSignal.aborted).toBe(true)
  next.resolve({ status: 'ready' }); await vi.advanceTimersByTimeAsync(0)
  await expect(jobs.run(args(), work)).rejects.toMatchObject({ code: 'scene_not_ready' })
  expect(work).toHaveBeenCalledOnce()
})

test('no additional provider dispatch starts during cancellation grace, but a reconnect can resume it', async () => {
  const jobs = createSceneRequests(), observed = deferred(), start = deferred(), controller = new AbortController(), paid = vi.fn()
  const work = vi.fn(async (_signal, job) => {
    paid('first'); start.resolve(); await observed.promise
    await job.beforeDispatch(_signal, () => paid('second'))
    return { status: 'ready' }
  })
  const first = jobs.run(args({ signal: controller.signal }), work)
  await start.promise
  const rejected = expect(first).rejects.toMatchObject({ code: 'scene_cancelled' })
  controller.abort(); await rejected; observed.resolve()
  await Promise.resolve(); await Promise.resolve()
  expect(paid).toHaveBeenCalledTimes(1)
  expect(await jobs.run(args(), work)).toEqual({ status: 'ready' })
  expect(paid).toHaveBeenCalledTimes(2)
  expect(work).toHaveBeenCalledOnce()
})

test('reconnect followed by immediate cancellation cannot dispatch the next paid stage', async () => {
  vi.useFakeTimers()
  const jobs = createSceneRequests(), started = deferred(), firstDone = deferred(), paid = vi.fn()
  const a = new AbortController(), b = new AbortController()
  const work = vi.fn(async (signal, job) => {
    paid('first'); started.resolve(); await firstDone.promise
    await job.beforeDispatch(signal, () => paid('second'))
    return { status: 'ready' }
  })
  const first = jobs.run(args({ signal: a.signal }), work)
  const rejectedA = expect(first).rejects.toMatchObject({ code: 'scene_cancelled' })
  await started.promise; a.abort(); await rejectedA; firstDone.resolve()
  await Promise.resolve(); await Promise.resolve()
  const second = jobs.run(args({ signal: b.signal }), work)
  const rejectedB = expect(second).rejects.toMatchObject({ code: 'scene_cancelled' })
  b.abort(); await rejectedB
  await vi.advanceTimersByTimeAsync(1001)
  expect(paid).toHaveBeenCalledTimes(1)
  expect(jobs.stats().pending).toBe(0)
})

test('failure cooldown prevents an immediate paid retry and never returns a rejected candidate as ready', async () => {
  vi.useFakeTimers()
  const jobs = createSceneRequests(), work = vi.fn().mockResolvedValueOnce({ status: 'unavailable', reason: 'visual_mismatch' }).mockResolvedValue({ status: 'ready' })
  expect((await jobs.run(args(), work)).status).toBe('unavailable')
  await expect(jobs.run(args(), work)).rejects.toMatchObject({ code: 'scene_not_ready' })
  await vi.advanceTimersByTimeAsync(5001)
  expect((await jobs.run(args(), work)).status).toBe('ready')
  expect(work).toHaveBeenCalledTimes(2)
})

test('cached bytes and entries are bounded, and idle private results expire without another request', async () => {
  vi.useFakeTimers()
  const jobs = createSceneRequests({ ttlMs: 100, maxEntries: 2, maxBytes: 90 })
  const work = vi.fn(async () => ({ status: 'ready', text: 'x'.repeat(25) }))
  for (let i = 0; i < 4; i++) await jobs.run(args({ requestId: `request_${i}0000` }), work)
  expect(jobs.stats().bytes).toBeLessThanOrEqual(90)
  expect(jobs.stats().entries).toBeLessThanOrEqual(2)
  await vi.advanceTimersByTimeAsync(101)
  expect(jobs.stats()).toEqual({ entries: 0, bytes: 0, pending: 0 })
})

test('server-signed guest sessions differ on the same IP; forged cookies and guest-child labels do not select another session', () => {
  const owner = createSceneOwner(), req = { headers: {}, ip: 'same-ip', body: { ownerId: 'guest-child' } }
  const cookies = [], res = { append: (_name, value) => cookies.push(value) }
  const first = owner(req, res), second = owner(req, res)
  expect(first).not.toBe(second)
  expect(owner({ ...req, headers: { cookie: cookies[0].split(';')[0] } }, res)).toBe(first)
  expect(owner({ ...req, headers: { cookie: cookies[0].split(';')[0].replace(/\.[a-f0-9]+$/, '.' + '0'.repeat(64)) } }, res)).not.toBe(first)
  expect(owner({ ...req, auth: { role: 'child', accountId: 'trusted-id' } }, res)).toBe('child:trusted-id')
  expect(cookies[0]).toContain('HttpOnly; SameSite=Strict')
})

test('a cancelled but unsettled provider still holds its concurrency permit and consumes an actual attempt', async () => {
  const gate = createSceneImageGate({ globalConcurrency: 1, maxAttempts: 1 }), next = deferred(), signal = new AbortController()
  const first = gate('child:one', signal.signal, () => next.promise)
  signal.abort()
  await expect(gate('child:two', undefined, vi.fn())).rejects.toMatchObject({ sceneReason: 'image_temporarily_unavailable' })
  next.resolve('image'); expect(await first).toBe('image')
  await expect(gate('child:one', undefined, vi.fn())).rejects.toMatchObject({ sceneReason: 'image_temporarily_unavailable' })
  expect(await gate('child:two', undefined, async () => 'other')).toBe('other')
})

test('failed calls count toward the internal window; rotating operation IDs cannot refund them', async () => {
  let time = 0
  const gate = createSceneImageGate({ maxAttempts: 1, windowMs: 100, now: () => time })
  await expect(gate('owner', undefined, async () => { throw Error('network') })).rejects.toThrow('network')
  await expect(gate('owner', undefined, vi.fn())).rejects.toMatchObject({ sceneReason: 'image_temporarily_unavailable' })
  time = 101
  expect(await gate('owner', undefined, async () => 'okay')).toBe('okay')
})
