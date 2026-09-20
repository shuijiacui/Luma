import type { NiloStrokeSpec } from '@/lib/api/lumaApi'
import { BRUSHES, type BrushKind } from '../brushes'
import { compileSketch, SKETCH_LIMITS, validateSketch, type DrawingSketch } from './sketch'

export const templates = ['waves', 'fish', 'leaf', 'window', 'stars', 'cloud', 'flower', 'trail', 'flame', 'rain', 'grass', 'echo', 'sun', 'moon', 'tree', 'mountain', 'house', 'boat', 'bird', 'butterfly', 'heart'] as const
export type BuiltinTemplate = typeof templates[number]
export type Template = BuiltinTemplate | 'custom'
export interface SubjectAnchor { x: number; y: number; width: number; height: number }
export type ProposalPlacement = 'above' | 'below' | 'left' | 'right' | 'inside' | 'near'
export interface DrawingProposal {
  template: Template
  x: number; y: number; width: number; height: number
  rotation: number; color: string; strokeWidth: number
  brushKind?: BrushKind
  target?: string; relation?: string
  anchor?: SubjectAnchor
  placement?: ProposalPlacement
  /** A bounded new object, distinct from its existing-scene target. */
  subject?: string
  sketch?: DrawingSketch
  /** Pin the first custom path to this existing outline point. */
  attachment?: { x: number; y: number }
  /** Child-authored source samples, supplied by the server for echo only. */
  echoPoints?: { x: number; y: number }[]
}
export interface CompanionReply {
  reply: string
  status?: 'ready' | 'clarify' | 'unavailable'
  reason?: 'model_unavailable' | 'timeout' | 'provider_error' | 'invalid_response' | 'missing_image'
  retryable?: boolean
  theme?: string
  proposal?: DrawingProposal
  additions?: DrawingProposal[]
  alternatives?: DrawingProposal[]
}
export interface StoryMemory {
  theme: string
  recentTemplates: string[]
  rejectedTemplates: string[]
  recentSubjects: string[]
  rejectedSubjects: string[]
}
export const emptyMemory = (): StoryMemory => ({ theme: '', recentTemplates: [], rejectedTemplates: [], recentSubjects: [], rejectedSubjects: [] })
const memorySubjects = (value: unknown): string[] => Array.isArray(value)
  ? [...new Set(value.filter((v): v is string => typeof v === 'string').map(v => v.trim().slice(0, 60)).filter(Boolean))].slice(-4) : []
const memoryValue = (value: Partial<StoryMemory>): StoryMemory => ({
  theme: typeof value.theme === 'string' ? value.theme.trim().slice(0, 120) : '',
  recentTemplates: Array.isArray(value.recentTemplates) ? value.recentTemplates.filter((v: unknown) => templates.includes(v as BuiltinTemplate)).slice(-4) : [],
  rejectedTemplates: Array.isArray(value.rejectedTemplates) ? value.rejectedTemplates.filter((v: unknown) => templates.includes(v as BuiltinTemplate)).slice(-4) : [],
  recentSubjects: memorySubjects(value.recentSubjects), rejectedSubjects: memorySubjects(value.rejectedSubjects),
})
export function readMemory(owner: string, artwork?: string): StoryMemory {
  if (!artwork) return emptyMemory()
  try {
    const value = JSON.parse(localStorage.getItem(`luma_story:${owner}:${artwork}`) ?? 'null')
    return value && typeof value === 'object' ? memoryValue(value) : emptyMemory()
  } catch { return emptyMemory() }
}
export function saveMemory(owner: string, artwork: string, memory: Partial<StoryMemory>) {
  try { localStorage.setItem(`luma_story:${owner}:${artwork}`, JSON.stringify(memoryValue(memory))) } catch { /* Drawing persistence remains independent of optional story memory. */ }
}
export function readMode(owner: string): 'off' | 'together' {
  try { return localStorage.getItem(`luma_companion_mode:${owner}`) === 'together' ? 'together' : 'off' } catch { return 'off' }
}
export function saveMode(owner: string, mode: 'off' | 'together') {
  try { localStorage.setItem(`luma_companion_mode:${owner}`, mode) } catch { /* optional preference */ }
}
export function hasWelcomed(owner: string) {
  try { return localStorage.getItem(`luma_companion_welcome:${owner}`) === '1' } catch { return false }
}
export function markWelcomed(owner: string) {
  try { localStorage.setItem(`luma_companion_welcome:${owner}`, '1') } catch { /* optional preference */ }
}

