import { expect, test } from 'vitest'
import { PNG } from 'pngjs'
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { extractImageAddition } from '../src/services/niloImageAddition.js'
import { checkImageAdditionFiles } from '../scripts/check-nilo-image-addition.mjs'

const roi = { x: .25, y: .15, width: .5, height: .30 }
const write = png => PNG.sync.write(png)
function pixel(png, x, y, color = [32, 53, 47, 255]) {
  for (let i = 0; i < 4; i++) png.data[(y * png.width + x) * 4 + i] = color[i]
}
function fixture(width = 128, height = 128) {
  const original = new PNG({ width, height }); original.data.fill(255)
  // Existing line is immediately below the allowed upper-side addition.
  for (let x = Math.ceil(width * .3); x < width * .7; x++) pixel(original, x, Math.floor(height * .45))
  const candidate = PNG.sync.read(write(original))
  for (let x = Math.ceil(width * .4); x < width * .6; x++) pixel(candidate, x, Math.floor(height * .25))
  return { original, candidate }
}
function run(f, extra = {}) {
  return extractImageAddition({ originalPng: write(f.original), candidatePng: write(f.candidate), roi, ...extra })
}

test.each([[128,128],[256,128],[128,256]])('extracts an additive layer at original %ix%i size without changing old pixels', (width, height) => {
  const f = fixture(width, height), before = Buffer.from(f.original.data), edited = Buffer.from(f.candidate.data)
  const result = run(f)
  expect(result.ok).toBe(true); expect(result.semanticVerified).toBe(false)
  const layer = PNG.sync.read(result.layerPng), composite = PNG.sync.read(result.compositePng)
  expect([layer.width, layer.height]).toEqual([width, height])
  expect(composite.data).toEqual(edited)
  expect(f.original.data).toEqual(before); expect(f.candidate.data).toEqual(edited)
  for (let i = 0; i < before.length; i += 4) {
    if (before[i] !== 255) {
      expect([...composite.data.subarray(i, i + 4)]).toEqual([...before.subarray(i, i + 4)])
      expect(layer.data[i + 3]).toBe(0)
    }
  }
})

test('small non-ink compression noise is ignored rather than copied across the background', () => {
  const f = fixture(); pixel(f.candidate, 4, 4, [254,253,252,255])
  const result = run(f)
  expect(result.ok).toBe(true); expect(result.metrics.ignoredNoisePixels).toBe(1)
  expect([...PNG.sync.read(result.compositePng).data.subarray((4 * 128 + 4) * 4, (4 * 128 + 4) * 4 + 4)]).toEqual([255,255,255,255])
})

test.each([
  ['eraser', [255,255,255,255]],
  ['recolor', [255,0,0,255]],
  ['faint-antialias overwrite', [254,254,254,255]],
])('rejects %s of original ink, even inside an authorized ROI', (_, color) => {
  const f = fixture(); pixel(f.original, 60, 40); pixel(f.candidate, 60, 40, color)
  expect(run(f).reason).toBe('original_ink_changed')
})

test('protects the faint original anti-alias fringe bit-for-bit', () => {
  const f = fixture(); pixel(f.original, 60, 40, [254,254,254,255]); pixel(f.candidate, 60, 40)
  expect(run(f).reason).toBe('original_ink_changed')
})

test('rejects a shifted whole subject, rather than align or crop the output into acceptance', () => {
  const f = fixture()
  for (let x = 39; x < 89; x++) {
    pixel(f.candidate, x, 57, [255,255,255,255]); pixel(f.candidate, x, 59)
  }
  const result = run(f)
  expect(result.ok).toBe(false); expect(result.reason).toBe('outside_authorized_region')
  expect(result.layerPng).toBeUndefined()
})

test('rejects candidate watermark and stray background edits rather than silently discarding them', () => {
  const f = fixture(); pixel(f.candidate, 3, 4)
  expect(run(f).reason).toBe('outside_authorized_region')
})

test('rejects unchanged, nearly invisible or a single-pixel addition', () => {
  const f = fixture(); f.candidate = PNG.sync.read(write(f.original))
  expect(run(f).reason).toBe('no_visible_addition')
  pixel(f.candidate, 60, 40)
  expect(run(f).reason).toBe('no_visible_addition')
  for (let x = 40; x < 70; x++) pixel(f.candidate, x, 40, [247,247,247,255])
  expect(run(f).reason).toBe('no_visible_addition')
})

test('rejects large area redraw, including filling a small ROI completely', () => {
  const f = fixture()
  for (let y = 25; y < 50; y++) for (let x = 40; x < 85; x++) pixel(f.candidate, x, y)
  expect(run(f).reason).toBe('addition_too_large')
  const g = fixture(); g.candidate = PNG.sync.read(write(g.original))
  const small = { x: .3, y: .2, width: .1, height: .1 }
  for (let y = 26; y < 38; y++) for (let x = 39; x < 51; x++) pixel(g.candidate, x, y)
  expect(run(g, { roi: small }).reason).toBe('addition_too_large')
})

