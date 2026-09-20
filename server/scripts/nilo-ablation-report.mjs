const percentile=(values,p)=>values.length?[...values].sort((a,b)=>a-b)[Math.ceil(values.length*p)-1]:null
export function ablationReport(records,meta={}){
  const groups=[]
  for(const mode of ['full','gold-scene','gold-plan'])for(const model of new Set(records.filter(r=>r.mode===mode).map(r=>r.model))){
    const rows=records.filter(r=>r.mode===mode&&r.model===model),executed=rows.filter(r=>r.executed)
    const failures={};for(const r of executed.filter(r=>!r.canvasFits))failures[r.failureCode??'unknown']=(failures[r.failureCode??'unknown']??0)+1
    const positive=executed.filter(r=>r.expected==='accept'),negative=executed.filter(r=>r.expected==='reject')
    const tokenRows=executed.flatMap(r=>r.calls??[]),known=tokenRows.filter(c=>Number.isFinite(c.tokens?.total_tokens)&&c.tokens.total_tokens>=0)
    groups.push({mode,model,total:rows.length,executed:executed.length,notRun:rows.length-executed.length,
      canvasPasses:executed.filter(r=>r.canvasFits).length,failures,
      ...(mode==='gold-plan'?{positiveControls:positive.length,positiveAccepted:positive.filter(r=>r.canvasFits).length,
        negativeControls:negative.length,negativeRejected:negative.filter(r=>!r.canvasFits).length,
        semanticNegativeControls:executed.filter(r=>r.expected==='human_reject').length}:{}),
      latencyP50Ms:percentile(executed.map(r=>r.latencyMs),.5),latencyP95Ms:percentile(executed.map(r=>r.latencyMs),.95),
      calls:tokenRows.length,tokenUsage:{knownCalls:known.length,missingCalls:tokenRows.length-known.length,
        totalTokens:known.length?known.reduce((n,c)=>n+c.tokens.total_tokens,0):null},
      semanticPasses:null,semanticEvaluation:'Independent human review required; model self-review and geometry are not semantic accuracy.'})
  }
  return {...meta,groups,notes:[
    'full includes observation, planning and review; gold-scene receives the author-supplied scene, so its total latency/tokens cannot be directly compared with full.',
    'All model turns share 14 seconds, at most 2 plans and 2 reviews: full normally 3, at most 5 provider calls; gold-scene normally 2, at most 4.',
    'Gold-plan does not call a provider. It measures deterministic acceptance of author-designed geometry and known malformed controls, not model skill.',
    'Every failure remains in its executed denominator. Missing usage stays null. No prices or cost estimates are invented.',
    'Semantic negatives can pass geometry: this is reported as unreviewed, never semantic success.',
  ]}
}
export function ablationMarkdown(report){
  return `# Nilo layered evaluation\n\nFixture: ${report.fixtureVersion}; SHA-256: \`${report.fixtureHash}\`\n\nRun: ${report.runId}; split: ${report.split}; live: ${report.live}\n\n| Mode | Model | Executed / planned | Canvas passes | P50 ms | P95 ms | Calls | Known tokens |\n|---|---|---:|---:|---:|---:|---:|---:|\n${report.groups.map(g=>`| ${g.mode} | ${g.model} | ${g.executed} / ${g.total} | ${g.canvasPasses} | ${g.latencyP50Ms??'—'} | ${g.latencyP95Ms??'—'} | ${g.calls} | ${g.tokenUsage.totalTokens??'unknown'} |`).join('\n')}\n\n${report.groups.map(g=>`## ${g.mode} / ${g.model}\n\nFailure codes: \`${JSON.stringify(g.failures)}\`\n\n${g.mode==='gold-plan'?`Author positive controls: ${g.positiveAccepted}/${g.positiveControls} accepted. Known invalid controls: ${g.negativeRejected}/${g.negativeControls} rejected. Semantic negative controls: ${g.semanticNegativeControls}.\n\n`:''}Semantic success: **not measured**. Review before/after images independently.\n`).join('\n')}\n${report.notes.map(n=>`- ${n}`).join('\n')}\n`
}
