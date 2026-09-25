import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { authFetch } from '@/lib/api/authFetch'
import { ApiError } from '@/lib/api/client'
import { useCompanionVoice } from '@/features/child/hooks/useCompanionVoice'
import { useDrawingMusic } from '@/features/child/hooks/useDrawingMusic'
import { convertVoiceBuffer, encodeVoiceWav } from '@/features/child/hooks/voiceAudio'
import { selectCompanionVoice } from '@/features/child/hooks/voiceProfile'
import { createSpeechEndpoint, recognitionContext, recognitionVocabulary, SPEECH_PAUSE_MS } from '@/features/child/hooks/voiceRecognition'

vi.mock('@/features/child/hooks/voiceVad',()=>({startVoiceVad:vi.fn(async()=>{throw new Error('unavailable in test')})}))

vi.mock('@/lib/api/authFetch', () => ({ authFetch: vi.fn() }))

class FakeRecognition {
  static instances: FakeRecognition[] = []
  lang = ''; continuous = false; interimResults = false
  onresult: ((event: { results: { isFinal: boolean; 0: { transcript: string } }[] }) => void) | null = null
  onerror: ((event: { error: string }) => void) | null = null
  onend: (() => void) | null = null
  onstart: (() => void) | null = null
  start = vi.fn(() => this.onstart?.())
  stop = vi.fn(() => this.onend?.())
  abort = vi.fn()
  constructor() { FakeRecognition.instances.push(this) }
  say(text: string) { this.onresult?.({ results: [{ isFinal: true, 0: { transcript: text } }] }); this.onend?.() }
}
class FakeUtterance {
  static instances: FakeUtterance[] = []
  text: string; lang = ''; rate = 1; pitch = 1; voice: SpeechSynthesisVoice | null = null
  onend: (() => void) | null = null
  onerror: (() => void) | null = null
  constructor(text: string) { this.text = text; FakeUtterance.instances.push(this) }
}
let playAudio = () => Promise.resolve()
class FakeAudio {
  static instances: FakeAudio[] = []
  src: string; volume = 1; loop = false; preload = ''
  onended: (() => void) | null = null
  onerror: (() => void) | null = null
  pause = vi.fn(); load = vi.fn(); removeAttribute = vi.fn()
  play = vi.fn(() => playAudio())
  constructor(src: string) { this.src = src; FakeAudio.instances.push(this) }
}
class FakeRecorder {
  static instances: FakeRecorder[] = []
  static isTypeSupported = (type: string) => type === 'audio/webm;codecs=opus'
  mimeType = 'audio/webm;codecs=opus'; state = 'inactive'
  onstop: (() => void) | null = null
  onerror: (() => void) | null = null
  ondataavailable: ((event: { data: Blob }) => void) | null = null
  constructor() { FakeRecorder.instances.push(this) }
  start() { this.state = 'recording' }
  stop() {
    this.state = 'inactive'
    this.ondataavailable?.({ data: new Blob(['recording'], { type: this.mimeType }) })
    this.onstop?.()
  }
}
const browserVoice = (name: string, lang: string, isDefault = false): SpeechSynthesisVoice => ({
  name, lang, voiceURI: name, default: isDefault, localService: true,
})
let voiceEvents = new EventTarget()
const synth = {
  speak: vi.fn(), cancel: vi.fn(), getVoices: vi.fn<() => SpeechSynthesisVoice[]>(),
  addEventListener: vi.fn((event: string, listener: EventListener) => voiceEvents.addEventListener(event, listener)),
  removeEventListener: vi.fn((event: string, listener: EventListener) => voiceEvents.removeEventListener(event, listener)),
}
const microphone = vi.fn()
const decodeAudio = vi.fn()
const decodedAudio = {
  length: 160, sampleRate: 16000, numberOfChannels: 1,
  getChannelData: () => new Float32Array(160).fill(.125),
} as AudioBuffer
class FakeAudioContext {
  static instances: FakeAudioContext[] = []
  constructor() { FakeAudioContext.instances.push(this) }
  createAnalyser() { return { fftSize: 1024, getByteTimeDomainData: (samples: Uint8Array) => samples.fill(128) } }
  createMediaStreamSource() { return { connect: vi.fn() } }
  resume = () => Promise.resolve()
  close = vi.fn(() => Promise.resolve())
  decodeAudioData = (data: ArrayBuffer) => decodeAudio(data)
}
const originalMediaDevices = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices')
const baseOptions = () => ({ ownerId: 'child-a', locale: 'zh' as const, enabled: true, onTranscript: vi.fn() })
async function ready() { await act(async () => { await Promise.resolve() }) }

