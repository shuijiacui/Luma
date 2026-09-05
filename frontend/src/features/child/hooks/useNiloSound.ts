import { useCallback, useEffect, useRef, useState } from 'react'

export type NiloSound = 'head' | 'nose' | 'hand' | 'belly' | 'tail' | 'door'
const notes: Record<NiloSound, number[]> = {
  head: [523, 659], nose: [880, 1175], hand: [659, 784, 1047],
  belly: [392, 523, 392, 659], tail: [440, 587, 740], door: [523, 659, 784, 1047],
}
export function useNiloSound() {
  const [soundOn, setSoundOn] = useState(() => {
    try { return localStorage.getItem('luma_nilo_sound') === 'on' } catch { return false }
  })
  const contextRef = useRef<AudioContext | null>(null)
  const lastSound = useRef(0)
  useEffect(() => () => { void contextRef.current?.close().catch(() => {}) }, [])
  const play = useCallback((kind: NiloSound) => {
    if (!soundOn || Date.now() - lastSound.current < 250) return
    lastSound.current = Date.now()
    try {
      const context = contextRef.current ?? new AudioContext()
      contextRef.current = context
      void context.resume().catch(() => {})
      notes[kind].forEach((frequency, index) => {
        const oscillator = context.createOscillator()
        const gain = context.createGain()
        const start = context.currentTime + index * .09
        oscillator.type = 'sine'
        oscillator.frequency.setValueAtTime(frequency, start)
        gain.gain.setValueAtTime(0, start)
        gain.gain.linearRampToValueAtTime(.045, start + .018)
        gain.gain.exponentialRampToValueAtTime(.001, start + .22)
        oscillator.connect(gain)
        gain.connect(context.destination)
        oscillator.start(start)
        oscillator.stop(start + .25)
        oscillator.onended = () => { oscillator.disconnect(); gain.disconnect() }
      })
    } catch { /* Visual interaction remains available without audio support. */ }
  }, [soundOn])
  function toggleSound() {
    setSoundOn(current => {
      try { localStorage.setItem('luma_nilo_sound', current ? 'off' : 'on') } catch { /* optional preference */ }
      return !current
    })
  }
  return { soundOn, toggleSound, play }
}
