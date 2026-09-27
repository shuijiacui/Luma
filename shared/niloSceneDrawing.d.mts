import type { DrawingSketch } from './niloSketch.mjs'
export type ScenePrimitive = 'castle' | 'tree' | 'cloud' | 'stars' | 'moon' | 'path' | 'water'
export interface SceneObject {
  id: string
  name: string
  aliases: string[]
  role: 'main' | 'support' | 'atmosphere'
  essential: string[]
  render: {kind:'recipe';recipeId:string} | {kind:'illustration';illustrationId:string} | {kind:'compose';primitive:ScenePrimitive;parameters?:Record<string,string|number|boolean>} | {kind:'custom'}
  box: {x:number;y:number;width:number;height:number}
  color: string
  /** A path starts at the visible bottom center of this scene object. */
  connectTo?: string
}
export interface ScenePlan {
  version: 1
  title: string
  summary: string
  request: string
  palette: {sky:string;ground:string;ink:string;accent:string}
  objects: SceneObject[]
  preserve: string[]
  materialProfile?: {style:'storybook'|'illustrated'|'realistic';detail:'simple'|'moderate'|'rich'}
}
export const scenePalette: Readonly<ScenePlan['palette']>
export const sceneDrawingCapabilities: Readonly<Record<ScenePrimitive,Record<string,readonly (string|number|boolean)[]>>>
export function sanitizeScenePlan(value:unknown):ScenePlan|null
export function compileSceneObject(object:SceneObject,options?:{canvasAspect?:number;brushKind?:string;strokeWidth?:number}):{sketch:DrawingSketch;recipeId?:string}|null