test.each([[503,'voice_provider_unavailable','服务暂时没连上'],[422,'voice_no_speech','没有听到完整的话'],[504,'timeout','等得有点久']] as const)('server ASR %s has an accurate error and releases the microphone',async(status,code,message)=>{
 vi.mocked(authFetch).mockImplementation(path=>path.endsWith('/config')?Promise.resolve({asr:true,tts:false}):Promise.reject(new ApiError(status,code)))
 const stopTrack=vi.fn(),opts=baseOptions()
 microphone.mockResolvedValue({getTracks:()=>[{stop:stopTrack}]})
 const {result}=renderHook(()=>useCompanionVoice(opts))
 await ready()
 await act(async()=>result.current.start())
 act(()=>result.current.stop())
 await act(async()=>{await new Promise(resolve=>setTimeout(resolve,30))})
 expect(result.current.error).toContain(message)
 expect(result.current.status).toBe('idle')
 expect(stopTrack).toHaveBeenCalledOnce()
 expect(opts.onTranscript).not.toHaveBeenCalled()
})
beforeEach(() => {
  vi.mocked(authFetch).mockReset()
  vi.mocked(authFetch).mockResolvedValue({ asr: false, tts: false })
  localStorage.clear()
  FakeRecognition.instances = []; FakeUtterance.instances = []; FakeAudio.instances = []; FakeRecorder.instances = []
  synth.speak.mockClear(); synth.cancel.mockClear(); microphone.mockReset()
  synth.getVoices.mockReset()
  synth.getVoices.mockReturnValue([browserVoice('Tingting', 'zh-CN'), browserVoice('Samantha', 'en-US')])
  synth.addEventListener.mockClear(); synth.removeEventListener.mockClear(); voiceEvents = new EventTarget()
  FakeAudioContext.instances = []
  decodeAudio.mockReset(); decodeAudio.mockResolvedValue(decodedAudio)
  playAudio = () => Promise.resolve()
  vi.stubGlobal('SpeechRecognition', FakeRecognition)
  vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance)
  vi.stubGlobal('speechSynthesis', synth)
  vi.stubGlobal('Audio', FakeAudio)
  vi.stubGlobal('MediaRecorder', FakeRecorder)
  vi.stubGlobal('AudioContext', FakeAudioContext)
  vi.stubGlobal('URL', class extends URL {
    static createObjectURL = vi.fn(() => 'blob:voice')
    static revokeObjectURL = vi.fn()
  })
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, get: () => ({ getUserMedia: microphone }) })
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
})
afterEach(() => {
  cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks()
  if (originalMediaDevices) Object.defineProperty(navigator, 'mediaDevices', originalMediaDevices)
  else Reflect.deleteProperty(navigator, 'mediaDevices')
})

test('never opens the microphone on entry and can retry after a permission refusal', async () => {
  const opts = baseOptions()
  const { result } = renderHook(() => useCompanionVoice(opts))
  await ready()
  expect(FakeRecognition.instances).toHaveLength(0)
  expect(result.current.backend).toBe('browser')
  act(() => result.current.start())
  act(() => FakeRecognition.instances[0].onerror?.({ error: 'not-allowed' }))
  expect(result.current.status).toBe('idle')
  expect(result.current.error).toContain('麦克风未获允许')
  act(() => result.current.start())
  act(() => FakeRecognition.instances[1].say('我想画一只猫'))
  expect(opts.onTranscript).toHaveBeenCalledWith('我想画一只猫', expect.stringMatching(/^voice-/))
  expect(result.current.transcript).toBe('我想画一只猫')
  expect(result.current.error).toBeNull()
})

test('browser input is ready before a stalled cloud check and TTS is not required', async () => {
  vi.useFakeTimers()
  vi.mocked(authFetch).mockImplementation(() => new Promise(() => {}))
  const { result } = renderHook(() => useCompanionVoice(baseOptions()))
  expect(result.current.voiceReady).toBe(true)
  expect(result.current.supported).toBe(true)
  expect(FakeRecognition.instances).toHaveLength(0)
  expect(microphone).not.toHaveBeenCalled()
  act(() => result.current.toggleSound())
  act(() => result.current.start())
  expect(FakeRecognition.instances).toHaveLength(1)
  act(() => vi.advanceTimersByTime(4000))
  expect(result.current.status).toBe('listening')
  expect(vi.mocked(authFetch).mock.calls[0][1]?.signal?.aborted).toBe(true)
})

test('a cloud-only browser gets bounded preparation feedback, ignores late config and never opens the microphone', async () => {
  vi.useFakeTimers()
  vi.stubGlobal('SpeechRecognition', undefined)
  let resolveConfig!: (config: { asr: boolean; tts: boolean }) => void
  vi.mocked(authFetch).mockImplementation(() => new Promise(resolve => { resolveConfig = resolve }))
  const { result } = renderHook(() => useCompanionVoice(baseOptions()))
  expect(result.current.voiceReady).toBe(false)
  act(() => result.current.start())
  expect(result.current.error).toContain('语音正在准备')
  act(() => vi.advanceTimersByTime(4000))
  expect(result.current.voiceReady).toBe(true)
  act(() => result.current.start())
  expect(result.current.error).toContain('语音服务暂时连不上')
  await act(async () => resolveConfig({ asr: true, tts: true }))
  expect(result.current.supported).toBe(false)
  expect(microphone).not.toHaveBeenCalled()
})

test('browser-prefixed speech recognition is available without cloud ASR', async () => {
  vi.stubGlobal('SpeechRecognition', undefined)
  vi.stubGlobal('webkitSpeechRecognition', FakeRecognition)
  const opts = baseOptions()
  const { result } = renderHook(() => useCompanionVoice(opts))
  await ready()
  act(() => result.current.start())
  act(() => FakeRecognition.instances[0].say('我想画太阳'))
  expect(opts.onTranscript).toHaveBeenCalledWith('我想画太阳', expect.stringMatching(/^voice-/))
})

