import { sampleProposalGeometry } from '../../../shared/niloGeometry.mjs'
import illustrationBounds from '../../../shared/niloIllustrationTracing.json' with { type: 'json' }
import { validateProposal } from './niloDialogue.js'

/** Connect a declared path using the same visible geometry rendered by the client. */
export function connectScenePaths(plan, rendered, aspect = 1) {
  const result = rendered.map(item => ({ ...item, proposal: { ...item.proposal } }))
  for (const object of plan.objects) {
    if (!object.connectTo) continue
    const item = result.find(item => item.id === object.id), target = result.find(item => item.id === object.connectTo)
    if (!item || !target) return null
    let targetPoints = sampleProposalGeometry(target.proposal, aspect).flatMap(stroke => stroke.points)
    if (target.proposal.template === 'illustration') {
      const p = target.proposal, shape = illustrationBounds[p.illustrationId]
      if (!shape) return null
      let width = p.width, height = p.height
      if (width * aspect / height > shape.aspect) width = height * shape.aspect / aspect
      else height = width * aspect / shape.aspect
      const angle = p.rotation * Math.PI / 180
      targetPoints = [[shape.left, shape.top], [shape.right, shape.top], [shape.right, shape.bottom], [shape.left, shape.bottom]].map(([x, y]) => {
        const dx = (x - .5) * width, dy = (y - .5) * height
        return { x: p.x + p.width / 2 + Math.cos(angle) * dx - Math.sin(angle) * dy / aspect,
          y: p.y + p.height / 2 + Math.sin(angle) * dx * aspect + Math.cos(angle) * dy }
      })
    }
    const starts = sampleProposalGeometry(item.proposal, aspect).map(stroke => stroke.points[0]).filter(Boolean)
    if (!targetPoints.length || starts.length !== 2) return null
    const bounds = targetPoints.reduce((b, p) => ({ left: Math.min(b.left, p.x), right: Math.max(b.right, p.x), bottom: Math.max(b.bottom, p.y) }), { left: 1, right: 0, bottom: 0 })
    const start = { x: (starts[0].x + starts[1].x) / 2, y: (starts[0].y + starts[1].y) / 2 }
    const proposal = { ...item.proposal, x: item.proposal.x + (bounds.left + bounds.right) / 2 - start.x,
      y: item.proposal.y + bounds.bottom - start.y }
    if (proposal.y + proposal.height > .985) {
      // Shorten the path coherently when a low doorway leaves less paper.
      const ratio = (.985 - bounds.bottom) / (proposal.height * .97)
      if (ratio <= 0) return null
      proposal.width *= ratio; proposal.height *= ratio
      proposal.x = (bounds.left + bounds.right) / 2 - proposal.width * .495
      proposal.y = bounds.bottom - proposal.height * .03
    }
    const checked = validateProposal(proposal, { canvasAspect: aspect })
    if (!checked) return null
    item.proposal = checked
  }
  return result
}
