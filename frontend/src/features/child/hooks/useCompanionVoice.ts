import { useCallback, useEffect, useRef, useState } from 'react'
import { authFetch } from '@/lib/api/authFetch'
import { convertVoiceBuffer, readVoiceRecording } from './voiceAudio'
import { companionSpeechProfile, selectCompanionVoice } from './voiceProfile'
import { createSpeechEndpoint, recognitionContext, recognitionVocabulary, SPEECH_PAUSE_MS, type DrawingSpeechContext } from './voiceRecognition'

export type CompanionVoiceStatus = 'idle' | 'preparing' | 'listening' | 'transcribing' | 'speaking'
export interface CompanionVoiceController {
  status: CompanionVoiceStatus
  error: string | null
  transcript: string
  soundOn: boolean
  continuous: boolean
  supported: boolean
  voiceReady: boolean
  backend: 'server' | 'browser' | 'unavailable'
  start: () => void
  stop: () => void
  cancel: () => void
  speak: (text: string) => void
  toggleSound: () => void
  setContinuous: (value: boolean) => void
}

interface VoiceOptions {
  ownerId: string
  token?: string
  locale: 'zh' | 'en'
  enabled: boolean
  drawingContext?: DrawingSpeechContext
  onTranscript: (text: string) => void
}
interface RecognitionResultEvent {
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>
}
interface Recognition {
  lang: string
  continuous: boolean
  interimResults: boolean
  phrases?: unknown[]
  onstart: (() => void) | null
  onresult: ((event: RecognitionResultEvent) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}
type RecognitionConstructor = new () => Recognition
type VoiceWindow = Window & {
  SpeechRecognition?: RecognitionConstructor
  webkitSpeechRecognition?: RecognitionConstructor
  webkitAudioContext?: typeof AudioContext
  SpeechRecognitionPhrase?: new (phrase: string, boost: number) => unknown
}
type Actions = Pick<CompanionVoiceController, 'start' | 'stop' | 'cancel' | 'speak' | 'toggleSound' | 'setContinuous'>

const preferenceKey = (ownerId: string) => `luma:voice-sound:${ownerId}`
function readSound(ownerId: string) {
  try { return localStorage.getItem(preferenceKey(ownerId)) !== 'off' } catch { return true }
}
function audioBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
    reader.onerror = () => reject(new Error('audio-read'))
    reader.readAsDataURL(blob)
  })
}

/** Microphone use only begins through start/setContinuous(true), never on mount.
 * The host calls speak even with sound off: it also marks the reply complete.
 */