test('a speech output service alone cannot enable microphone recognition', async () => {
  vi.stubGlobal('SpeechRecognition', undefined)
  vi.mocked(authFetch).mockResolvedValue({ asr: false, tts: true })
  const { result } = renderHook(() => useCompanionVoice(baseOptions()))
  await ready()
  act(() => result.current.start())
  expect(result.current.supported).toBe(false)
  expect(result.current.error).toContain('这个浏览器暂时不能听你说话')
  expect(microphone).not.toHaveBeenCalled()
})

test('cancelling a failed microphone attempt clears its error before a new drawing action', async () => {
  vi.stubGlobal('SpeechRecognition', undefined)
  const { result } = renderHook(() => useCompanionVoice(baseOptions()))
  await ready()
  act(() => result.current.start())
  expect(result.current.error).toContain('这个浏览器暂时不能听你说话')
  // Nilo's drawing invitation cancels voice before starting its own proposal.
  act(() => result.current.cancel())
  expect(result.current.error).toBeNull()
  expect(result.current.status).toBe('idle')
  expect(microphone).not.toHaveBeenCalled()
  expect(synth.speak).not.toHaveBeenCalled()
})

test('an insecure deployment explains the HTTPS requirement before requesting permission', async () => {
  vi.stubGlobal('isSecureContext', false)
  vi.mocked(authFetch).mockResolvedValue({ asr: true, tts: false })
  const { result } = renderHook(() => useCompanionVoice(baseOptions()))
  await ready()
  act(() => result.current.start())
  expect(result.current.error).toContain('HTTPS')
  expect(result.current.supported).toBe(false)
  expect(microphone).not.toHaveBeenCalled()
  expect(FakeRecognition.instances).toHaveLength(0)
})

test.each([
  ['network', '连接失败'],
  ['service-not-allowed', '识别服务不可用'],
  ['audio-capture', '没有找到可用麦克风'],
  ['language-not-supported', '不支持这种语言'],
] as const)('browser %s failure is explicit and retryable', async (error, message) => {
  const { result } = renderHook(() => useCompanionVoice(baseOptions()))
  await ready()
  act(() => result.current.start())
  act(() => FakeRecognition.instances[0].onerror?.({ error }))
  expect(result.current.error).toContain(message)
  expect(result.current.status).toBe('idle')
  act(() => result.current.start())
  expect(result.current.error).toBeNull()
  expect(FakeRecognition.instances).toHaveLength(2)
})

test('final recognition waits for a pause without requiring end; interim words never become commands', async () => {
  vi.useFakeTimers()
  const opts = baseOptions()
  const { result } = renderHook(() => useCompanionVoice(opts))
  await ready()
  act(() => result.current.start())
  const recognition = FakeRecognition.instances[0]
  const lateEnd = recognition.onend
  const lateError = recognition.onerror
  act(() => recognition.onresult?.({ results: [{ isFinal: false, 0: { transcript: '留下来' } }] }))
  expect(result.current.transcript).toBe('留下来')
  expect(opts.onTranscript).not.toHaveBeenCalled()
  act(() => recognition.onresult?.({ results: [{ isFinal: true, 0: { transcript: '留下来' } }] }))
  expect(opts.onTranscript).not.toHaveBeenCalled()
  act(() => vi.advanceTimersByTime(SPEECH_PAUSE_MS))
  expect(opts.onTranscript).toHaveBeenCalledExactlyOnceWith('留下来', expect.stringMatching(/^voice-/))
  expect(result.current.status).toBe('idle')
  expect(recognition.abort).toHaveBeenCalledOnce()
  act(() => { lateEnd?.(); lateError?.({ error: 'aborted' }) })
  expect(opts.onTranscript).toHaveBeenCalledTimes(1)
  expect(result.current.error).toBeNull()
})

test('a thinking pause and revised interim tail are kept in one Chinese utterance', async () => {
  vi.useFakeTimers()
  const opts = baseOptions()
  const { result } = renderHook(() => useCompanionVoice(opts))
  await ready()
  act(() => result.current.start())
  const recognition = FakeRecognition.instances[0]
  expect(recognition.continuous).toBe(true)
  const first = { isFinal: true, 0: { transcript: '帮我画一个' } }
  act(() => recognition.onresult?.({ results: [first] }))
  act(() => vi.advanceTimersByTime(1500))
  expect(opts.onTranscript).not.toHaveBeenCalled()
  act(() => recognition.onresult?.({ results: [first, { isFinal: false, 0: { transcript: '篮子的' } }] }))
  act(() => vi.advanceTimersByTime(2500))
  expect(opts.onTranscript).not.toHaveBeenCalled()
  act(() => recognition.onresult?.({ results: [first, { isFinal: true, 0: { transcript: '蓝色的小汽车' } }] }))
  act(() => vi.advanceTimersByTime(SPEECH_PAUSE_MS))
  expect(opts.onTranscript).toHaveBeenCalledExactlyOnceWith('帮我画一个蓝色的小汽车', expect.stringMatching(/^voice-/))
})

test('an unfinished trailing correction is never dropped to execute the earlier fragment', async () => {
  vi.useFakeTimers()
  const opts = baseOptions()
  const { result } = renderHook(() => useCompanionVoice(opts))
  await ready()
  act(() => result.current.start())
  const recognition = FakeRecognition.instances[0]
  act(() => recognition.onresult?.({ results: [
    { isFinal: true, 0: { transcript: '留下来' } },
    { isFinal: false, 0: { transcript: '不，等一下' } },
  ] }))
  act(() => recognition.onend?.())
  expect(opts.onTranscript).not.toHaveBeenCalled()
  expect(result.current.error).toContain('没听完整')
})

