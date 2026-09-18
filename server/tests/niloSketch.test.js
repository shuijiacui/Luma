import { expect, test } from 'vitest'
import { NILO_TEMPLATE_PATH_COUNTS, validateCustomSketch, withinDrawingGroupBudget } from '../src/services/niloSketch.js'

const line = () => [['M', .1, .1], ['L', .8, .8]]
const sketch = paths => ({ aspect: .7, paths })
const custom = paths => ({ template: 'custom', sketch: sketch(paths) })
const longPath = () => [['M', .1, .1], ...Array.from({ length: 31 }, (_, i) => ['L', i % 2 ? .1 : .9, .8])]

test('numeric tuple sketches preserve contour curves, isolated ellipses and natural aspect', () => {
  const input = sketch([
    [['M', .5, .05], ['Q', .12, .3, .22, .78], ['L', .78, .78], ['C', .82, .6, .8, .2, .5, .05], ['Z']],
    [['E', .5, .4, .12, .09]],
  ])
  const result = validateCustomSketch(input)
  expect(result).toEqual(input)
  input.paths[0][0][1] = 1
  expect(result.paths[0][0][1]).toBe(.5)
  expect(validateCustomSketch({ aspect: .2, paths: [line()] })).not.toBeNull()
  expect(validateCustomSketch({ aspect: 5, paths: [line()] })).not.toBeNull()
})

test('custom sketch and every tuple reject extra fields, strings, sparse arrays and executable data', () => {
  for (const invalid of [null, [], {}, { aspect: .1, paths: [line()] }, { aspect: 5.01, paths: [line()] }, { aspect: NaN, paths: [line()] }, { aspect: '1', paths: [line()] }, { ...sketch([line()]), svg: '<svg>' }, { ...sketch([line()]), action: 'accept' }]) expect(validateCustomSketch(invalid)).toBeNull()
  for (const path of [[], ['M0 0 L1 1'], [{ op: 'M', x: 0, y: 0 }, ['L', 1, 1]], [['m', 0, 0], ['L', 1, 1]], [['M', 0, 0], ['A', 1, 1]], [['M', 0, 0], ['L', 1, 1, 'code']], [['M', 0, 0], ['L', '1', 1]], [['M', 0, 0], ['L', NaN, 1]], [['M', 0, 0], ['L', Infinity, 1]], [['M', 0, 0], ['L', 1.01, 1]], [['M', 0, 0], ['Q', -.1, .5, 1, 1]], [['M', 0, 0], ['C', .2, .2, .8, 1.01, 1, 1]], [['M', 0, 0], new Array(3)]]) expect(validateCustomSketch(sketch([path]))).toBeNull()
  expect(validateCustomSketch(sketch(new Array(1)))).toBeNull()
  const sparseCoordinate = new Array(3)
  sparseCoordinate[0] = 'L'
  sparseCoordinate[2] = .5
  expect(validateCustomSketch(sketch([[['M', 0, 0], sparseCoordinate]]))).toBeNull()
})

test('ordinary paths have exactly one initial move and a visible segment before an optional final close', () => {
  for (const path of [[['L', 0, 0], ['L', 1, 1]], [['M', 0, 0]], [['M', 0, 0], ['M', 1, 1], ['L', .5, .5]], [['M', 0, 0], ['Z']], [['M', 0, 0], ['L', 1, 1], ['Z'], ['L', 0, 0]], [['M', .1, .1], ['L', .1, .1]], [['M', .1, .1], ['Q', .1, .1, .1, .1]], [['M', .1, .1], ['C', .1, .1, .1, .1, .1, .1]], [['M', .1, .1], ['L', .1 + 1e-10, .1]]]) expect(validateCustomSketch(sketch([path]))).toBeNull()
  // Curves can return to their starting point while their controls define a real loop.
  expect(validateCustomSketch(sketch([[['M', .1, .1], ['Q', .5, .5, .1, .1]]]))).not.toBeNull()
  expect(validateCustomSketch(sketch([[['M', .1, .1], ['C', .1, .5, .5, .1, .1, .1]]]))).not.toBeNull()
  // One repeated point inside an otherwise visible path is harmless; a wholly invisible path is not.
  expect(validateCustomSketch(sketch([[['M', .1, .1], ['L', .1, .1], ['L', .8, .8], ['Z']]]))).not.toBeNull()
})

test('ellipse commands are standalone full ellipses contained inside their local box', () => {
  expect(validateCustomSketch(sketch([[['E', .5, .5, .5, .5]]]))).not.toBeNull()
  for (const path of [[['E', .5, .5, 0, .1]], [['E', .5, .5, .1, -1]], [['E', .9, .5, .2, .1]], [['E', .1, .5, .2, .1]], [['E', .5, .1, .1, .2]], [['E', .5, .9, .1, .2]], [['E', .5, .5, .1, .1], ['Z']], [['M', .1, .1], ['E', .5, .5, .1, .1]]]) expect(validateCustomSketch(sketch([path]))).toBeNull()
})

test('path and command budgets are inclusive and reject excess atomically', () => {
  expect(validateCustomSketch(sketch(Array.from({ length: 24 }, line)))).not.toBeNull()
  expect(validateCustomSketch(sketch(Array.from({ length: 25 }, line)))).toBeNull()
  expect(validateCustomSketch(sketch([longPath(), longPath(), longPath()]))).not.toBeNull()
  expect(validateCustomSketch(sketch([longPath(), longPath(), longPath(), line()]))).toBeNull()
  expect(validateCustomSketch(sketch([[...longPath(), ['L', .5, .5]]]))).toBeNull()
})

test('combined plans include built-in stroke counts and stop at 64 paths or 192 custom commands', () => {
  const paths = count => custom(Array.from({ length: count }, line))
  expect(withinDrawingGroupBudget([paths(24), paths(24), paths(16)])).toBe(true)
  expect(withinDrawingGroupBudget([paths(24), paths(24), paths(17)])).toBe(false)
  expect(withinDrawingGroupBudget([paths(24), paths(24), paths(7), { template: 'sun' }])).toBe(true)
  expect(withinDrawingGroupBudget([paths(24), paths(24), paths(8), { template: 'sun' }])).toBe(false)
  const manyCommands = custom([longPath(), longPath(), longPath()])
  expect(withinDrawingGroupBudget([manyCommands, manyCommands])).toBe(true)
  expect(withinDrawingGroupBudget([manyCommands, manyCommands, paths(1)])).toBe(false)
  expect(withinDrawingGroupBudget(Array(5).fill({ template: 'moon' }))).toBe(false)
  expect(withinDrawingGroupBudget([{ template: 'unknown' }])).toBe(false)
  expect(Object.keys(NILO_TEMPLATE_PATH_COUNTS)).toHaveLength(21)
})