export function useCompanionVoice(options: VoiceOptions): CompanionVoiceController {
  const { ownerId, token, locale, enabled } = options
  const onTranscript = useRef(options.onTranscript)
  onTranscript.current = options.onTranscript
  const drawingContext = useRef(options.drawingContext)
  drawingContext.current = options.drawingContext
  const actions = useRef<Actions | null>(null)
  const [status, setStatus] = useState<CompanionVoiceStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [transcript, setTranscript] = useState('')
  const [soundOn, setSoundOn] = useState(() => readSound(ownerId))
  const [continuous, setContinuousState] = useState(false)
  const [backend, setBackend] = useState<CompanionVoiceController['backend']>('unavailable')
  const [voiceReady, setVoiceReady] = useState(false)

  useEffect(() => {
    let disposed = false
    let version = 0
    let currentStatus: CompanionVoiceStatus = 'idle'
    let sound = readSound(ownerId)
    let continuing = false
    let sessionTurns = 0
    let sessionTimer: ReturnType<typeof setTimeout> | undefined
    let mode: CompanionVoiceController['backend'] = 'unavailable'
    let config = { asr: false, tts: false }
    let capabilitySettled = false
    let capabilityFailed = false
    let input: MediaStream | null = null
    let recorder: MediaRecorder | null = null
    let recognition: Recognition | null = null
    let context: AudioContext | null = null
    let decodingContext: AudioContext | null = null
    let analyserTimer: ReturnType<typeof setInterval> | undefined
    let player: HTMLAudioElement | null = null
    let playerUrl: string | null = null
    let utterance: SpeechSynthesisUtterance | null = null
    let releaseVoiceWait: (() => void) | null = null
    let request: AbortController | null = null
    let turnContext: DrawingSpeechContext = {}
    const timers = new Set<ReturnType<typeof setTimeout>>()
    const capabilityRequest = new AbortController()
    const voiceWindow = window as VoiceWindow
    const RecognitionApi = voiceWindow.SpeechRecognition ?? voiceWindow.webkitSpeechRecognition
    const secureContext = window.isSecureContext !== false
    const canRecord = !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined'

    function recognitionError(code: string) {
      switch (code) {
        case 'not-allowed': return '麦克风未获允许，可以在浏览器设置里开启，或继续用按钮。'
        case 'service-not-allowed': return '浏览器的语音识别服务不可用，可以换个浏览器或用按钮继续。'
        case 'network': return '浏览器的语音识别服务连接失败，请检查网络后重试。'
        case 'audio-capture': return '没有找到可用麦克风，请检查设备后重试。'
        case 'language-not-supported': return '当前语音服务不支持这种语言，请切换语言或用按钮继续。'
        case 'no-speech': return '没有听清，点麦克风再说一次吧。'
        default: return '暂时没听清，可以再说一次或用按钮。'
      }
    }
    function unavailableMessage() {
      if (!secureContext) return '语音需要安全连接，请用 HTTPS 或 localhost 打开。'
      if (!capabilitySettled) return '语音正在准备，请稍后再点麦克风。'
      if (capabilityFailed) return '语音服务暂时连不上，请刷新页面后重试。'
      if (config.asr && !canRecord) return '当前浏览器无法使用麦克风，请用支持录音的浏览器打开。'
      return '这个浏览器暂时不能听你说话，可以换个浏览器，或用按钮继续。'
    }

    function later(callback: () => void, ms: number) {
      const timer = setTimeout(() => { timers.delete(timer); callback() }, ms)
      timers.add(timer)
      return timer
    }
    function updateStatus(next: CompanionVoiceStatus) {
      currentStatus = next
      if (!disposed) setStatus(next)
      window.dispatchEvent(new CustomEvent('luma-voice-active', { detail: next !== 'idle' }))
    }
    function releaseInput() {
      if (recorder) {
        recorder.onstop = null
        recorder.ondataavailable = null
        recorder.onerror = null
        if (recorder.state !== 'inactive') { try { recorder.stop() } catch { /* Already stopping. */ } }
        recorder = null
      }
      if (recognition) {
        recognition.onstart = null; recognition.onend = null; recognition.onerror = null; recognition.onresult = null
        try { recognition.abort() } catch { /* Already stopped. */ }
        recognition = null
      }
      input?.getTracks().forEach(track => track.stop())
      input = null
      if (analyserTimer) clearInterval(analyserTimer)
      analyserTimer = undefined
      if (context) void context.close().catch(() => undefined)
      context = null
    }
    function releasePlayback() {
      releaseVoiceWait?.(); releaseVoiceWait = null
      if (player) {
        player.onended = null; player.onerror = null
        player.pause(); player.removeAttribute('src'); player.load()
        player = null
      }
      if (playerUrl) URL.revokeObjectURL(playerUrl)
      playerUrl = null
      if (utterance) {
        utterance.onend = null; utterance.onerror = null
        window.speechSynthesis?.cancel()
        utterance = null
      }
    }
    function clearOperation() {
      version++
      request?.abort(); request = null
      if (decodingContext) void decodingContext.close().catch(() => undefined)
      decodingContext = null
      timers.forEach(clearTimeout); timers.clear()
      releaseInput(); releasePlayback()
    }
    function endSession() {
      continuing = false
      if (sessionTimer) clearTimeout(sessionTimer)
      sessionTimer = undefined
      if (!disposed) setContinuousState(false)
    }
    function cancel() {
      endSession(); clearOperation(); updateStatus('idle')
      if (!disposed) setError(null)
    }
    function fail(message: string) {
      cancel()
      if (!disposed) setError(message)
    }
    const valid = (turn: number) => !disposed && enabled && version === turn && document.visibilityState !== 'hidden'
    function resume() {
      updateStatus('idle')
      if (!continuing) return
      if (sessionTurns >= 12) { endSession(); return }
      // Allow the speaker's sound to decay before opening the microphone.
      later(() => { if (continuing) start() }, 450)
    }
    function deliver(text: string, turn: number) {
      if (!valid(turn)) return
      const clean = text.trim().slice(0, 1200)
      if (!clean) { fail('没有听清，点麦克风再说一次吧。'); return }
      releaseInput()
      setTranscript(clean)
      updateStatus('idle')
      sessionTurns++
      // A missing/failed host reply must not leave an indefinite live session.
      later(() => { if (valid(turn) && continuing) endSession() }, 30000)
      onTranscript.current(clean)
    }
    async function transcribe(blob: Blob, turn: number) {
      if (!valid(turn)) return
      updateStatus('transcribing')
      request = new AbortController()
      const controller = request
      const timeout = later(() => { if (valid(turn)) fail('暂时没听清，可以再说一次或用按钮。') }, 20000)
      try {
        const recording = await readVoiceRecording(blob, controller.signal)
        if (!valid(turn) || controller.signal.aborted) return
        const AudioContextApi = window.AudioContext ?? voiceWindow.webkitAudioContext
        if (!AudioContextApi) throw new Error('Audio decoding is unavailable')
        const decoder = new AudioContextApi()
        decodingContext = decoder
        let decoded: AudioBuffer
        try {
          decoded = await decoder.decodeAudioData(recording)
        } finally {
          // Cancellation already closes its decoder; avoid touching a newer turn.
          if (decodingContext === decoder) {
            decodingContext = null
            void decoder.close().catch(() => undefined)
          }
        }
        if (!valid(turn) || controller.signal.aborted) return
        const wav = await convertVoiceBuffer(decoded, controller.signal)
        const base64 = await audioBase64(wav)
        if (!valid(turn) || controller.signal.aborted) return
        const result = await authFetch<{ text: string }>('/nilo/voice/transcribe', {
          method: 'POST', token, signal: controller.signal,
          body: { audioBase64: base64, mimeType: 'audio/wav', locale, context: turnContext },
        })
        deliver(result.text, turn)
      } catch { if (valid(turn)) fail('暂时没听清，可以再说一次或用按钮。') }
      finally { clearTimeout(timeout); timers.delete(timeout) }
    }
    function stop() {
      if (currentStatus === 'preparing') { cancel(); return }
      if (currentStatus !== 'listening') return
      updateStatus('transcribing')
      if (recorder && recorder.state !== 'inactive') {
        try { recorder.stop() } catch { fail('暂时没听清，可以再说一次或用按钮。') }
      } else if (recognition) {
        const turn = version
        try {
          recognition.stop()
          // A browser engine can fail to emit end/result after stop (e.g. its
          // remote recognition service is unreachable). Never spin indefinitely.
          later(() => {
            if (valid(turn) && currentStatus === 'transcribing') fail('语音识别没有响应，请再点麦克风重试。')
          }, 5000)
        } catch { fail('暂时没听清，可以再说一次或用按钮。') }
      } else cancel() // Permission can still be pending; invalidate a late microphone stream.
    }
    function watchSilence(stream: MediaStream, turn: number) {
      const AudioContextApi = window.AudioContext ?? voiceWindow.webkitAudioContext
      if (!AudioContextApi) return
      try {
        context = new AudioContextApi()
        const analyser = context.createAnalyser()
        analyser.fftSize = 1024
        context.createMediaStreamSource(stream).connect(analyser)
        void context.resume().catch(() => undefined)
        const samples = new Uint8Array(analyser.fftSize)
        const floatSamples = new Float32Array(analyser.fftSize)
        const endpoint = createSpeechEndpoint(Date.now())
        analyserTimer = setInterval(() => {
          if (!valid(turn) || currentStatus !== 'listening') return
          let energy = 0
          if (typeof analyser.getFloatTimeDomainData === 'function') {
            analyser.getFloatTimeDomainData(floatSamples)
            energy = floatSamples.reduce((sum, value) => sum + value ** 2, 0) / floatSamples.length
          } else {
            analyser.getByteTimeDomainData(samples)
            energy = samples.reduce((sum, value) => sum + ((value - 128) / 128) ** 2, 0) / samples.length
          }
          const state = endpoint(Math.sqrt(energy), Date.now())
          if (state === 'no-speech') fail('没有听到声音，想说话时再点麦克风。')
          else if (continuing && state === 'silence') stop()
        }, 100)
      } catch { /* Manual stop and the segment limit still work without an analyser. */ }
    }
    async function startRecording(turn: number) {
      try {
        const permissionTimer = later(() => {
          if (valid(turn) && !recorder) fail('麦克风暂时不可用，可以用按钮继续。')
        }, 20000)
        const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
        clearTimeout(permissionTimer); timers.delete(permissionTimer)
        if (!valid(turn)) { stream.getTracks().forEach(track => track.stop()); return }
        input = stream
        const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus']
          .find(type => MediaRecorder.isTypeSupported?.(type))
        recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
        const activeRecorder = recorder
        const chunks: BlobPart[] = []
        recorder.ondataavailable = event => { if (valid(turn) && event.data.size > 0) chunks.push(event.data) }
        recorder.onerror = () => { if (valid(turn)) fail('麦克风暂时不可用，可以用按钮继续。') }
        recorder.onstop = () => {
          if (!valid(turn)) return
          const blob = new Blob(chunks, { type: activeRecorder.mimeType || mimeType || 'audio/webm' })
          releaseInput()
          if (blob.size === 0) { fail('没有听清，点麦克风再说一次吧。'); return }
          void transcribe(blob, turn)
        }
        recorder.start()
        updateStatus('listening')
        watchSilence(stream, turn)
        later(() => { if (valid(turn)) stop() }, 20000)
      } catch (reason) {
        if (!valid(turn)) return
        const denied = reason instanceof DOMException && (reason.name === 'NotAllowedError' || reason.name === 'SecurityError')
        const missing = reason instanceof DOMException && (reason.name === 'NotFoundError' || reason.name === 'NotReadableError')
        fail(denied ? recognitionError('not-allowed') : missing ? recognitionError('audio-capture') : '麦克风暂时不可用，可以用按钮继续。')
      }
    }
    function startRecognition(turn: number, withPhrases = true) {
      if (!RecognitionApi) { fail('当前浏览器暂不支持语音，可以用按钮继续。'); return }
      try {
        recognition = new RecognitionApi()
        recognition.lang = locale === 'zh' ? 'zh-CN' : 'en-US'
        recognition.continuous = true
        recognition.interimResults = true
        const Phrase = voiceWindow.SpeechRecognitionPhrase
        let biased = false
        if (withPhrases && Phrase && 'phrases' in recognition) {
          try { recognition.phrases = recognitionVocabulary(locale, turnContext).map(word => new Phrase(word, 3)) }
          catch { /* Context biasing is optional and is not supported by every engine. */ }
          biased = Boolean(recognition.phrases?.length)
        }
        let finalText = ''
        let hasInterim = false
        let delivered = false
        let settleTimer: ReturnType<typeof setTimeout> | undefined
        function clearSettle() {
          if (settleTimer) { clearTimeout(settleTimer); timers.delete(settleTimer) }
          settleTimer = undefined
        }
        function complete() {
          if (!valid(turn) || delivered) return
          clearSettle()
          delivered = true
          // Never silently drop an unfinished tail (especially a negation).
          if (hasInterim) { fail('这句话还没听完整，请再说一次，或点“说完了”。'); return }
          deliver(finalText, turn)
        }
        recognition.onresult = event => {
          if (!valid(turn) || delivered) return
          const results = Array.from(event.results)
          const separator = locale === 'zh' ? '' : ' '
          finalText = results.filter(result => result.isFinal).map(result => result[0].transcript.trim()).join(separator)
          hasInterim = results.some(result => !result.isFinal && result[0].transcript.trim())
          setTranscript(results.map(result => result[0].transcript.trim()).join(separator))
          clearSettle()
          // A final fragment need not be the end of the child's sentence.
          // New interim/final results extend the window. Manual stop stays immediate.
          if (finalText.trim() && !hasInterim) {
            if (currentStatus === 'transcribing') complete()
            else settleTimer = later(complete, SPEECH_PAUSE_MS)
          }
        }
        recognition.onerror = event => {
          if (!valid(turn) || delivered) return
          if (event.error === 'phrases-not-supported' && biased) {
            delivered = true
            clearSettle(); releaseInput(); startRecognition(turn, false); return
          }
          fail(recognitionError(event.error))
        }
        recognition.onend = complete
        recognition.onstart = () => { if (valid(turn) && !delivered) updateStatus('listening') }
        updateStatus('preparing')
        recognition.start()
        later(() => {
          if (!valid(turn)) return
          if (currentStatus === 'preparing') fail('麦克风暂时不可用，可以用按钮继续。')
          else stop()
        }, 20000)
      } catch (reason) {
        if (!valid(turn)) return
        const denied = reason instanceof DOMException && (reason.name === 'NotAllowedError' || reason.name === 'SecurityError')
        fail(denied ? recognitionError('not-allowed') : '麦克风暂时不可用，可以用按钮继续。')
      }
    }
    function start() {
      if (!enabled || disposed || document.visibilityState === 'hidden') return
      clearOperation()
      setError(null); setTranscript('')
      turnContext = recognitionContext(drawingContext.current)
      const turn = version
      if (mode === 'server') {
        updateStatus('preparing')
        void startRecording(turn)
      } else if (mode === 'browser') startRecognition(turn)
      else fail(unavailableMessage())
    }
    function browserSpeak(text: string, turn: number) {
      if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) {
        setError('声音暂时不可用，可以看字幕继续。'); resume(); return
      }
      const synthesis = window.speechSynthesis
      const availableVoices = () => typeof synthesis.getVoices === 'function' ? synthesis.getVoices() : []
      let settled = false
      function play(voices: SpeechSynthesisVoice[]) {
        if (!valid(turn) || settled) return
        settled = true
        releaseVoiceWait?.(); releaseVoiceWait = null
        const voice = selectCompanionVoice(voices, locale)
        if (!voice && voices.length) {
          setError('声音暂时不可用，可以看字幕继续。'); resume(); return
        }
        utterance = new SpeechSynthesisUtterance(text)
        if (voice) utterance.voice = voice
        // Without enumeration, ask the platform to match the requested language.
        utterance.lang = voice?.lang ?? (locale === 'zh' ? 'zh-CN' : 'en-US')
        utterance.pitch = companionSpeechProfile.pitch
        utterance.rate = companionSpeechProfile.rate
        utterance.onend = () => { if (valid(turn)) { releasePlayback(); resume() } }
        utterance.onerror = () => { if (valid(turn)) fail('声音没播放成功，点麦克风或看字幕继续。') }
        updateStatus('speaking')
        try { synthesis.speak(utterance) }
        catch { if (valid(turn)) fail('声音没播放成功，点麦克风或看字幕继续。') }
      }
      const voices = availableVoices()
      if (voices.length) { play(voices); return }
      if (typeof synthesis.addEventListener !== 'function') { play(voices); return }
      // Some browsers populate voices asynchronously; keep the wait cancellable.
      updateStatus('speaking')
      const onVoicesChanged = () => {
        const available = availableVoices()
        if (available.length) play(available)
      }
      const waitTimer = later(() => play(availableVoices()), 1000)
      synthesis.addEventListener('voiceschanged', onVoicesChanged)
      releaseVoiceWait = () => {
        synthesis.removeEventListener('voiceschanged', onVoicesChanged)
        clearTimeout(waitTimer); timers.delete(waitTimer)
      }
    }
    async function speak(text: string) {
      if (!enabled || disposed || document.visibilityState === 'hidden') return
      clearOperation()
      setError(null)
      const turn = version
      const clean = text.trim().slice(0, 1500)
      if (!clean || !sound) { resume(); return }
      later(() => {
        if (valid(turn) && currentStatus === 'speaking') fail('声音没播放成功，点麦克风或看字幕继续。')
      }, 90000)
      if (!config.tts) { browserSpeak(clean, turn); return }
      updateStatus('speaking')
      request = new AbortController()
      const controller = request
      later(() => controller.abort(), 20000)
      try {
        const result = await authFetch<{ audioBase64: string; mimeType: string }>('/nilo/voice/speak', {
          method: 'POST', token, signal: controller.signal, body: { text: clean, locale },
        })
        if (!valid(turn)) return
        const bytes = Uint8Array.from(atob(result.audioBase64), char => char.charCodeAt(0))
        playerUrl = URL.createObjectURL(new Blob([bytes], { type: result.mimeType }))
        player = new Audio(playerUrl)
        player.onended = () => { if (valid(turn)) { releasePlayback(); resume() } }
        player.onerror = () => { if (valid(turn)) fail('声音没播放成功，点麦克风或看字幕继续。') }
        try { await player.play() }
        catch { if (valid(turn)) fail('声音没播放成功，点麦克风或看字幕继续。') }
      } catch { if (valid(turn)) browserSpeak(clean, turn) }
    }
    function toggleSound() {
      sound = !sound
      setSoundOn(sound)
      try { localStorage.setItem(preferenceKey(ownerId), sound ? 'on' : 'off') } catch { /* Private mode. */ }
      if (!sound && currentStatus === 'speaking') { clearOperation(); resume() }
    }
    function setContinuous(value: boolean) {
      if (!value) { cancel(); return }
      endSession()
      continuing = true; sessionTurns = 0
      setContinuousState(true)
      sessionTimer = setTimeout(() => { cancel() }, 5 * 60 * 1000)
      start()
    }
    function onVisibility() { if (document.visibilityState === 'hidden') cancel() }

    setSoundOn(sound); setContinuousState(false); setTranscript(''); setError(null)
    // Browser recognition is usable immediately, regardless of TTS or a slow
    // cloud capability check. This does not start recording or request permission.
    mode = enabled && secureContext && RecognitionApi ? 'browser' : 'unavailable'
    setVoiceReady(mode === 'browser'); setBackend(mode); updateStatus('idle')
    actions.current = { start, stop, cancel, speak: text => { void speak(text) }, toggleSound, setContinuous }
    document.addEventListener('visibilitychange', onVisibility)
    let capabilityTimer: ReturnType<typeof setTimeout> | undefined
    function finishCapabilities(value?: { asr: boolean; tts: boolean }) {
      if (disposed || capabilitySettled) return
      capabilitySettled = true
      if (capabilityTimer) clearTimeout(capabilityTimer)
      capabilityFailed = !value
      if (value) config = { asr: value.asr === true, tts: value.tts === true }
      mode = !secureContext ? 'unavailable' : config.asr && canRecord ? 'server' : RecognitionApi ? 'browser' : 'unavailable'
      setBackend(mode); setVoiceReady(true)
    }
    if (enabled) {
      // Keep this timer separate from operation timers: clicking the microphone
      // must not cancel capability discovery or leave it pending forever.
      capabilityTimer = setTimeout(() => {
        finishCapabilities()
        capabilityRequest.abort()
      }, 4000)
      void authFetch<{ asr: boolean; tts: boolean }>('/nilo/voice/config', { token, signal: capabilityRequest.signal })
        .then(finishCapabilities)
        .catch(() => finishCapabilities())
    }
    return () => {
      disposed = true
      if (capabilityTimer) clearTimeout(capabilityTimer)
      capabilityRequest.abort()
      cancel()
      actions.current = null
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [ownerId, token, locale, enabled])

  const start = useCallback(() => actions.current?.start(), [])
  const stop = useCallback(() => actions.current?.stop(), [])
  const cancel = useCallback(() => actions.current?.cancel(), [])
  const speak = useCallback((text: string) => actions.current?.speak(text), [])
  const toggleSound = useCallback(() => actions.current?.toggleSound(), [])
  const setContinuous = useCallback((value: boolean) => actions.current?.setContinuous(value), [])
  return { status, error, transcript, soundOn, continuous, backend, supported: backend !== 'unavailable', voiceReady, start, stop, cancel, speak, toggleSound, setContinuous }
}