test('manual stop submits a complete sentence immediately and cancellation discards a pending one', async () => {
  vi.useFakeTimers()
  const opts = baseOptions()
  const { result } = renderHook(() => useCompanionVoice(opts))
  await ready()
  act(() => result.current.start())
  act(() => FakeRecognition.instances[0].onresult?.({ results: [{ isFinal: true, 0: { transcript: '画太阳' } }] }))
  act(() => result.current.stop())
  expect(opts.onTranscript).toHaveBeenCalledExactlyOnceWith('画太阳', expect.stringMatching(/^voice-/))
  act(() => result.current.start())
  act(() => FakeRecognition.instances[1].onresult?.({ results: [{ isFinal: true, 0: { transcript: '留下来' } }] }))
  act(() => result.current.cancel())
  act(() => vi.advanceTimersByTime(SPEECH_PAUSE_MS))
  expect(opts.onTranscript).toHaveBeenCalledTimes(1)
})

test('English fragments retain word boundaries', async () => {
  vi.useFakeTimers()
  const opts = { ...baseOptions(), locale: 'en' as const }
  const { result } = renderHook(() => useCompanionVoice(opts))
  await ready()
  act(() => result.current.start())
  act(() => FakeRecognition.instances[0].onresult?.({ results: [
    { isFinal: true, 0: { transcript: 'Draw a' } }, { isFinal: true, 0: { transcript: 'blue boat' } },
  ] }))
  act(() => vi.advanceTimersByTime(SPEECH_PAUSE_MS))
  expect(opts.onTranscript).toHaveBeenCalledExactlyOnceWith('Draw a blue boat', expect.stringMatching(/^voice-/))
})

test('an engine that rejects contextual phrases retries once without biasing', async () => {
  class BiasedRecognition extends FakeRecognition { phrases: unknown[] = [] }
  vi.stubGlobal('SpeechRecognition', BiasedRecognition)
  vi.stubGlobal('SpeechRecognitionPhrase', class { constructor(public phrase: string, public boost: number) {} })
  const opts = { ...baseOptions(), drawingContext: { theme: '小恐龙', subjects: ['火箭'] } }
  const { result } = renderHook(() => useCompanionVoice(opts))
  await ready()
  act(() => result.current.start())
  expect((FakeRecognition.instances[0] as BiasedRecognition).phrases).toEqual(expect.arrayContaining([expect.objectContaining({ phrase: '小恐龙' })]))
  act(() => FakeRecognition.instances[0].onerror?.({ error: 'phrases-not-supported' }))
  expect(FakeRecognition.instances).toHaveLength(2)
  expect((FakeRecognition.instances[1] as BiasedRecognition).phrases).toEqual([])
  act(() => FakeRecognition.instances[1].say('画火箭'))
  expect(opts.onTranscript).toHaveBeenCalledExactlyOnceWith('画火箭', expect.stringMatching(/^voice-/))
})

test('endpointing accepts quiet speech and preserves a pause before the next word', () => {
  const endpoint = createSpeechEndpoint(0)
  for (let now = 100; now <= 1000; now += 100) expect(endpoint(.002, now)).toBe('listening')
  expect(endpoint(.012, 1100)).toBe('listening')
  expect(endpoint(.012, 1200)).toBe('listening')
  expect(endpoint(.002, 2700)).toBe('listening')
  expect(endpoint(.012, 2800)).toBe('listening')
  expect(endpoint(.012, 2900)).toBe('listening')
  expect(endpoint(.002, 5099)).toBe('listening')
  expect(endpoint(.002, 5100)).toBe('silence')
})

test('separate clicks and background noise do not count as speech', () => {
  const endpoint = createSpeechEndpoint(0)
  for (let now = 100; now <= 6900; now += 100) expect(endpoint(now % 1000 === 0 ? .1 : .002, now)).toBe('listening')
  expect(endpoint(.002, 7000)).toBe('no-speech')
})

test('recognition vocabulary carries bounded drawing context without inventing transcript text', () => {
  const context = recognitionContext({ theme: '恐龙\n世界' + 'x'.repeat(200), subjects: Array(20).fill('火箭') })
  expect(context.theme).toHaveLength(120)
  expect(context.theme).not.toContain('\n')
  expect(context.subjects).toEqual(['火箭'])
  expect(recognitionVocabulary('zh', context)).toEqual(expect.arrayContaining(['Nilo', '恐龙', '火箭']))
  expect(recognitionVocabulary('en')).toContain('spaceship')
})

test('a browser that never replies after stop cannot leave transcription stuck', async () => {
  vi.useFakeTimers()
  const { result } = renderHook(() => useCompanionVoice(baseOptions()))
  await ready()
  act(() => result.current.start())
  FakeRecognition.instances[0].stop.mockImplementation(() => undefined)
  act(() => result.current.stop())
  expect(result.current.status).toBe('transcribing')
  act(() => vi.advanceTimersByTime(5000))
  expect(result.current.status).toBe('idle')
  expect(result.current.error).toContain('没有响应')
  act(() => result.current.start())
  expect(result.current.status).toBe('listening')
  expect(FakeRecognition.instances).toHaveLength(2)
})

