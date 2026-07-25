import { vi, test, expect, afterEach } from 'vitest'
import { chatWithImage, LLMParseError } from '../src/services/llmClient.js'

afterEach(() => vi.unstubAllGlobals())

test('sends image and parses json content', async () => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ choices: [{ message: { content: '{"elements":["house"]}' } }] }),
  })
  vi.stubGlobal('fetch', fetchMock)

  const out = await chatWithImage('base64data', 'extract features')
  expect(out).toEqual({ elements: ['house'] })

  const body = JSON.parse(fetchMock.mock.calls[0][1].body)
  expect(body.messages[0].content[1].image_url.url).toContain('base64data')
  // kimi-k2.5 是 reasoning 模型，max_tokens 必须给足
  expect(body.max_tokens).toBeGreaterThanOrEqual(2000)
})

test('parses fenced ```json block', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      choices: [{ message: { content: '这是分析结果：\n```json\n{"elements":["tree"]}\n```' } }],
    }),
  }))
  const out = await chatWithImage('img', 'prompt')
  expect(out).toEqual({ elements: ['tree'] })
})

test('falls back to reasoning_content when content is empty (kimi reasoning model)', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      choices: [{ message: { content: '', reasoning_content: '{"elements":["sun"]}' } }],
    }),
  }))
  const out = await chatWithImage('img', 'prompt')
  expect(out).toEqual({ elements: ['sun'] })
})

test('throws LLMParseError with raw content on unparseable response', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ choices: [{ message: { content: 'not json at all' } }] }),
  }))
  await expect(chatWithImage('img', 'prompt')).rejects.toThrow(LLMParseError)
  await expect(chatWithImage('img', 'prompt')).rejects.toThrow(/not json at all/)
}, 20_000)

test('throws on non-ok http response', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => 'boom' }))
  await expect(chatWithImage('img', 'prompt')).rejects.toThrow(/500/)
}, 20_000)
