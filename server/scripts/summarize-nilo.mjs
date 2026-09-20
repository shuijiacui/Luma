// Read-only aggregate diagnostics. Never print prompts, drawings, identities or
// provider error bodies. API approval is not proof of a client canvas commit.
import { readFileSync } from 'node:fs'
const file = new URL('../logs/traces.jsonl', import.meta.url)
const since = process.argv.find(arg => arg.startsWith('--since='))?.slice(8)
if (since && !Number.isFinite(Date.parse(since))) throw new Error('Use an ISO date for --since')
let text = ''
try { text = readFileSync(file, 'utf8') } catch (e) { if (e.code !== 'ENOENT') throw e }
const rows = text.split(/\r?\n/).flatMap(line => { try { return [JSON.parse(line)] } catch { return [] } })
  .filter(row => !since || Date.parse(row.ts) >= Date.parse(since))
const failureCodes = new Set(['misplaced_detail','duplicate_detail','unrelated_detail','uncertain_review','invalid_review','wrong_target',
  'invalid_json','invalid_contract','missing_proposal','missing_attachment','attachment_outside_anchor','rejected_subject','unclear_geometry','blank_canvas'])
const outcomes = new Set(['preview','clarify','conversation','recognition_rejected','ungrounded_turn','invalid_plan','invalid_response','invalid',
  'review_rejected','wrong_target','unrelated_plan','unrelated_turn','timeout','provider_error','model_unavailable','explicit_subject'])
const failures = {}, stages = {}, protocolStages = {}, latencies = []
for (const row of rows) {
  if(row.type==='node'&&row.name==='nilo_protocol'&&['observe','plan','compile','preflight','review','result'].includes(row.stage)
    && typeof row.code==='string'&&/^[a-z_]{1,40}$/.test(row.code)) {
    const key=`${row.stage}:${row.code}`;protocolStages[key]=(protocolStages[key]??0)+1
  }
  if (row.type === 'node' && row.name === 'nilo_companion') {
    if (outcomes.has(row.outcome)) stages[row.outcome] = (stages[row.outcome] ?? 0) + 1
    if (failureCodes.has(row.failureCode)) failures[row.failureCode] = (failures[row.failureCode] ?? 0) + 1
  }
  if (row.type === 'llm_call' && /^(nilo_companion_(vision|review|text)|nilo_knowledge_observe)$/.test(row.kind) && Number.isFinite(row.latencyMs)) latencies.push(row.latencyMs)
}
latencies.sort((a,b)=>a-b)
console.log(JSON.stringify({since:since??null,stageEvents:stages,failureEvents:failures,protocolStages,modelCalls:latencies.length,
  callP50Ms:latencies[Math.floor((latencies.length-1)*.5)]??null,callP95Ms:latencies[Math.floor((latencies.length-1)*.95)]??null,
  note:'Counts are stage events, not unique turns. Read tab-local luma:nilo-turn-diagnostics:v1 for actual AI/local commits and undo counts.'},null,2))