/** Evenly retain the whole gesture, including endpoints, instead of sending thousands of points. */
export function summarizeStroke(stroke: { points: { x: number; y: number }[]; color: string; width: number } | null) {
  if (!stroke?.points?.length) return null
  const points = stroke.points.filter(point => Number.isFinite(point.x) && Number.isFinite(point.y) && point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1)
  if (points.length < 2) return null
  const count = Math.min(24, points.length)
  return { ...stroke, points: Array.from({ length: count }, (_, i) => ({ ...points[Math.round(i * (points.length - 1) / (count - 1))] })) }
}

type Point = { x: number; y: number }
type Paths = Point[][]
const path = (...xy: number[]): Point[] => Array.from({ length: xy.length / 2 }, (_, i) => ({ x: xy[i * 2], y: xy[i * 2 + 1] }))
const ellipse = (cx: number, cy: number, rx: number, ry: number, start = 0, end = Math.PI * 2): Point[] =>
  Array.from({ length: 49 }, (_, i) => ({ x: cx + Math.cos(start + (end - start) * i / 48) * rx, y: cy + Math.sin(start + (end - start) * i / 48) * ry }))
const curve = (x0: number, y0: number, x1: number, y1: number, x2: number, y2: number): Point[] =>
  Array.from({ length: 33 }, (_, i) => { const t = i / 32; return { x: (1 - t) ** 2 * x0 + 2 * t * (1 - t) * x1 + t ** 2 * x2, y: (1 - t) ** 2 * y0 + 2 * t * (1 - t) * y1 + t ** 2 * y2 } })

/** Small complete contributions. Geometry, preview and committed drawing share these paths. */
function localPaths(template: BuiltinTemplate): Paths {
  switch (template) {
    case 'waves': return [0.28, 0.7].map(y => Array.from({ length: 61 }, (_, i) => ({ x: 0.06 + i / 60 * .88, y: y + Math.sin(i / 60 * Math.PI * 4) * .13 })))
    case 'fish': return [ellipse(.43, .5, .34, .29), path(.75, .5, .94, .18, .94, .82, .75, .5), ellipse(.25, .43, .025, .035)]
    case 'leaf': return [curve(.1, .9, .04, .06, .9, .1), curve(.9, .1, .96, .94, .1, .9), path(.1, .9, .9, .1), path(.43, .57, .23, .35), path(.61, .39, .77, .65)]
    case 'window': return [path(.12, .12, .88, .12, .88, .88, .12, .88, .12, .12), path(.5, .12, .5, .88), path(.12, .5, .88, .5)]
    case 'stars': return [[.3, .35, .24], [.77, .74, .15]].map(([cx, cy, r]) => Array.from({ length: 11 }, (_, i) => { const a = -Math.PI / 2 + i * Math.PI / 5; return { x: cx + Math.cos(a) * r * (i % 2 ? .42 : 1), y: cy + Math.sin(a) * r * (i % 2 ? .42 : 1) } }))
    case 'cloud': return [curve(.1, .72, -.04, .3, .28, .35).concat(curve(.28, .35, .43, -.12, .66, .35), curve(.66, .35, 1.06, .18, .9, .72), path(.9, .72, .1, .72))]
    case 'flower': return [path(.5, .5, .5, .94), curve(.5, .78, .05, .5, .16, .85), ...Array.from({ length: 5 }, (_, i) => { const a = i * Math.PI * 2 / 5; return ellipse(.5 + Math.cos(a) * .19, .35 + Math.sin(a) * .19, .12, .12) }), ellipse(.5, .35, .09, .09)]
    case 'trail': return [curve(.15, .92, .85, .55, .46, .08), curve(.44, .92, 1, .57, .64, .08)]
    case 'flame': return [curve(.12, .12, -.08, .54, .5, .94).concat(curve(.5, .94, 1.08, .54, .88, .12)), curve(.36, .16, .28, .55, .5, .73).concat(curve(.5, .73, .72, .55, .64, .16))]
    case 'rain': return [.2, .5, .8].flatMap(x => [path(x, .08, x - .12, .4), path(x + .08, .6, x - .04, .92)])
    case 'grass': return [.22, .5, .78].flatMap(x => [curve(x, .9, x - .03, .24, x - .13, .12), curve(x, .9, x + .01, .45, x + .13, .3)])
    case 'sun': return [ellipse(.5, .5, .23, .23), ...Array.from({ length: 8 }, (_, i) => {
      const a = i * Math.PI / 4
      return path(.5 + Math.cos(a) * .32, .5 + Math.sin(a) * .32, .5 + Math.cos(a) * .44, .5 + Math.sin(a) * .44)
    })]
    case 'moon': return [curve(.7, .09, -.31, .5, .7, .91).concat(curve(.7, .91, .18, .5, .7, .09))]
    case 'tree': return [path(.43, .91, .43, .59), path(.57, .91, .57, .59), path(.37, .92, .65, .92),
      curve(.28, .64, .02, .3, .3, .32).concat(curve(.3, .32, .5, -.14, .7, .32), curve(.7, .32, .98, .3, .72, .64), curve(.72, .64, .5, .74, .28, .64)),
      path(.5, .66, .5, .48, .4, .4), path(.5, .55, .64, .43)]
    case 'mountain': return [path(.05, .91, .37, .12, .7, .91), path(.56, .57, .75, .26, .95, .91),
      path(.28, .35, .34, .4, .4, .32, .47, .36), path(.68, .38, .75, .45, .8, .38), path(.06, .92, .94, .92)]
    case 'house': return [path(.08, .45, .5, .08, .92, .45), path(.18, .4, .18, .9, .82, .9, .82, .4),
      path(.42, .9, .42, .64, .59, .64, .59, .9), path(.27, .51, .38, .51, .38, .63, .27, .63, .27, .51),
      path(.66, .22, .66, .1, .77, .1, .77, .32)]
    case 'boat': return [path(.1, .65, .9, .65, .78, .88, .24, .88, .1, .65), path(.48, .64, .48, .09),
      path(.43, .15, .15, .57, .43, .57, .43, .15), path(.54, .23, .82, .57, .54, .57, .54, .23)]
    case 'bird': return [ellipse(.5, .59, .23, .18), path(.72, .53, .89, .58, .72, .63),
      path(.28, .53, .1, .4, .17, .66, .29, .67), curve(.36, .55, .58, .76, .66, .46),
      ellipse(.62, .54, .018, .022), path(.45, .77, .42, .9, .34, .9), path(.57, .77, .56, .9, .64, .9)]
    case 'butterfly': return [ellipse(.3, .34, .19, .24), ellipse(.7, .34, .19, .24), ellipse(.32, .71, .15, .18), ellipse(.68, .71, .15, .18),
      path(.5, .24, .5, .87), curve(.5, .27, .31, .05, .34, .08), curve(.5, .27, .69, .05, .66, .08)]
    case 'heart': return [Array.from({ length: 65 }, (_, i) => {
      const a = i / 64 * Math.PI * 2
      return { x: .5 + Math.sin(a) ** 3 * .4, y: .47 - (13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a)) * .026 }
    })]
    case 'echo': return [] // Echo paths must come from the child's actual stroke, never a generic curve.
  }
}

