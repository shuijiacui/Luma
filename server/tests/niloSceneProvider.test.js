import { afterEach, expect, test, vi } from 'vitest'
import { callSceneProvider } from '../src/services/niloSceneProvider.js'
import { sceneTextOptions, sceneVisionOptions } from '../src/services/niloSceneModels.js'

afterEach(() => vi.useRealTimers())

test.each([429, 502, 503, 'network'])('a transient %s retries once inside the original deadline', async status => {
  vi.useFakeTimers()
  const error = status === 'network' ? new TypeError('fetch failed') : Object.assign(new Error('private payload'), { status })
  const invoke = vi.fn().mockRejectedValueOnce(error).mockResolvedValue({ accepted: true }), onRetry = vi.fn()
  const pending = callSceneProvider(invoke, { deadline: Date.now() + 5000, onRetry })
  await vi.advanceTimersByTimeAsync(400)
  expect(await pending).toEqual({ accepted: true })
  expect(invoke).toHaveBeenCalledTimes(2); expect(onRetry).toHaveBeenCalledOnce()
})

test.each([400, 401, 403, 422, undefined])('a deterministic status %s never retries', async status => {
  const error = Object.assign(new Error('invalid output'), { status }), invoke = vi.fn().mockRejectedValue(error)
  await expect(callSceneProvider(invoke, { deadline: Date.now() + 5000 })).rejects.toBe(error)
  expect(invoke).toHaveBeenCalledOnce()
})

test('repeated network failure has a strict two-call ceiling', async () => {
  vi.useFakeTimers()
  const invoke = vi.fn().mockRejectedValue(new TypeError('fetch failed'))
  const pending = expect(callSceneProvider(invoke, { deadline: Date.now() + 5000 })).rejects.toThrow('fetch failed')
  await vi.advanceTimersByTimeAsync(400); await pending
  expect(invoke).toHaveBeenCalledTimes(2)
})

test('cancellation during backoff and insufficient remaining time never start another call', async () => {
  vi.useFakeTimers()
  const invoke = vi.fn().mockRejectedValue(new TypeError('fetch failed')), controller = new AbortController()
  const pending = expect(callSceneProvider(invoke, { signal: controller.signal, deadline: Date.now() + 5000 })).rejects.toThrow('cancelled')
  await vi.advanceTimersByTimeAsync(100); controller.abort(new Error('cancelled')); await pending
  await vi.advanceTimersByTimeAsync(1000); expect(invoke).toHaveBeenCalledOnce()
  await expect(callSceneProvider(invoke, { deadline: Date.now() + 1000 })).rejects.toThrow('fetch failed')
  expect(invoke).toHaveBeenCalledTimes(2)
})

test('only semantic extraction uses the configured fast model; planning and global fallback keep their own model', () => {
  const config = { textModel: 'scene-planner', understandingModel: 'extractor' }
  expect(sceneTextOptions({ kind: 'nilo_scene_understand' }, config).model).toBe('extractor')
  expect(sceneTextOptions({ kind: 'nilo_scene_plan' }, config)).not.toHaveProperty('model')
  expect(sceneTextOptions({ kind: 'nilo_scene_understand' }, { textModel: 'global' })).not.toHaveProperty('model')
})

test('only neutral observation uses the fast vision model; acceptance stays with the stronger configured reviewer', () => {
  const config = { visionModel: 'reviewer', observationModel: 'observer' }
  expect(sceneVisionOptions({ kind: 'nilo_scene_observe' }, config).model).toBe('observer')
  expect(sceneVisionOptions({ kind: 'nilo_scene_quality' }, config)).not.toHaveProperty('model')
  expect(sceneVisionOptions({ kind: 'nilo_scene_observe' }, { visionModel: 'global' })).not.toHaveProperty('model')
})
