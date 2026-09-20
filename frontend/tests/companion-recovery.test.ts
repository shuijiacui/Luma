import { expect, test } from 'vitest'
import { recoveryIdeas } from '@/features/child/companion/recoveryIdeas'
import { drawingPlanFits } from '@/features/child/companion/proposals'

test.each([[1280,600],[720,340],[360,640]])('explicit choices fit a %sx%s canvas without stretching their shapes', (width,height)=>{
  const occupancy=Array(64*64).fill(0)
  const style={brushKind:'crayon' as const,color:'#20352f',brushSize:8}
  // Existing tree occupies the left edge; preserve it.
  for(let y=0;y<64;y++)for(let x=0;x<20;x++)occupancy[y*64+x]=1
  const ideas=recoveryIdeas(occupancy,width/height,style,{width,height})
  expect(ideas).toHaveLength(2)
  for(const {proposal} of ideas) {
    expect(proposal).toMatchObject({color:style.color,brushKind:style.brushKind,strokeWidth:8})
    expect(proposal.width*width/(proposal.height*height)).toBeCloseTo(proposal.sketch!.aspect)
    expect(drawingPlanFits([proposal],occupancy,width/height,{width,height})).toBe(true)
  }
})

test('full or invalid canvases never receive forced decoration',()=>{
  const style={brushKind:'round' as const,color:'#20352f',brushSize:8}
  expect(recoveryIdeas(Array(4096).fill(1),2,style)).toEqual([])
  expect(recoveryIdeas([],2,style)).toEqual([])
  expect(recoveryIdeas(Array(4096).fill(0),NaN,style)).toEqual([])
})
