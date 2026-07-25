import { test, expect } from 'vitest'
import {
  score,
  effectiveWeight,
  posteriorScore,
  assertConfig,
  DEFAULT_CONFIG,
} from '../src/services/score.js'

const mk = (id, signal, cluster, s, r, note = '文献依据摘要', tier = 1) =>
  ({ id, featureMatch: {}, emotionSignal: signal, cluster, strength: s, reliability: r, note, tier })

const VALID_FEATURES = {
  elements: ['sun'], colors: { dominant: ['black'], darkRatio: 0.7 },
  composition: { size: 'small', position: 'corner', pressure: 'heavy' },
  distortions: ['blackened_sun'], erasureMarks: 3,
  confidence: { elements: 0.9, colors: 0.9, composition: 0.9, distortions: 0.9, erasureMarks: 0.9 },
}
const EMPTY_FEATURES = { elements: [], colors: null, composition: null, distortions: [], erasureMarks: 0 }

// 用例 1: w_eff = s × r（LLM 置信度 c 只做门控，不影响数值）
test('1. w_eff = s*r, capped at 0.9; feature confidence does not affect score', () => {
  expect(effectiveWeight({ strength: 0.6, reliability: 0.7 })).toBeCloseTo(0.42)
  expect(effectiveWeight({ strength: 1, reliability: 1 })).toBe(0.9)

  const matches = [mk('X-1', '低落倾向', 'c1', 0.6, 0.7), mk('X-2', '低落倾向', 'c2', 0.6, 0.7)]
  const lowC = score(matches, { ...VALID_FEATURES, confidence: { elements: 0.51, colors: 0.51, composition: 0.51, distortions: 0.51, erasureMarks: 0.51 } })
  const highC = score(matches, VALID_FEATURES)
  expect(lowC.groups['低落倾向'].posterior).toBeCloseTo(highC.groups['低落倾向'].posterior, 10)
})

// 用例 2: c 门控（0.49 丢弃 / 0.51 保留）由 extractFeatures.gateFeatures 实现，
// 覆盖于 tests/extractFeatures.test.js「gateFeatures drops dimensions with confidence < 0.5」

// 用例 3: 同簇去重——簇内多条命中只取 max
test('3. same-cluster hits dedupe to max weight', () => {
  const three = score([
    mk('A-1', '低落倾向', 'dark_color', 0.3, 0.7),
    mk('A-2', '低落倾向', 'dark_color', 0.6, 0.7), // 0.42 = 簇内 max
    mk('A-3', '低落倾向', 'dark_color', 0.2, 0.7),
  ], VALID_FEATURES)
  const one = score([mk('A-2', '低落倾向', 'dark_color', 0.6, 0.7)], VALID_FEATURES)
  expect(three.groups['低落倾向'].posterior).toBeCloseTo(one.groups['低落倾向'].posterior, 10)
  expect(three.groups['低落倾向'].clusters).toBe(1)
})

// 用例 4: 多簇 noisy-OR 合成 > 单簇
test('4. noisy-OR across independent clusters exceeds single cluster', () => {
  const single = score([mk('B-1', '低落倾向', 'c1', 0.6, 0.7)], VALID_FEATURES)
  const double = score([mk('B-1', '低落倾向', 'c1', 0.6, 0.7), mk('B-2', '低落倾向', 'c2', 0.6, 0.7)], VALID_FEATURES)
  expect(double.groups['低落倾向'].E).toBeCloseTo(1 - (1 - 0.42) ** 2, 10)
  expect(double.groups['低落倾向'].posterior).toBeGreaterThan(single.groups['低落倾向'].posterior)
})

// 用例 5: 天花板只作用于展示值；排名用未截断分值
test('5. display confidence capped at 0.85, raw posterior preserved for ranking', () => {
  // 乐观平稳先验 0.6，强证据下 raw posterior 可超过 0.85
  const matches = [mk('P-1', '乐观平稳', 'p1', 0.9, 0.9), mk('P-2', '乐观平稳', 'p2', 0.9, 0.9)]
  const res = score(matches, VALID_FEATURES)
  expect(res.emotion).toBe('乐观平稳')
  expect(res.groups['乐观平稳'].posterior).toBeGreaterThan(0.85) // 未截断原始分
  expect(res.confidence).toBe(0.85) // 展示值被天花板截断
})

