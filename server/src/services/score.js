// 情绪评分 + 置信度 v2.3（严格按 docs/RAG设计.md「评分与置信度 v2」+ Step 6 完整决策序）
//
//   w_eff = min(s·r, 0.9)         —— LLM 置信度 c 只做 ≥0.5 门控（在 extractFeatures），不入权重
//   簇内取 max → 簇间 noisy-OR: E = 1-Π(1-w_cluster)
//   posterior_score = E·prior / (E·prior + fpr·(1-prior))   （Bayesian-inspired calibration，非严格后验）
//   天花板 0.85 只作用于展示值；排名用未截断分值
import { allDimensionsEmpty } from './extractFeatures.js'

export const NEGATIVE_GROUPS = ['低落倾向', '焦虑倾向']
export const POSITIVE_GROUP = '乐观平稳'
export const ALL_GROUPS = [...NEGATIVE_GROUPS, POSITIVE_GROUP]

export const RED_LINE_WORDS = ['抑郁', '抑郁症', '焦虑障碍', '多动症', '自闭', '孤独症', '双相', '精神分裂', '心理疾病', '诊断']

export const DEFAULT_CONFIG = {
  priors: { 低落倾向: 0.15, 焦虑倾向: 0.15, 乐观平稳: 0.6 },
  fpr: 0.05,
  threshold: 0.7,        // 主判定阈值
  weakBand: 0.4,         // 弱预警带下界 / 乐观抑制线
  positiveConflict: 0.5, // 方向冲突：乐观组分值线
  closeMargin: 0.1,      // 区分度不足的最小差距
  ceiling: 0.85,         // 效度天花板（Lin et al. 2022）
  redLineWords: RED_LINE_WORDS,
  validIds: null,        // Set<entryId>；null 表示不校验
  crossClusterDiscount: 1.0, // 预留（v2.2 已知局限），当前不生效
}

// Step 4: Bayesian-inspired calibration
export function posteriorScore(E, prior, fpr) {
  if (E <= 0) return 0
  return (E * prior) / (E * prior + fpr * (1 - prior))
}

export function effectiveWeight(entry) {
  return Math.min(entry.strength * entry.reliability, 0.9)
}

// 规则 9：参数自校验——fpr ≤ prior·(1-θ)/(θ·(1-prior))，每次读取配置时断言
export function assertConfig(config) {
  for (const g of NEGATIVE_GROUPS) {
    const prior = config.priors[g]
    const maxFpr = (prior * (1 - config.threshold)) / (config.threshold * (1 - prior))
    if (!(config.fpr <= maxFpr + 1e-12)) {
      throw new Error(`config rejected: fpr=${config.fpr} 超过阈值可达性上界 ${maxFpr.toFixed(4)}（prior=${prior}, threshold=${config.threshold}）`)
    }
  }
  return true
}

const insufficient = (reason, extra = {}) =>
  ({ emotion: '信息不足', confidence: 0, evidence: [], groups: {}, suppressed: [], reason, ...extra })

function buildGroups(matches) {
  const groups = {}
  for (const name of ALL_GROUPS) groups[name] = { clusterMax: new Map(), hits: [] }
  for (const m of matches) {
    const g = groups[m.emotionSignal]
    if (!g) continue
    const w = effectiveWeight(m)
    const cluster = m.cluster || m.id
    g.clusterMax.set(cluster, Math.max(g.clusterMax.get(cluster) ?? 0, w))
    g.hits.push({ entry: m, w })
  }
  return groups
}

