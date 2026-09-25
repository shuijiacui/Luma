import type { DrawingSketch } from './niloSketch.mjs'
import type { Geometry } from './niloGeometry.mjs'

export type MaterialCategory = 'animals' | 'people' | 'architecture' | 'botanical' | 'landscape' | 'vehicles' | 'food' | 'stilllife' | 'fantasy'
export type MaterialDifficulty = 'beginner' | 'medium' | 'detailed'
export type MaterialStyle = 'storybook' | 'illustrated' | 'realistic'
export interface Material {
  id: string; subject: string; name: string; label: string; kind: 'recipe' | 'illustration';
  style: MaterialStyle; difficulty: MaterialDifficulty; category: MaterialCategory;
  aliases: string[]; aspect: number; minPixels?: number; src?: string; sketch?: DrawingSketch;
}
export interface MaterialSubject { subject: string; name: string; category: MaterialCategory; aliases: string[]; materials: Material[] }
export interface MaterialPreferences { preferredStyle?: MaterialStyle; preferredDifficulty?: MaterialDifficulty; recentIds?: string[] }
export interface MaterialProposal extends Geometry {
  template: 'custom' | 'illustration'; subject: string; recipeId?: string;
  target: string; relation: string; contribution: 'object'; placementPolicy: 'free';
}
export const materialCategories: Readonly<Record<MaterialCategory, string>>
export function materialCategory(materialOrSubject: string | { subject?: string; category?: string }): MaterialCategory
export function getMaterial(id: string): Material | undefined
export function rankMaterials(materials: Material[], options?: MaterialPreferences): Material[]
export function listMaterialSubjects(options?: MaterialPreferences): MaterialSubject[]
export function getMaterialChoices(subjectOrAlias: string, options?: MaterialPreferences): Material[]
export function materialSubjectForProposal(proposal: { template: string; subject?: string; recipeId?: string; illustrationId?: string } | null | undefined): string | null
export function createMaterialProposal(id: string, source?: Geometry | null, canvasAspect?: number): MaterialProposal | null
export const proposalForMaterial: typeof createMaterialProposal
