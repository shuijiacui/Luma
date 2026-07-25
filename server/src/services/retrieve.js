// 知识库检索：标签匹配（docs/RAG设计.md「检索算法」）
// 所有 featureMatch 条件 AND；命中按 strength × reliability 降序（v2.2：c 只门控不入权重）
import fs from 'node:fs'

export function matchEntry(entry, features) {
  if (!features) return false
  for (const [key, cond] of Object.entries(entry.featureMatch ?? {})) {
    switch (key) {
      case 'elements':
        if (!cond.every(e => features.elements?.includes(e))) return false
        break
      case 'colors.darkRatioMin':
        if (!(features.colors?.darkRatio >= cond)) return false
        break
      case 'colors.dominantIncludes':
        if (!cond.some(c => features.colors?.dominant?.includes(c))) return false
        break
      case 'composition.size':
      case 'composition.position':
      case 'composition.pressure': {
        const dim = key.split('.')[1]
        if (features.composition?.[dim] !== cond) return false
        break
      }
      case 'distortions':
        if (!cond.every(d => features.distortions?.includes(d))) return false
        break
      case 'erasureMarksMin':
        if (!((features.erasureMarks ?? 0) >= cond)) return false
        break
      default:
        return false // 未知条件一律不命中（与 validate.mjs 的 CONDITIONS 白名单对齐）
    }
  }
  return true
}

export function retrieve(features, entries) {
  return entries
    .filter(e => matchEntry(e, features))
    .sort((a, b) => b.strength * b.reliability - a.strength * a.reliability)
}

export function loadEntries(filePath) {
  return fs.readFileSync(filePath, 'utf8')
    .trim().split('\n').filter(Boolean).map(l => JSON.parse(l))
}
