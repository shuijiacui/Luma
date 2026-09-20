export type Point = { x:number; y:number };
export type SketchCommand = ['M',number,number] | ['L',number,number] | ['Q',number,number,number,number] | ['C',number,number,number,number,number,number] | ['Z'] | ['E',number,number,number,number];
export interface DrawingSketch { aspect:number; paths:SketchCommand[][] }
export const SKETCH_LIMITS: {readonly paths:24;readonly commandsPerPath:32;readonly commands:96;readonly planCommands:192;readonly planStrokes:64};
export function validateSketch(value:unknown):DrawingSketch|null;
export function compileSketch(value:unknown):Point[][]|null;
