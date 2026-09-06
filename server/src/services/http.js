export const asyncRoute = fn => (req, res, next) => Promise.resolve().then(() => fn(req, res, next)).catch(next)

export function httpError(status, message) {
  return Object.assign(new Error(message), { status })
}