export function validateProposal(value: unknown): DrawingProposal | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const raw = value as DrawingProposal
  if (Object.keys(raw).some(key => !['template', 'x', 'y', 'width', 'height', 'rotation', 'color', 'strokeWidth', 'brushKind', 'target', 'relation', 'anchor', 'placement', 'echoPoints', 'subject', 'sketch', 'attachment'].includes(key))) return null
  const p = { ...raw, rotation: raw.rotation === undefined ? 0 : raw.rotation, strokeWidth: raw.strokeWidth === undefined ? 4 : raw.strokeWidth }
  if (!(p.template === 'custom' || templates.includes(p.template)) || !/^#[\da-f]{6}$/i.test(p.color)) return null
  if (![p.x, p.y, p.width, p.height, p.rotation, p.strokeWidth].every(Number.isFinite)) return null
  if (p.width < .025 || p.height < .025 || p.width > .45 || p.height > .45 || p.width * p.height > .16) return null
  if (p.x < 0 || p.y < 0 || p.x + p.width > 1 || p.y + p.height > 1 || Math.abs(p.rotation) > 180 || p.strokeWidth < 1 || p.strokeWidth > 32) return null
  if (p.brushKind !== undefined && !BRUSHES.some(brush => brush.id === p.brushKind)) return null
  const target = typeof p.target === 'string' ? p.target.trim().slice(0, 100) : ''
  const relation = typeof p.relation === 'string' ? p.relation.trim().slice(0, 180) : ''
  if (!target || !relation) return null
  let sketch: DrawingSketch | null = null
  let subject = ''
  if (p.template === 'custom') {
    subject = typeof p.subject === 'string' ? p.subject.trim() : ''
    sketch = validateSketch(p.sketch)
    if (!subject || subject.length > 60 || !sketch) return null
  } else if ('subject' in p || 'sketch' in p) return null
  if (p.placement !== undefined && !['above', 'below', 'left', 'right', 'inside', 'near'].includes(p.placement)) return null
  if (p.anchor !== undefined) {
    const a = p.anchor
    if (!a || typeof a !== 'object' || Array.isArray(a) || Object.keys(a).some(key => !['x', 'y', 'width', 'height'].includes(key))) return null
    if (![a.x, a.y, a.width, a.height].every(Number.isFinite) || a.x < 0 || a.y < 0 || a.width < .01 || a.height < .01 || a.x + a.width > 1 || a.y + a.height > 1) return null
  }
  if (p.attachment !== undefined) {
    const a = p.attachment, anchor = p.anchor
    if (!a || typeof a !== 'object' || Array.isArray(a) || Object.keys(a).some(key => !['x', 'y'].includes(key))
      || !Number.isFinite(a.x) || !Number.isFinite(a.y) || !anchor || !sketch || p.rotation !== 0 || sketch.paths[0][0][0] !== 'M'
      || a.x < anchor.x || a.x > anchor.x + anchor.width || a.y < anchor.y || a.y > anchor.y + anchor.height) return null
  }
  if (p.template === 'echo') {
    if (!Array.isArray(p.echoPoints) || p.echoPoints.length < 2 || p.echoPoints.length > 24 || p.echoPoints.some(point => !point || !Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1)) return null
    const xs = p.echoPoints.map(point => point.x), ys = p.echoPoints.map(point => point.y)
    if (Math.max(...xs) - Math.min(...xs) + Math.max(...ys) - Math.min(...ys) < .005) return null
  } else if (p.echoPoints !== undefined) return null
  return { ...p, color: p.color.toLowerCase(), target, relation, ...(sketch ? { subject, sketch } : {}), ...(p.anchor ? { anchor: { ...p.anchor } } : {}), ...(p.echoPoints ? { echoPoints: p.echoPoints.map(({ x, y }) => ({ x, y })) } : {}) }
}
export function proposalStrokes(p: DrawingProposal, aspect = 1): NiloStrokeSpec[] {
  if (!Number.isFinite(aspect) || aspect <= 0 || !validateProposal(p)) return []
  const angle = p.rotation * Math.PI / 180
  let paths = p.template === 'custom' ? compileSketch(p.sketch)! : localPaths(p.template)
  if (p.template === 'echo' && p.echoPoints) {
    const xs = p.echoPoints.map(point => point.x * aspect), ys = p.echoPoints.map(point => point.y)
    const left = Math.min(...xs), right = Math.max(...xs), top = Math.min(...ys), bottom = Math.max(...ys)
    const scale = Math.min(right > left ? .84 * p.width * aspect / (right - left) : Infinity, bottom > top ? .84 * p.height / (bottom - top) : Infinity)
    paths = [p.echoPoints.map(point => ({ x: .5 + (point.x * aspect - (left + right) / 2) * scale / (p.width * aspect), y: .5 + (point.y - (top + bottom) / 2) * scale / p.height }))]
  }
  // Rotate in physical canvas space, not stretched normalised coordinates.
  return paths.map(points => ({
    kind: p.template, color: p.color, width: p.strokeWidth, brushKind: p.brushKind ?? 'round',
    points: points.map(point => {
      const dx = (point.x - .5) * p.width, dy = (point.y - .5) * p.height
      return { x: p.x + p.width / 2 + Math.cos(angle) * dx - Math.sin(angle) * dy / aspect,
        y: p.y + p.height / 2 + Math.sin(angle) * dx * aspect + Math.cos(angle) * dy }
    }),
  }))
}
type SurfaceSize = { width: number; height: number }
function occupancySize(occupancy: number[]): number | null {
  const n = Math.sqrt(occupancy.length)
  return Number.isInteger(n) && n >= 8 && occupancy.every(v => Number.isFinite(v) && v >= 0 && v <= 1) ? n : null
}
function brushMargins(p: DrawingProposal, n: number, surfaceSize?: SurfaceSize) {
  const tipScale = { round: 1, pencil: .4, marker: 1.8, crayon: 1, star: 2.5 }[p.brushKind ?? 'round']
  const radius = p.strokeWidth * tipScale / 2 + 1
  return {
    x: surfaceSize && Number.isFinite(surfaceSize.width) && surfaceSize.width > 0 ? Math.max(.35 / n, radius / surfaceSize.width) : .35 / n,
    y: surfaceSize && Number.isFinite(surfaceSize.height) && surfaceSize.height > 0 ? Math.max(.35 / n, radius / surfaceSize.height) : .35 / n,
  }
}
/** Shared raster footprint for child-ink collision and collisions between additions. */
function proposalFootprint(p: DrawingProposal, n: number, aspect: number, surfaceSize?: SurfaceSize): Set<number> | null {
  const strokes = proposalStrokes(p, aspect)
  if (!strokes.length) return null
  const { x: marginX, y: marginY } = brushMargins(p, n, surfaceSize)
  const cells = new Set<number>()
  // Densely sample each segment so sparse paths (window/leaf/rain) cannot jump over ink.
  for (const stroke of strokes) {
    const samples = stroke.points.flatMap((point, index) => {
      if (!index) return [point]
      const prev = stroke.points[index - 1]
      const steps = Math.max(1, Math.ceil(Math.max(Math.abs(point.x - prev.x), Math.abs(point.y - prev.y)) * n * 3))
      return Array.from({ length: steps }, (_, i) => ({ x: prev.x + (point.x - prev.x) * (i + 1) / steps, y: prev.y + (point.y - prev.y) * (i + 1) / steps }))
    })
    for (const { x, y } of samples) {
      if (x < Math.max(.015, marginX) || x > 1 - Math.max(.015, marginX) || y < Math.max(.015, marginY) || y > 1 - Math.max(.015, marginY)) return null
      // Include the complete brush footprint, especially wide markers and star tips.
      for (let col = Math.max(0, Math.floor((x - marginX) * n)); col <= Math.min(n - 1, Math.floor((x + marginX) * n)); col++) {
        for (let row = Math.max(0, Math.floor((y - marginY) * n)); row <= Math.min(n - 1, Math.floor((y + marginY) * n)); row++) {
          cells.add(row * n + col)
        }
      }
    }
  }
  return cells
}
/** Check actual paths and brush thickness; both 64-cell grids and legacy 32-cell grids work. */
export function projectionFits(p: DrawingProposal, occupancy: number[], aspect = 1, surfaceSize?: SurfaceSize): boolean {
  const n = occupancySize(occupancy)
  if (!n) return false
  const cells = proposalFootprint(p, n, aspect, surfaceSize)
  if (!cells) return false
  if (!p.attachment) return [...cells].every(cell => occupancy[cell] <= .025)
  const start = proposalStrokes(p, aspect)[0]?.points[0]
  if (!start || Math.hypot(start.x - p.attachment.x, start.y - p.attachment.y) > .0001) return false
  const margin = brushMargins(p, n, surfaceSize)
  const atJoin = (cell: number) => Math.abs((cell % n + .5) / n - p.attachment!.x) <= margin.x + 1 / n
    && Math.abs((Math.floor(cell / n) + .5) / n - p.attachment!.y) <= margin.y + 1 / n
  // Declaring an attachment is not enough: its start must actually meet ink.
  if (![...cells].some(cell => occupancy[cell] > .025 && atJoin(cell))) return false
  // Only the join may touch old ink; the rest of the new part remains collision checked.
  return [...cells].every(cell => occupancy[cell] <= .025 || atJoin(cell))
}

