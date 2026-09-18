import { useCallback, useEffect, useRef, useState } from 'react'
import { musicTracks, musicUrl } from '../musicTracks'

export function useDrawingMusic() {
  const [trackId, setTrackId] = useState<string>(musicTracks[0].id)
  const [volume, setVolume] = useState(15)
  const [status, setStatus] = useState<'off' | 'loading' | 'on'>('off')
  const [error, setError] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const wanted = useRef(false)
  const request = useRef(0)
  const mounted = useRef(true)
  const voiceActive = useRef(false)
  const preferredVolume = useRef(volume)
  const stop = useCallback(() => {
    request.current++
    audioRef.current?.pause()
  }, [])

  const play = useCallback(async (audio: HTMLAudioElement) => {
    const version = ++request.current
    setStatus('loading')
    try {
      await audio.play()
      if (mounted.current && version === request.current && wanted.current) setStatus('on')
    } catch {
      if (!mounted.current || version !== request.current) return
      wanted.current = false
      audio.pause()
      setStatus('off')
      setError(true)
    }
  }, [])

  useEffect(() => {
    mounted.current = true
    function visibilityChanged() {
      const audio = audioRef.current
      if (!audio || !wanted.current) return
      if (document.visibilityState !== 'visible') {
        stop()
        setStatus('on')
      } else void play(audio)
    }
    function voiceChanged(event: Event) {
      voiceActive.current = (event as CustomEvent<boolean>).detail === true
      if (audioRef.current) audioRef.current.volume = preferredVolume.current / 100 * (voiceActive.current ? .15 : 1)
    }
    document.addEventListener('visibilitychange', visibilityChanged)
    window.addEventListener('luma-voice-active', voiceChanged)
    return () => {
      mounted.current = false
      wanted.current = false
      stop()
      document.removeEventListener('visibilitychange', visibilityChanged)
      window.removeEventListener('luma-voice-active', voiceChanged)
      const audio = audioRef.current
      if (audio) {
        audio.onerror = null
        audio.removeAttribute('src')
        audio.load()
      }
      audioRef.current = null
    }
  }, [play, stop])

  function toggle() {
    setError(false)
    if (wanted.current) {
      wanted.current = false
      stop()
      setStatus('off')
      return
    }
    wanted.current = true
    let audio = audioRef.current
    if (!audio) {
      audio = new Audio(musicUrl(musicTracks.find(track => track.id === trackId)!.file))
      audio.loop = true
      audio.preload = 'none'
      audio.volume = volume / 100 * (voiceActive.current ? .15 : 1)
      audio.onerror = () => {
        if (!mounted.current || !wanted.current) return
        wanted.current = false
        request.current++
        audioRef.current?.pause()
        setStatus('off')
        setError(true)
      }
      audioRef.current = audio
    }
    void play(audio)
  }

  function selectTrack(id: string) {
    const track = musicTracks.find(item => item.id === id)
    if (!track || id === trackId) return
    setTrackId(id)
    setError(false)
    request.current++
    const audio = audioRef.current
    if (!audio) return
    audio.pause()
    audio.src = musicUrl(track.file)
    if (wanted.current && document.visibilityState === 'visible') void play(audio)
  }

  function changeVolume(value: number) {
    const next = Math.max(0, Math.min(100, value))
    preferredVolume.current = next
    setVolume(next)
    if (audioRef.current) audioRef.current.volume = next / 100 * (voiceActive.current ? .15 : 1)
  }

  return { trackId, volume, status, error, toggle, selectTrack, changeVolume }
}
