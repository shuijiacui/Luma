export interface GeneratedRaster {
  version: 1
  pngBase64: string
  width: number
  height: number
  projection: 'gray' | 'dashed'
  paths?: [number, number][][]
}
export const GENERATED_RASTER_LIMITS: Readonly<{ bytes: number; side: number; pixels: number; paths: number; points: number; pathCharacters: number }>
export function validateGeneratedRaster(value: unknown): GeneratedRaster | null
