// 多模态 LLM 客户端（OpenAI 兼容 chat/completions）
// 配置走 env：LLM_BASE_URL / LLM_API_KEY / LLM_VISION_MODEL / LLM_TEXT_MODEL
// 注意：kimi-k2.5 是 reasoning 模型，输出可能落在 reasoning_content，且 max_tokens 必须给足

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

async function chat(messages, { model, maxTokens = 4000, config = llmConfig() } = {}) {
  const res = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({ model, messages, max_tokens: Math.max(maxTokens, 2000) }),
  })
  if (!res.ok) throw new Error(`LLM request failed: ${res.status} ${await res.text()}`)
  const data = await res.json()
  const msg = data.choices?.[0]?.message ?? {}
  // reasoning 模型：content 为空时回退 reasoning_content
  return extractJson(msg.content?.trim() ? msg.content : msg.reasoning_content)
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
  ], { ...opts, model: opts.model ?? config.visionModel, config })
}

export async function chatText(prompt, opts = {}) {
  const config = opts.config ?? llmConfig()
  return chat([{ role: 'user', content: prompt }], { ...opts, model: opts.model ?? config.textModel, config })
}
