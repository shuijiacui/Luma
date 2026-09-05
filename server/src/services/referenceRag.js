import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../')
const SCRIPT = path.join(ROOT, 'rag', 'retrieve_references.py')
const PYTHON = process.env.RAG_PYTHON || path.join(ROOT, '.rag-venv', 'Scripts', 'python.exe')

export function retrieveReferences(query, { timeoutMs = 120000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(PYTHON, [SCRIPT, query], { cwd: ROOT, windowsHide: true })
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
禁止：诊断、概率、个体结论、把单幅画当作心理评估、编造文献内容。
只返回 JSON：{"items":[{"sourceFile":"原文件名","text":"不超过100字的谨慎说明","limitation":"不超过60字的局限"}]}
查询：${query}
候选文献：${JSON.stringify(retrieved)}`
}

export function validateReferenceFilter(value, retrieved) {
  if (!value || !Array.isArray(value.items)) return null
  const allowed = new Set(retrieved.map(x => x.sourceFile))
  const items = value.items.filter(x => x && allowed.has(x.sourceFile) && typeof x.text === 'string' && typeof x.limitation === 'string')
  if (!items.length || items.length > 5) return null
  const forbidden = /(诊断|疾病|患病|概率|确定|说明孩子|心理测评)/
  if (items.some(x => forbidden.test(`${x.text}${x.limitation}`))) return null
  return items.map(x => ({ ...x, role: 'reference_only' }))
}
