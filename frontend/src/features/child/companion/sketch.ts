import type { Point } from '../brushes'

export type SketchCommand = ['M', number, number] | ['L', number, number]
  | ['Q', number, number, number, number]
  | ['C', number, number, number, number, number, number]
  | ['Z'] | ['E', number, number, number, number]
export interface DrawingSketch { aspect: number; paths: SketchCommand[][] }

export const SKETCH_LIMITS = { paths: 24, commandsPerPath: 32, commands: 96, planCommands: 192, planStrokes: 64 } as const
const coordinate = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
const differs = (a: Point, b: Point) => Math.abs(a.x - b.x) > 1e-9 || Math.abs(a.y - b.y) > 1e-9
const point = (x: number, y: number): Point => ({ x, y })

/** Parse a small geometry language, never SVG, code, URLs or unbounded path strings. */
export function validateSketch(value: unknown): DrawingSketch | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const raw = value as DrawingSketch
  if (Object.keys(raw).some(key => key !== 'aspect' && key !== 'paths')
    || !Number.isFinite(raw.aspect) || raw.aspect < .2 || raw.aspect > 5
    || !Array.isArray(raw.paths) || raw.paths.length < 1 || raw.paths.length > SKETCH_LIMITS.paths) return null
  let total = 0
  for (const path of raw.paths) {
    if (!Array.isArray(path) || path.length < 1 || path.length > SKETCH_LIMITS.commandsPerPath) return null
    total += path.length
    if (total > SKETCH_LIMITS.commands) return null
    let current: Point | null = null, drawn = false
    for (const [index, command] of path.entries()) {
      if (!Array.isArray(command)) return null
      const op = command[0]
      const length = { M: 3, L: 3, Q: 5, C: 7, Z: 1, E: 5 }[op]
      if (length === undefined || command.length !== length) return null
      for (let i = 1; i < command.length; i++) if (!coordinate(command[i])) return null
      if (op === 'E') {
        if (path.length !== 1) return null
        const [, x, y, rx, ry] = command
        if (rx <= 0 || ry <= 0 || x - rx < 0 || x + rx > 1 || y - ry < 0 || y + ry > 1) return null
        drawn = true
      } else if (op === 'M') {
        if (index !== 0) return null
        current = point(command[1], command[2])
      } else {
        if (!current) return null
        if (op === 'Z') {
          if (index !== path.length - 1) return null
        } else {
          for (let i = 1; i < command.length; i += 2) {
            if (differs(current, point(command[i] as number, command[i + 1] as number))) drawn = true
          }
          current = point(command[command.length - 2] as number, command[command.length - 1] as number)
        }
      }
    }
    if (!drawn) return null
  }
  return { aspect: raw.aspect, paths: raw.paths.map(path => path.map(command => [...command] as SketchCommand)) }
}

/** Every input path produces exactly one brush stroke; no member is filtered out.
 * Quadratic/cubic curves use 24/32 segments, and ellipses 48. A valid path stays
 * below 1,000 points, well within the canvas's 4,096-point per-stroke limit.
 */
export function compileSketch(value: unknown): Point[][] | null {
  const sketch = validateSketch(value)
  if (!sketch) return null
  return sketch.paths.map(path => {
    const first = path[0]
    if (first[0] === 'E') {
      const [, cx, cy, rx, ry] = first
      return Array.from({ length: 49 }, (_, i) => {
        const angle = i / 48 * Math.PI * 2
        return point(cx + Math.cos(angle) * rx, cy + Math.sin(angle) * ry)
      })
    }
    // validateSketch guarantees the unique opening command is M.
    const start = point(first[1]!, first[2]!)
    const points = [start]
    let current = start
    for (const command of path.slice(1)) {
      if (command[0] === 'Z') {
        points.push({ ...start }); current = start
      } else if (command[0] === 'L') {
        current = point(command[1], command[2]); points.push(current)
      } else if (command[0] === 'Q' || command[0] === 'C') {
        const from = current
        const steps = command[0] === 'Q' ? 24 : 32
        for (let i = 1; i <= steps; i++) {
          const t = i / steps, u = 1 - t
          current = command[0] === 'Q'
            ? point(u * u * from.x + 2 * u * t * command[1] + t * t * command[3], u * u * from.y + 2 * u * t * command[2] + t * t * command[4])
            : point(u ** 3 * from.x + 3 * u * u * t * command[1] + 3 * u * t * t * command[3] + t ** 3 * command[5],
              u ** 3 * from.y + 3 * u * u * t * command[2] + 3 * u * t * t * command[4] + t ** 3 * command[6])
          points.push(current)
        }
      }
    }
    return points
  })
}
