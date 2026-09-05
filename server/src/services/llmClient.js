// 多模态 LLM 客户端（OpenAI 兼容 chat/completions）
// 配置走 env：LLM_BASE_URL / LLM_API_KEY / LLM_VISION_MODEL / LLM_TEXT_MODEL
// 注意：kimi-k2.5 是 reasoning 模型，输出可能落在 reasoning_content，且 max_tokens 必须给足
import { traceLLM } from './tracing.js'

export class LLMParseError extends Error {
  constructor(message, raw) {
    super(message)
    this.name = 'LLMParseError'
    this.raw = raw
  }
}

export function llmConfig(env = process.env) {
  return {
    baseUrl: env.LLM_BASE_URL || 'https://api.openai-next.com/v1',
    apiKey: env.LLM_API_KEY || '',
    visionModel: env.LLM_VISION_MODEL || 'o3-pro',
    textModel: env.LLM_TEXT_MODEL || 'kimi-k2.5',
  }
}

function extractJson(text) {
  if (typeof text !== 'string' || !text.trim()) throw new LLMParseError('empty LLM content', text)
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const candidate = fenced ? fenced[1].trim() : text.trim()
  try {
    return JSON.parse(candidate)
  } catch {
    throw new LLMParseError(`LLMParseError: cannot parse JSON from: ${text.slice(0, 200)}`, text)
  }
}

// 提取消息文本预览（用于 tracing，不记录完整 base64 图片）
function previewOf(messages) {
  return messages.map(m => {
    if (typeof m.content === 'string') return m.content
    if (Array.isArray(m.content)) {
      const text = m.content.find(c => c.type === 'text')?.text ?? ''
      const hasImage = m.content.some(c => c.type === 'image_url')
      return `${text}${hasImage ? ' [image]' : ''}`
    }
    return ''
  }).join('\n')
}

const LLM_TIMEOUT_MS = 90_000   // o3-pro 视觉推理较慢，给足 90s
const MAX_RETRIES = 2           // 5xx/网络错误重试 2 次（指数退避），4xx 不重试

async function chat(messages, { model, maxTokens = 4000, config = llmConfig(), kind = 'text' } = {}) {
  const payload = {
    model,
    messages,
    max_tokens: Math.max(maxTokens, 2000),
  }
  const started = Date.now()
  let lastError
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const res = await fetch(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
      })
      if (!res.ok) {
        const body = await res.text()
        // 4xx 是请求/配额问题，重试无意义
        if (res.status < 500) throw new Error(`LLM request failed: ${res.status} ${body}`)
        lastError = new Error(`LLM request failed: ${res.status} ${body}`)
      } else {
        const data = await res.json()
        const msg = data.choices?.[0]?.message ?? {}
        // reasoning 模型：content 为空时回退 reasoning_content
        const content = msg.content?.trim() ? msg.content : msg.reasoning_content
        traceLLM({ model, kind, promptPreview: previewOf(messages), outputPreview: content, latencyMs: Date.now() - started, tokens: data.usage ?? null })
        return extractJson(content)
      }
    } catch (err) {
      // 解析失败（模型输出格式问题）与 4xx 都是确定性错误，重试无意义
      if (err instanceof LLMParseError) throw err
      if (err.message?.startsWith('LLM request failed: 4')) throw err
      lastError = err
    }
    if (attempt < MAX_RETRIES) {
      await new Promise(r => setTimeout(r, 1000 * 2 ** attempt)) // 1s, 2s
    }
  }
  traceLLM({ model, kind, promptPreview: previewOf(messages), latencyMs: Date.now() - started, error: lastError })
  throw lastError
}

export async function chatWithImage(imageBase64, prompt, opts = {}) {
  const config = opts.config ?? llmConfig()
  return chat([
    {
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: `data:image/png;base64,${imageBase64}` } },
      ],
    },
  ], { ...opts, model: opts.model ?? config.visionModel, config, kind: 'vision' })
}

export async function chatText(prompt, opts = {}) {
  const config = opts.config ?? llmConfig()
  return chat([{ role: 'user', content: prompt }], { ...opts, model: opts.model ?? config.textModel, config, kind: 'text' })
}
