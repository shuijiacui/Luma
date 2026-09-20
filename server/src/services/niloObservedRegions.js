// One numbering source for the planner and the measured contact catalogue.
// Dropping an invalid region must never attach its ID to a different region.
const bounds = b => b && ['x','y','width','height'].every(k => Number.isFinite(b[k]) && b[k] >= 0 && b[k] <= 1)
  && b.width >= .01 && b.height >= .01 && b.x + b.width <= 1.000001 && b.y + b.height <= 1.000001
const within = (a,b) => a.x >= b.x - .002 && a.y >= b.y - .002
  && a.x + a.width <= b.x + b.width + .002 && a.y + a.height <= b.y + b.height + .002
const confident = value => Number.isFinite(value) && value >= .65 && value <= 1
export function observedSubjectRegions(subject) {
  if (!bounds(subject?.bounds) || !confident(subject.confidence)) return []
  const regions = [{id:'R0', name:'whole subject', bounds:subject.bounds}]
  for (const region of (subject.regions ?? []).slice(0,4)) {
    const name = typeof region?.name === 'string' ? region.name.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0,40) : ''
    if (name && bounds(region.bounds) && within(region.bounds, subject.bounds) && confident(region.confidence))
      regions.push({id:`R${regions.length}`, name, bounds:region.bounds})
  }
  return regions
}