const naturalRatios: Record<Exclude<BuiltinTemplate, 'echo'>, number> = {
  waves: 2.8, fish: 1.55, leaf: .8, window: 1, stars: 1, cloud: 1.7,
  flower: .7, trail: .8, flame: .65, rain: 1.25, grass: 2.2,
  sun: 1, moon: .85, tree: .8, mountain: 1.55, house: 1, boat: 1.4,
  bird: 1.4, butterfly: 1.1, heart: 1,
}

function proportionedProposal(p: DrawingProposal, aspect: number): DrawingProposal {
  let width = p.width * aspect
  let height = p.height
  if (p.template !== 'echo') {
    const ratio = p.template === 'custom' ? p.sketch!.aspect : naturalRatios[p.template]
    if (width / height > ratio) width = height * ratio
    else height = width / ratio
  }
  if (p.anchor) {
    const aw = p.anchor.width * aspect, ah = p.anchor.height
    const subjectSize = Math.max(aw, ah)
    let maxWidth = subjectSize * .85, maxHeight = subjectSize * .85
    if (p.placement === 'inside' || p.template === 'window') {
      const fraction = p.template === 'window' ? .6 : .8
      maxWidth = aw * fraction; maxHeight = ah * fraction
    } else if (p.template === 'waves' || p.template === 'grass') {
      maxWidth = aw * 1.15; maxHeight = ah * .5
    }
    const scale = Math.min(1, maxWidth / width, maxHeight / height)
    width *= scale; height *= scale
  }
  return { ...p, x: p.x + (p.width - width / aspect) / 2, y: p.y + (p.height - height) / 2, width: width / aspect, height }
}

