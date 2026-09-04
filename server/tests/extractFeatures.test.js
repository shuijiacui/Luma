import { test, expect } from 'vitest'
import {
  extractFeatures,
  validateFeatures,
  gateFeatures,
  allDimensionsEmpty,
  FeatureExtractionError,
} from '../src/services/extractFeatures.js'

const VALID = {
  rawDescription: '画面中央有一座房子，旁边一棵树。',
  elements: ['house', 'tree'],
  colors: { dominant: ['green'], darkRatio: 0.1 },
  composition: { size: 'normal', position: 'center', pressure: 'normal' },
  distortions: [],
  erasureMarks: 0,
  confidence: { elements: 0.9, colors: 0.85, composition: 0.8, distortions: 0.6, erasureMarks: 0.55 },
}

test('valid feature JSON passes validation', () => {
  expect(() => validateFeatures(VALID)).not.toThrow()
})

test('missing confidence dimension fails validation', () => {
  const bad = structuredClone(VALID)
  delete bad.confidence.colors
  expect(() => validateFeatures(bad)).toThrow(/confidence/)
})

test('missing rawDescription fails validation (防幻觉审计依据必须存在)', () => {
  const bad = structuredClone(VALID)
  delete bad.rawDescription
  expect(() => validateFeatures(bad)).toThrow(/rawDescription/)
})

test('gateFeatures drops dimensions with confidence < 0.5, keeps >= 0.5', () => {
  const f = structuredClone(VALID)
  f.confidence.elements = 0.49 // 丢弃
  f.confidence.colors = 0.51   // 保留
  const { features, dropped } = gateFeatures(f)
  expect(dropped).toEqual(['elements'])
  expect(features.elements).toEqual([])
  expect(features.colors).toEqual({ dominant: ['green'], darkRatio: 0.1 })
})

test('extractFeatures returns schema-valid gated features (合法输入)', async () => {
  const chatWithImage = async () => structuredClone(VALID)
  const features = await extractFeatures('img', { chatWithImage })
  expect(features.elements).toEqual(['house', 'tree'])
  expect(features.rawDescription).toContain('房子')
  expect(features.droppedDimensions).toEqual([])
  expect(() => validateFeatures(features)).not.toThrow()
})

test('extractFeatures throws FeatureExtractionError with raw content (非法输入)', async () => {
  const chatWithImage = async () => ({ elements: 'not-an-array' })
  const err = await extractFeatures('img', { chatWithImage }).catch(e => e)
  expect(err).toBeInstanceOf(FeatureExtractionError)
  expect(JSON.stringify(err.raw)).toContain('not-an-array')
})

test('allDimensionsEmpty: true when every dimension gated out', () => {
  const empty = {
    elements: [], colors: null, composition: null, distortions: [], erasureMarks: 0,
  }
  expect(allDimensionsEmpty(empty)).toBe(true)
  expect(allDimensionsEmpty(VALID)).toBe(false)
})
