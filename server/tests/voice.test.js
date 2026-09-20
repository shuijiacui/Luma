import express from 'express'
import request from 'supertest'
import { expect, test, vi } from 'vitest'
import { createNiloRouter } from '../src/routes/nilo.js'
import { MAX_AUDIO_BYTES, readAudio, readSpeech, synthesizeVoice, transcribeVoice, trustedDashscopeAudioUrl, voiceCapabilities, voiceConfig, voiceRecognitionContext } from '../src/services/voice.js'
import { rateLimit } from '../src/services/security.js'

const config = { baseUrl: 'https://voice.example/v1', apiKey: 'test-only-placeholder', asrModel: 'asr', ttsModel: 'tts', voice: 'otter', timeoutMs: 1000 }
const input = { audioBase64: Buffer.from('sample-audio').toString('base64'), mimeType: 'audio/webm;codecs=opus', locale: 'zh' }
const api = (voice, options = {}) => express().use(express.json({ limit: '5mb' })).use((req, _res, next) => { req.auth = options.auth; next() }).use('/nilo', rateLimit({ windowMs: 60000, max: options.max ?? 100 })).use('/nilo', createNiloRouter({ voice })).use((error, _req, res, _next) => res.status(error.status ?? 500).json({ error: error.message }))

test('voice is explicitly configured and never borrows a text-model credential', async () => {
  expect(voiceCapabilities(voiceConfig({ LLM_API_KEY: 'placeholder' }))).toEqual({ asr: false, tts: false })
  expect(voiceCapabilities({ ...config, asrModel: '' })).toEqual({ asr: false, tts: true })
  const app = api({ config: voiceConfig({}) })
  const capabilities = await request(app).get('/nilo/voice/config')
  expect(capabilities.body).toEqual({ asr: false, tts: false })
  expect(capabilities.headers['cache-control']).toBe('no-store')
  expect((await request(app).post('/nilo/voice/transcribe').send(input)).status).toBe(503)
  expect((await request(app).post('/nilo/voice/speak').send({ text: '你好' })).status).toBe(503)
})

test('ASR sends only bounded audio multipart with selected language and returns text', async () => {
  const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ text: '这是我的飞船', usage: { input_tokens: 12, output_tokens: 5 } }), { headers: { 'Content-Type': 'application/json' } }))
  const result = await transcribeVoice(input, { config, fetchImpl })
  expect(result).toEqual({ text: '这是我的飞船' })
  expect(fetchImpl).toHaveBeenCalledTimes(1)
  expect(fetchImpl.mock.calls[0][0]).toBe('https://voice.example/v1/audio/transcriptions')
  const options = fetchImpl.mock.calls[0][1]
  expect(options.body.get('language')).toBe('zh')
  expect(options.body.get('file').name).toBe('utterance.webm')
  expect(options.body.get('response_format')).toBe('json')
})

test('TTS returns playable mp3 and sends short text without logging content', async () => {
  const fetchImpl = vi.fn(async () => new Response(Buffer.from('audio'), { headers: { 'Content-Type': 'audio/mpeg' } }))
  const result = await synthesizeVoice({ text: 'I am here.', locale: 'en' }, { config, fetchImpl })
  expect(result).toEqual({ audioBase64: Buffer.from('audio').toString('base64'), mimeType: 'audio/mpeg' })
  expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({ model: 'tts', input: 'I am here.', voice: 'otter', response_format: 'mp3' })
})

test('rejects unsupported, malformed and oversized input before a provider call', async () => {
  for (const value of [{ ...input, mimeType: 'text/html' }, { ...input, audioBase64: '$bad' }, { ...input, audioBase64: '' }, { ...input, audioBase64: Buffer.alloc(MAX_AUDIO_BYTES + 1).toString('base64') }]) expect(() => readAudio(value)).toThrow()
  expect(() => readSpeech({ text: 'x'.repeat(401) })).toThrow()
  expect(() => readSpeech({ text: ' ' })).toThrow()
  const fetchImpl = vi.fn()
  await expect(synthesizeVoice({ text: 'x'.repeat(401) }, { config, fetchImpl })).rejects.toThrow('invalid_speech_text')
  expect(fetchImpl).not.toHaveBeenCalled()
})

