import { afterEach, expect, test, vi } from 'vitest'
import { PNG } from 'pngjs'
import { generateNiloScene } from '../src/services/niloScene.js'

afterEach(() => { vi.restoreAllMocks() })

test('both vision stages inspect the same genuinely inverted generated pixels after input validation and aspect fitting', async () => {
  // An asymmetric source: one dark rectangle lies entirely in the upper-left
  // quarter; the lower and right halves contain no ink. No OCR or familiar
  // subject is needed to prove the actual output's coordinate transformation.
  const source = new PNG({ width: 64, height: 64 }); source.data.fill(255)
  for (let y = 7; y < 18; y++) for (let x = 8; x < 24; x++) {
    const offset = (y * source.width + x) * 4
    source.data[offset] = source.data[offset + 1] = source.data[offset + 2] = 32
  }
  const raster = { version: 1, pngBase64: PNG.sync.write(source).toString('base64'), width: 64, height: 64, projection: 'gray' }
  const object = { id: 'inverted_pattern', name: '倒置图案', aliases: [], role: 'main', essential: ['方块位于完整图像的右下方'],
    render: { kind: 'generated', sourceDescription: 'One dark rectangle in the upper-left quarter of an otherwise white square image.' },
    rotation: 180, box: { x: .1, y: .15, width: .8, height: .6 }, color: '#66729b' }
  const plan = { version: 1, title: '倒置图案', request: '把完整图案旋转半圈', summary: '小方块出现在图像的右下方。', objects: [object], preserve: [] }
  const snapshot = structuredClone(plan), images = []
  const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('This regression must not use the network'))
  const generateImage = vi.fn(async () => raster)
  const chatText = vi.fn(async () => { throw new Error('No text generation is expected during rendering') })
  const result = await generateNiloScene({ stage: 'render', utterance: plan.request, locale: 'zh', plan,
    context: { canvasAspect: 1.4, requestScope: 'scene' } }, {
    generateImage, chatText,
    chatWithImage: async (image, _prompt, options) => {
      images.push({ kind: options.kind, image })
      if (options.kind === 'nilo_scene_observe') return {
        subject: 'A rectangle on a white background.', parts: ['One dark rectangle'], connections: [],
        orientation: 'Rectangle is in the lower-right part of the drawing.', uncertain: [],
      }
      expect(options.kind).toBe('nilo_scene_quality')
      return { accepted: true, issues: [] }
    },
  })
  expect(result.status).toBe('ready')
  expect(generateImage).toHaveBeenCalledOnce()
  expect(generateImage.mock.calls[0][0]).toMatchObject({ rotation: 180, render: object.render })
  expect(images.map(item => item.kind)).toEqual(['nilo_scene_observe', 'nilo_scene_quality'])
  expect(images[0].image).toBe(images[1].image)
  expect(images[0].image).not.toBe(raster.pngBase64)
  const proposal = result.objects[0].proposal
  expect(proposal.rotation).toBe(180)
  expect(proposal.width * 1.4 / proposal.height).toBeCloseTo(1, 10)
  expect(proposal.width).toBeLessThan(object.box.width)
  const final = PNG.sync.read(Buffer.from(images[0].image, 'base64'))
  const centerX = (proposal.x + proposal.width / 2) * final.width
  const centerY = (proposal.y + proposal.height / 2) * final.height
  let darkPixels = 0, upperHalfInk = 0, leftHalfInk = 0
  for (let y = 0; y < final.height; y++) for (let x = 0; x < final.width; x++) {
    const offset = (y * final.width + x) * 4
    if (final.data[offset] >= 200) continue
    darkPixels++
    if (y < centerY) upperHalfInk++
    if (x < centerX) leftHalfInk++
  }
  // These independent pixel-location checks fail for no rotation, a mere
  // vertical flip, a mere horizontal flip, or an empty preview.
  expect(darkPixels).toBeGreaterThan(1000)
  expect(upperHalfInk).toBe(0)
  expect(leftHalfInk).toBe(0)
  expect(result.plan.objects[0].render).toEqual(object.render)
  expect(plan).toEqual(snapshot)
  expect(chatText).not.toHaveBeenCalled()
  expect(fetch).not.toHaveBeenCalled()
})
