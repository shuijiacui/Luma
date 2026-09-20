import {expect,test} from 'vitest'
import {PNG} from 'pngjs'
import {compileWaypointSketch} from '../src/services/niloWaypointSketch.js'
import {validateCustomSketch} from '../src/services/niloSketch.js'
import {compileSketch,validateSketch} from '../../shared/niloSketch.mjs'
import {decodeCanvas,renderReviewCandidate} from '../src/services/niloPreview.js'

const line={points:[[0,32],[16,0],[32,32]],smooth:false,closed:false}
const input=(stroke=line)=>({aspect:1,grid:32,strokes:[stroke]})

test('unsmoothed paths retain every supplied corner without fitting or resampling',()=>{
  const sketch=compileWaypointSketch(input({points:[[0,32],[15,2],[16,0],[17,2],[32,32]],smooth:false,closed:false}))
  expect(sketch).toEqual({aspect:1,paths:[[['M',0,1],['L',15/32,2/32],['L',.5,0],['L',17/32,2/32],['L',1,1]]]})
  expect(validateCustomSketch(sketch)).toEqual(sketch);expect(validateSketch(sketch)).toEqual(sketch)
})

test('smooth curves use adjacent midpoints while retaining the exact first and last joints',()=>{
  const sketch=compileWaypointSketch(input({...line,smooth:true}))
  expect(sketch.paths[0]).toEqual([['M',0,1],['Q',.5,0,.75,.5],['L',1,1]])
  const rendered=compileSketch(sketch)[0]
  expect(rendered[0]).toEqual({x:0,y:1});expect(rendered.at(-1)).toEqual({x:1,y:1})
  expect(rendered.length).toBeGreaterThan(3)
})

test.each([false,true])('smooth=%s keeps the precise closing edge and joins',smooth=>{
  const sketch=compileWaypointSketch(input({...line,smooth,closed:true}))
  expect(sketch.paths[0].at(-2)).toEqual(['L',1,1]);expect(sketch.paths[0].at(-1)).toEqual(['Z'])
  const rendered=compileSketch(sketch)[0]
  expect(rendered[0]).toEqual({x:0,y:1});expect(rendered.at(-2)).toEqual({x:1,y:1});expect(rendered.at(-1)).toEqual(rendered[0])
})

test.each([
  {points:[[0,0],[0,32],[32,0]]},
  {points:[[16,0],[32,16],[16,32],[0,16]]},
  {points:[[0,0],[32,0],[32,32],[0,32]]},
])('smooth renderer remains within the local convex hull for boundary waypoints %j',({points})=>{
  const sketch=compileWaypointSketch(input({points,smooth:true,closed:true}))
  const rendered=compileSketch(sketch)[0]
  for(const point of rendered){
    expect(point.x).toBeGreaterThanOrEqual(0);expect(point.x).toBeLessThanOrEqual(1)
    expect(point.y).toBeGreaterThanOrEqual(0);expect(point.y).toBeLessThanOrEqual(1)
    if(points.length===3)expect(point.x+point.y).toBeLessThanOrEqual(1+1e-12)
    if(points[0][0]===16)expect(Math.abs(point.x-.5)+Math.abs(point.y-.5)).toBeLessThanOrEqual(.5+1e-12)
  }
})

test.each([-1,33,.5,NaN,Infinity,-Infinity,'16',null,undefined])('invalid grid coordinate %s rejects the whole sketch',value=>{
  expect(compileWaypointSketch(input({...line,points:[[0,0],[value,32]]}))).toBeNull()
})

test.each([
  {points:[[1,1],[1,1]],smooth:false,closed:false},
  {points:[[0,0],[16,32],[0,0]],smooth:true,closed:false},
  {points:[[0,0],[32,32],[0,0]],smooth:false,closed:true},
  {points:[[0,0],[32,32]],smooth:false,closed:true},
  {points:[[0,0],[16,16],[32,32]],smooth:true,closed:true},
])('repeated vertices and degenerate closed outlines are rejected: %j',stroke=>{
  expect(compileWaypointSketch(input(stroke))).toBeNull()
})

test('distinct collinear open waypoints and a self-intersecting closed doodle remain valid',()=>{
  expect(compileWaypointSketch(input({points:[[0,0],[16,16],[32,32]],smooth:true,closed:false}))).toBeTruthy()
  expect(compileWaypointSketch(input({points:[[0,0],[32,32],[0,32],[32,0]],smooth:false,closed:true}))).toBeTruthy()
})

test.each([
  null,[],{},
  {...input(),grid:16},
  {...input(),aspect:Infinity},
  {...input(),aspect:.1},
  {...input(),aspect:5.1},
  {...input(),aspect:'1'},
  {...input(),colour:'red'},
  {...input(),strokes:[]},
  input({...line,placement:'inside'}),
  input({...line,smooth:'true'}),
  input({...line,closed:0}),
  input({points:line.points,smooth:false}),
  input({...line,points:[[0,0,0],[32,32]]}),
  input({...line,points:[[0,0]]}),
].map(raw=>({raw})))('rejects malformed contract or extra fields: %j',({raw})=>{
  expect(compileWaypointSketch(raw)).toBeNull()
})

test('stroke, vertex and command caps reject entire sketches without silently dropping paths',()=>{
  expect(compileWaypointSketch({...input(),strokes:Array.from({length:9},()=>line)})).toBeNull()
  const long={points:Array.from({length:17},(_,i)=>[i,i%2?32:0]),smooth:false,closed:false}
  expect(compileWaypointSketch(input(long))).toBeNull()
  const twelve={points:long.points.slice(0,12),smooth:true,closed:false}
  const atLimit=compileWaypointSketch({...input(),strokes:Array.from({length:8},()=>twelve)})
  expect(atLimit.paths).toHaveLength(8);expect(atLimit.paths.flat()).toHaveLength(96)
  const tooMany={...input(),strokes:Array.from({length:8},()=>({...twelve,closed:true}))}
  expect(compileWaypointSketch(tooMany)).toBeNull()
})

test('the compiler is pure and outputs only the existing strict sketch contract',()=>{
  const raw=input({...line,smooth:true}),before=structuredClone(raw)
  const sketch=compileWaypointSketch(raw)
  expect(raw).toEqual(before);expect(Object.keys(sketch).sort()).toEqual(['aspect','paths'])
  sketch.paths[0][1][1]=.9
  expect(raw).toEqual(before)
})

test('pilot output renders through the actual shared brush geometry and PNG preview',()=>{
  const sketch=compileWaypointSketch(input({...line,smooth:true,closed:true}))
  const blank=new PNG({width:128,height:128});blank.data.fill(255)
  const result=renderReviewCandidate(PNG.sync.write(blank).toString('base64'),{
    template:'custom',sketch,x:.2,y:.2,width:.6,height:.6,rotation:0,color:'#20352f',strokeWidth:3,brushKind:'round',
  },{canvasAspect:1,canvasSize:{width:128,height:128},fixedGeometry:true})
  const rendered=decodeCanvas(result.imageBase64)
  let changed=0
  for(let i=0;i<rendered.data.length;i+=4)if(rendered.data[i]<200)changed++
  expect(changed).toBeGreaterThan(100)
})
