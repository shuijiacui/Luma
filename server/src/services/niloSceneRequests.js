import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

const failure = (status, code) => Object.assign(new Error(code), { status, code })
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const keyPattern = /^[a-zA-Z0-9_-]{8,128}$/

/** The browser's guest-child label is shared by every visitor. A signed,
 * HttpOnly random session keeps anonymous cached work separate on the server. */
export function createSceneOwner() {
  const secret = randomBytes(32), name = 'nilo_scene_session'
  const sign = id => createHmac('sha256', secret).update(id).digest('hex')
  return (req, res, { renew = false } = {}) => {
    if (req.auth?.role === 'child') return `child:${req.auth.accountId}`
    const cookie = (req.headers.cookie ?? '').split(';').map(value => value.trim()).find(value => value.startsWith(`${name}=`))?.slice(name.length + 1)
    let [id, mac] = typeof cookie === 'string' ? cookie.split('.') : []
    const valid = /^[a-f0-9]{48}$/.test(id ?? '') && /^[a-f0-9]{64}$/.test(mac ?? '')
      && timingSafeEqual(Buffer.from(mac, 'hex'), Buffer.from(sign(id), 'hex'))
    if (!valid) {
      id = randomBytes(24).toString('hex'); mac = sign(id)
    }
    if (!valid || renew) {
      res.append('Set-Cookie', `${name}=${id}.${mac}; Path=/api/nilo; HttpOnly; SameSite=Strict; Max-Age=1800${req.secure ? '; Secure' : ''}`)
    }
    return `guest:${id}`
  }
}

/** Bounded private operation cache, never a public prompt/image cache. Only
 * approved results are replayed. Callers retain the same operation ID for a
 * retry and allocate a new ID for a genuinely new variant. */