test('provider errors are sanitized and not retried; invalid output is rejected', async () => {
  const fetchImpl = vi.fn(async () => new Response('private transcript or key', { status: 500 }))
  await expect(transcribeVoice(input, { config, fetchImpl })).rejects.toThrow('voice_provider_unavailable')
  expect(fetchImpl).toHaveBeenCalledTimes(1)
  await expect(synthesizeVoice({ text: 'hi' }, { config, fetchImpl: async () => new Response('<html>', { headers: { 'Content-Type': 'text/html' } }) })).rejects.toThrow('invalid_voice_response')
  await expect(transcribeVoice(input, { config, fetchImpl: async () => new Response('{"text":""}') })).rejects.toThrow('voice_no_speech')
})

test('ASR timeout cancels the provider and routes share cost rate limits and child access', async () => {
  let signal
  await expect(transcribeVoice(input, { config: { ...config, timeoutMs: 15 }, fetchImpl: (_url, options) => { signal = options.signal; return new Promise(() => {}) } })).rejects.toThrow('voice_cancelled_or_timeout')
  expect(signal.aborted).toBe(true)
  const limited = api({ config: voiceConfig({}) }, { max: 1 })
  expect((await request(limited).get('/nilo/voice/config')).status).toBe(200)
  expect((await request(limited).post('/nilo/voice/transcribe').send(input)).status).toBe(429)
  const parent = api({ config }, { auth: { role: 'parent' } })
  expect((await request(parent).get('/nilo/voice/config')).status).toBe(403)
  expect((await request(parent).post('/nilo/companion').send({ context: {} })).status).toBe(403)
})

test('DashScope config uses independent Beijing credentials and native ASR payload', async () => {
  const dashscope = voiceConfig({ VOICE_PROVIDER: 'dashscope', VOICE_API_KEY: 'test-only-placeholder' })
  expect(dashscope).toMatchObject({ baseUrl: 'https://dashscope.aliyuncs.com', asrModel: 'qwen3-asr-flash', ttsModel: 'qwen3-tts-flash', voice: 'Mochi' })
  expect(voiceConfig({ VOICE_PROVIDER: 'dashscope', VOICE_TTS_VOICE: 'Cherry' }).voice).toBe('Cherry')
  expect(voiceCapabilities(voiceConfig({ VOICE_PROVIDER: 'dashscope', LLM_API_KEY: 'placeholder', DASHSCOPE_API_KEY: 'placeholder' }))).toEqual({ asr: false, tts: false })
  const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: '我的飞船' } }], usage: { input_tokens: 12 } })))
  expect(await transcribeVoice({ ...input, mimeType: 'audio/wav' }, { config: dashscope, fetchImpl })).toEqual({ text: '我的飞船' })
  expect(fetchImpl.mock.calls[0][0]).toBe('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions')
  const payload = JSON.parse(fetchImpl.mock.calls[0][1].body)
  expect(payload.asr_options).toEqual({ language: 'zh', enable_itn: false })
  expect(payload.messages[0].role).toBe('system')
  expect(JSON.parse(payload.messages[0].content).vocabulary).toContain('Nilo')
  expect(payload.messages[1].content[0]).toEqual({ type: 'input_audio', input_audio: { data: `data:audio/wav;base64,${input.audioBase64}` } })
})