function placementFits(p: DrawingProposal, aspect: number, surfaceSize?: SurfaceSize): boolean {
  if (!p.anchor || !p.placement) return true
  // A joined part is located by its actual junction and paths, not by a box
  // outside the whole subject (a leaf can grow from the middle of a stem).
  // projectionFits still requires contact at the join and clear ink elsewhere.
  if (p.attachment) return true
  const points = proposalStrokes(p, aspect).flatMap(stroke => stroke.points)
  if (!points.length) return false
  const margin = brushMargins(p, 64, surfaceSize)
  const left = Math.min(...points.map(point => point.x)) - margin.x
  const right = Math.max(...points.map(point => point.x)) + margin.x
  const top = Math.min(...points.map(point => point.y)) - margin.y
  const bottom = Math.max(...points.map(point => point.y)) + margin.y
  const a = p.anchor
  const horizontalNear = right >= a.x - .12 / aspect && left <= a.x + a.width + .12 / aspect
  const verticalNear = bottom >= a.y - .12 && top <= a.y + a.height + .12
  switch (p.placement) {
    case 'above': return bottom <= a.y + 1e-9 && horizontalNear
    case 'below': return top >= a.y + a.height - 1e-9 && horizontalNear
    case 'left': return right <= a.x + 1e-9 && verticalNear
    case 'right': return left >= a.x + a.width - 1e-9 && verticalNear
    case 'inside': return left >= a.x && right <= a.x + a.width && top >= a.y && bottom <= a.y + a.height
    case 'near': {
      const dx = Math.max(a.x - right, left - (a.x + a.width), 0) * aspect
      const dy = Math.max(a.y - bottom, top - (a.y + a.height), 0)
      return Math.hypot(dx, dy) <= Math.max(.08, Math.max(a.width * aspect, a.height) * .65)
    }
  }
}

