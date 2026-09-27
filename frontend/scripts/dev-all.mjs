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
    // Vite normally exits when stdin ends. A background launcher can close its
    // input independently of the dev servers; keep only that mode noninteractive.
    env: process.stdin.isTTY ? process.env : { ...process.env, CI: 'true' },
  })
  child.on('spawn', () => console.info(`[${name}] 已启动（PID ${child.pid}）`))
  child.on('error', error => {
    console.error(`[${name}] 启动失败（PID ${child.pid ?? 'unknown'}）：${error.message}`)
    shutdown(1, `${name}启动失败`)
  })
  child.on('exit', (code, signal) => {
    const detail = `PID ${child.pid ?? 'unknown'}，code ${code ?? 'null'}，signal ${signal ?? 'none'}`
    if (closing) console.info(`[${name}] 已关闭（${detail}）`)
    else {
      console.error(`[${name}] 意外退出（${detail}）`)
      shutdown(code || 1, `${name}意外退出`)
    }
  })
  return child
})

function shutdown(exitCode = 0, reason = '手动关闭') {
  if (closing) return
  closing = true
  console.info(`[开发服务] 正在关闭（${reason}）`)
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null && !child.killed) child.kill()
  }
  process.exitCode = exitCode
}

process.on('SIGINT', () => shutdown(0, 'SIGINT'))
process.on('SIGTERM', () => shutdown(0, 'SIGTERM'))