test('cancelling ignores late browser recognition callbacks', async () => {
  const opts = baseOptions()
  const { result } = renderHook(() => useCompanionVoice(opts))
  await ready()
  act(() => result.current.start())
  const recognition = FakeRecognition.instances[0]
  const lateResult = recognition.onresult
  const lateEnd = recognition.onend
  act(() => result.current.cancel())
  act(() => { lateResult?.({ results: [{ isFinal: true, 0: { transcript: '留下来' } }] }); lateEnd?.() })
  expect(opts.onTranscript).not.toHaveBeenCalled()
  expect(result.current.status).toBe('idle')
  expect(recognition.abort).toHaveBeenCalled()
})

test('microphone activation interrupts playback and a stale speech end cannot reopen it', async () => {
  const { result } = renderHook(() => useCompanionVoice(baseOptions()))
  await ready()
  act(() => result.current.speak('我陪你画画'))
  const lateEnd = FakeUtterance.instances[0].onend
  expect(result.current.status).toBe('speaking')
  act(() => result.current.start())
  expect(synth.cancel).toHaveBeenCalledOnce()
  expect(result.current.status).toBe('listening')
  act(() => lateEnd?.())
  expect(result.current.status).toBe('listening')
  expect(FakeRecognition.instances).toHaveLength(1)
})

test('voice selection prefers youthful names only within the requested language', () => {
  const englishChild = browserVoice('Junior child', 'en-US')
  const chineseChild = browserVoice('中文童声', 'zh_CN')
  const chineseGentle = browserVoice('Microsoft Xiaoxiao Online', 'zh-CN')
  const englishGentle = browserVoice('Microsoft Jenny Online', 'en-US')
  const voices = [browserVoice('System default', 'zh-CN', true), englishChild, chineseGentle, englishGentle, chineseChild]
  expect(selectCompanionVoice(voices, 'zh')).toBe(chineseChild)
  expect(selectCompanionVoice(voices, 'en')).toBe(englishChild)
  expect(selectCompanionVoice([voices[0], chineseGentle], 'zh')).toBe(chineseGentle)
  expect(selectCompanionVoice([browserVoice('Default', 'en-GB', true), englishGentle], 'en')).toBe(englishGentle)
  expect(selectCompanionVoice([englishChild], 'zh')).toBeNull()
})

test.each([
  ['zh', 'Microsoft Xiaoyou Online (Natural)', 'zh-CN'],
  ['zh', 'zh-CN-XiaoshuangNeural', 'zh-CN'],
  ['en', 'Microsoft Ana Online (Natural)', 'en-US'],
  ['en', 'en-GB-MaisieNeural', 'en-GB'],
] as const)('available %s child voice %s beats an adult default and keeps its natural pitch', async (locale, name, lang) => {
  const child = browserVoice(name, lang)
  const adult = browserVoice(locale === 'zh' ? 'Microsoft Xiaoxiao Online' : 'Microsoft Jenny Online', lang, true)
  synth.getVoices.mockReturnValue([adult, child])
  const { result } = renderHook(() => useCompanionVoice({ ...baseOptions(), locale }))
  await ready()
  const text = locale === 'zh' ? '按你的想法试试看，我陪着你。' : 'Try your idea. I am here with you.'
  act(() => result.current.speak(text))
  expect(FakeUtterance.instances[0]).toMatchObject({ voice: child, text, pitch: 1 })
  expect(FakeUtterance.instances[0].rate).toBeLessThan(1)
  expect(vi.mocked(authFetch).mock.calls.some(([path]) => path.endsWith('/speak'))).toBe(false)
})

test('child voice selection also recognizes a localized display name by its voice URI', () => {
  const child = { ...browserVoice('系统语音二', 'zh-CN'), voiceURI: 'zh-CN-XiaoyouNeural' }
  expect(selectCompanionVoice([browserVoice('婷婷', 'zh-CN', true), child], 'zh')).toBe(child)
  expect(selectCompanionVoice([child], 'en')).toBeNull()
})

test.each(['zh', 'en'] as const)('browser speech uses the %s voice and a gentle pitch and pace', async locale => {
  const { result } = renderHook(() => useCompanionVoice({ ...baseOptions(), locale }))
  await ready()
  act(() => result.current.speak(locale === 'zh' ? '我陪你画画' : 'Let’s draw together.'))
  const utterance = FakeUtterance.instances[0]
  expect(utterance.voice?.lang.startsWith(locale)).toBe(true)
  expect(utterance.lang).toBe(utterance.voice?.lang)
  expect(utterance.pitch).toBeGreaterThanOrEqual(1.15)
  expect(utterance.pitch).toBeLessThanOrEqual(1.2)
  expect(utterance.rate).toBeGreaterThanOrEqual(.94)
  expect(utterance.rate).toBeLessThanOrEqual(.98)
})

test('asynchronously loaded voices are used and pending selection is cancelled with the microphone', async () => {
  vi.useFakeTimers()
  synth.getVoices.mockReturnValue([])
  const { result } = renderHook(() => useCompanionVoice(baseOptions()))
  await ready()
  act(() => result.current.speak('我在这里'))
  expect(synth.speak).not.toHaveBeenCalled()
  const voice = browserVoice('中文童声', 'zh-CN')
  synth.getVoices.mockReturnValue([voice])
  act(() => voiceEvents.dispatchEvent(new Event('voiceschanged')))
  expect(FakeUtterance.instances[0].voice).toBe(voice)
  act(() => FakeUtterance.instances[0].onend?.())

  synth.getVoices.mockReturnValue([])
  act(() => result.current.speak('这个晚到的声音不要播放'))
  act(() => result.current.start())
  synth.getVoices.mockReturnValue([voice])
  act(() => { voiceEvents.dispatchEvent(new Event('voiceschanged')); vi.advanceTimersByTime(1100) })
  expect(synth.speak).toHaveBeenCalledTimes(1)
  expect(result.current.status).toBe('listening')
  expect(synth.removeEventListener).toHaveBeenCalledTimes(2)
})