export function score(matches, features, config = DEFAULT_CONFIG) {
  assertConfig(config)

  // 规则 1：提取质量闸——全部特征维度被 L1→L2 丢弃 → 信息不足
  if (allDimensionsEmpty(features)) return insufficient('extraction_failed')

  // 规则 8a：引用条目 ID 必须真实存在
  const usable = config.validIds ? matches.filter(m => config.validIds.has(m.id)) : matches
  if (matches.length > 0 && usable.length === 0) return insufficient('invalid_evidence')

  // 规则 2：零命中分支——missing evidence ≠ positive evidence，命中后立即终止，不执行规则 3-7
  if (usable.length === 0) {
    return {
      emotion: '未见明显风险信号', confidence: config.priors[POSITIVE_GROUP],
      evidence: [], groups: {}, suppressed: [], reason: 'zero_hits',
    }
  }

  const raw = buildGroups(usable)
  const groups = {}
  for (const [name, g] of Object.entries(raw)) {
    // Step 2/3：簇内 max → 簇间 noisy-OR
    const weights = [...g.clusterMax.values()]
    const E = weights.length ? 1 - weights.reduce((acc, w) => acc * (1 - w), 1) : 0
    // Step 4：Bayesian-inspired calibration（未截断，排名用）
    const posterior = posteriorScore(E, config.priors[name], config.fpr)
    groups[name] = { E, posterior, clusters: g.clusterMax.size, hits: g.hits }
  }

  const negatives = NEGATIVE_GROUPS.map(name => ({ name, ...groups[name] }))
  const anyNegativeWeak = negatives.some(g => g.posterior >= config.weakBand)

  // 规则 3：乐观抑制——任一负面组 ≥ 0.4 → 乐观组移出候选（不参与排序、不可输出）
  const suppressed = anyNegativeWeak ? [POSITIVE_GROUP] : []
  const candidates = ALL_GROUPS.filter(g => !suppressed.includes(g))
  const ranked = candidates
    .map(name => ({ name, ...groups[name] }))
    .filter(g => g.posterior > 0)
    .sort((a, b) => b.posterior - a.posterior)

  const strongNeg = negatives.filter(g => g.posterior >= config.threshold)
  const weakNeg = negatives.filter(g => g.posterior >= config.weakBand && g.posterior < config.threshold)

  // 规则 4：弱预警与冲突带（满足任一 → 需要关注）
  let attentionReason = null
  if (weakNeg.length > 0) attentionReason = '4a'                                 // 负面组 ∈ [0.4, 0.7)
  else if (strongNeg.length >= 2) attentionReason = '4b'                         // ≥2 个负面组 ≥ 0.7
  else if (ranked.length >= 2 && ranked[0].posterior >= config.threshold
    && ranked[0].posterior - ranked[1].posterior < config.closeMargin) attentionReason = '4c' // 区分度不足
  else if (strongNeg.length >= 1
    && groups[POSITIVE_GROUP].posterior >= config.positiveConflict) attentionReason = '4d'     // 方向冲突
  else if (strongNeg.some(g => g.clusters < 2)) attentionReason = '4e'           // 单簇不定案（规则 5）

  const display = v => Math.min(v, config.ceiling)
  const collectEvidence = groupNames => groupNames
    .flatMap(name => groups[name].hits)
    .sort((a, b) => b.w - a.w)
    // summary 用策展人撰写的家长向 note；source 字段含文献原文描述（可能出现疾病名），不直接展示
    .map(h => ({ entryId: h.entry.id, summary: h.entry.note || '文献依据见知识库条目' }))

  let result
  if (attentionReason) {
    const involved = ALL_GROUPS.filter(name => groups[name].posterior >= config.weakBand)
    result = {
      emotion: '需要关注',
      confidence: display(ranked[0]?.posterior ?? 0),
      evidence: collectEvidence(involved),
      reason: attentionReason,
    }
  } else {
    // 规则 6：主判定——候选组未截断分值最高且 ≥ 0.7，与次高组差 ≥ 0.1
    const top = ranked[0]
    const marginOk = ranked.length < 2 || top.posterior - ranked[1].posterior >= config.closeMargin
    const evidenceOk = !NEGATIVE_GROUPS.includes(top?.name) || top.clusters >= 2
    if (top && top.posterior >= config.threshold && marginOk && evidenceOk) {
      result = {
        emotion: top.name,
        confidence: display(top.posterior),
        evidence: collectEvidence([top.name]),
        reason: 'main',
      }
    } else {
      // 规则 7：兜底
      result = insufficient('fallback')
    }
  }

  // 规则 8b：输出红线——文案含疾病词 → 拦截降级
  const redLine = new RegExp(config.redLineWords.join('|'))
  const textOut = result.emotion + result.evidence.map(e => e.summary).join('')
  if (redLine.test(textOut)) return insufficient('redline')

  return { ...result, groups, suppressed }
}
