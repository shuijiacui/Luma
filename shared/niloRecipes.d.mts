import type { DrawingSketch } from './niloSketch.mjs'
export interface DrawingRecipe { id:string; subject:string; name:string; label:string; related:string[]; sketch:DrawingSketch; parts:Record<string,number[]>; source:string; minPixels:number; colors:string[] }
export const drawingRecipes: DrawingRecipe[]
export function getDrawingRecipe(id:string): DrawingRecipe | undefined
export function recipeMatchesSubject(recipe:DrawingRecipe,name:string): boolean
export function matchingRecipeSubjects(text:string): string[]
export function creativeRecipeCatalogue(subjects?:{family?:string;id?:string;subject?:string}[],recent?:string[]): {index:string;relevant:{subject:string;related:string[];colors:string[]}[]}
export function recipeCatalogue(subjects?:{family?:string;id?:string;subject?:string}[],recent?:string[]): {id:string;subject:string;name:string;variant:string;related:string[];colors:string[]}[]
