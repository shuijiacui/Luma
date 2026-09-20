import type { DrawingSketch, Point } from './niloSketch.mjs';
import type { DrawingContact } from './niloContact.mjs';
type Brush = 'round'|'pencil'|'marker'|'crayon'|'star';
export interface Geometry {template:string;x:number;y:number;width:number;height:number;rotation:number;color:string;strokeWidth:number;brushKind?:Brush;sketch?:DrawingSketch;echoPoints?:Point[];anchor?:{x:number;y:number;width:number;height:number};placement?:string;attachment?:Point;contact?:DrawingContact}
export function localPaths(template:string):Point[][];
export function sampleProposalGeometry(p:Geometry,aspect?:number):{kind:string;color:string;width:number;brushKind:Brush;points:Point[]}[];
export function proportionedProposal<T extends Geometry>(p:T,aspect:number):T;
