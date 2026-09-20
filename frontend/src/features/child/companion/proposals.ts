import { occupancySize, brushMargins, proposalFootprint, placementFits, projectionFits as sharedProjectionFits } from '../../../../../shared/niloCollision.mjs'
import type { InkPixels } from '../../../../../shared/niloContact.mjs'
import { localPaths, sampleProposalGeometry, proportionedProposal } from '../../../../../shared/niloGeometry.mjs'
import { validateContact, type DrawingContact } from '../../../../../shared/niloContact.mjs'
import type { NiloStrokeSpec } from '@/lib/api/lumaApi'
import { BRUSHES, type BrushKind } from '../brushes'
import { SKETCH_LIMITS, validateSketch, type DrawingSketch } from './sketch'

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
  /** Program-measured joins; collision permission is limited to the brush tip. */
  contact?: DrawingContact
  /** Child-authored source samples, supplied by the server for echo only. */
  echoPoints?: { x: number; y: number }[]
}
export const clarificationReasons = ['unclear_target', 'misplaced_detail', 'duplicate_detail', 'unrelated_detail', 'uncertain_review', 'invalid_review', 'wrong_target'] as const
export interface CompanionReply {
  geometryReviewed?: boolean
  reply: string
  status?: 'ready' | 'clarify' | 'unavailable'
  reason?: 'model_unavailable' | 'timeout' | 'provider_error' | 'invalid_response' | 'missing_image' | typeof clarificationReasons[number]
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

type Point = { x:number; y:number }
export function validateProposal(value: unknown): DrawingProposal | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const raw = value as DrawingProposal
  if (Object.keys(raw).some(key => !['template', 'x', 'y', 'width', 'height', 'rotation', 'color', 'strokeWidth', 'brushKind', 'target', 'relation', 'anchor', 'placement', 'echoPoints', 'subject', 'sketch', 'attachment', 'contact'].includes(key))) return null
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
  const contact = p.contact === undefined ? null : validateContact(p.contact, p.anchor)
  if (p.contact !== undefined && (!contact || !p.anchor || !sketch || p.rotation !== 0 || p.attachment !== undefined)) return null
  if (p.template === 'echo') {
    if (!Array.isArray(p.echoPoints) || p.echoPoints.length < 2 || p.echoPoints.length > 24 || p.echoPoints.some(point => !point || !Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1)) return null
    const xs = p.echoPoints.map(point => point.x), ys = p.echoPoints.map(point => point.y)
    if (Math.max(...xs) - Math.min(...xs) + Math.max(...ys) - Math.min(...ys) < .005) return null
  } else if (p.echoPoints !== undefined) return null
  return { ...p, color: p.color.toLowerCase(), target, relation, ...(sketch ? { subject, sketch } : {}), ...(p.anchor ? { anchor: { ...p.anchor } } : {}), ...(contact ? { contact } : {}), ...(p.echoPoints ? { echoPoints: p.echoPoints.map(({ x, y }) => ({ x, y })) } : {}) }
}
export function proposalStrokes(p: DrawingProposal, aspect = 1): NiloStrokeSpec[] {
  return validateProposal(p) ? sampleProposalGeometry(p, aspect) : []
}
type SurfaceSize = { width: number; height: number }
export function projectionFits(p: DrawingProposal, occupancy: number[], aspect = 1, surfaceSize?: SurfaceSize, pixels?: InkPixels): boolean {
  return !!validateProposal(p) && sharedProjectionFits(p, occupancy, aspect, surfaceSize, pixels)
}

/** Fit natural physical proportions into the proposed area, then repair only locally.
 * No shape is moved to an unrelated corner, and no returned path covers existing ink.
 */
export function prepareProposal(value: DrawingProposal, occupancy: number[], aspect = 1, surfaceSize?: SurfaceSize, pixels?: InkPixels): DrawingProposal | null {
  const p = validateProposal(value)
  if (!p || !Number.isFinite(aspect) || aspect <= 0 || !occupancySize(occupancy)) return null
  if (p.contact) return placementFits(p, aspect, surfaceSize) && projectionFits(p, occupancy, aspect, surfaceSize, pixels) ? p : null
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
export function prepareTurnProposal(value: DrawingProposal, occupancy: number[], aspect = 1, surfaceSize?: SurfaceSize, pixels?: InkPixels): DrawingProposal | null {
  let p = validateProposal(value)
  if (!p || !Number.isFinite(aspect) || aspect <= 0 || !occupancySize(occupancy)) return null
  if (p.contact) return placementFits(p, aspect, surfaceSize) && projectionFits(p, occupancy, aspect, surfaceSize, pixels) ? p : null
  if (p.attachment) {
    const fitted = prepareAttachedProposal(p, occupancy, aspect, surfaceSize)
    if (fitted || !['left', 'right'].includes(p.placement ?? '')) return fitted
    // An open click permits the same part to grow on the other side of its
    // fixed joint. Explicit voice/edit plans use prepareProposal and never flip.
    // No new subject, new junction, or unchecked collision is introduced.
    const sketch = validateSketch({ aspect: p.sketch!.aspect, paths: p.sketch!.paths.map(path => path.map(command =>
      command[0] === 'E' ? ['E', 1 - command[1], command[2], command[3], command[4]]
        : command.map((value, index) => index % 2 === 1 && typeof value === 'number' ? 1 - value : value))) })
    if (!sketch) return null
    const mirrored: DrawingProposal = { ...p, sketch, placement: p.placement === 'left' ? 'right' : 'left',
      relation: /[\u3400-\u9fff]/.test(p.relation ?? p.subject ?? '') ? '从同一连接点向另一侧延伸，避开已有线条' : 'Extend from the same joint on the other side, clear of existing lines.' }
    return prepareAttachedProposal(mirrored, occupancy, aspect, surfaceSize)
  }
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
export function drawingPlanFits(proposals: DrawingProposal[], occupancy: number[], aspect = 1, surfaceSize?: SurfaceSize, pixels?: InkPixels): boolean {
  const n = occupancySize(occupancy)
  if (!n || !planBudgetFits(proposals) || proposals.reduce((area, p) => area + p.width * p.height, 0) > .24) return false
  const occupied = [...occupancy]
  for (const p of proposals) {
    const cells = proposalFootprint(p, n, aspect, surfaceSize)
    // Original pixels cannot authorize overlap with another not-yet-painted
    // proposal. Multi-item plans keep the conservative grid-only decision.
    if (!cells || !placementFits(p, aspect, surfaceSize) || !projectionFits(p, occupied, aspect, surfaceSize, proposals.length === 1 ? pixels : undefined)) return false
    for (const cell of cells) occupied[cell] = 1
  }
  return true
}

/** Prepare the whole contribution atomically: an unsafe addition rejects the plan. */
export function prepareDrawingPlan(proposals: DrawingProposal[], occupancy: number[], aspect = 1, surfaceSize?: SurfaceSize, pixels?: InkPixels): DrawingProposal[] | null {
  const n = occupancySize(occupancy)
  if (!n || !planBudgetFits(proposals)) return null
  const occupied = [...occupancy]
  const prepared: DrawingProposal[] = []
  for (const p of proposals) {
    const candidate = prepareProposal(p, occupied, aspect, surfaceSize, proposals.length === 1 ? pixels : undefined)
    if (!candidate) return null
    const cells = proposalFootprint(candidate, n, aspect, surfaceSize)
    if (!cells) return null
    for (const cell of cells) occupied[cell] = 1
    prepared.push(candidate)
  }
  return drawingPlanFits(prepared, occupancy, aspect, surfaceSize, pixels) ? prepared : null
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
