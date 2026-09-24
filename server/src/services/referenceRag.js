import { spawn } from 'node:child_process'
import { unsafeEnglish } from './localization.js'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../')
const SCRIPT = path.join(ROOT, 'rag', 'retrieve_references.py')
const pythonPath = env => env.RAG_PYTHON || path.join(ROOT, '.rag-venv', ...(process.platform === 'win32' ? ['Scripts', 'python.exe'] : ['bin', 'python']))
const MANIFEST = path.join(ROOT, 'knowledge', 'psychology', 'chroma', 'manifest.json')

export function referenceRagReady(env = process.env, exists = fs.existsSync) {
  return env.RAG_ENABLED === '1' && Boolean(env.RAG_EMBED_API_KEY)
    && exists(pythonPath(env)) && exists(MANIFEST)
}

export function retrieveReferences(query, { timeoutMs = 15000, signal } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(pythonPath(process.env), [SCRIPT, query], { cwd: ROOT, windowsHide: true, signal })
    let output = ''; let error = ''
    const timer = setTimeout(() => { child.kill(); reject(new Error('reference RAG timeout')) }, timeoutMs)
    child.stdout.on('data', chunk => { output += chunk })
    child.stderr.on('data', chunk => { error += chunk })
    child.on('error', err => { clearTimeout(timer); reject(err) })
    child.on('close', code => {
      clearTimeout(timer)
      if (code !== 0) return reject(new Error(`reference RAG failed: ${error.slice(-500)}`))
      try { resolve(JSON.parse(output)) } catch { reject(new Error('reference RAG returned invalid JSON')) }
    })
  })
}

export function buildReferenceFilterPrompt(query, retrieved) {
  return `你是儿童绘画观察助手。请对检索到的研究文献片段做严格内容过滤，只保留与查询直接相关、可以被原文支持的研究背景信息。
候选片段有 chunkId、sourceFile、sourcePage 和原文。每条说明必须对应一个具体 chunkId；不能引用未提供的页码。对于原文不足以支持的内容，不要输出。
禁止：诊断、概率、个体结论、把单幅画当作心理评估、编造文献内容。
只返回 JSON：{"items":[{"chunkId":"候选片段的chunkId","text":"不超过100字的谨慎说明","limitation":"不超过60字的局限"}]}
查询：${query}
候选文献：${JSON.stringify(retrieved)}`
}

export function validateReferenceFilter(value, retrieved) {
  if (!value || !Array.isArray(value.items)) return null
  const allowed = new Map(retrieved.filter(x => x && typeof x.chunkId === 'string'
    && typeof x.sourceFile === 'string' && Number.isInteger(x.sourcePage) && x.sourcePage > 0)
    .map(x => [x.chunkId, x]))
  if (!value.items.length || value.items.length > 5) return null
  const seen = new Set()
  const items = value.items.map(x => {
    const source = allowed.get(x?.chunkId)
    if (!source || seen.has(x.chunkId) || typeof x.text !== 'string' || typeof x.limitation !== 'string'
      || !x.text.trim() || !x.limitation.trim() || x.text.length > 100 || x.limitation.length > 60) return null
    seen.add(x.chunkId)
    return { chunkId: source.chunkId, sourceId: source.sourceId, sourceFile: source.sourceFile,
      sourcePage: source.sourcePage, sourceSha256: source.sourceSha256,
      text: x.text.trim(), limitation: x.limitation.trim(), role: 'reference_only' }
  })
  if (items.some(x => !x)) return null
  const forbidden = /(诊断|疾病|患病|概率|确定|说明孩子|心理测评)/
  if (items.some(x => forbidden.test(`${x.text}${x.limitation}`) || unsafeEnglish(`${x.text} ${x.limitation}`))) return null
  return items
}
