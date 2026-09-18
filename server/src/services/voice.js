import { traceNode } from './tracing.js'

export const MAX_AUDIO_BYTES = 3 * 1024 * 1024
export const MAX_SPEECH_CHARS = 400
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024
const AUDIO_TYPES = new Map([
  ['audio/webm', 'webm'], ['audio/ogg', 'ogg'], ['audio/mp4', 'mp4'], ['audio/m4a', 'm4a'],
  ['audio/x-m4a', 'm4a'], ['audio/mpeg', 'mp3'], ['audio/mp3', 'mp3'], ['audio/wav', 'wav'],
  ['audio/x-wav', 'wav'], ['audio/flac', 'flac'],
])
const clean = value => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim() : ''
export class VoiceError extends Error {
  constructor(code, status = 502) { super(code); this.status = status }
}

export function voiceConfig(env = process.env) {
  const provider = clean(env.VOICE_PROVIDER) || 'openai-compatible'
  const dashscope = provider === 'dashscope'
  return {
    provider,
    baseUrl: (clean(env.VOICE_BASE_URL) || (dashscope ? 'https://dashscope.aliyuncs.com' : '')).replace(/\/+$/, ''),
    apiKey: clean(env.VOICE_API_KEY),
    asrModel: clean(env.VOICE_ASR_MODEL) || (dashscope ? 'qwen3-asr-flash' : ''),
    ttsModel: clean(env.VOICE_TTS_MODEL) || (dashscope ? 'qwen3-tts-flash' : ''),
    voice: clean(env.VOICE_TTS_VOICE) || (dashscope ? 'Mochi' : ''),
    timeoutMs: Math.min(20000, Math.max(1000, Number(env.VOICE_TIMEOUT_MS) || 12000)),
  }
}

export function voiceCapabilities(config = voiceConfig()) {
  const ready = Boolean(config.baseUrl && config.apiKey && (!config.provider || ['dashscope', 'openai-compatible'].includes(config.provider)))
  return { asr: ready && Boolean(config.asrModel), tts: ready && Boolean(config.ttsModel && config.voice) }
}

export function readAudio(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new VoiceError('invalid_audio', 400)
  const mimeType = clean(input.mimeType).toLowerCase().split(';')[0]
  if (!AUDIO_TYPES.has(mimeType)) throw new VoiceError('unsupported_audio_type', 400)
  const encoded = input.audioBase64
  if (typeof encoded !== 'string' || encoded.length > Math.ceil(MAX_AUDIO_BYTES / 3) * 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length % 4 !== 0) throw new VoiceError('invalid_audio', 400)
  const audio = Buffer.from(encoded, 'base64')
  if (!audio.length || audio.length > MAX_AUDIO_BYTES) throw new VoiceError('invalid_audio', 400)
  return { audio, mimeType, extension: AUDIO_TYPES.get(mimeType), locale: input.locale === 'en' ? 'en' : 'zh' }
}

export function readSpeech(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new VoiceError('invalid_speech_text', 400)
  const text = clean(input.text)
  if (!text || text.length > MAX_SPEECH_CHARS) throw new VoiceError('invalid_speech_text', 400)
  return { text, locale: input.locale === 'en' ? 'en' : 'zh' }
}

