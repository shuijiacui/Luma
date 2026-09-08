import { animate, useMotionValue, type MotionValue } from 'framer-motion'
import { useEffect, useId, useRef, useState } from 'react'
import idle from '@/assets/images/nilo-companion-v1.png'
import content from '@/assets/images/nilo/nilo-content.png'
import laugh from '@/assets/images/nilo/nilo-laugh.png'
import highfive from '@/assets/images/nilo/nilo-highfive.png'
import silhouettes from './nilo-silhouettes.json'
import type { NiloSound } from '../hooks/useNiloSound'

export type NiloPose = 'idle' | 'content' | 'laugh' | 'highfive'
type Part = Exclude<NiloSound, 'door'>
const artwork = { idle, content, laugh, highfive }
type Silhouette = { width: number; height: number; path: string }
const outlines: Record<string, Silhouette> = silhouettes

// Smooth displacement fields bend the intact painting locally. There are no
// detached limbs, neck cut lines, independently scaled heads or visible joints.
function field(cx: number, cy: number, rx: number, ry: number, axis: 'x' | 'y') {
  const color = axis === 'x' ? '#ff8080' : '#80ff80'
  return 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="1254" height="1254"><defs><radialGradient id="f"><stop stop-color="${color}"/><stop offset="1" stop-color="#808080"/></radialGradient></defs><path fill="#808080" d="M0 0H1254V1254H0Z"/><ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#f)"/></svg>`)
}
const fields = {
  idle: field(540, 790, 230, 245, 'y'),
  head: field(650, 290, 315, 250, 'y'),
  nose: field(576, 319, 130, 100, 'y'),
  hand: field(810, 480, 170, 185, 'x'),
  belly: field(548, 765, 250, 250, 'x'),
  tail: field(1060, 962, 250, 140, 'y'),
  lantern: field(279, 525, 150, 175, 'x'),
}
const gazeField = field(650, 280, 315, 250, 'x')
const movement: Record<Part, number[]> = {
  head: [-13, -8, -11, 0], nose: [10, -6, 3, 0], hand: [-5, 3, 0],
  belly: [15, -11, 12, -8, 7, 0], tail: [40, -32, 31, -20, 12, 0], lantern: [19, -12, 9, 0],
}

export function NiloIllustration({ part, phase, blinking, paused, gaze, sequence, onPoseChange }: {
  part?: Part; phase: string; blinking: boolean; paused: boolean; gaze: MotionValue<number>; sequence: number
  onPoseChange: (pose: NiloPose) => void
}) {
  const id = useId().replace(/:/g, '')
  const warp = useMotionValue(0)
  const warpNode = useRef<SVGFEDisplacementMapElement>(null)
  const gazeNode = useRef<SVGFEDisplacementMapElement>(null)
  const [ready, setReady] = useState<Partial<Record<NiloPose, boolean>>>({ idle: true })
  const respond = phase === 'respond'
  const requested: NiloPose = respond && part === 'hand' ? 'highfive'
    : respond && part === 'belly' ? 'laugh'
      : (respond && part === 'head') || blinking ? 'content' : 'idle'
  const pose = ready[requested] ? requested : 'idle'
  const silhouette = pose === 'highfive' ? outlines.highfive ?? outlines.idle : outlines.idle

  useEffect(() => {
    let mounted = true
    const loaders = (Object.entries(artwork) as [NiloPose, string][]).map(([name, src]) => {
      const image = new Image()
      image.onload = () => {
        const complete = () => { if (mounted) setReady(current => ({ ...current, [name]: true })) }
        if (image.decode) void image.decode().then(complete).catch(() => {})
        else complete()
      }
      image.src = src
      return image
    })
    return () => { mounted = false; loaders.forEach(image => { image.onload = null }) }
  }, [])
  useEffect(() => onPoseChange(pose), [pose, onPoseChange])
  useEffect(() => warp.on('change', value => warpNode.current?.setAttribute('scale', String(value))), [warp])
  useEffect(() => {
    const update = (value: number) => gazeNode.current?.setAttribute('scale', String(paused || part ? 0 : value * 3))
    update(gaze.get())
    return gaze.on('change', update)
  }, [gaze, paused, part])
  useEffect(() => {
    if (paused) { warp.set(0); return }
    const animation = !part
      ? animate(warp, [warp.get(), -5, 0], { duration: 5.2, repeat: Infinity, ease: 'easeInOut' })
      : animate(warp, respond ? [warp.get(), ...movement[part]] : 0, { duration: respond ? part === 'lantern' ? 1.85 : 1.1 : .18, ease: 'easeInOut' })
    return () => animation.stop()
  }, [paused, part, respond, sequence, warp])

  return <svg className="nilo-illustration" viewBox="0 0 1254 1254" data-pose={pose} aria-hidden="true" focusable="false">
    <defs>
      <radialGradient id={id + '-face-feather'}><stop offset=".66" stopColor="white" /><stop offset="1" stopColor="black" /></radialGradient>
      <mask id={id + '-face'} maskUnits="userSpaceOnUse" x="0" y="0" width="1254" height="1254" style={{ maskType: 'luminance' }}>
        <ellipse cx="650" cy="310" rx="300" ry="240" fill={`url(#${id}-face-feather)`} />
      </mask>
      <mask id={id + '-outline'} maskUnits="userSpaceOnUse" x="0" y="0" width="1254" height="1254" style={{ maskType: 'luminance' }}>
        <path d={silhouette.path} fill="white" fillRule="evenodd" stroke="black" strokeWidth=".55" strokeLinejoin="round" />
      </mask>
      <filter id={id + '-motion'} filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse" x="0" y="0" width="1254" height="1254" colorInterpolationFilters="sRGB">
        <feImage href={fields[part ?? 'idle']} x="0" y="0" width="1254" height="1254" result="field" />
        <feDisplacementMap ref={warpNode} in="SourceGraphic" in2="field" scale="0" xChannelSelector="R" yChannelSelector="G" result="reaction" />
        <feImage href={gazeField} x="0" y="0" width="1254" height="1254" result="gaze" />
        <feDisplacementMap ref={gazeNode} in="reaction" in2="gaze" scale="0" xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </defs>
    <g filter={paused ? undefined : `url(#${id}-motion)`}>
      <g mask={`url(#${id}-outline)`}>
        <image href={pose === 'highfive' ? highfive : idle} x="0" y="0" width="1254" height="1254" />
        {(pose === 'content' || pose === 'laugh') && <image href={artwork[pose]} x="0" y="0" width="1254" height="1254" mask={`url(#${id}-face)`} />}
      </g>
    </g>
  </svg>
}
