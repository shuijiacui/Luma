export type MaterialDecision = 'keep' | 'reject' | 'pending'
export type MaterialCuration = { version: 1; decisions: Record<string, 'keep' | 'reject'> }
export function normalizeMaterialCuration(value: unknown, allowedIds?: Set<string>): MaterialCuration
export function setMaterialCuration(value: unknown): MaterialCuration
export function getMaterialCuration(): MaterialCuration
export function materialDecision(id: string, manifest?: MaterialCuration): MaterialDecision
export function isMaterialEnabled(id: string, manifest?: MaterialCuration): boolean
export function filterApprovedMaterials<T extends { id: string }>(items: T[], manifest?: MaterialCuration): T[]

export interface RetiredMaterialIdentity { id:string;subject:string;name:string;label:string;style:string;category:string|null;aliases:string[] }
export const retiredMaterialIdentities: RetiredMaterialIdentity[]
export const deletedMaterialIds: string[]
export function materialAvailability(id:string): 'active'|'archived'|'deleted'
export function getRetiredMaterialIdentity(id:string): RetiredMaterialIdentity|undefined
