import { expect, test } from 'vitest'
import { selectCoCreationExamples, coCreationExamplesPrompt } from '../src/services/niloExamples.js'
const loop=Array.from({length:24},(_,i)=>({x:.5+.2*Math.cos(i*2*Math.PI/23),y:.5+.2*Math.sin(i*2*Math.PI/23)}))
test('child-declared wheel takes priority over an attractive balloon interpretation',()=>{
  const examples=selectCoCreationExamples({utterance:'这是我的车轮',lastStroke:{points:loop}})
  expect(examples[0].id).toBe('wheel-hub')
  expect(examples.length).toBeLessThanOrEqual(2)
  expect(examples[0].wrong).toContain('balloon')
})
test('an unnamed open line gets a continuation example, not an assumed plant',()=>{
  const result=selectCoCreationExamples({utterance:'轮到你了',lastStroke:{points:[{x:.1,y:.1},{x:.4,y:.3}]},history:[{role:'assistant',text:'apple tree stem'}]})
  expect(result.map(x=>x.id)).toEqual(['open-gesture'])
})
test('multi-turn context supplies a new-subject example and never loads the whole library',()=>{
  const context={utterance:'轮到你了',lastStroke:{points:loop},scene:{recentContributions:[{owner:'child'},{owner:'nilo'},{owner:'child'}]}}
  expect(selectCoCreationExamples(context)[0].id).toBe('new-subject-after-turn')
  expect(selectCoCreationExamples(context)).toHaveLength(2)
  expect(coCreationExamplesPrompt(context)).not.toContain('boat-ripples')
  expect(coCreationExamplesPrompt(context)).toContain('FULL CANVAS')
})

test('a multi-stroke subject does not inherit the last open-line continuation example',()=>{
  const context={utterance:'轮到你了',lastStroke:{points:[{x:.7,y:.7},{x:.8,y:.9}]},scene:{recentContributions:[{owner:'child',strokeCount:5}]}}
  const ids=selectCoCreationExamples(context).map(x=>x.id)
  expect(ids).toContain('whole-person-not-last-leg')
  expect(ids).not.toContain('open-gesture')
})