test('an unavailable language is not replaced by a different language default voice', async () => {
  synth.getVoices.mockReturnValue([browserVoice('English child', 'en-US', true)])
  const { result } = renderHook(() => useCompanionVoice(baseOptions()))
  await ready()
  act(() => result.current.speak('我陪你画画'))
  expect(synth.speak).not.toHaveBeenCalled()
  expect(result.current.status).toBe('idle')
  expect(result.current.error).toContain('声音暂时不可用')
})

test('an empty voice inventory waits briefly then requests the current language from the platform', async () => {
  vi.useFakeTimers()
  synth.getVoices.mockReturnValue([])
  const { result } = renderHook(() => useCompanionVoice({ ...baseOptions(), locale: 'en' }))
  await ready()
  act(() => result.current.speak('I am here.'))
  act(() => vi.advanceTimersByTime(999))
  expect(synth.speak).not.toHaveBeenCalled()
  act(() => vi.advanceTimersByTime(1))
  expect(synth.speak).toHaveBeenCalledOnce()
  expect(FakeUtterance.instances[0].lang).toBe('en-US')
  expect(FakeUtterance.instances[0].voice).toBeNull()
  expect(synth.removeEventListener).toHaveBeenCalledOnce()
})

test('continuous conversation waits for actual speech end, then listens again', async () => {
  vi.useFakeTimers()
  const { result } = renderHook(() => useCompanionVoice(baseOptions()))
  await ready()
  act(() => result.current.setContinuous(true))
  act(() => FakeRecognition.instances[0].say('画什么呢'))
  act(() => result.current.speak('我们可以画你喜欢的东西'))
  act(() => vi.advanceTimersByTime(5000))
  expect(FakeRecognition.instances).toHaveLength(1)
  act(() => FakeUtterance.instances[0].onend?.())
  act(() => vi.advanceTimersByTime(450))
  expect(FakeRecognition.instances).toHaveLength(2)
  expect(result.current.status).toBe('listening')
  act(() => FakeRecognition.instances[1].onerror?.({ error: 'no-speech' }))
  act(() => vi.advanceTimersByTime(60000))
  expect(FakeRecognition.instances).toHaveLength(2)
  expect(result.current.continuous).toBe(false)
})

test('continuous conversation has a finite turn budget even when every reply succeeds', async () => {
  vi.useFakeTimers()
  const { result } = renderHook(() => useCompanionVoice(baseOptions()))
  await ready()
  act(() => result.current.toggleSound())
  act(() => result.current.setContinuous(true))
  for (let turn = 0; turn < 12; turn++) {
    act(() => FakeRecognition.instances[turn].say('继续聊'))
    act(() => result.current.speak('我在这里'))
    act(() => vi.advanceTimersByTime(450))
  }
  expect(FakeRecognition.instances).toHaveLength(12)
  expect(result.current.continuous).toBe(false)
  expect(result.current.status).toBe('idle')
})

test('continuous server recording closes an idle microphone without sending silent audio', async () => {
  vi.useFakeTimers()
  vi.mocked(authFetch).mockResolvedValue({ asr: true, tts: false })
  const stopTrack = vi.fn()
  microphone.mockResolvedValue({ getTracks: () => [{ stop: stopTrack }] })
  vi.stubGlobal('AudioContext', class {
    createAnalyser() { return { fftSize: 1024, getByteTimeDomainData: (samples: Uint8Array) => samples.fill(128) } }
    createMediaStreamSource() { return { connect: vi.fn() } }
    resume = () => Promise.resolve()
    close = () => Promise.resolve()
  })
  const { result } = renderHook(() => useCompanionVoice(baseOptions()))
  await ready()
  await act(async () => result.current.setContinuous(true))
  act(() => vi.advanceTimersByTime(7100))
  expect(result.current.continuous).toBe(false)
  expect(result.current.status).toBe('idle')
  expect(stopTrack).toHaveBeenCalledOnce()
  expect(authFetch).toHaveBeenCalledTimes(1)
})

test('server recording keeps quiet speech across a thinking pause and stops after a completed turn', async () => {
  vi.useFakeTimers()
  vi.mocked(authFetch).mockResolvedValue({ asr: true, tts: false })
  let amplitude = .012
  vi.stubGlobal('AudioContext', class extends FakeAudioContext {
    createAnalyser() { return { ...super.createAnalyser(), getFloatTimeDomainData: (samples: Float32Array) => samples.fill(amplitude) } }
  })
  microphone.mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] })
  const { result } = renderHook(() => useCompanionVoice(baseOptions()))
  await ready()
  await act(async () => result.current.setContinuous(true))
  act(() => vi.advanceTimersByTime(300))
  amplitude = .002
  act(() => vi.advanceTimersByTime(1500))
  expect(result.current.status).toBe('listening')
  expect(FakeRecorder.instances[0].state).toBe('recording')
  amplitude = .012
  act(() => vi.advanceTimersByTime(300))
  amplitude = .002
  act(() => vi.advanceTimersByTime(2200))
  expect(result.current.status).toBe('transcribing')
  expect(FakeRecorder.instances[0].state).toBe('inactive')
  act(() => result.current.cancel())
})

