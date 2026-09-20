import {expect,test} from 'vitest'
import {drawingInkContacts,placeContactSketch} from '../src/services/niloContactPlacement.js'
import {drawingScene,compileDrawingPlan,fitDrawingPlan} from '../src/services/niloDrawingProtocol.js'
import {validateProposal} from '../src/services/niloDialogue.js'
import {validateContact} from '../../shared/niloContact.mjs'
import {sampleProposalGeometry} from '../../shared/niloGeometry.mjs'
import {renderSynthetic} from '../scripts/check-nilo-ablation.mjs'

function head(aspect=1) {
  const radius=.18*Math.min(1,aspect)
  const points=Array.from({length:97},(_,i)=>({x:.5+radius/aspect*Math.cos(i*Math.PI/48),y:.52+radius*Math.sin(i*Math.PI/48),...(i===0?{move:true}:{})}))
  const bounds={x:.5-radius/aspect-.01,y:.52-radius-.01,width:2*radius/aspect+.02,height:2*radius+.02}
  const observation={subjects:[{subject:'自由形状',family:'abstract',confidence:1,visible:'闭合曲线',existingParts:['外轮廓'],bounds}]}
  const raster=renderSynthetic(points,aspect)
  return {observation,raster}
}
const hat={aspect:1.5,paths:[[['M',0,1],['L',.2,.1],['L',.8,.1],['L',1,1],['L',0,1]]]}

test.each([.5,1,2])('measured contours obey the SAME short-edge bound on canvas aspect %s',aspect=>{
  const {observation,raster}=head(aspect),contacts=drawingInkContacts(raster.imageBase64,observation)
  expect(contacts.length).toBeGreaterThan(0)
  for(const c of contacts)expect(validateContact({kind:'contour',points:c.points},observation.subjects[0].bounds,aspect)).toBeTruthy()
})

test('a measured hat brim follows the original curved outline with its corners preserved',()=>{
  const {observation,raster}=head(),contacts=drawingInkContacts(raster.imageBase64,observation)
  const candidate=contacts.find(c=>c.id==='S1R0_top');expect(candidate).toBeTruthy()
  const scene=drawingScene(observation,[],contacts)
  const context={canvasAspect:1,canvasSize:{width:512,height:512},drawingStyle:{color:'#20352f',brushKind:'round',brushSize:3}}
  const raw={intent:{subjectId:'S1',regionId:'S1R0',detail:'小帽子',relationship:'帽沿贴合原来的弧线'},drawing:{...hat,placement:{mode:'contact',contactKind:'contour',contactId:candidate.id}}}
  const compiled=compileDrawingPlan(raw,scene,context,validateProposal)
  expect(compiled.ok).toBe(true)
  expect(compiled.proposal.contact.points).toEqual(candidate.points)
  expect(fitDrawingPlan(compiled.proposal,raster.occupancy,1,context.canvasSize)).toBeTruthy()
  const paths=sampleProposalGeometry(compiled.proposal,1)
  expect(paths[0].points.length).toBeLessThanOrEqual(32)
  expect(Math.min(...paths[0].points.map(p=>p.y))).toBeLessThan(candidate.points[0].y-.06)
  expect(compileDrawingPlan({...raw,drawing:{...raw.drawing,placement:{...raw.drawing.placement,contactId:'invented'}}},scene,context,validateProposal).code).toBe('contact_reference')
})

test('a contour-shaped permission cannot turn a copied original line into a contribution',()=>{
  const {observation,raster}=head(),contacts=drawingInkContacts(raster.imageBase64,observation)
  const c=contacts.find(v=>v.id==='S1R0_top')
  const geometry=placeContactSketch({aspect:2,paths:[[['M',0,1],['L',1,1]]]},c,'contour',1)
  // An excessively thin retrace can already fail the geometry budget.
  if(!geometry){expect(geometry).toBeNull();return}
  const p={...geometry,template:'custom',rotation:0,color:'#20352f',strokeWidth:3,brushKind:'round',anchor:observation.subjects[0].bounds,placement:'near',target:'曲线',relation:'沿曲线',subject:'描摹'}
  expect(fitDrawingPlan(p,raster.occupancy,1,{width:512,height:512})).toBeNull()
})

test.each(['outside','tiny','unnamed'])('dropping an %s region keeps measured contact IDs aligned with the planner',kind=>{
  const {observation,raster}=head(),subject=observation.subjects[0]
  const bad=kind==='outside'?{name:'outside',bounds:{x:.05,y:.05,width:.1,height:.1},confidence:1}
    :kind==='tiny'?{name:'tiny',bounds:{x:.45,y:.4,width:.005,height:.005},confidence:1}
    :{name:'',bounds:subject.bounds,confidence:1}
  subject.regions=[bad,{name:'usable head',bounds:subject.bounds,confidence:1}]
  const contacts=drawingInkContacts(raster.imageBase64,observation),scene=drawingScene(observation,[],contacts)
  expect(scene.subjects[0].regions.map(r=>r.id)).toEqual(['S1R0','S1R1'])
  const measured=contacts.find(c=>c.id==='S1R1_top')
  expect(measured).toBeTruthy()
  expect(scene.subjects[0].contacts.find(c=>c.id===measured.id)).toEqual(measured)
  expect(contacts.some(c=>c.regionId==='S1R2')).toBe(false)
  const compiled=compileDrawingPlan({intent:{subjectId:'S1',regionId:'S1R1',detail:'小帽子',relationship:'帽沿贴合实际头顶'},
    drawing:{...hat,placement:{mode:'contact',contactKind:'contour',contactId:measured.id}}},scene,
    {canvasAspect:1,canvasSize:{width:512,height:512},drawingStyle:{color:'#20352f',brushKind:'round',brushSize:3}},validateProposal)
  expect(compiled.ok).toBe(true)
  expect(compiled.proposal.contact.points).toEqual(measured.points)
})
