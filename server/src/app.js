import express from 'express'
import fs from 'node:fs'
import { createApiRouter } from './routes/analyze.js'
import { loadEntries } from './services/retrieve.js'
import { DEFAULT_CONFIG } from './services/score.js'

const KNOWLEDGE_DIR = new URL('../../knowledge/', import.meta.url)

function loadJsonSafe(url) {
  try { return JSON.parse(fs.readFileSync(url, 'utf8')) } catch { return null }
}

function envNum(name) {
  const v = parseFloat(process.env[name] ?? '')
  return Number.isFinite(v) ? v : undefined
}

// deps 注入便于测试：{ chatWithImage, entries, scoreConfig }
export function createApp(deps = {}) {
  const entries = deps.entries ?? loadEntries(new URL('entries.jsonl', KNOWLEDGE_DIR))
  const constraints = loadJsonSafe(new URL('constraints.json', KNOWLEDGE_DIR))
  const scoreConfig = deps.scoreConfig ?? {
    ...DEFAULT_CONFIG,
    threshold: envNum('CONFIDENCE_THRESHOLD') ?? DEFAULT_CONFIG.threshold,
    ceiling: envNum('CONFIDENCE_CEILING') ?? DEFAULT_CONFIG.ceiling,
    fpr: envNum('FALSE_POSITIVE_RATE') ?? DEFAULT_CONFIG.fpr,
    priors: {
      ...DEFAULT_CONFIG.priors,
      低落倾向: envNum('PRIOR_DISTRESS') ?? DEFAULT_CONFIG.priors.低落倾向,
      焦虑倾向: envNum('PRIOR_DISTRESS') ?? DEFAULT_CONFIG.priors.焦虑倾向,
      乐观平稳: envNum('PRIOR_POSITIVE') ?? DEFAULT_CONFIG.priors.乐观平稳,
    },
    validIds: new Set(entries.map(e => e.id)),
    redLineWords: constraints?.redLineWords ?? DEFAULT_CONFIG.redLineWords,
  }

  const app = express()
  app.use(express.json({ limit: '15mb' }))
  // Demo 联调用宽松 CORS（无账号体系，见 docs/项目边界.md）
  app.use((req, res, next) => {
    res.set('Access-Control-Allow-Origin', '*')
    res.set('Access-Control-Allow-Headers', 'Content-Type')
    res.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
    if (req.method === 'OPTIONS') return res.sendStatus(204)
    next()
  })

  app.get('/api/health', (_req, res) => res.json({ ok: true }))
  app.use('/api', createApiRouter({
    chatWithImage: deps.chatWithImage ?? undefined,
    entries,
    scoreConfig,
  }))
  return app
}