/** Fit natural physical proportions into the proposed area, then repair only locally.
 * No shape is moved to an unrelated corner, and no returned path covers existing ink.
 */
export function prepareProposal(value: DrawingProposal, occupancy: number[], aspect = 1, surfaceSize?: SurfaceSize): DrawingProposal | null {
  const p = validateProposal(value)
  if (!p || !Number.isFinite(aspect) || aspect <= 0 || !occupancySize(occupancy)) return null
  if (p.attachment) return prepareAttachedProposal(p, occupancy, aspect, surfaceSize)
  const base = proportionedProposal(p, aspect)
  const stepY = surfaceSize && Number.isFinite(surfaceSize.height) && surfaceSize.height > 0 ? Math.min(.024, Math.max(.008, 10 / surfaceSize.height)) : .016
  const stepX = stepY / aspect
  const offsets = [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1], [-2, 0], [2, 0], [0, -2], [0, 2]]
  for (const scale of [1, .86, .72]) {
    const width = base.width * scale, height = base.height * scale
    for (const [dx, dy] of offsets) {
      const candidate = validateProposal({ ...base, width, height,
        x: base.x + (base.width - width) / 2 + dx * stepX,
        y: base.y + (base.height - height) / 2 + dy * stepY,
      })
      if (candidate && placementFits(candidate, aspect, surfaceSize) && projectionFits(candidate, occupancy, aspect, surfaceSize)) return candidate
    }
  }
  return null
}

/** A Nilo turn may locate its one detail anywhere along the requested side of
 * its target. Keep the relation and full collision checks, rather than giving
 * up because the model's initial box was a few pixels off. */
