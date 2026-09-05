// Bocha Web Search（博查搜索）— Node 客户端
// 用途：仅补充「家长沟通建议」的教育性、陪伴性内容
// 红线：绝不用于判定、不改 emotion/confidence/evidence，搜索结果不进知识库
// 配置：.env 的 BOCHA_API_KEY / BOCHA_WEB_SEARCH_URL
export class WebSearchError extends Error {
  constructor(message) {
    super(message)
    this.name = 'WebSearchError'
  }
}

export function webSearchConfig(env = process.env) {
  return {
    endpoint: env.BOCHA_WEB_SEARCH_URL || 'https://api.bochaai.com/v1/web-search',
    apiKey: env.BOCHA_API_KEY || '',
  }
}

// 安全的搜索主题白名单：只围绕亲子陪伴/沟通，绝不按视觉特征构造伪心理学查询
const SEARCH_TOPICS = {
  焦虑倾向: '如何与孩子温和沟通 情绪陪伴 儿童亲子教育',
  低落倾向: '如何陪伴倾听孩子 亲子互动 儿童教育建议',
  需要关注: '儿童情绪观察 家长耐心陪伴 温和沟通方法',
  乐观平稳: '鼓励孩子用绘画表达 亲子互动陪伴',
  未见明显风险信号: '儿童绘画表达 亲子陪伴 鼓励孩子',
  信息不足: '儿童绘画引导 家长陪伴 亲子沟通',
}

export function searchQueryFor(emotion) {
  return SEARCH_TOPICS[emotion] ?? '儿童绘画 亲子沟通 陪伴建议'
}

export async function bochaSearch(query, { count = 5, config = webSearchConfig() } = {}) {
  if (!config.apiKey) return null
  const res = await fetch(config.endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, summary: true, count }),
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) throw new WebSearchError(`search failed: ${res.status}`)
  const payload = await res.json()
  if (payload?.code !== 200) throw new WebSearchError(`search code ${payload?.code} ${payload?.msg ?? ''}`)
  const pages = payload?.data?.webPages?.value ?? []
  return pages
    .map(p => ({ title: p.name ?? '', url: p.url ?? '', snippet: p.snippet ?? '' }))
    .filter(p => p.title || p.snippet)
    .slice(0, count)
}