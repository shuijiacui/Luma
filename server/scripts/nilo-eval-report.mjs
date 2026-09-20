/** Aggregate only. A geometry pass is never counted as semantic quality. */
export function evaluationReport(results,{suite,fixtureVersion,live}) {
  const rows=results.map(r=>({case:r.name,group:r.group,split:r.split,status:r.result?.status??'dry-run',
    plans:r.result?.drawingMetrics?.plans??0,compiled:r.result?.drawingMetrics?.compiled??0,
    preflight:r.result?.drawingMetrics?.preflight??0,repairs:r.result?.drawingMetrics?.repairs??0,
    canvasFits:!!r.prepared,latencyMs:r.latencyMs,calls:r.calls,semantic:r.semanticCheck,
    subject:r.prepared?.subject??null,reason:r.result?.reason??null}))
  const latencies=rows.map(r=>r.latencyMs).sort((a,b)=>a-b)
  return {suite,fixtureVersion,live,samples:rows.length,
    turnsWithCompiledPlan:rows.filter(r=>r.compiled>0).length,
    turnsWithPreflightPass:rows.filter(r=>r.preflight>0).length,
    canvasPasses:rows.filter(r=>r.canvasFits).length,
    semanticPasses:null,semanticNote:'Requires independent human review of every before/after pair; model approval is not ground truth.',
    p50Ms:latencies[Math.max(0,Math.ceil(latencies.length*.5)-1)]??0,p95Ms:latencies[Math.max(0,Math.ceil(latencies.length*.95)-1)]??0,rows}
}
export function evaluationMarkdown(report) {
  return `# Nilo cross-drawing evaluation\n\nSuite: ${report.suite}; fixtures: ${report.fixtureVersion}. Synthetic drawings only.\n\nSamples: ${report.samples}; compiled: ${report.turnsWithCompiledPlan}; preflight: ${report.turnsWithPreflightPass}; canvas passes: ${report.canvasPasses}. P50 ${report.p50Ms} ms / P95 ${report.p95Ms} ms.\n\n${report.semanticNote}\n\n| Case | Split | Group | Compiled plans | Preflight | Canvas | ms | Semantic | Failure |\n|---|---|---|---:|---:|---|---:|---|---|\n`+
    report.rows.map(r=>`| ${r.case} | ${r.split} | ${r.group} | ${r.compiled} | ${r.preflight} | ${r.canvasFits?'pass':'fail'} | ${r.latencyMs} | pending human review | ${r.reason??''} |`).join('\n')+'\n'
}
