export const VOICE_SAMPLE_RATE = 16000

function abortIfNeeded(signal: AbortSignal) {
  if (signal.aborted) throw new DOMException('Audio conversion cancelled', 'AbortError')
}

/** Browser recorders differ (WebM on Chrome, MP4 on Safari). Read their output
 * without retaining an unabortable FileReader when the child leaves. */
export function readVoiceRecording(blob: Blob, signal: AbortSignal): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    abortIfNeeded(signal)
    const reader = new FileReader()
    const cleanup = () => signal.removeEventListener('abort', abort)
    const abort = () => { reader.abort(); cleanup(); reject(new DOMException('Audio read cancelled', 'AbortError')) }
    reader.onload = () => { cleanup(); resolve(reader.result as ArrayBuffer) }
    reader.onerror = () => { cleanup(); reject(reader.error ?? new Error('Audio read failed')) }
    reader.onabort = () => { cleanup(); reject(new DOMException('Audio read cancelled', 'AbortError')) }
    signal.addEventListener('abort', abort, { once: true })
    reader.readAsArrayBuffer(blob)
  })
}

/** Write standard 16-bit PCM WAV and explicitly mix all channels to mono. */
export function encodeVoiceWav(channels: readonly Float32Array[]): ArrayBuffer {
  const frames = channels[0]?.length ?? 0
  if (!frames || channels.some(channel => channel.length !== frames)) throw new Error('Invalid audio channels')
  const buffer = new ArrayBuffer(44 + frames * 2)
  const view = new DataView(buffer)
  const text = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i))
  }
  text(0, 'RIFF'); view.setUint32(4, 36 + frames * 2, true); text(8, 'WAVE')
  text(12, 'fmt '); view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // One channel
  view.setUint32(24, VOICE_SAMPLE_RATE, true)
  view.setUint32(28, VOICE_SAMPLE_RATE * 2, true)
  view.setUint16(32, 2, true); view.setUint16(34, 16, true)
  text(36, 'data'); view.setUint32(40, frames * 2, true)
  for (let frame = 0; frame < frames; frame++) {
    let sum = 0
    for (const channel of channels) sum += Number.isFinite(channel[frame]) ? channel[frame] : 0
    const value = Math.max(-1, Math.min(1, sum / channels.length))
    view.setInt16(44 + frame * 2, Math.round(value * (value < 0 ? 32768 : 32767)), true)
  }
  return buffer
}

/** Let Web Audio perform filtered resampling instead of dropping samples. */
export async function convertVoiceBuffer(decoded: AudioBuffer, signal: AbortSignal): Promise<Blob> {
  abortIfNeeded(signal)
  if (!decoded.length || decoded.length / decoded.sampleRate > 25) throw new Error('Invalid recording length')
  let audio = decoded
  if (decoded.sampleRate !== VOICE_SAMPLE_RATE) {
    const OfflineContext = window.OfflineAudioContext ?? (window as Window & { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext
    if (!OfflineContext) throw new Error('Audio resampling is unavailable')
    const frames = Math.ceil(decoded.length * VOICE_SAMPLE_RATE / decoded.sampleRate)
    const offline = new OfflineContext(1, frames, VOICE_SAMPLE_RATE)
    const source = offline.createBufferSource()
    source.buffer = decoded
    source.connect(offline.destination)
    source.start()
    const abort = () => { try { source.stop() } catch { /* Rendering may have ended. */ }; source.disconnect() }
    signal.addEventListener('abort', abort, { once: true })
    try {
      audio = await offline.startRendering()
    } finally {
      signal.removeEventListener('abort', abort)
      source.disconnect()
    }
  }
  abortIfNeeded(signal)
  const channels = Array.from({ length: audio.numberOfChannels }, (_, channel) => audio.getChannelData(channel))
  return new Blob([encodeVoiceWav(channels)], { type: 'audio/wav' })
}