test('DashScope receives drawing vocabulary and context as bounded background data', async () => {
  const dashscope = voiceConfig({ VOICE_PROVIDER: 'dashscope', VOICE_API_KEY: 'test-only-placeholder' })
  const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: '画一只恐龙' } }] })))
  await transcribeVoice({ ...input, context: { theme: '恐龙\n世界', subjects: ['霸王龙'], history: 'not sent' } }, { config: dashscope, fetchImpl })
  const payload = JSON.parse(fetchImpl.mock.calls[0][1].body)
  const context = JSON.parse(payload.messages[0].content)
  expect(context.drawingTheme).toBe('恐龙 世界')
  expect(context.vocabulary).toEqual(expect.arrayContaining(['Nilo', '蜡笔', '霸王龙']))
  expect(payload.messages).toHaveLength(2)
  expect(payload.messages[0].content).not.toContain('not sent')
  const bounded = JSON.parse(voiceRecognitionContext({ theme: 'x'.repeat(10000), subjects: Array.from({ length: 20 }, (_, i) => String(i).padEnd(1000, 'x')) }))
  expect(bounded.drawingTheme).toHaveLength(120)
  expect(bounded.vocabulary.filter(word => word.endsWith('x'))).toHaveLength(8)
  expect(bounded.vocabulary.every(word => word.length <= 40)).toBe(true)
  expect(JSON.parse(voiceRecognitionContext(null, 'en')).vocabulary).toContain('crayon')
})

test.each([['en', 'Hello', 'English'], ['zh', '你好', 'Chinese']])('DashScope TTS uses the childlike voice in %s and downloads trusted WAV without authorization', async (locale, text, language) => {
  const wav = Buffer.alloc(48)
  wav.write('RIFF', 0); wav.write('WAVE', 8)
  const dashscope = voiceConfig({ VOICE_PROVIDER: 'dashscope', VOICE_API_KEY: 'test-only-placeholder' })
  const fetchImpl = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ output: { audio: { url: 'http://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/audio.wav?signature=test' } }, usage: { characters: 5 } })))
    .mockResolvedValueOnce(new Response(wav, { headers: { 'Content-Type': 'audio/wav' } }))
  expect(await synthesizeVoice({ text, locale }, { config: dashscope, fetchImpl })).toEqual({ audioBase64: wav.toString('base64'), mimeType: 'audio/wav' })
  expect(fetchImpl.mock.calls[0][0]).toBe('https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation')
  expect(JSON.parse(fetchImpl.mock.calls[0][1].body).input).toEqual({ text, voice: 'Mochi', language_type: language })
  expect(fetchImpl.mock.calls[1][0]).toBe('https://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/audio.wav?signature=test')
  expect(fetchImpl.mock.calls[1][1].redirect).toBe('error')
  expect(fetchImpl.mock.calls[1][1].headers).toBeUndefined()
})

test('DashScope download rejects SSRF destinations, redirects and malformed audio', async () => {
  for (const url of ['http://127.0.0.1/audio.wav', 'https://evil.oss-cn-beijing.aliyuncs.com/audio.wav', 'https://dashscope-result-bj.oss-cn-beijing.aliyuncs.com.evil.test/audio.wav', 'https://user@dashscope-result-bj.oss-cn-beijing.aliyuncs.com/audio.wav', 'https://dashscope-result-bj.oss-cn-beijing.aliyuncs.com:8000/audio.wav', 'file:///tmp/audio.wav']) expect(() => trustedDashscopeAudioUrl(url)).toThrow('untrusted_voice_audio_url')
  const dashscope = voiceConfig({ VOICE_PROVIDER: 'dashscope', VOICE_API_KEY: 'test-only-placeholder' })
  const malicious = vi.fn(async () => new Response(JSON.stringify({ output: { audio: { url: 'http://169.254.169.254/latest/meta-data' } } })))
  await expect(synthesizeVoice({ text: '你好' }, { config: dashscope, fetchImpl: malicious })).rejects.toThrow('untrusted_voice_audio_url')
  expect(malicious).toHaveBeenCalledTimes(1)
  const redirect = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ output: { audio: { url: 'https://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/audio.wav' } } }))).mockResolvedValueOnce(new Response(null, { status: 302, headers: { Location: 'http://localhost' } }))
  await expect(synthesizeVoice({ text: '你好' }, { config: dashscope, fetchImpl: redirect })).rejects.toThrow('voice_provider_unavailable')
})
