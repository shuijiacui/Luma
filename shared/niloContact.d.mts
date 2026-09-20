import type { Geometry } from './niloGeometry.mjs';
export type ContactPoint = {x:number;y:number};
export interface DrawingContact {kind:'points'|'contour';points:ContactPoint[]}
export interface InkPixels {width:number;height:number;data:Uint8Array|Uint8ClampedArray}
export function validateContact(value:unknown,anchor?:{x:number;y:number;width:number;height:number},aspect?:number):DrawingContact|null;
export function contactSamples(contact:DrawingContact,aspect?:number,step?:number):ContactPoint[];
export function contactProjectionFits(p:Geometry,occupancy:number[],aspect:number,surfaceSize:{width:number;height:number}|undefined,cells:Set<number>,margin:{x:number;y:number},pixels?:InkPixels):boolean;
