export interface ProposalSizeLimits { readonly minSpan: number; readonly maxSpan: number; readonly maxArea: number }
export function hasRegisteredRecipeGeometry(proposal: unknown): boolean;
export function drawingProposalLimits(proposal: unknown): ProposalSizeLimits;