async function boundedBody(response, limit = MAX_RESPONSE_BYTES) {
  if (Number(response.headers?.get?.('content-length')) > limit) throw new VoiceError('voice_response_too_large')
  const chunks = []
  let size = 0
  for await (const chunk of response.body) {
    size += chunk.byteLength
    if (size > limit) {
      throw new VoiceError('voice_response_too_large')
    }
    chunks.push(Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

async function voiceRequest(path, body, { config, signal, fetchImpl, json = false, onResponse, kind, chars, audioBytes, responseLimit }) {
  const controller = new AbortController()
  const abort = () => controller.abort()
  signal?.addEventListener('abort', abort, { once: true })
  if (signal?.aborted) abort()
  let timer
  let abortListener
  const started = Date.now()
  try {
    controller.signal.throwIfAborted()
    return await Promise.race([
      (async () => {
        const response = await fetchImpl(`${config.baseUrl}${path}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${config.apiKey}`, ...(json ? { 'Content-Type': 'application/json' } : {}) },
          body: json ? JSON.stringify(body) : body,
          signal: controller.signal,
        })
        // Do not echo provider error payloads, which may contain transcripts or credentials.
        if (!response.ok) throw new VoiceError('voice_provider_unavailable', response.status === 429 ? 429 : 502)
        const bytes = await boundedBody(response, responseLimit ?? (kind === 'asr' ? 64 * 1024 : MAX_RESPONSE_BYTES))
        controller.signal.throwIfAborted()
        const result = await onResponse(bytes, response, { signal: controller.signal, fetchImpl })
        controller.signal.throwIfAborted()
        traceNode(`nilo_voice_${kind}`, { latencyMs: Date.now() - started, inputCharacters: chars, audioBytes, outputBytes: bytes.length, usage: result.usage ?? null, outcome: 'success' })
        return result.payload
      })(),
      new Promise((_, reject) => {
        abortListener = () => reject(new VoiceError('voice_cancelled_or_timeout', 504))
        controller.signal.addEventListener('abort', abortListener, { once: true })
        timer = setTimeout(abort, config.timeoutMs)
      }),
    ])
  } catch (error) {
    controller.abort()
    traceNode(`nilo_voice_${kind}`, { latencyMs: Date.now() - started, inputCharacters: chars, audioBytes, outcome: 'failed' })
    throw error instanceof VoiceError ? error : new VoiceError('voice_provider_unavailable')
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', abort)
    if (abortListener) controller.signal.removeEventListener('abort', abortListener)
  }
}

export async function transcribeVoice(input, { config = voiceConfig(), signal, fetchImpl = fetch } = {}) {
  const { audio, mimeType, extension, locale } = readAudio(input)
  if (!voiceCapabilities(config).asr) throw new VoiceError('voice_asr_not_configured', 503)
  if (config.provider === 'dashscope') {
    return voiceRequest('/compatible-mode/v1/chat/completions', {
      model: config.asrModel,
      messages: [{ role: 'user', content: [{ type: 'input_audio', input_audio: { data: `data:${mimeType};base64,${audio.toString('base64')}` } }] }],
      stream: false,
      asr_options: { language: locale, enable_itn: false },
    }, {
      config, signal, fetchImpl, json: true, kind: 'asr', audioBytes: audio.length,
      onResponse: bytes => {
        const result = parseVoiceJson(bytes)
        const text = clean(result.choices?.[0]?.message?.content).slice(0, 600)
        if (!text) throw new VoiceError('voice_no_speech', 422)
        return { payload: { text }, usage: numericUsage(result.usage) }
      },
    })
  }
  const form = new FormData()
  form.append('file', new Blob([audio], { type: mimeType }), `utterance.${extension}`)
  form.append('model', config.asrModel)
  form.append('language', locale)
  form.append('response_format', 'json')
  return voiceRequest('/audio/transcriptions', form, {
    config, signal, fetchImpl, kind: 'asr', audioBytes: audio.length,
    onResponse: bytes => {
      const result = parseVoiceJson(bytes)
      const text = clean(result.text).slice(0, 600)
      if (!text) throw new VoiceError('voice_no_speech', 422)
      // Only numerical usage is retained. Audio and transcript never enter traces or files.
      return { payload: { text }, usage: numericUsage(result.usage) }
    },
  })
}

export async function synthesizeVoice(input, { config = voiceConfig(), signal, fetchImpl = fetch } = {}) {
  const { text, locale } = readSpeech(input)
  if (!voiceCapabilities(config).tts) throw new VoiceError('voice_tts_not_configured', 503)
  if (config.provider === 'dashscope') {
    return voiceRequest('/api/v1/services/aigc/multimodal-generation/generation', {
      model: config.ttsModel,
      input: { text, voice: config.voice, language_type: locale === 'en' ? 'English' : 'Chinese' },
    }, {
      config, signal, fetchImpl, json: true, kind: 'tts', chars: text.length, responseLimit: 64 * 1024,
      onResponse: async (bytes, _response, transport) => {
        const result = parseVoiceJson(bytes)
        const url = trustedDashscopeAudioUrl(result.output?.audio?.url)
        // Do not forward the API key to the signed asset host, and never follow a redirect.
        const response = await transport.fetchImpl(url, { signal: transport.signal, redirect: 'error' })
        if (!response.ok) throw new VoiceError('voice_provider_unavailable')
        const audio = await boundedBody(response)
        // DashScope non-streaming Qwen TTS provides a WAV file; check its actual container.
        if (audio.length < 44 || audio.toString('ascii', 0, 4) !== 'RIFF' || audio.toString('ascii', 8, 12) !== 'WAVE') throw new VoiceError('invalid_voice_response')
        return { payload: { audioBase64: audio.toString('base64'), mimeType: 'audio/wav' }, usage: numericUsage(result.usage) }
      },
    })
  }
  return voiceRequest('/audio/speech', { model: config.ttsModel, input: text, voice: config.voice, response_format: 'mp3' }, {
    config, signal, fetchImpl, json: true, kind: 'tts', chars: text.length,
    onResponse: (bytes, response) => {
      const type = response.headers?.get?.('content-type')?.split(';')[0]
      if (!bytes.length || (type && type !== 'audio/mpeg' && type !== 'audio/mp3' && type !== 'application/octet-stream')) throw new VoiceError('invalid_voice_response')
      return { payload: { audioBase64: bytes.toString('base64'), mimeType: 'audio/mpeg' } }
    },
  })
}

function parseVoiceJson(bytes) {
  let result
  try { result = JSON.parse(bytes.toString('utf8')) } catch { throw new VoiceError('invalid_voice_response') }
  if (!result || typeof result !== 'object' || Array.isArray(result) || (result.status_code && result.status_code !== 200) || result.code) throw new VoiceError('invalid_voice_response')
  return result
}

function numericUsage(usage) {
  return usage && typeof usage === 'object'
    ? Object.fromEntries(Object.entries(usage).filter(([, value]) => typeof value === 'number' && Number.isFinite(value))) : null
}

// Exact service-owned OSS buckets from the official Qwen-TTS examples. No arbitrary OSS
// tenant, private host, custom port, credential URL or redirect can become a download target.
export function trustedDashscopeAudioUrl(raw) {
  let url
  try { url = new URL(raw) } catch { throw new VoiceError('untrusted_voice_audio_url') }
  const allowedHosts = new Set(['dashscope-result-bj.oss-cn-beijing.aliyuncs.com', 'dashscope-result-wlcb.oss-cn-wulanchabu.aliyuncs.com'])
  if (!['http:', 'https:'].includes(url.protocol) || !allowedHosts.has(url.hostname) || url.username || url.password || url.port || !url.pathname.endsWith('.wav')) throw new VoiceError('untrusted_voice_audio_url')
  // Official responses may contain HTTP URLs; OSS supports HTTPS with the same signature.
  url.protocol = 'https:'
  return url.href
}
