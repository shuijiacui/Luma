import { test,expect } from 'vitest'
import { PNG } from 'pngjs'
import { drawingInkAnchors,resolveInkAnchor } from '../src/services/niloInkAnchors.js'

test('suggested connection IDs refer to real original ink and not guessed blank locations',()=>{
  const png=new PNG({width:200,height:100});png.data.fill(255)
  for(let i=0;i<360;i++){
    const angle=i*Math.PI/180,x=Math.round(100+60*Math.cos(angle)),y=Math.round(50+30*Math.sin(angle)),at=(y*200+x)*4
    png.data[at]=30;png.data[at+1]=40;png.data[at+2]=40
  }
  const image=PNG.sync.write(png).toString('base64')
  const anchors=drawingInkAnchors(image,{subjects:[{subject:'unlisted animal',confidence:.9,bounds:{x:.19,y:.19,width:.62,height:.62}}]})
  expect(anchors.length).toBe(8)
  for(const a of anchors){expect(png.data[(Math.floor(a.y*100)*200+Math.floor(a.x*200))*4]).toBe(30)}
  const right=anchors.find(a=>a.id==='S1_right')
  expect(right.x).toBeGreaterThan(.79)
  const raw={proposal:{template:'custom',attachmentId:'S1_right',attachment:{x:.5,y:.5}}}
  const resolved=resolveInkAnchor(raw,anchors)
  expect(resolved.proposal.attachment).toEqual({x:right.x,y:right.y})
  expect(resolved.proposal).not.toHaveProperty('attachmentId')
  expect(resolveInkAnchor({proposal:{attachmentId:'not-a-real-id'}},anchors).proposal).toBeUndefined()
  expect(raw.proposal.attachment).toEqual({x:.5,y:.5})
})

test('blank, uncertain and invalid images do not invent connection points',()=>{
  const png=new PNG({width:32,height:32});png.data.fill(255)
  const observation={subjects:[{subject:'unknown',confidence:.9,bounds:{x:.1,y:.1,width:.8,height:.8}}]}
  expect(drawingInkAnchors(PNG.sync.write(png).toString('base64'),observation)).toEqual([])
  expect(drawingInkAnchors('invalid',observation)).toEqual([])
})
