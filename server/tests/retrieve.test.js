import { test, expect } from 'vitest'
import { retrieve, matchEntry } from '../src/services/retrieve.js'

const ENTRIES = [
  { id: 'A', featureMatch: { elements: ['sun'] }, emotionSignal: '低落倾向', cluster: 'weather', strength: 0.5, reliability: 0.7 },
  { id: 'B', featureMatch: { 'colors.darkRatioMin': 0.6 }, emotionSignal: '低落倾向', cluster: 'dark_color', strength: 0.6, reliability: 0.9 },
  { id: 'C', featureMatch: { elements: ['house', 'tree'] }, emotionSignal: '乐观平稳', cluster: 'classic_htp', strength: 0.3, reliability: 0.5 },
  { id: 'D', featureMatch: { distortions: ['blackened_sun'], erasureMarksMin: 3 }, emotionSignal: '焦虑倾向', cluster: 'dark_color', strength: 0.4, reliability: 0.7 },
]

const FEATURES = {
  elements: ['sun', 'house', 'tree'],
  colors: { dominant: ['black'], darkRatio: 0.7 },
  composition: { size: 'normal', position: 'center', pressure: 'heavy' },
  distortions: ['blackened_sun'],
  erasureMarks: 1,
}

test('hits are returned sorted by strength*reliability desc', () => {
  const hits = retrieve(FEATURES, ENTRIES)
  // 命中: B(0.54) > A(0.35) > C(0.15)；D 擦改次数不足不命中
  expect(hits.map(h => h.id)).toEqual(['B', 'A', 'C'])
})

test('AND logic: all conditions must hold', () => {
  expect(matchEntry(ENTRIES[3], FEATURES)).toBe(false) // erasureMarks 1 < 3
  expect(matchEntry(ENTRIES[3], { ...FEATURES, erasureMarks: 5 })).toBe(true)
})

test('no match returns empty array', () => {
  const plain = {
    elements: ['flower'], colors: { dominant: ['red'], darkRatio: 0.05 },
    composition: { size: 'large', position: 'center', pressure: 'light' },
    distortions: [], erasureMarks: 0,
  }
  expect(retrieve(plain, ENTRIES)).toEqual([])
})

test('gated-out dimensions (null) never match', () => {
  const gated = { elements: [], colors: null, composition: null, distortions: [], erasureMarks: 0 }
  expect(retrieve(gated, ENTRIES)).toEqual([])
})
