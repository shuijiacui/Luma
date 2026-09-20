import type { Geometry as DrawingProposal } from './niloGeometry.mjs';
import type { InkPixels } from './niloContact.mjs';
type Size = {width:number;height:number};
export function occupancySize(occupancy:number[]):number|null;
export function brushMargins(p:DrawingProposal,n:number,size?:Size):{x:number;y:number};
export function proposalFootprint(p:DrawingProposal,n:number,aspect:number,size?:Size):Set<number>|null;
export function placementFits(p:DrawingProposal,aspect:number,size?:Size):boolean;
export function projectionFits(p:DrawingProposal,occupancy:number[],aspect?:number,size?:Size,pixels?:InkPixels):boolean;
