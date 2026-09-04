// 知识库调度器（docs/知识库调度.md「调度器」落地）
// L4 元认知层先行：年龄调制 → 标签匹配 → L3 共现门槛 → 冲突登记处置
// 输出分层命中集给 score.js；冲突与丢弃全程显式记录（不在黑箱里消化）
import { matchEntry } from './retrieve.js'

const GATE = 0.5 // 与 extractFeatures 的 L1→L2 闸门一致

// 条目 featureMatch 涉及的特征维度（用于年龄调制查对应 confidence）
function matchDims(entry) {
  return Object.keys(entry.featureMatch ?? {}).map(key =>
    key === 'erasureMarksMin' ? 'erasureMarks' : key.split('.')[0])
}

export function dispatchEntries({ features, entries, constraints = {}, childAge = null }) {
  const conflicts = []
  const dropped = []
  let hits = entries.filter(e => matchEntry(e, features))

  // 1. 年龄调制（L4 前置）：affectedEntries 在低龄段按 c×multiplier 重新过门控
  //    v2.2 语义：c 只做门控不入权重——年龄调制影响的是"该条目的特征证据在发育混淆年龄段是否可信"
  const ageMods = constraints.ageMods
  if (ageMods && childAge != null) {
    const band = ageMods.bands?.find(b => childAge >= b.min && childAge <= b.max)
    const multiplier = band?.multiplier ?? ageMods.defaultMultiplier ?? 1
    if (multiplier < 1) {
      hits = hits.filter(e => {
        if (!ageMods.affectedEntries?.includes(e.id)) return true
        const pass = matchDims(e).every(d => (features.confidence?.[d] ?? 0) * multiplier >= GATE)
        if (!pass) dropped.push({ id: e.id, reason: `age_mod(age=${childAge},x${multiplier})` })
        return pass
      })
    }
  }

  // 2. L3 经验层共现门槛：同情绪组无 L1 命中 → L3 条目丢弃（定性观察永远只是旁证）
  const l1Groups = new Set(hits.filter(h => h.tier === 1).map(h => h.emotionSignal))
  hits = hits.filter(h => {
    if (h.tier !== 3 || l1Groups.has(h.emotionSignal)) return true
    dropped.push({ id: h.id, reason: 'L3_requires_L1_cooccurrence' })
    return false
  })

  // 3. 冲突登记（L4）：命中规则按 policy 处置，冲突 ID 强制记录
  for (const rule of constraints.conflictRegistry ?? []) {
    const hitBy = id => hits.some(h => h.id === id)
    if (rule.id === 'CONFLICT-01') {
      // 天气意象方向冲突：两条同时命中 → weather 簇在两组均作废
      if (rule.entries.every(hitBy)) {
        const voided = hits.filter(h => h.cluster === 'weather').map(h => h.id)
        hits = hits.filter(h => h.cluster !== 'weather')
        conflicts.push(rule.id)
        dropped.push(...voided.map(id => ({ id, reason: `${rule.id}: weather 簇作废` })))
      }
    } else if (rule.id === 'CONFLICT-02') {
      // 擦改方向争议：只在伴随 line_quality/heavy_pressure 簇命中时计入
      if (rule.entries.some(hitBy)) {
        const lineSupport = hits.some(h => h.cluster === 'line_quality' || h.cluster === 'heavy_pressure')
        conflicts.push(rule.id)
        if (!lineSupport) {
          hits = hits.filter(h => !rule.entries.includes(h.id))
          dropped.push(...rule.entries.map(id => ({ id, reason: `${rule.id}: 无线条簇支撑，擦改条目不计入` })))
        }
      }
    }
    // CONFLICT-03：policy 为"strength 已压至 0.35，不再调整"——条目数据已落地，无需运行期处置
  }

  // 与 retrieve() 一致的排序（s×r 降序）
  hits.sort((a, b) => b.strength * b.reliability - a.strength * a.reliability)
  return { hits, conflicts, dropped }
}
