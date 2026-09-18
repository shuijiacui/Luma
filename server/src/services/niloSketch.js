// The custom sketch protocol is data only: no SVG, executable code or arbitrary canvas commands.
const EPSILON = 1e-9
export const NILO_SKETCH_MAX_PATHS = 24
export const NILO_SKETCH_MAX_PATH_COMMANDS = 32
export const NILO_SKETCH_MAX_COMMANDS = 96
export const NILO_GROUP_MAX_PATHS = 64
export const NILO_GROUP_MAX_CUSTOM_COMMANDS = 192

// Keep these in sync with frontend/src/features/child/companion/proposals.ts.
export const NILO_TEMPLATE_PATH_COUNTS = Object.freeze({
  waves: 2, fish: 3, leaf: 5, window: 3, stars: 2, cloud: 1, flower: 8,
  trail: 2, flame: 2, rain: 6, grass: 6, echo: 1, sun: 9, moon: 1,
  tree: 6, mountain: 5, house: 5, boat: 4, bird: 7, butterfly: 7, heart: 1,
})
const COMMAND_LENGTHS = Object.freeze({ M: 3, L: 3, Q: 5, C: 7, Z: 1, E: 5 })
const isCoordinate = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
const isDifferent = (x, y, current) => Math.abs(x - current[0]) > EPSILON || Math.abs(y - current[1]) > EPSILON

/** Reject the whole sketch when malformed. Never silently remove a part of an object. */
export function validateCustomSketch(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  if (Object.keys(raw).some(key => !['aspect', 'paths'].includes(key))) return null
  if (typeof raw.aspect !== 'number' || !Number.isFinite(raw.aspect) || raw.aspect < .2 || raw.aspect > 5) return null
  if (!Array.isArray(raw.paths) || raw.paths.length < 1 || raw.paths.length > NILO_SKETCH_MAX_PATHS) return null
  const paths = []
  let commandCount = 0
  for (const path of raw.paths) {
    if (!Array.isArray(path) || path.length < 1 || path.length > NILO_SKETCH_MAX_PATH_COMMANDS) return null
    commandCount += path.length
    if (commandCount > NILO_SKETCH_MAX_COMMANDS) return null
    let current = null, hasDrawing = false
    const copy = []
    for (let index = 0; index < path.length; index++) {
      const command = path[index]
      if (!Array.isArray(command) || typeof command[0] !== 'string' || !Object.hasOwn(COMMAND_LENGTHS, command[0]) || command.length !== COMMAND_LENGTHS[command[0]]) return null
      const [op, ...coordinates] = command
      if (!coordinates.every(isCoordinate)) return null
      if (op === 'E') {
        if (path.length !== 1) return null
        const [cx, cy, rx, ry] = coordinates
        if (rx <= 0 || ry <= 0 || cx - rx < 0 || cx + rx > 1 || cy - ry < 0 || cy + ry > 1) return null
        hasDrawing = true
      } else if (index === 0) {
        if (op !== 'M' || path.length < 2) return null
        current = coordinates
      } else if (op === 'Z') {
        if (index !== path.length - 1) return null
      } else {
        if (op === 'M' || !current) return null
        for (let coordinate = 0; coordinate < coordinates.length; coordinate += 2) {
          if (isDifferent(coordinates[coordinate], coordinates[coordinate + 1], current)) hasDrawing = true
        }
        current = coordinates.slice(-2)
      }
      copy.push([...command])
    }
    if (!hasDrawing) return null
    paths.push(copy)
  }
  return { aspect: raw.aspect, paths }
}

/** For already validated proposals; limits apply to the group accepted in one action. */
export function withinDrawingGroupBudget(proposals) {
  if (!Array.isArray(proposals) || proposals.length < 1 || proposals.length > 4) return false
  let pathCount = 0, customCommands = 0
  for (const proposal of proposals) {
    if (!proposal) return false
    if (proposal.template === 'custom') {
      if (!proposal.sketch?.paths) return false
      pathCount += proposal.sketch.paths.length
      customCommands += proposal.sketch.paths.reduce((sum, path) => sum + path.length, 0)
    } else {
      const count = NILO_TEMPLATE_PATH_COUNTS[proposal.template]
      if (count === undefined) return false
      pathCount += count
    }
  }
  return pathCount <= NILO_GROUP_MAX_PATHS && customCommands <= NILO_GROUP_MAX_CUSTOM_COMMANDS
}
