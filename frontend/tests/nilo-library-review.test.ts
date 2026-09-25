import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {afterEach,describe,expect,it,vi} from 'vitest'
import {waitFor} from '@testing-library/react'

const ui=readFileSync(resolve(process.cwd(),'../server/scripts/nilo-library-ui.js'),'utf8')
const generated=readFileSync(resolve(process.cwd(),'../knowledge/nilo/previews/nilo-library.html'),'utf8')
const fixture=[{id:'school-0',kind:'vector',difficulty:'beginner',availability:'active',subject:'school',name:'学校',label:'正面',category:'architecture',style:'storybook',aliases:[],lines:[[[0,0],[10,10]]]},{id:'illustration-school',kind:'illustration',difficulty:'medium',availability:'active',subject:'school',name:'校园插画',label:'',category:'architecture',style:'illustrated',aliases:[],imageSrc:'school.png'}]
function start(rows=fixture){document.documentElement.innerHTML=generated.slice(0,generated.indexOf('<script>'));new Function('recipes','embeddedCuration','deletedIds',ui)(rows,{version:1,decisions:{}},[])}
const card=(id:string)=>document.querySelector<HTMLElement>(`article[data-id="${id}"]`)!
const click=(id:string,selector:string)=>card(id).querySelector<HTMLButtonElement>(selector)!.click()
afterEach(()=>{localStorage.clear();vi.unstubAllGlobals()})

describe('material gallery reviewer',()=>{
 it('combines type, beginner difficulty, and illustration filters independently',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockRejectedValue(Error('offline')))
  start([...fixture,{...fixture[1],id:'illustration-cat-beginner',subject:'cat',name:'猫咪',category:'animals',difficulty:'beginner'},{...fixture[1],id:'illustration-cat-medium',subject:'cat',name:'猫咪',category:'animals'}])
  await waitFor(()=>expect(card('school-0').querySelector<HTMLButtonElement>('.reject')!.disabled).toBe(false))
  const category=document.getElementById('category') as HTMLSelectElement
  const difficulty=document.getElementById('difficulty') as HTMLSelectElement
  const kind=document.getElementById('kind') as HTMLSelectElement
  category.value='animals';category.dispatchEvent(new Event('input'))
  expect(document.querySelectorAll('article')).toHaveLength(2)
  difficulty.value='beginner';difficulty.dispatchEvent(new Event('input'))
  kind.value='illustration';kind.dispatchEvent(new Event('input'))
  expect(document.querySelectorAll('article')).toHaveLength(1)
  expect(card('illustration-cat-beginner').textContent).toContain('初级')
  difficulty.value='medium';difficulty.dispatchEvent(new Event('input'))
  expect(card('illustration-cat-medium').textContent).toContain('中级')
 })
 it('filters medium illustrations and clearly keeps archived retained vectors out of current materials',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockRejectedValue(Error('offline')))
  start([...fixture,{...fixture[0],id:'school-2',availability:'archived'}])
  await waitFor(()=>expect(card('school-0').querySelector<HTMLButtonElement>('.reject')!.disabled).toBe(false))
  expect(document.querySelector('article[data-id="school-2"]')).toBeNull()
  const difficulty=document.getElementById('difficulty') as HTMLSelectElement
  difficulty.value='medium';difficulty.dispatchEvent(new Event('input'))
  expect(document.querySelectorAll('article')).toHaveLength(1)
  expect(card('illustration-school').textContent).toContain('中级')
  difficulty.value='';difficulty.dispatchEvent(new Event('input'))
  const scope=document.getElementById('availability') as HTMLSelectElement
  scope.value='archived';scope.dispatchEvent(new Event('input'))
  expect(document.querySelectorAll('article')).toHaveLength(1)
  expect(card('school-2').textContent).toContain('保留归档也不会重新加入推荐')
  click('school-2','.keep')
  await waitFor(()=>expect(card('school-2').dataset.decision).toBe('keep'))
  scope.value='active';scope.dispatchEvent(new Event('input'))
  expect(document.querySelector('article[data-id="school-2"]')).toBeNull()
 })
 it('keeps local decisions across reload, filters rejections, and restores them',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockRejectedValue(Error('offline')));start()
  await waitFor(()=>expect(card('school-0').querySelector<HTMLButtonElement>('.reject')!.disabled).toBe(false))
  expect(document.getElementById('save-state')!.textContent).toContain('尚未影响项目')
  click('school-0','.reject');await waitFor(()=>expect(card('school-0').dataset.decision).toBe('reject'))
  expect(JSON.parse(localStorage.getItem('nilo-material-curation-v1')!).decisions['school-0']).toBe('reject')
  start();await waitFor(()=>expect(card('school-0').dataset.decision).toBe('reject'))
  const filter=document.getElementById('decision') as HTMLSelectElement;filter.value='reject';filter.dispatchEvent(new Event('input'))
  expect(document.querySelectorAll('article')).toHaveLength(1)
  click('school-0','.restore');await waitFor(()=>expect(document.querySelectorAll('article')).toHaveLength(0))
  expect(JSON.parse(localStorage.getItem('nilo-material-curation-v1')!).decisions).toEqual({})
 })
 it('sends saves to the reviewer and leaves the old decision intact on failure',async()=>{
  let fail=false;let saved:Record<string,string>={}
  const fetchMock=vi.fn(async(path:string,options?:RequestInit)=>{
   if(options?.method==='POST'){
    expect(options.headers).toMatchObject({'X-Nilo-Review-Token':'test-token'})
    if(fail)return{ok:false,json:async()=>({error:'disk unavailable'})}
    const body=JSON.parse(options.body as string);saved={...saved,[body.id]:body.decision}
   }
   return{ok:true,json:async()=>({manifest:{version:1,decisions:saved},token:'test-token'})}
  })
  vi.stubGlobal('fetch',fetchMock);start()
  await waitFor(()=>expect(document.getElementById('save-state')!.dataset.mode).toBe('project'))
  expect(card('illustration-school').querySelector('img')!.getAttribute('src')).toBe('/assets/illustration-school')
  click('illustration-school','.keep');await waitFor(()=>expect(card('illustration-school').dataset.decision).toBe('keep'))
  fail=true;click('illustration-school','.reject');await waitFor(()=>expect(document.getElementById('save-state')!.dataset.mode).toBe('error'))
  expect(card('illustration-school').dataset.decision).toBe('keep')
  expect(localStorage.getItem('nilo-material-curation-v1')).toBeNull()
 })
})
