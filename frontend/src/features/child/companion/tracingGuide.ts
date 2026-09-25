import { validateProposal, type DrawingProposal } from './proposals'

/** A learning aid, separate from authored canvas operations and image exports. */
export interface TracingGuide {
  /** Stable across reloads so explicitly traced strokes keep their association. */
  id?: string
  proposal: DrawingProposal
  additions: DrawingProposal[]
  aspect: number
}

export function validateTracingGuide(value: unknown): TracingGuide | null {
  if (!value || typeof value !== 'object') return null
  const guide = value as TracingGuide
  if (!Number.isFinite(guide.aspect) || guide.aspect <= 0 || guide.aspect > 100
    || !Array.isArray(guide.additions) || guide.additions.length > 3) return null
  const proposal = validateProposal(guide.proposal)
  const additions = guide.additions.map(validateProposal)
  return proposal && additions.every((item): item is DrawingProposal => !!item)
    ? { proposal, additions, aspect: guide.aspect, ...(typeof guide.id === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(guide.id) ? { id: guide.id } : {}) } : null
}