// 用例 6: 红线——文案含疾病词或引用 ID 不存在 → 信息不足
test('6. red-line disease word in evidence summary → 信息不足', () => {
  const matches = [
    mk('R-1', '低落倾向', 'c1', 0.6, 0.7, '该特征与抑郁相关'),
    mk('R-2', '低落倾向', 'c2', 0.6, 0.7),
  ]
  const res = score(matches, VALID_FEATURES)
  expect(res.emotion).toBe('信息不足')
  expect(res.reason).toBe('redline')
})

test('6b. evidence entry id not in knowledge base → 信息不足', () => {
  const config = { ...DEFAULT_CONFIG, validIds: new Set(['KNOWN-1']) }
  const res = score([mk('GHOST-1', '低落倾向', 'c1', 0.6, 0.7)], VALID_FEATURES, config)
  expect(res.emotion).toBe('信息不足')
  expect(res.reason).toBe('invalid_evidence')
})

// 用例 7: 阈值可达性不变量——每组 posterior(E=1) ≥ threshold；配置非法拒绝加载
test('7. threshold reachability invariant holds and is asserted', () => {
  for (const prior of [0.15, 0.6]) {
    expect(posteriorScore(1, prior, DEFAULT_CONFIG.fpr)).toBeGreaterThanOrEqual(DEFAULT_CONFIG.threshold)
  }
  // 典型 2 簇场景（s·r=0.42 × 2）可达阈值
  expect(posteriorScore(1 - (1 - 0.42) ** 2, 0.15, 0.05)).toBeGreaterThanOrEqual(0.7)
  expect(() => assertConfig(DEFAULT_CONFIG)).not.toThrow()
  expect(() => assertConfig({ ...DEFAULT_CONFIG, fpr: 0.3 })).toThrow(/fpr/)
})

// 用例 8: 乐观抑制——负面组 ≥ 0.4 → 乐观组从候选集删除（分更高也不输出）
test('8. positive group suppressed when any negative group >= 0.4', () => {
  const matches = [
    mk('N-1', '低落倾向', 'c1', 0.6, 0.7), mk('N-2', '低落倾向', 'c2', 0.6, 0.7), // 负面 0.70
    mk('P-1', '乐观平稳', 'p1', 0.9, 0.9), // 乐观 raw 0.93，分更高
  ]
  const res = score(matches, VALID_FEATURES)
  expect(res.groups['乐观平稳'].posterior).toBeGreaterThan(res.groups['低落倾向'].posterior)
  expect(res.suppressed).toContain('乐观平稳')
  expect(res.emotion).not.toBe('乐观平稳') // 方向冲突（规则 4d）→ 需要关注
  expect(res.emotion).toBe('需要关注')
})

// 用例 9: 最低证据数——负面组仅 1 簇命中且分值 ≥ 0.7 → 需要关注（规则 4e）
test('9. single-cluster negative group >= 0.7 → 需要关注', () => {
  const res = score([mk('S-1', '低落倾向', 'only', 1, 0.9)], VALID_FEATURES)
  expect(res.groups['低落倾向'].posterior).toBeGreaterThanOrEqual(0.7)
  expect(res.groups['低落倾向'].clusters).toBe(1)
  expect(res.emotion).toBe('需要关注')
  expect(res.reason).toBe('4e')
})

// 用例 10: 零命中分支 vs 提取失败
test('10. zero hits → 未见明显风险信号(0.60); all dims gated → 信息不足', () => {
  const zero = score([], VALID_FEATURES)
  expect(zero.emotion).toBe('未见明显风险信号')
  expect(zero.confidence).toBe(0.6)
  expect(zero.reason).toBe('zero_hits')

  const failed = score([], EMPTY_FEATURES)
  expect(failed.emotion).toBe('信息不足')
  expect(failed.reason).toBe('extraction_failed')
})

