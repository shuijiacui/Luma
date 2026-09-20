import { expect, test } from 'vitest'
import { PNG } from 'pngjs'
import { drawingReferenceSheet, hasCompositeDrawing } from '../src/services/niloDrawingReferences.js'
import { buildCoCreationPrompt, turnAttentionFailure } from '../src/services/niloCoCreation.js'

test('references remain separate inspiration and do not identify an unnamed single stroke',()=>{
  expect(drawingReferenceSheet({utterance:'轮到你了'})).toBeUndefined()
  expect(hasCompositeDrawing({scene:{recentContributions:[{owner:'nilo',strokeCount:8}]}})).toBe(false)
  const sheet=drawingReferenceSheet({scene:{recentContributions:[{owner:'child',strokeCount:5}]}})
  expect(sheet.description).toContain('not part of the child canvas')
  const png=PNG.sync.read(Buffer.from(sheet.imageBase64,'base64'))
  expect([png.width,png.height]).toEqual([480,320])
})

test('a connected head can receive a detail even after the child last drew a leg',()=>{
  const item=bounds=>({owner:'child',bounds})
  const scene={recentContributions:[item({x:.1,y:.1,width:.4,height:.4}),item({x:.35,y:.5,width:.02,height:.13}),item({x:.35,y:.62,width:.1,height:.18})]}
  expect(turnAttentionFailure({scene},{anchor:{x:.1,y:.1,width:.2,height:.2}})).toBeNull()
  expect(turnAttentionFailure({scene},{anchor:{x:.75,y:.05,width:.15,height:.15}})).toBe('wrong_target')
})

test('multiple separate objects do not make the old object eligible via Nilo marks',()=>{
  const scene={recentContributions:[
    {owner:'child',bounds:{x:.05,y:.1,width:.2,height:.3}},
    {owner:'nilo',bounds:{x:.2,y:.2,width:.5,height:.1}},
    {owner:'child',bounds:{x:.7,y:.1,width:.2,height:.3}},
  ]}
  expect(turnAttentionFailure({scene},{anchor:{x:.05,y:.1,width:.2,height:.3}})).toBe('wrong_target')
})

test('composite planning uses whole-subject guidance without treating prior guesses as fact',()=>{
  const prompt=buildCoCreationPrompt({locale:'zh',utterance:'轮到你了',scene:{recentContributions:[{owner:'child',strokeCount:5}]},history:[{role:'user',text:'这是我'},{role:'assistant',text:'I guessed a balloon earlier'}]},[])
  expect(prompt).toContain('whole-person-not-last-leg')
  expect(prompt).toContain('这是我')
  expect(prompt).not.toContain('I guessed a balloon earlier')
  expect(prompt).not.toContain('"id":"open-gesture"')
})
