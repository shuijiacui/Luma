import {describe,expect,test,vi} from 'vitest'
import {relationExampleLibrary,validateRelationLibrary,relationExampleGeometry,selectRelationExamples} from '../src/services/niloRelationExamples.js'
import {renderRelationBefore} from '../scripts/render-nilo-relation-examples.mjs'
import {renderReviewCandidate,decodeCanvas} from '../src/services/niloPreview.js'
import {pixelOccupancy} from '../../shared/niloOccupancy.mjs'

const bounds={x:.2,y:.2,width:.5,height:.5}
const scene=(extra={})=>({version:2,subjects:[{id:'S1',name:'any invented object',family:'object',bounds,
  regions:[{id:'S1R0',name:'visible support',bounds}],anchors:[],contacts:[],...extra}]})
const contact=(side='right')=>({id:`S1R0_${side}`,subjectId:'S1',regionId:'S1R0',side,
  points:Array.from({length:8},(_,i)=>side==='right'?{x:.7,y:.35+i*.2/7}:{x:.35+i*.2/7,y:.2})})

test('six original assets cover five relationships without importing frozen evaluation fixtures',()=>{
  const library=relationExampleLibrary()
  expect(library.examples).toHaveLength(6)
  expect(validateRelationLibrary(library)).toEqual([])
  expect(new Set(library.examples.map(e=>e.relation))).toEqual(new Set(['inside','single-point','two-points','contour','abstract-continuation']))
  expect(library.status).toBe('offline-prototype-not-enabled-in-production')
  expect(library.examples.every(e=>e.source==='original-synthetic'&&e.wrongExamples.length>0)).toBe(true)
  library.examples[0].title='local mutation'
  expect(relationExampleLibrary().examples[0].title).not.toBe('local mutation')
})

test.each(relationExampleLibrary().examples.map(e=>[e.id,e]))('%s renders before and after deterministically with a visible addition',(_id,example)=>{
  const {png,bytes}=renderRelationBefore(example),proposal=relationExampleGeometry(example)
  const after=decodeCanvas(renderReviewCandidate(bytes.toString('base64'),proposal,{fixedGeometry:true,canvasAspect:1,canvasSize:{width:512,height:512}}).imageBase64)
  let newPixels=0
  for(let i=0;i<after.data.length;i+=4)if(png.data[i]===255&&after.data[i]<250)newPixels++
  expect(newPixels).toBeGreaterThan(20)
  expect(proposal.width).toBeGreaterThan(0);expect(proposal.height).toBeGreaterThan(0)
  expect(pixelOccupancy(after)).toHaveLength(65536)
})

test('invalid paths, invented contact locations and missing counterexamples fail validation',()=>{
  const invalid=relationExampleLibrary()
  invalid.examples[0].addition.sketch.paths[0][1][1]=5
  invalid.examples[1].addition.placement.point={x:.95,y:.95}
  invalid.examples[2].wrongExamples=[]
  const issues=validateRelationLibrary(invalid)
  expect(issues).toContain('kite-inset-emblem:sketch')
  expect(issues).toContain('umbrella-hook-end:contact_not_on_original_ink')
  expect(issues).toContain('mug-two-join-handle:negative_example')
})

describe('bounded geometry-aware retrieval, without provider calls',()=>{
  test('names do not affect matching and unsupported relations are never invented',()=>{
    const first=selectRelationExamples(scene(),{limit:2})
    const second=selectRelationExamples(scene({name:'completely different drawing'}),{limit:2})
    expect(first).toEqual(second)
    expect(first.length).toBeGreaterThan(0)
    expect(first.every(r=>r.relation==='inside')).toBe(true)
    expect(first.every(r=>r.spaceEvidence==='bounds-only-needs-collision-check')).toBe(true)
    expect(JSON.stringify(first).length).toBeLessThan(2600)
  })
  test('real anchors and measured contact records unlock only their supported relations',()=>{
    const anchored=selectRelationExamples(scene({anchors:[{id:'S1_bottom',x:.45,y:.7,side:'bottom'}]}))
    expect(anchored.some(e=>e.relation==='single-point'&&e.match.anchorId==='S1_bottom')).toBe(true)
    expect(anchored.some(e=>['two-points','contour'].includes(e.relation))).toBe(false)
    const joined=selectRelationExamples(scene({contacts:[contact()]}))
    expect(joined.some(e=>e.relation==='two-points'&&e.match.contactId==='S1R0_right')).toBe(true)
    const contour=selectRelationExamples(scene({contacts:[contact('top')]}))
    expect(contour.some(e=>e.relation==='contour')).toBe(true)
  })
  test('abstract continuation requires an actual abstract subject and actual endpoint',()=>{
    const extra={anchors:[{id:'S1_right',x:.7,y:.45,side:'right'}]}
    expect(selectRelationExamples(scene(extra)).some(e=>e.relation==='abstract-continuation')).toBe(false)
    expect(selectRelationExamples(scene({...extra,family:'abstract'})).some(e=>e.relation==='abstract-continuation')).toBe(true)
    expect(selectRelationExamples(scene({family:'abstract'})).some(e=>e.relation==='abstract-continuation')).toBe(false)
  })
  test('occupied areas, invalid contact references and off-canvas extension space cannot be promoted',()=>{
    expect(selectRelationExamples(scene({contacts:[{...contact(),subjectId:'S404'}]})).every(e=>e.relation==='inside')).toBe(true)
    expect(selectRelationExamples(scene(),{occupancy:Array(65536).fill(1),canvasSize:{width:512,height:512}})).toEqual([])
    expect(selectRelationExamples(scene({anchors:[{id:'S1_bottom',x:.45,y:.99,side:'bottom'}]})).every(e=>e.relation==='inside')).toBe(true)
    expect(selectRelationExamples(scene(),{canvasAspect:0})).toEqual([])
  })
  test('caps results at two and never makes a provider call',()=>{
    const fetcher=vi.spyOn(globalThis,'fetch').mockRejectedValue(new Error('offline only'))
    try{
      expect(selectRelationExamples(scene({contacts:[contact(),contact('top')]}),{limit:99})).toHaveLength(2)
      expect(selectRelationExamples(scene(),{limit:0})).toEqual([])
      expect(selectRelationExamples({subjects:[]})).toEqual([])
      expect(fetcher).not.toHaveBeenCalled()
    }finally{fetcher.mockRestore()}
  })
})
