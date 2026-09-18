// Explicit, bounded diagnostic against the configured provider. Uses synthetic line art only.
// Does not print secrets, prompts, model reasoning or customer drawings. No retries.
import { deflateSync } from 'node:zlib'
process.env.NODE_ENV = 'test'
try { process.loadEnvFile(new URL('../.env', import.meta.url)) } catch { /* env may already be set */ }
const { llmConfig } = await import('../src/services/llmClient.js')
const { buildDialoguePrompt, dialogueBudgetMs, extractDialogueJson, NILO_DIALOGUE_MAX_TOKENS, sanitizeDialogueContext, validateDialogue } = await import('../src/services/niloDialogue.js')
const config = llmConfig()
if (!process.argv.includes('--live') || !config.apiKey) {
  console.log(JSON.stringify({ skipped: true, reason: !config.apiKey ? 'key_not_configured' : 'pass_--live_to_make_one_billable_request' }))
  process.exit(0)
}
const size = 256
const pixels = Buffer.alloc(size * size * 4, 255)
function line(ax, ay, bx, by, rgb) {
  const steps = Math.max(Math.abs(bx - ax), Math.abs(by - ay))
  for (let i = 0; i <= steps; i++) {
    const x = Math.round(ax + (bx - ax) * i / steps), y = Math.round(ay + (by - ay) * i / steps)
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (x + dx < 0 || x + dx >= size || y + dy < 0 || y + dy >= size) continue
      const offset = ((y + dy) * size + x + dx) * 4
      pixels[offset] = rgb[0]; pixels[offset + 1] = rgb[1]; pixels[offset + 2] = rgb[2]
    }
  }
}
const boat = [139, 90, 50], sail = [230, 150, 60]
for (const args of [[65, 150, 195, 150], [65, 150, 85, 172], [85, 172, 175, 172], [175, 172, 195, 150], [125, 150, 125, 65]]) line(...args, boat)
for (const args of [[125, 65, 175, 140], [175, 140, 125, 140], [125, 140, 125, 65]]) line(...args, sail)
function crc32(bytes) {
  let crc = 0xffffffff
  for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0) }
  return (crc ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const buffer = Buffer.alloc(data.length + 12), label = Buffer.from(type)
  buffer.writeUInt32BE(data.length); label.copy(buffer, 4); data.copy(buffer, 8)
  buffer.writeUInt32BE(crc32(Buffer.concat([label, data])), data.length + 8)
  return buffer
}
const header = Buffer.alloc(13); header.writeUInt32BE(size); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 6
const rows = Buffer.alloc((size * 4 + 1) * size)
for (let y = 0; y < size; y++) pixels.copy(rows, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
const image = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]).toString('base64')
const context = sanitizeDialogueContext({ locale: 'zh', utterance: '这是我在海上的小船，请在船下面画一点蓝色水波。', theme: '在海上的小船', requestDrawing: true, imageProvenance: 'child', revision: 1, canvasAspect: 1 })
// Match production by default. The opt-in flag allows one comparison request,
// never a second request or retry; non-DeepSeek providers receive no thinking field.
const nonThinking = new URL(config.baseUrl).hostname === 'api.deepseek.com' && !process.argv.includes('--provider-default-thinking')
const budgetMs = dialogueBudgetMs()
const started = Date.now()
try {
  const response = await fetch(`${config.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify({ model: config.visionModel, messages: [{ role: 'user', content: [{ type: 'text', text: buildDialoguePrompt(context, true) }, { type: 'image_url', image_url: { url: `data:image/png;base64,${image}` } }] }], max_tokens: NILO_DIALOGUE_MAX_TOKENS, response_format: { type: 'json_object' }, ...(nonThinking ? { thinking: { type: 'disabled' } } : {}) }),
    signal: AbortSignal.timeout(budgetMs),
  })
  if (!response.ok) { console.log(JSON.stringify({ status: response.status, latencyMs: Date.now() - started, mode: nonThinking ? 'disabled' : 'provider-default' })); process.exit(1) }
  const result = await response.json(), choice = result.choices?.[0], message = choice?.message ?? {}
  const parsed = extractDialogueJson(message.content)
  const validated = parsed ? validateDialogue(parsed, context, true) : null
  const usage = result.usage && typeof result.usage === 'object' ? Object.fromEntries(Object.entries(result.usage).filter(([, value]) => typeof value === 'number' && Number.isFinite(value))) : null
  console.log(JSON.stringify({ status: response.status, latencyMs: Date.now() - started, budgetMs, maxTokens: NILO_DIALOGUE_MAX_TOKENS, mode: nonThinking ? 'disabled' : 'provider-default', finishReason: choice?.finish_reason, contentCharacters: message.content?.length ?? 0, reasoningCharacters: message.reasoning_content?.length ?? 0, usage, parsed: Boolean(parsed), valid: Boolean(validated), proposal: validated?.proposal?.template ?? null, additions: validated?.additions?.length ?? 0 }))
} catch (error) { console.log(JSON.stringify({ failure: error.name, latencyMs: Date.now() - started })); process.exitCode = 1 }