// 用例 11: 多组过阈 → 需要关注（规则 4b/4c）
test('11. two negative groups both >= 0.7 → 需要关注', () => {
  const matches = [
    mk('D-1', '低落倾向', 'c1', 0.6, 0.7), mk('D-2', '低落倾向', 'c2', 0.6, 0.7), mk('D-3', '低落倾向', 'c3', 0.6, 0.7), // ≈0.74
    mk('A-1', '焦虑倾向', 'c4', 0.6, 0.7), mk('A-2', '焦虑倾向', 'c5', 0.6, 0.7), mk('A-3', '焦虑倾向', 'c6', 0.5, 0.7), // ≈0.73
  ]
  const res = score(matches, VALID_FEATURES)
  expect(res.groups['低落倾向'].posterior).toBeGreaterThanOrEqual(0.7)
  expect(res.groups['焦虑倾向'].posterior).toBeGreaterThanOrEqual(0.7)
  expect(res.emotion).toBe('需要关注')
  expect(['4b', '4c']).toContain(res.reason)
})

// 用例 12: 方向冲突——负面组 ≥0.7 且乐观组 ≥0.5 → 需要关注（规则 4d）
test('12. negative >= 0.7 with positive >= 0.5 → 需要关注 (4d)', () => {
  const matches = [
    mk('N-1', '焦虑倾向', 'c1', 0.6, 0.7), mk('N-2', '焦虑倾向', 'c2', 0.6, 0.7), // 0.70
    mk('P-1', '乐观平稳', 'p1', 0.1, 0.5), // E=0.05 → posterior 0.6
  ]
  const res = score(matches, VALID_FEATURES)
  expect(res.groups['焦虑倾向'].posterior).toBeGreaterThanOrEqual(0.7)
  expect(res.groups['乐观平稳'].posterior).toBeGreaterThanOrEqual(0.5)
  expect(res.emotion).toBe('需要关注')
  expect(res.reason).toBe('4d')
})

// 主判定 happy path：单负面组 2 簇 ≥0.7，无干扰 → 输出该倾向
test('main rule: negative group with 2 clusters >= 0.7 outputs the tendency', () => {
  const matches = [mk('M-1', '低落倾向', 'c1', 0.6, 0.7), mk('M-2', '低落倾向', 'c2', 0.6, 0.7)]
  const res = score(matches, VALID_FEATURES)
  expect(res.emotion).toBe('低落倾向')
  expect(res.confidence).toBeCloseTo(res.groups['低落倾向'].posterior, 10)
  expect(res.confidence).toBeGreaterThanOrEqual(0.7)
  expect(res.evidence.map(e => e.entryId)).toEqual(expect.arrayContaining(['M-1', 'M-2']))
})

// 正面证据输出乐观平稳（区别于零命中的"未见明显风险信号"）
test('positive evidence → 乐观平稳 (distinct from zero-hit branch)', () => {
  const res = score([mk('P-1', '乐观平稳', 'p1', 0.2, 0.7)], VALID_FEATURES)
  expect(res.emotion).toBe('乐观平稳')
  expect(res.reason).toBe('main')
  expect(res.confidence).toBeGreaterThanOrEqual(0.7)
})

// 弱预警带：负面组 ∈ [0.4, 0.7) → 需要关注（规则 4a）
test('weak band: negative in [0.4, 0.7) → 需要关注 (4a)', () => {
  // 单簇 w=0.42 → E=0.42 → posterior ≈ 0.60
  const res = score([mk('W-1', '焦虑倾向', 'c1', 0.6, 0.7)], VALID_FEATURES)
  expect(res.groups['焦虑倾向'].posterior).toBeGreaterThanOrEqual(0.4)
  expect(res.groups['焦虑倾向'].posterior).toBeLessThan(0.7)
  expect(res.emotion).toBe('需要关注')
  expect(res.reason).toBe('4a')
})

// 兜底：有命中但所有组 < 0.4 → 信息不足
test('fallback: hits exist but all groups < 0.4 → 信息不足', () => {
  const res = score([mk('F-1', '低落倾向', 'c1', 0.2, 0.5)], VALID_FEATURES) // w=0.1 → posterior 0.26
  expect(res.groups['低落倾向'].posterior).toBeLessThan(0.4)
  expect(res.emotion).toBe('信息不足')
  expect(res.reason).toBe('fallback')
})