test('hidden page ends the session and never restarts it on return', async () => {
  const visibility = vi.spyOn(document, 'visibilityState', 'get')
  const { result } = renderHook(() => useCompanionVoice(baseOptions()))
  await ready()
  act(() => result.current.setContinuous(true))
  visibility.mockReturnValue('hidden')
  act(() => document.dispatchEvent(new Event('visibilitychange')))
  expect(result.current.continuous).toBe(false)
  expect(result.current.status).toBe('idle')
  visibility.mockReturnValue('visible')
  act(() => document.dispatchEvent(new Event('visibilitychange')))
  expect(FakeRecognition.instances).toHaveLength(1)
})

test('sound preference belongs to each child; microphone mode is never restored', async () => {
  const opts = baseOptions()
  const { result, rerender } = renderHook(({ ownerId }) => useCompanionVoice({ ...opts, ownerId }), { initialProps: { ownerId: 'child-a' } })
  await ready()
  act(() => result.current.toggleSound())
  expect(result.current.soundOn).toBe(false)
  rerender({ ownerId: 'child-b' }); await ready()
  expect(result.current.soundOn).toBe(true)
  rerender({ ownerId: 'child-a' }); await ready()
  expect(result.current.soundOn).toBe(false)
  expect(result.current.continuous).toBe(false)
  expect(FakeRecognition.instances).toHaveLength(0)
})

test('late microphone permission resolves into a released stream after cancellation', async () => {
  vi.mocked(authFetch).mockResolvedValue({ asr: true, tts: false })
  let release!: (stream: MediaStream) => void
  microphone.mockImplementation(() => new Promise(resolve => { release = resolve }))
  const stopTrack = vi.fn()
  const { result } = renderHook(() => useCompanionVoice(baseOptions()))
  await ready()
  act(() => result.current.start())
  expect(result.current.status).toBe('preparing')
  act(() => result.current.stop()) // Also cancels while the permission sheet is open.
  await act(async () => release({ getTracks: () => [{ stop: stopTrack }] } as unknown as MediaStream))
  expect(stopTrack).toHaveBeenCalledOnce()
  expect(FakeRecorder.instances).toHaveLength(0)
  expect(result.current.status).toBe('idle')
})

test('the browser only shows listening after its microphone starts; late start cannot revive cancellation', async () => {
  class SlowRecognition extends FakeRecognition { start = vi.fn() }
  vi.stubGlobal('SpeechRecognition', SlowRecognition)
  const { result } = renderHook(() => useCompanionVoice(baseOptions()))
  await ready()
  act(() => result.current.start())
  expect(result.current.status).toBe('preparing')
  const lateStart = FakeRecognition.instances[0].onstart
  act(() => result.current.stop())
  act(() => lateStart?.())
  expect(result.current.status).toBe('idle')
  act(() => result.current.start())
  expect(result.current.status).toBe('preparing')
  act(() => FakeRecognition.instances[1].onstart?.())
  expect(result.current.status).toBe('listening')
})

test('server recognition converts recordings to 16 kHz mono WAV and ignores a response after disable', async () => {
  let finish!: (result: { text: string }) => void
  vi.mocked(authFetch).mockImplementation(path => path.endsWith('/config')
    ? Promise.resolve({ asr: true, tts: false })
    : new Promise(resolve => { finish = resolve }))
  const stopTrack = vi.fn()
  microphone.mockResolvedValue({ getTracks: () => [{ stop: stopTrack }] })
  const opts = { ...baseOptions(), drawingContext: { theme: '海上的小船', subjects: ['帆船'] } }
  const { result, rerender } = renderHook(({ enabled }) => useCompanionVoice({ ...opts, enabled }), { initialProps: { enabled: true } })
  await ready()
  await act(async () => result.current.start())
  act(() => result.current.stop())
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 15)) })
  const call = vi.mocked(authFetch).mock.calls.find(([path]) => path.endsWith('/transcribe'))
  expect(call?.[1]?.body).toMatchObject({ mimeType: 'audio/wav', locale: 'zh', context: { theme: '海上的小船', subjects: ['帆船'] } })
  const body = call?.[1]?.body as { audioBase64: string }
  const bytes = Uint8Array.from(atob(body.audioBase64), char => char.charCodeAt(0))
  const header = new DataView(bytes.buffer)
  expect(String.fromCharCode(...bytes.slice(0, 4))).toBe('RIFF')
  expect(header.getUint16(22, true)).toBe(1)
  expect(header.getUint32(24, true)).toBe(16000)
  expect(FakeAudioContext.instances.every(context => context.close.mock.calls.length === 1)).toBe(true)
  expect(stopTrack).toHaveBeenCalledOnce()
  rerender({ enabled: false })
  await act(async () => finish({ text: '留下来' }))
  expect(opts.onTranscript).not.toHaveBeenCalled()
  expect(call?.[1]?.signal?.aborted).toBe(true)
  expect(result.current.status).toBe('idle')
})

