import {validateCustomSketch,NILO_SKETCH_MAX_COMMANDS} from './niloSketch.js'

const exactFields=(value,fields)=>value&&typeof value==='object'&&!Array.isArray(value)
  &&Object.keys(value).length===fields.length&&Object.keys(value).every(key=>fields.includes(key))
const coordinate=value=>typeof value==='number'&&Number.isInteger(value)&&value>=0&&value<=32
const midpoint=(a,b)=>[(a[0]+b[0])/2,(a[1]+b[1])/2]

/** Optional pilot compiler, deliberately NOT wired into the production planner.
 * The integer grid describes only a local new stroke, never canvas coordinates.
 * Repeated vertices are rejected; `closed` supplies the return to the first one.
 * Smoothing rounds interior corners inside the waypoint convex hull. The first
 * and final waypoint are exact attachment points and never move. */
export function compileWaypointSketch(raw) {
  if(!exactFields(raw,['aspect','grid','strokes'])||raw.grid!==32
    ||!Number.isFinite(raw.aspect)||raw.aspect<.2||raw.aspect>5
    ||!Array.isArray(raw.strokes)||raw.strokes.length<1||raw.strokes.length>8)return null
  const paths=[]
  let commands=0
  for(const stroke of raw.strokes) {
    if(!exactFields(stroke,['points','smooth','closed'])||typeof stroke.smooth!=='boolean'||typeof stroke.closed!=='boolean'
      ||!Array.isArray(stroke.points)||stroke.points.length<2||stroke.points.length>16)return null
    const seen=new Set(),points=[]
    for(const point of stroke.points) {
      if(!Array.isArray(point)||point.length!==2||!point.every(coordinate))return null
      const key=`${point[0]},${point[1]}`
      if(seen.has(key))return null
      seen.add(key);points.push([point[0]/32,point[1]/32])
    }
    // Closing two vertices or a collinear set only retraces a zero-area line.
    // Self-intersecting child shapes are otherwise allowed, not "corrected".
    if(stroke.closed) {
      const [a,b]=points
      if(points.length<3||!points.slice(2).some(c=>(b[0]-a[0])*(c[1]-a[1])!==(b[1]-a[1])*(c[0]-a[0])))return null
    }
    const path=[['M',...points[0]]]
    if(stroke.smooth) {
      for(let i=1;i<points.length-1;i++)path.push(['Q',...points[i],...midpoint(points[i],points[i+1])])
      path.push(['L',...points.at(-1)])
    }else{
      for(const point of points.slice(1))path.push(['L',...point])
    }
    // Preserve the last-to-first edge exactly even when interior corners curve.
    if(stroke.closed)path.push(['Z'])
    commands+=path.length
    if(commands>NILO_SKETCH_MAX_COMMANDS)return null
    paths.push(path)
  }
  return validateCustomSketch({aspect:raw.aspect,paths})
}
