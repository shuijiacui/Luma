// Fixed v1 evaluation fixtures, separate from drawing knowledge and prompts.
// Names/categories are evaluation metadata and MUST NOT enter model requests.
const paths=(...lines)=>lines.flatMap(line=>line.map(([x,y],i)=>({x,y,...(!i?{move:true}:{})})))
const oval=(x,y,w,h)=>Array.from({length:65},(_,i)=>[x+w*Math.cos(i*Math.PI/32),y+h*Math.sin(i*Math.PI/32)])
export const holdoutVersion='nilo-holdout-v1'
export const holdoutCases={
  holdout_elephant:{group:'animal',points:paths(oval(.55,.48,.25,.18),oval(.29,.43,.13,.14),oval(.38,.42,.07,.12),
    [[.19,.46],[.16,.64],[.24,.68],[.26,.61]],[[.41,.64],[.4,.83],[.47,.83],[.48,.65]],[[.66,.64],[.66,.83],[.73,.83],[.73,.6]],[[.8,.48],[.87,.55]])},
  holdout_rocket:{group:'vehicle',points:paths([[.4,.7],[.4,.32],[.5,.13],[.6,.32],[.6,.7],[.4,.7]],
    [[.4,.55],[.27,.76],[.4,.71]],[[.6,.55],[.73,.76],[.6,.71]],[[.43,.71],[.45,.78],[.55,.78],[.57,.71]])},
  holdout_chair:{group:'object',points:paths([[.28,.55],[.72,.55],[.72,.68],[.28,.68],[.28,.55]],
    [[.31,.55],[.31,.2],[.69,.2],[.69,.55]],[[.31,.68],[.29,.87]],[[.69,.68],[.71,.87]])},
  holdout_flowerpot:{group:'plant',points:paths([[.33,.65],[.67,.65],[.61,.88],[.39,.88],[.33,.65]],[[.5,.65],[.5,.42]],
    ...Array.from({length:5},(_,i)=>oval(.5+.075*Math.cos(i*Math.PI*2/5),.31+.075*Math.sin(i*Math.PI*2/5),.055,.065)),oval(.5,.31,.035,.035))},
  holdout_imaginary:{group:'imaginary',points:paths(oval(.5,.5,.21,.22),[[.38,.31],[.31,.17],[.4,.25]],[[.58,.29],[.68,.15],[.67,.35]],
    [[.32,.61],[.19,.68],[.14,.6]],[[.68,.61],[.82,.68]],[[.42,.72],[.37,.84]],[[.58,.72],[.63,.84]])},
  holdout_abstract:{group:'abstract',points:paths([[.16,.3],[.36,.46],[.22,.62],[.46,.71],[.65,.53],[.82,.68]],oval(.57,.3,.13,.08))},
}