test('cancelling during audio decoding releases the decoder and never uploads its late result', async () => {
  vi.mocked(authFetch).mockResolvedValue({ asr: true, tts: false })
  let finishDecode!: (audio: AudioBuffer) => void
  decodeAudio.mockImplementation(() => new Promise(resolve => { finishDecode = resolve }))
  microphone.mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] })
  const { result } = renderHook(() => useCompanionVoice(baseOptions()))
  await ready()
  await act(async () => result.current.start())
  act(() => result.current.stop())
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 15)) })
  expect(decodeAudio).toHaveBeenCalledOnce()
  const decoder = FakeAudioContext.instances.at(-1)!
  act(() => result.current.cancel())
  expect(decoder.close).toHaveBeenCalledOnce()
  await act(async () => finishDecode(decodedAudio))
  expect(authFetch).toHaveBeenCalledTimes(1)
  expect(decoder.close).toHaveBeenCalledOnce()
  expect(result.current.status).toBe('idle')
})

test('PCM WAV encoding mixes stereo, clips peaks and writes correct sample data', () => {
  const bytes = encodeVoiceWav([
    new Float32Array([1, -1, 1, 3, -3, Number.NaN]),
    new Float32Array([-1, 1, 0, 3, -3, .5]),
  ])
  const data = new DataView(bytes)
  expect(data.getUint32(4, true)).toBe(bytes.byteLength - 8)
  expect(data.getUint32(40, true)).toBe(12)
  expect(data.getUint16(20, true)).toBe(1)
  expect(data.getUint16(34, true)).toBe(16)
  expect(Array.from({ length: 6 }, (_, index) => data.getInt16(44 + index * 2, true)))
    .toEqual([0, 0, 16384, 32767, -32768, 8192])
})

test('resampling uses an offline 16 kHz mono destination and drops cancelled output', async () => {
  let finishRender!: (audio: AudioBuffer) => void
  const disconnect = vi.fn()
  const stop = vi.fn()
  const constructors = vi.fn()
  vi.stubGlobal('OfflineAudioContext', class {
    destination = {}
    constructor(...args: unknown[]) { constructors(...args) }
    createBufferSource() { return { buffer: null, connect: vi.fn(), start: vi.fn(), stop, disconnect } }
    startRendering() { return new Promise<AudioBuffer>(resolve => { finishRender = resolve }) }
  })
  const controller = new AbortController()
  const conversion = convertVoiceBuffer({ ...decodedAudio, sampleRate: 48000, length: 480 } as AudioBuffer, controller.signal)
  expect(constructors).toHaveBeenCalledWith(1, 160, 16000)
  controller.abort()
  finishRender(decodedAudio)
  await expect(conversion).rejects.toMatchObject({ name: 'AbortError' })
  expect(stop).toHaveBeenCalledOnce()
  expect(disconnect).toHaveBeenCalled()
})

test('failed audio autoplay ends the continuous session instead of recording speaker audio', async () => {
  vi.mocked(authFetch).mockImplementation(path => Promise.resolve(path.endsWith('/config')
    ? { asr: false, tts: true } : { audioBase64: btoa('sound'), mimeType: 'audio/mpeg' }))
  playAudio = () => Promise.reject(new DOMException('blocked', 'NotAllowedError'))
  const { result } = renderHook(() => useCompanionVoice(baseOptions()))
  await ready()
  act(() => result.current.setContinuous(true))
  act(() => FakeRecognition.instances[0].say('你好'))
  await act(async () => result.current.speak('你好呀'))
  expect(result.current.continuous).toBe(false)
  expect(result.current.status).toBe('idle')
  expect(result.current.error).toContain('声音没播放成功')
  expect(FakeRecognition.instances).toHaveLength(1)
  expect(FakeAudio.instances[0].pause).toHaveBeenCalled()
})

test('voice activity ducks music while preserving the user volume setting', async () => {
  const { result } = renderHook(() => useDrawingMusic())
  await act(async () => result.current.toggle())
  const audio = FakeAudio.instances[0]
  act(() => window.dispatchEvent(new CustomEvent('luma-voice-active', { detail: true })))
  expect(audio.volume).toBeCloseTo(.15 * .15)
  act(() => result.current.changeVolume(40))
  expect(result.current.volume).toBe(40)
  expect(audio.volume).toBeCloseTo(.4 * .15)
  act(() => window.dispatchEvent(new CustomEvent('luma-voice-active', { detail: false })))
  expect(audio.volume).toBe(.4)
})


test('recognition alternatives retain the entire correction without rewriting the displayed transcript',async()=>{
 const opts=baseOptions(); const {result}=renderHook(()=>useCompanionVoice(opts))
 await ready()
 act(()=>result.current.start())
 const recognition=FakeRecognition.instances[0]
 act(()=>{recognition.onresult?.({results:[
  {isFinal:true,0:{transcript:'画蔡阳'},1:{transcript:'画太阳'},length:2},
  {isFinal:true,0:{transcript:'只画一半，不要放右边，放左上角'}}
 ]} as Parameters<NonNullable<typeof recognition.onresult>>[0]);recognition.onend?.()})
 expect(result.current.transcript).toBe('画蔡阳只画一半，不要放右边，放左上角')
 expect(opts.onTranscript).toHaveBeenCalledExactlyOnceWith('画蔡阳只画一半，不要放右边，放左上角',expect.stringMatching(/^voice-/),['画太阳只画一半，不要放右边，放左上角'])
})