export function createSceneRequests({ ttlMs = 300000, failureTtlMs = 5000, cancelGraceMs = 1000,
  maxEntries = 64, maxBytes = 16_000_000, maxOwnerEntries = 8, now = Date.now } = {}) {
  const entries = new Map()
  let bytes = 0
  function remove(key, entry) { if (entries.get(key) === entry) { clearTimeout(entry.expiryTimer); entries.delete(key); bytes -= entry.bytes ?? 0 } }
  function expire(key, entry, ms) {
    entry.expires = now() + ms
    entry.expiryTimer = setTimeout(() => remove(key, entry), ms)
    entry.expiryTimer.unref?.()
  }
  function prune() {
    for (const [key, entry] of entries) if (entry.state !== 'pending' && entry.expires <= now()) remove(key, entry)
  }
  function reserve(owner) {
    prune()
    while (entries.size >= maxEntries || [...entries.values()].filter(entry => entry.owner === owner).length >= maxOwnerEntries) {
      const ownFull = [...entries.values()].filter(entry => entry.owner === owner).length >= maxOwnerEntries
      const oldest = [...entries].find(([, entry]) => entry.state !== 'pending' && (!ownFull || entry.owner === owner))
      if (!oldest) throw failure(503, 'scene_busy')
      remove(...oldest)
    }
  }
  return {
    async run({ owner, scopeKey, artworkId, requestId, stage, input, policy, signal }, work) {
      if (signal?.aborted) throw failure(499, 'scene_cancelled')
      const fields = [scopeKey, artworkId, requestId]
      // Old clients keep working without any cross-request cache identity.
      if (fields.every(value => value === undefined)) return work(signal, { beforeDispatch: async (dispatchSignal = signal, dispatch) => { dispatchSignal?.throwIfAborted(); return dispatch?.() } })
      if (!fields.every(value => typeof value === 'string' && keyPattern.test(value))) throw failure(400, 'invalid_scene_request_identity')
      const key = digest([owner, scopeKey, artworkId, stage, requestId]), signature = digest([input, policy])
      prune()
      let entry = entries.get(key)
      if (entry && entry.signature !== signature) throw failure(409, 'scene_request_changed')
      if (entry?.state === 'ready') {
        entries.delete(key); entries.set(key, entry)
        return JSON.parse(entry.value)
      }
      if (entry?.state === 'failed') throw failure(503, 'scene_not_ready')
      if (!entry) {
        reserve(owner)
        entry = { owner, signature, state: 'pending', controller: new AbortController(), waiters: 0, bytes: 0, resumed: new Set() }
        entries.set(key, entry)
        const current = entry
        current.beforeDispatch = async (signal = current.controller.signal, dispatch) => {
          signal?.throwIfAborted()
          while (!current.waiters) {
            await new Promise((resolve, reject) => {
            const clear = () => { current.resumed.delete(resume); signal?.removeEventListener('abort', abort) }
            const resume = () => { clear(); resolve() }
            const abort = () => { clear(); reject(failure(499, 'scene_cancelled')) }
            current.resumed.add(resume); signal?.addEventListener('abort', abort, { once: true })
            if (signal?.aborted) abort()
            })
            signal?.throwIfAborted()
          }
          // Dispatch in this synchronous segment: a reconnect that immediately
          // cancels cannot slip between the waiter check and a paid call.
          return dispatch?.()
        }
        current.promise = Promise.resolve().then(() => current.beforeDispatch(current.controller.signal,
          () => work(current.controller.signal, { beforeDispatch: current.beforeDispatch }))).then(result => {
          const value = JSON.stringify(result), size = Buffer.byteLength(value)
          if (!current.controller.signal.aborted && ['ready', 'proposed'].includes(result?.status) && size <= maxBytes) {
            for (const [otherKey, other] of entries) {
              if (bytes + size <= maxBytes) break
              if (other !== current && other.state !== 'pending') remove(otherKey, other)
            }
            if (bytes + size <= maxBytes) {
              current.state = 'ready'; current.value = value; current.bytes = size; bytes += size
              expire(key, current, ttlMs)
              return result
            }
          }
          current.state = 'failed'; expire(key, current, failureTtlMs)
          return result
        }).catch(error => {
          current.state = 'failed'; expire(key, current, failureTtlMs)
          throw error
        }).finally(() => { clearTimeout(current.cancelTimer); current.promise = undefined })
        // A disconnected last waiter must never produce an unhandled rejection.
        current.promise.catch(() => {})
      }
      clearTimeout(entry.cancelTimer)
      entry.waiters++
      for (const resume of entry.resumed) resume()
      return new Promise((resolve, reject) => {
        let settled = false
        const finish = (fn, value) => {
          if (settled) return
          settled = true; signal?.removeEventListener('abort', abort); entry.waiters--
          if (!entry.waiters && entry.state === 'pending') {
            entry.cancelTimer = setTimeout(() => entry.controller.abort(), cancelGraceMs)
            entry.cancelTimer.unref?.()
          }
          fn(value)
        }
        const abort = () => finish(reject, failure(499, 'scene_cancelled'))
        signal?.addEventListener('abort', abort, { once: true })
        if (signal?.aborted) abort()
        entry.promise.then(value => finish(resolve, structuredClone(value)), error => finish(reject, error))
      })
    },
    stats() { prune(); return { entries: entries.size, bytes, pending: [...entries.values()].filter(entry => entry.state === 'pending').length } },
  }
}

/** Reservations count real attempts, including failures/cancellation. The
 * permit stays held until the actual provider promise settles. */
export function createSceneImageGate({ globalConcurrency = 2, ownerConcurrency = 1, maxAttempts = 12,
  windowMs = 3600000, maxOwners = 1024, now = Date.now } = {}) {
  const owners = new Map()
  let active = 0
  return async (owner, signal, work) => {
    if (signal?.aborted) throw failure(499, 'scene_cancelled')
    const cutoff = now() - windowMs
    for (const [key, entry] of owners) {
      entry.attempts = entry.attempts.filter(time => time > cutoff)
      if (!entry.active && !entry.attempts.length) owners.delete(key)
    }
    const entry = owners.get(owner) ?? { active: 0, attempts: [] }
    if (active >= globalConcurrency || entry.active >= ownerConcurrency || entry.attempts.length >= maxAttempts
      || !owners.has(owner) && owners.size >= maxOwners) {
      throw Object.assign(new Error('image_temporarily_unavailable'), { sceneReason: 'image_temporarily_unavailable' })
    }
    owners.set(owner, entry); entry.active++; active++; entry.attempts.push(now())
    try { return await work() } finally { entry.active--; active-- }
  }
}
