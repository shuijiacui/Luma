// 轻量 tracing：LLM 调用与判定链路的结构化可观测
// 默认写 logs/traces.jsonl（结构化、可后续导入 Langfuse/OpenTelemetry）
// 保留 exporter 接口，未来可切 Langfuse 而不改埋点
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const TRACE_DIR = fileURLToPath(new URL('../../logs/', import.meta.url))
const ENABLED = process.env.NODE_ENV !== 'test'

function ensureDir() {
  fs.mkdirSync(TRACE_DIR, { recursive: true })
}

let stream = null
function write(record) {
  if (!ENABLED) return
  ensureDir()
  if (!stream) {
    stream = fs.createWriteStream(path.join(TRACE_DIR, 'traces.jsonl'), { flags: 'a' })
  }
  try {
    stream.write(`${JSON.stringify({ ts: new Date().toISOString(), ...record })}\n`)
  } catch { /* tracing 失败不影响主流程 */ }
}

// span：一次逻辑操作的起止（可嵌套追踪判定链路）
export function startSpan(name, attributes = {}) {
  const spanId = crypto.randomUUID()
  const started = Date.now()
  write({ type: 'span_start', spanId, name, ...attributes })
  return {
    spanId,
    end(extra = {}) {
      write({ type: 'span_end', spanId, name, durationMs: Date.now() - started, ...extra })
    },
  }
}

// LLM 调用：记录模型、输入输出摘要、耗时、token、错误
export function traceLLM({ model, kind, promptPreview = '', outputPreview = '', latencyMs = 0, tokens = null, error = null }) {
  write({
    type: 'llm_call',
    model,
    kind,
    promptPreview: String(promptPreview).slice(0, 600),
    outputPreview: String(outputPreview).slice(0, 900),
    latencyMs,
    tokens,
    error: error ? String(error).slice(0, 300) : null,
  })
}

// 判定节点：记录知识库版本、命中条目、冲突、评分结果（比 audit.log 更结构化）
export function traceNode(name, attributes = {}) {
  write({ type: 'node', name, ...attributes })
}