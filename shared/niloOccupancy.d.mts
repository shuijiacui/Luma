export interface CollisionMap {size:256;bits:string}
export function encodeOccupancy(cells:number[]):CollisionMap|null;
export function decodeOccupancy(value:unknown):number[]|null;
export function pixelOccupancy(image:{data:ArrayLike<number>;width:number;height:number},size?:number):number[];
