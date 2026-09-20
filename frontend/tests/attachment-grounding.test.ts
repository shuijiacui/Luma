import { expect, test } from 'vitest'
import { refineAttachment } from '@/features/child/companion/attachmentGrounding'
import type { CanvasDocument, CanvasOperation } from '@/features/child/canvasDocument'
import type { DrawingProposal } from '@/features/child/companion/proposals'

const stem: CanvasOperation = {type:'stroke',owner:'child',groupId:'stem',eraser:false,brushKind:'round',color:'#20352f',size:6,referenceWidth:512,referenceHeight:512,points:[{x:.5,y:.12},{x:.48,y:.19},{x:.48,y:.3}]}
const face = {...stem,groupId:'face',points:[{x:.4,y:.4},{x:.6,y:.4}]}
const document: CanvasDocument = {version:1,baseSource:'child',operations:[stem,face]}
const leaf: DrawingProposal = {template:'custom',subject:'叶片',target:'苹果梗',relation:'接在梗的顶端',anchor:{x:.44,y:.11,width:.12,height:.26},placement:'right',attachment:{x:.49,y:.115},x:.49,y:.030625,width:.18,height:.1125,rotation:0,color:'#20352f',strokeWidth:6,sketch:{aspect:1.6,paths:[[['M',0,.75],['L',1,0]]]}}

test('a leaf joins the actual older stem tip even when the most recent child stroke is a face', () => {
  const result = refineAttachment(leaf, document, 1)
  expect(result.attachment).toEqual({x:.5,y:.12})
  expect(result.x).toBeCloseTo(.5)
  expect(result.y + .75*result.height).toBeCloseTo(.12)
  expect(leaf.attachment).toEqual({x:.49,y:.115})
  expect(result.sketch).toEqual(leaf.sketch)
})

test('attachment refinement cannot revive erased/cleared marks or jump to distant or outside-anchor ink', () => {
  expect(refineAttachment(leaf,{...document,operations:[stem,{type:'clear',owner:'child',groupId:'clear'},face]},1)).toEqual(leaf)
  expect(refineAttachment(leaf,{...document,operations:[stem,{...face,eraser:true}]},1)).toEqual(leaf)
  const far = {...leaf,attachment:{x:.54,y:.115},x:.54}
  expect(refineAttachment(far,document,1)).toEqual(far)
  const outside = {...leaf,anchor:{x:.44,y:.11,width:.055,height:.26}}
  expect(refineAttachment(outside,document,1)).toEqual(outside)
})
