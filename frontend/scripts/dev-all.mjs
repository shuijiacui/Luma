import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const viteBin = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url))
const apps = [
  ['官网', []],
  ['家长端', ['--config', 'vite.config.parent.ts']],
  ['儿童端', ['--config', 'vite.config.child.ts']],
]

let closing = false
const children = apps.map(([name, args]) => {
  const child = spawn(process.execPath, [viteBin, ...args, '--strictPort'], {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    stdio: 'inherit',
  })
  child.on('error', error => {
    console.error(`[${name}] 启动失败：${error.message}`)
    shutdown(1)
  })
  child.on('exit', code => {
    if (!closing && code !== 0) {
      console.error(`[${name}] 已退出（code ${code ?? 'unknown'}）`)
      shutdown(code ?? 1)
    }
  })
  return child
})

function shutdown(exitCode = 0) {
  if (closing) return
  closing = true
  for (const child of children) {
    if (!child.killed) child.kill()
  }
  process.exitCode = exitCode
}

process.on('SIGINT', () => shutdown())
process.on('SIGTERM', () => shutdown())
