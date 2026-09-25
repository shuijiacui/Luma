import type { DrawingSketch } from './niloSketch.mjs'
export type RecipeStyle = 'storybook' | 'illustrated' | 'realistic'
export interface DrawingRecipe { id:string; subject:string; name:string; label:string; related:string[]; sketch:DrawingSketch; parts:Record<string,number[]>; source:string; minPixels:number; colors:string[]; style?:RecipeStyle; difficulty?:'beginner'; category?:string; collection?:'studio'|'playtime'; aliases?:string[]; poses?:string[]; learning?:string }
export const drawingRecipes: DrawingRecipe[]
export function getDrawingRecipe(id:string): DrawingRecipe | undefined
export function recipeMatchesSubject(recipe:DrawingRecipe,name:string): boolean
export function matchingRecipeSubjects(text:string,exact?:boolean): string[]
export function requestedRecipeStyle(text:string): RecipeStyle | undefined
export function creativeRecipeCatalogue(subjects?:{family?:string;id?:string;subject?:string}[],recent?:string[]): {index:string;relevant:{subject:string;related:string[];colors:string[]}[]}
export function recipeCatalogue(subjects?:{family?:string;id?:string;subject?:string}[],recent?:string[],preferred?:RecipeStyle): {id:string;subject:string;name:string;variant:string;related:string[];colors:string[];style?:RecipeStyle;collection?:'studio'|'playtime';poses?:string[];category?:string}[]