export function prepareTurnProposal(value: DrawingProposal, occupancy: number[], aspect = 1, surfaceSize?: SurfaceSize): DrawingProposal | null {
  let p = validateProposal(value)
  if (!p || !Number.isFinite(aspect) || aspect <= 0 || !occupancySize(occupancy)) return null
  if (p.attachment) return prepareAttachedProposal(p, occupancy, aspect, surfaceSize)
  if (p.template === 'echo' && p.echoPoints) {
    // The actual source stroke is authoritative for an echo's bounds. A model
    // often labels just an endpoint as its anchor, shrinking the echo to a dot.
    const xs = p.echoPoints.map(point => point.x), ys = p.echoPoints.map(point => point.y)
    const left = Math.min(...xs), top = Math.min(...ys), right = Math.max(...xs), bottom = Math.max(...ys)
    const sourceW = Math.max(.01, right - left) * aspect, sourceH = Math.max(.01, bottom - top)
    const span = Math.min(.2, Math.max(.12, 64 / (surfaceSize?.height || 400)))
    const scale = Math.min(.65, span / Math.max(sourceW, sourceH))
    const width = Math.max(.04, sourceW * scale / aspect), height = Math.max(.04, sourceH * scale)
    const anchorX = Math.min(left, .99), anchorY = Math.min(top, .99)
    p = { ...p, width, height, rotation: 0,
      x: p.x + (p.width - width) / 2, y: p.y + (p.height - height) / 2,
      anchor: { x: anchorX, y: anchorY, width: Math.max(.01, right - anchorX), height: Math.max(.01, bottom - anchorY) },
      placement: p.placement && p.placement !== 'inside' ? p.placement : 'near' }
  }
  const original = prepareProposal(p, occupancy, aspect, surfaceSize)
  if (original) return original
  const base = proportionedProposal(p, aspect)
  const anchor = base.anchor
  const margin = brushMargins(base, 64, surfaceSize)
  for (const scale of [1, .82, .65]) {
    const width = base.width * scale, height = base.height * scale
    const centers: Point[] = []
    if (anchor && base.placement) {
      const centerX = anchor.x + anchor.width / 2, centerY = anchor.y + anchor.height / 2
      for (const gap of [.015, .045, .08]) {
        if (base.placement === 'above' || base.placement === 'below') {
          for (const along of [0, -.25, .25, -.45, .45]) centers.push({ x: centerX + along * anchor.width,
            y: base.placement === 'above' ? anchor.y - height / 2 - margin.y - gap : anchor.y + anchor.height + height / 2 + margin.y + gap })
        } else if (base.placement === 'left' || base.placement === 'right') {
          for (const along of [0, -.25, .25, -.45, .45]) centers.push({ y: centerY + along * anchor.height,
            x: base.placement === 'left' ? anchor.x - width / 2 - margin.x - gap / aspect : anchor.x + anchor.width + width / 2 + margin.x + gap / aspect })
        } else if (base.placement === 'inside') {
          for (const dx of [0, -.2, .2]) for (const dy of [0, -.2, .2]) centers.push({ x: centerX + dx * anchor.width, y: centerY + dy * anchor.height })
        } else {
          for (const dx of [-1, 0, 1]) for (const dy of [-1, 0, 1]) if (dx || dy) centers.push({
            x: centerX + dx * (anchor.width / 2 + width / 2 + margin.x + gap / aspect),
            y: centerY + dy * (anchor.height / 2 + height / 2 + margin.y + gap),
          })
        }
      }
    } else {
      // Without an anchor, stay close to the model's chosen area.
      for (const distance of [.04, .08, .12]) for (const dx of [-1, 0, 1]) for (const dy of [-1, 0, 1]) if (dx || dy) centers.push({
        x: base.x + base.width / 2 + dx * distance / aspect, y: base.y + base.height / 2 + dy * distance,
      })
    }
    for (const center of centers) {
      const candidate = validateProposal({ ...base, width, height, x: center.x - width / 2, y: center.y - height / 2 })
      if (candidate && placementFits(candidate, aspect, surfaceSize) && projectionFits(candidate, occupancy, aspect, surfaceSize)) return candidate
    }
  }
  return null
}

/** Shrink around the actual join, never slide a connected part off its target. */
function prepareAttachedProposal(p: DrawingProposal, occupancy: number[], aspect: number, surfaceSize?: SurfaceSize): DrawingProposal | null {
  const base = proportionedProposal(p, aspect)
  const start = base.sketch!.paths[0][0]
  for (const scale of [1, .82, .65]) {
    const width = base.width * scale, height = base.height * scale
    const candidate = validateProposal({ ...base, width, height,
      x: p.attachment!.x - Number(start[1]) * width, y: p.attachment!.y - Number(start[2]) * height })
    if (candidate && placementFits(candidate, aspect, surfaceSize) && projectionFits(candidate, occupancy, aspect, surfaceSize)) return candidate
  }
  return null
}

/** Validation for editing/accepting a complete plan; never adjusts its coordinates. */
export function drawingPlanFits(proposals: DrawingProposal[], occupancy: number[], aspect = 1, surfaceSize?: SurfaceSize): boolean {
  const n = occupancySize(occupancy)
  if (!n || !planBudgetFits(proposals) || proposals.reduce((area, p) => area + p.width * p.height, 0) > .24) return false
  const occupied = [...occupancy]
  for (const p of proposals) {
    const cells = proposalFootprint(p, n, aspect, surfaceSize)
    if (!cells || !placementFits(p, aspect, surfaceSize) || !projectionFits(p, occupied, aspect, surfaceSize)) return false
    for (const cell of cells) occupied[cell] = 1
  }
  return true
}

