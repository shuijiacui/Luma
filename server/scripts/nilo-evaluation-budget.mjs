/** Counts actual paid HTTP attempts, including provider retries. Downloads do
 * not consume a model call. This guard belongs to evaluation, not production. */
export function evaluationBudget(fetchImpl, { maxApiCalls = 8, maxImageCalls = 2 } = {}) {
  for (const limit of [maxApiCalls, maxImageCalls]) {
    if (!Number.isSafeInteger(limit) || limit < 1) throw new Error('Invalid evaluation budget')
  }
  const usage = { apiCalls: 0, imageCalls: 0, blockedCalls: 0, maxApiCalls, maxImageCalls }
  const fetch = async (resource, options) => {
    const method = (options?.method ?? resource?.method ?? 'GET').toUpperCase()
    if (method !== 'GET' && method !== 'HEAD') {
      const url = new URL(typeof resource === 'string' || resource instanceof URL ? resource : resource.url)
      const image = /\/images\/generations\/?$/.test(url.pathname)
      if (usage.apiCalls >= maxApiCalls || image && usage.imageCalls >= maxImageCalls) {
        usage.blockedCalls++
        throw Object.assign(new Error('evaluation_budget_exhausted'), { code: 'EVALUATION_BUDGET' })
      }
      usage.apiCalls++
      if (image) usage.imageCalls++
    }
    return fetchImpl(resource, options)
  }
  return { fetch, usage }
}