test('only an explicit, bounded contact band permits an extension just outside the ROI', () => {
  const f = fixture(); pixel(f.candidate, 60, 58); pixel(f.candidate, 61, 58)
  const contact = { points: [{ x: 60.5/128, y: 57.5/128 }], radius: .018 }
  expect(run(f).reason).toBe('outside_authorized_region')
  const result = run(f, { contact })
  expect(result.ok).toBe(true); expect(result.metrics.contactAdditionPixels).toBe(2)
  const offset = (57 * 128 + 60) * 4
  expect([...PNG.sync.read(result.compositePng).data.subarray(offset, offset + 4)]).toEqual([...f.original.data.subarray(offset, offset + 4)])
})

test('an authorized contact band never permits replacing existing ink', () => {
  const f = fixture(); pixel(f.candidate, 60, 57, [255,0,0,255]); pixel(f.candidate, 60, 58)
  const contact = { points: [{ x: 60.5/128, y: 57.5/128 }], radius: .018 }
  expect(run(f, { contact }).reason).toBe('original_ink_changed')
})

test('declared contact must have actual new pixels, not only a detached addition elsewhere', () => {
  expect(run(fixture(), { contact: { points: [{ x: 60.5/128, y: 57.5/128 }], radius: .018 } }).reason).toBe('missing_contact_addition')
})

test.each([
  [{ points: [{x:.5,y:.2}], radius: .02 }, 'contact_without_original_ink'],
  [{ points: [{x:.5,y:.8}], radius: .02 }, 'contact_outside_roi'],
  [{ points: [{x:.5,y:.445}], radius: .3 }, 'invalid_contact'],
  [{ points: [{x:NaN,y:.445}], radius: .02 }, 'invalid_contact'],
  [{ points: Array.from({length:25},()=>({x:.5,y:.445})), radius: .02 }, 'invalid_contact'],
  [{ points: [{x:.30,y:.445},{x:.69,y:.445}], radius: .02 }, 'contact_too_long'],
])('rejects broad, invented or malformed contact %#', (contact, reason) => {
  expect(run(fixture(), { contact }).reason).toBe(reason)
})

test.each([
  undefined,
  { x:0,y:0,width:1,height:1 },
  { x:-.1,y:.1,width:.3,height:.2 },
  { x:.8,y:.1,width:.3,height:.2 },
  { x:.1,y:.1,width:0,height:.2 },
  { x:.1,y:.1,width:.3,height:.2,override:true },
])('rejects invalid/unbounded ROI %#', badRoi => {
  expect(run(fixture(), { roi:badRoi }).reason).toBe('invalid_roi')
})

test('refuses resizing, transparent canvases, malformed data and compressed dimension bombs', () => {
  const f = fixture(), g = fixture(64,64)
  expect(extractImageAddition({originalPng:write(f.original),candidatePng:write(g.candidate),roi}).reason).toBe('dimensions_changed')
  f.candidate.data[3]=0
  expect(run(f).reason).toBe('opaque_canvas_required')
  expect(extractImageAddition({originalPng:Buffer.from('not a png'),candidatePng:write(g.candidate),roi}).reason).toBe('invalid_png')
  const bomb=write(g.original);bomb.writeUInt32BE(999999,16)
  expect(extractImageAddition({originalPng:bomb,candidatePng:write(g.candidate),roi}).reason).toBe('image_too_large')
})

test('file runner outputs only approved layer/composite and refuses to overwrite previous artifacts', () => {
  const directory = mkdtempSync(join(tmpdir(),'nilo-image-addition-')), f=fixture()
  const original=join(directory,'original.png'),candidate=join(directory,'candidate.png'),region=join(directory,'region.json')
  writeFileSync(original,write(f.original));writeFileSync(candidate,write(f.candidate));writeFileSync(region,JSON.stringify({roi}))
  const options={original,candidate,region,out:join(directory,'approved')}
  const result=checkImageAdditionFiles(options)
  expect(result.ok).toBe(true);expect(existsSync(join(options.out,'addition.png'))).toBe(true)
  expect(JSON.parse(readFileSync(join(options.out,'report.json'),'utf8')).semanticVerified).toBe(false)
  expect(()=>checkImageAdditionFiles(options)).toThrow('output_directory_already_exists')
  pixel(f.candidate,0,0);writeFileSync(candidate,write(f.candidate))
  const denied=join(directory,'denied')
  expect(checkImageAdditionFiles({...options,out:denied}).ok).toBe(false)
  expect(existsSync(join(denied,'report.json'))).toBe(true)
  expect(existsSync(join(denied,'addition.png'))).toBe(false)
  expect(existsSync(join(denied,'composite.png'))).toBe(false)
})
