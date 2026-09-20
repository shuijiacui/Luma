import { expect, test } from 'vitest'
import { validateContact, contactSamples } from '../../shared/niloContact.mjs'
import { projectionFits, placementFits } from '../../shared/niloCollision.mjs'
import { validateProposal } from '../src/services/niloDialogue.js'

const size = { width: 800, height: 800 }, n = 256
function ink(...paths) {
  const grid = Array(n * n).fill(0)
  for (const path of paths) for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i], steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * n * 4))
    for (let j = 0; j <= steps; j++) {
      const x = Math.floor((a.x + (b.x - a.x) * j / steps) * n), y = Math.floor((a.y + (b.y - a.y) * j / steps) * n)
      grid[y * n + x] = 1
    }
  }
  return grid
}
const hat = {
  template: 'custom', x: .3, y: .25, width: .3, height: .2, rotation: 0, color: '#234536', strokeWidth: 3,
  target: 'person', subject: 'hat', relation: 'hat joins the upper head contour', placement: 'near',
  anchor: { x: .25, y: .4, width: .4, height: .3 },
  sketch: { aspect: 1.5, paths: [[['M', 0, 1], ['L', .5, 0], ['L', 1, 1]]] },
  contact: { kind: 'points', points: [{ x: .3, y: .45 }, { x: .6, y: .45 }] },
}
const headTop = [{ x: .25, y: .45 }, { x: .65, y: .45 }]
const fits = (p, grid, aspect = 1, surface = size) => projectionFits(p, grid, aspect, surface)

test('a two-end hat joins both existing points without granting permission across the face', () => {
  const grid = ink(headTop)
  expect(validateProposal(hat, { canvasAspect: 1 })).toMatchObject({ contact: hat.contact })
  expect(placementFits(hat, 1, size)).toBe(true)
  expect(fits(hat, grid)).toBe(true)
  const { contact, ...detached } = hat
  expect(fits(detached, grid)).toBe(false)
  expect(fits(hat, ink(headTop, [{ x: .44, y: .27 }, { x: .44, y: .43 }]))).toBe(false)
})

test('a scarf can join two separate neck edges while the empty span remains protected', () => {
  const scarf = { ...hat, x: .4, y: .45, width: .2, height: .15, subject: 'scarf',
    sketch: { aspect: 4 / 3, paths: [[['M', 0, 0], ['L', .2, .9], ['L', .8, .9], ['L', 1, 0]]] },
    contact: { kind: 'points', points: [{ x: .4, y: .45 }, { x: .6, y: .45 }] } }
  const neck = [[{ x: .4, y: .4 }, { x: .4, y: .45 }], [{ x: .6, y: .4 }, { x: .6, y: .45 }]]
  expect(fits(scarf, ink(...neck))).toBe(true)
  expect(fits(scarf, ink(...neck, [{ x: .5, y: .5 }, { x: .5, y: .65 }]))).toBe(false)
})

test('a short measured curved brim may follow original ink only when most new ink is outside it', () => {
  const points = Array.from({ length: 6 }, (_, i) => ({ x: .35 + .04 * i, y: .46 - .02 * Math.sin(Math.PI * i / 5) }))
  const curved = { ...hat, x: .35, y: .26, width: .2, height: .2,
    sketch: { aspect: 1, paths: [[['M', 0, 1], ['L', .5, 0], ['L', 1, 1]],
      points.map((p, i) => [i ? 'L' : 'M', Number(((p.x - .35) / .2).toFixed(8)), Number(((p.y - .26) / .2).toFixed(8))])] },
    contact: { kind: 'contour', points } }
  expect(validateContact(curved.contact, curved.anchor)).not.toBeNull()
  expect(fits(curved, ink(points))).toBe(true)
  expect(fits({ ...curved, sketch: { aspect: 1, paths: [curved.sketch.paths[1]] } }, ink(points))).toBe(false)
  expect(fits(curved, ink(points.slice(0, 2), points.slice(4)))).toBe(false)
})

test('all required contacts need both current ink and touching proposed paths', () => {
  expect(fits(hat, Array(n * n).fill(0))).toBe(false)
  expect(fits(hat, ink([{ x: .25, y: .45 }, { x: .4, y: .45 }]))).toBe(false)
  expect(fits({ ...hat, y: .22 }, ink(headTop))).toBe(false)
  expect(fits({ ...hat, sketch: { aspect: 1.5, paths: [[['M', 0, 1], ['L', .5, 0]]] } }, ink(headTop))).toBe(false)
})

test('contact payloads cannot disable collision rules or request broad coverage', () => {
  for (const contact of [
    { ...hat.contact, radius: .5 },
    { kind: 'all', points: hat.contact.points },
    { kind: 'points', points: [...hat.contact.points, { x: .4, y: .45 }, { x: .5, y: .45 }] },
    { kind: 'contour', points: [{ x: .3, y: .45 }, { x: .6, y: .45 }] },
    { kind: 'contour', points: Array.from({ length: 25 }, (_, i) => ({ x: .3 + i * .005, y: .45 })) },
    { kind: 'points', points: [{ x: .1, y: .1 }, { x: .6, y: .45 }] },
    { kind: 'points', points: [{ x: NaN, y: .45 }, { x: .6, y: .45 }] },
    { kind: 'points', points: [hat.contact.points[0], hat.contact.points[0]] },
  ]) {
    expect(validateContact(contact, hat.anchor)).toBeNull()
    expect(fits({ ...hat, contact }, ink(headTop))).toBe(false)
    expect(validateProposal({ ...hat, contact })).toBeNull()
  }
  const winding = Array.from({ length: 10 }, (_, i) => ({ x: i % 2 ? .46 : .4, y: .45 + .005 * i }))
  expect(validateContact({ kind: 'contour', points: winding }, hat.anchor)).toBeNull()
  expect(validateProposal({ ...hat, attachment: hat.contact.points[0] })).toBeNull()
  expect(validateProposal({ ...hat, rotation: 10 })).toBeNull()
  expect(fits({ ...hat, attachment: hat.contact.points[0] }, ink(headTop))).toBe(false)
})

test('brush width and physical aspect cannot silently open a larger collision corridor', () => {
  expect(fits({ ...hat, strokeWidth: 32, brushKind: 'marker' }, ink(headTop), 1, { width: 256, height: 256 })).toBe(false)
  expect(validateContact(hat.contact, hat.anchor, 2)).toBeNull()
  expect(fits(hat, ink(headTop), 2, { width: 1600, height: 800 })).toBe(false)
  const portrait = { ...hat, contact: { kind: 'points', points: [{ x: .3, y: .4 }, { x: .3, y: .6 }] } }
  expect(validateContact(portrait.contact, undefined, .5)).toBeNull()
})

test('dense contour checkpoints include endpoints and cannot skip a gap', () => {
  const contact = { kind: 'contour', points: [{ x: .3, y: .45 }, { x: .35, y: .44 }, { x: .4, y: .45 }] }
  const samples = contactSamples(contact, 1, .003)
  expect(samples[0]).toEqual(contact.points[0]); expect(samples.at(-1)).toEqual(contact.points.at(-1))
  expect(samples.length).toBeGreaterThan(30)
  for (let i = 1; i < samples.length; i++) expect(Math.hypot(samples[i].x - samples[i - 1].x, samples[i].y - samples[i - 1].y)).toBeLessThanOrEqual(.00301)
})
