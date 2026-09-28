/** Retry transport failures once within the existing scene deadline. Content,
 * authentication and schema failures need correction, not another paid call. */
export function transientSceneProviderError(error) {
  const status = Number(error?.status)
  return status === 429 || status >= 500 && status <= 599
    || error instanceof TypeError && /fetch|network/i.test(error.message)
    || ['ECONNRESET', 'ECONNREFUSED', 'EAI_AGAIN', 'ETIMEDOUT', 'UND_ERR_SOCKET'].includes(error?.cause?.code ?? error?.code)
}

function pause(ms, signal) {
  return new Promise((resolve, reject) => {
    signal?.throwIfAborted()
    const done = () => { signal?.removeEventListener('abort', aborted); resolve() }
    const timer = setTimeout(done, ms)
    const aborted = () => { clearTimeout(timer); signal.removeEventListener('abort', aborted); reject(signal.reason) }
    signal?.addEventListener('abort', aborted, { once: true })
  })
}

export async function callSceneProvider(invoke, { signal, deadline, onRetry } = {}) {
  for (let attempt = 0; ; attempt++) {
    signal?.throwIfAborted()
    try { return await invoke() }
    catch (error) {
      signal?.throwIfAborted()
      if (attempt || !transientSceneProviderError(error) || deadline - Date.now() < 1400) throw error
      await pause(400, signal)
      signal?.throwIfAborted()
      onRetry?.()
    }
  }
}