/** Prepare the whole contribution atomically: an unsafe addition rejects the plan. */
export function prepareDrawingPlan(proposals: DrawingProposal[], occupancy: number[], aspect = 1, surfaceSize?: SurfaceSize): DrawingProposal[] | null {
  const n = occupancySize(occupancy)
  if (!n || !planBudgetFits(proposals)) return null
  const occupied = [...occupancy]
  const prepared: DrawingProposal[] = []
  for (const p of proposals) {
    const candidate = prepareProposal(p, occupied, aspect, surfaceSize)
    if (!candidate) return null
    const cells = proposalFootprint(candidate, n, aspect, surfaceSize)
    if (!cells) return null
    for (const cell of cells) occupied[cell] = 1
    prepared.push(candidate)
  }
  return drawingPlanFits(prepared, occupancy, aspect, surfaceSize) ? prepared : null
}

function planBudgetFits(proposals: DrawingProposal[]): boolean {
  if (!Array.isArray(proposals) || proposals.length < 1 || proposals.length > 4) return false
  let strokes = 0, commands = 0
  for (const value of proposals) {
    const p = validateProposal(value)
    if (!p) return false
    if (p.template === 'custom') {
      strokes += p.sketch!.paths.length
      commands += p.sketch!.paths.reduce((sum, path) => sum + path.length, 0)
    } else strokes += p.template === 'echo' ? 1 : localPaths(p.template).length
    if (strokes > SKETCH_LIMITS.planStrokes || commands > SKETCH_LIMITS.planCommands) return false
  }
  return true
}

export type LocalCommand = 'accept' | 'dismiss' | 'alternative' | 'smaller' | 'larger' | 'left' | 'right' | 'up' | 'down' | 'stop' | 'forget' | { color: string } | null
/** Whole-utterance matches only. Praise, negation and partial recognition never commit a projection. */
export function localCommand(text: string): LocalCommand {
  if (/[?？]/.test(text)) return null
  const s = text.toLowerCase().trim().replace(/[。！!.]+$/g, '').replace(/\s+/g, ' ')
  if (/^(留下来?|确认留下|把它留下来|画上去|放上去|keep it|keep this|add it|put it on)$/.test(s)) return 'accept'
  if (/^(先不要了?|不要了?|先收起来|取消|不要留下来?|不留下|别画|不用了|no|cancel|dismiss|not this|don't keep it|do not keep it)$/.test(s)) return 'dismiss'
  if (/^(换一个|换个想法|换一下|another one|try another|another idea)$/.test(s)) return 'alternative'
  if (/^(停止|安静一下|暂停聊天|stop|stop talking|quiet please)$/.test(s)) return 'stop'
  if (/^(忘掉这个故事|重新开始故事|forget this story|forget the story)$/.test(s)) return 'forget'
  if (/^(再?小一点|缩小一点|小一些|make it smaller|smaller)$/.test(s)) return 'smaller'
  if (/^(再?大一点|放大一点|大一些|make it bigger|bigger|larger)$/.test(s)) return 'larger'
  if (/^(往?左[边移挪]*一点|往左|向左|move left|left)$/.test(s)) return 'left'
  if (/^(往?右[边移挪]*一点|往右|向右|move right|right)$/.test(s)) return 'right'
  if (/^(往?上[边移挪]*一点|往上|向上|move up|up)$/.test(s)) return 'up'
  if (/^(往?下[边移挪]*一点|往下|向下|move down|down)$/.test(s)) return 'down'
  const colors: [RegExp, string][] = [[/^(换成|变成|改成)?蓝色(一点)?$|^(make it )?blue$/, '#4aa5d8'], [/^(换成|变成|改成)?红色$|^(make it )?red$/, '#d74952'], [/^(换成|变成|改成)?橙色$|^(make it )?orange$/, '#f28c38'], [/^(换成|变成|改成)?绿色$|^(make it )?green$/, '#51a06c'], [/^(换成|变成|改成)?紫色$|^(make it )?purple$/, '#7a82d8'], [/^(换成|变成|改成)?黄色$|^(make it )?yellow$/, '#edcd70']]
  for (const [pattern, color] of colors) if (pattern.test(s)) return { color }
  return null
}
