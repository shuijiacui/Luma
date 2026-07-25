// JSONL 日志持久化：app.log（运行日志）+ audit.log（判定审计快照）
// 审计快照对齐 knowledge/dispatch.config.json loading.auditSnapshot：
// 每次判定记录命中条目 ID + 知识库版本，供"判定依据"展示与事后审计
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const LOG_DIR = fileURLToPath(new URL('../../logs/', import.meta.url))

function ensureDir() {
  fs.mkdirSync(LOG_DIR, { recursive: true })
}

function writer(file) {
  ensureDir()
  const stream = fs.createWriteStream(path.join(LOG_DIR, file), { flags: 'a' })
  return (record) => stream.write(JSON.stringify({ ts: new Date().toISOString(), ...record }) + '\n')
}

const appWriter = writer('app.log')
const auditWriter = writer('audit.log')
const toConsole = process.env.LOG_TO_CONSOLE !== '0'

export const log = {
  info(event, data = {}) {
    appWriter({ level: 'info', event, ...data })
    if (toConsole) console.info(`[${event}]`, data.msg ?? '')
  },
  error(event, data = {}) {
    appWriter({ level: 'error', event, ...data })
    if (toConsole) console.error(`[${event}]`, data.msg ?? '')
  },
  // 判定审计：命中条目 ID 快照 + 知识库版本（entries 条数 + constraints 版本）
  audit(report, data = {}) {
    auditWriter({ type: 'report', ...report, ...data })
  },
}
