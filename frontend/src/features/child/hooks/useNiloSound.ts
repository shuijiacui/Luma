import { useCallback, useEffect, useRef, useState } from 'react'

export type NiloSound = 'head' | 'nose' | 'hand' | 'belly' | 'tail' | 'lantern' | 'door'

type Tone = {
  frequency: number
  delay: number
  duration: number
  volume: number
  endFrequency?: number
  wave?: OscillatorType
}
type Voice = { oscillator: OscillatorNode; gain: GainNode }

// Quiet, rounded phrases: a little music, without a recording or a network request.
const phrases: Record<NiloSound, Tone[]> = {
  head: [
    { frequency: 523.25, delay: 0, duration: .3, volume: .034 },
    { frequency: 659.25, delay: .13, duration: .4, volume: .026 },
  ],
  nose: [
    { frequency: 940, endFrequency: 610, delay: 0, duration: .15, volume: .04 },
    { frequency: 1174.66, endFrequency: 880, delay: .12, duration: .17, volume: .024 },
  ],
  hand: [
    { frequency: 659.25, delay: 0, duration: .2, volume: .034, wave: 'triangle' },
    { frequency: 1046.5, delay: .085, duration: .35, volume: .029 },
  ],
  belly: [
    { frequency: 329.63, endFrequency: 392, delay: 0, duration: .14, volume: .034 },
    { frequency: 392, endFrequency: 440, delay: .12, duration: .13, volume: .029 },
    { frequency: 329.63, endFrequency: 392, delay: .24, duration: .14, volume: .026 },
    { frequency: 523.25, delay: .37, duration: .25, volume: .022 },
  ],
  tail: [
    { frequency: 440, endFrequency: 587.33, delay: 0, duration: .23, volume: .026 },
    { frequency: 587.33, endFrequency: 739.99, delay: .16, duration: .29, volume: .023 },
  ],
  lantern: [
    { frequency: 523.25, delay: 0, duration: .5, volume: .026 },
    { frequency: 783.99, delay: .16, duration: .55, volume: .023 },
    { frequency: 1046.5, delay: .32, duration: .68, volume: .02 },
    { frequency: 1318.51, delay: .48, duration: .72, volume: .012 },
  ],
  door: [
    { frequency: 523.25, delay: 0, duration: .28, volume: .03 },
    { frequency: 659.25, delay: .1, duration: .3, volume: .027 },
    { frequency: 783.99, delay: .2, duration: .34, volume: .024 },
    { frequency: 1046.5, delay: .32, duration: .5, volume: .02 },
  ],
}

function disconnectVoice(voice: Voice) {
  voice.oscillator.onended = null
  voice.oscillator.disconnect()
  voice.gain.disconnect()
}

export function useNiloSound() {
  const [soundOn, setSoundOn] = useState(() => {
    try { return localStorage.getItem('luma_nilo_sound') === 'on' } catch { return false }
  })
  const enabledRef = useRef(soundOn)
  const mountedRef = useRef(true)
  const contextRef = useRef<AudioContext | null>(null)
  const voicesRef = useRef(new Set<Voice>())
  const lastSoundRef = useRef(-Infinity)
  const requestRef = useRef(0)

  const getContext = useCallback(() => {
    if (contextRef.current && contextRef.current.state !== 'closed') return contextRef.current
    const AudioContextClass = window.AudioContext ??
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioContextClass) return null
    contextRef.current = new AudioContextClass()
    return contextRef.current
  }, [])

  useEffect(() => {
    mountedRef.current = true
    const voices = voicesRef.current
    return () => {
      mountedRef.current = false
      requestRef.current += 1
      for (const voice of voices) {
        try { voice.oscillator.stop() } catch { /* It may already have ended. */ }
        disconnectVoice(voice)
      }
      voices.clear()
      const context = contextRef.current
      contextRef.current = null
      if (context && context.state !== 'closed') void context.close().catch(() => {})
    }
  }, [])

  const play = useCallback((kind: NiloSound) => {
    const now = performance.now()
    if (!enabledRef.current || !mountedRef.current || now - lastSoundRef.current < 300) return
    lastSoundRef.current = now
    const request = ++requestRef.current
    try {
      const context = getContext()
      if (!context) return
      const schedule = () => {
        if (!mountedRef.current || !enabledRef.current || request !== requestRef.current || context.state !== 'running') return
        const phrase = phrases[kind]
        // Include future notes in this limit, so rapid touches cannot pile up audio.
        if (voicesRef.current.size + phrase.length > 12) return
        for (const tone of phrase) {
          const voice = { oscillator: context.createOscillator(), gain: context.createGain() }
          voicesRef.current.add(voice)
          try {
            const start = context.currentTime + .008 + tone.delay
            const end = start + tone.duration
            voice.oscillator.type = tone.wave ?? 'sine'
            voice.oscillator.frequency.setValueAtTime(tone.frequency, start)
            if (tone.endFrequency) voice.oscillator.frequency.exponentialRampToValueAtTime(tone.endFrequency, end)
            voice.gain.gain.setValueAtTime(0, start)
            voice.gain.gain.linearRampToValueAtTime(tone.volume, start + .014)
            voice.gain.gain.exponentialRampToValueAtTime(.0001, end)
            voice.oscillator.connect(voice.gain)
            voice.gain.connect(context.destination)
            voice.oscillator.onended = () => {
              disconnectVoice(voice)
              voicesRef.current.delete(voice)
            }
            voice.oscillator.start(start)
            voice.oscillator.stop(end + .025)
          } catch {
            try { voice.oscillator.stop() } catch { /* An unstarted oscillator needs no stop. */ }
            disconnectVoice(voice)
            voicesRef.current.delete(voice)
          }
        }
      }
      // resume is invoked in the original pointer/keyboard gesture, including on iPad.
      if (context.state === 'running') schedule()
      else void context.resume().then(schedule).catch(() => {})
    } catch { /* Visual interaction remains available without audio support. */ }
  }, [getContext])

  const toggleSound = useCallback(() => {
    const enabled = !enabledRef.current
    enabledRef.current = enabled
    requestRef.current += 1
    lastSoundRef.current = -Infinity
    setSoundOn(enabled)
    try { localStorage.setItem('luma_nilo_sound', enabled ? 'on' : 'off') } catch { /* Optional preference. */ }
    if (enabled) {
      try {
        const context = getContext()
        if (context && context.state !== 'running') void context.resume().catch(() => {})
      } catch { /* Audio support is optional. */ }
    } else {
      const context = contextRef.current
      if (!context) return
      for (const voice of voicesRef.current) {
        try {
          voice.gain.gain.cancelScheduledValues(context.currentTime)
          voice.gain.gain.setTargetAtTime(0, context.currentTime, .012)
          voice.oscillator.stop(context.currentTime + .06)
        } catch { /* The voice may have ended during this gesture. */ }
      }
    }
  }, [getContext])

  return { soundOn, toggleSound, play }
}
