// Development diagnostics only. Nilo's request path does not depend on Python.
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const [tool, ...args] = process.argv.slice(2)
if (!['glance', 'ground', 'detect', 'crop', 'trace'].includes(tool)) {
  console.error('Usage: node scripts/vision-tool.mjs <glance|ground|detect|crop|trace> <image> [options]')
  process.exit(2)
}
const root = join(process.env.CODEX_HOME || join(homedir(), '.codex'), 'tools', 'agent-vision-toolkit')
const python = join(root, '.venv312', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')
if (!existsSync(python) || !existsSync(join(root, 'bin', tool))) {
  console.error('Install the agent-vision-toolkit companion tools and their isolated Python environment first.')
  process.exit(2)
}
const env = { ...process.env, PYTHONUTF8: '1', VISION_ENV_FILE: process.platform === 'win32' ? 'NUL' : '/dev/null' }
// A RAG or shell environment may point at a different Python's native modules.
delete env.PYTHONPATH
delete env.PYTHONHOME
let key = ''
if (['glance', 'ground', 'detect'].includes(tool) && !args.includes('--help')) {
  try { process.loadEnvFile(new URL('../.env', import.meta.url)) } catch { /* system env is also supported */ }
  const { llmConfig } = await import('../src/services/llmClient.js')
  const config = llmConfig()
  key = config.apiKey
  if (!key) { console.error('The server vision API key is not configured.'); process.exit(2) }
  Object.assign(env, { VISION_API_KEY: key, VISION_BASE_URL: config.baseUrl, VISION_MODEL: config.visionModel,
    VISION_API_PROTOCOL: 'chat_completions', VISION_BOX_ORDER: 'xyxy', LANG: 'zh' })
}
const result = spawnSync(python, [join(root, 'bin', tool), ...args], {
  env, encoding: 'utf8', timeout: 45000, maxBuffer: 2 * 1024 * 1024, windowsHide: true,
})
const redact = text => key ? (text || '').split(key).join('[redacted]') : text || ''
process.stdout.write(redact(result.stdout))
process.stderr.write(redact(result.stderr))
if (result.error) console.error(result.error.code === 'ETIMEDOUT' ? 'Vision diagnostic timed out after 45 seconds.' : 'Unable to run the vision diagnostic.')
process.exit(result.status === 0 && !result.error ? 0 : 1)
