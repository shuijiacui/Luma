import { afterEach, expect, test, vi } from 'vitest'
import { createDemoTurn, demoArtworkKind, loadDemoChat, saveDemoChat } from '@/features/parents/demo/parentChatDemo'

afterEach(() => sessionStorage.clear())
function conversation(locale: 'zh' | 'en' = 'zh') {
  const state = loadDemoChat('child', locale)
  return { state, say(text: string, sourceId: string | null = null) {
    const turn = createDemoTurn(state, { text, sourceId, locale, requestId: `turn-${state.revision}`, revision: state.revision })
    state.turns.push(turn); state.revision++
    return turn
  } }
}
test('repair follows fatigue, practical wording and less formal wording without forcing artwork', () => {
  const demo = conversation()
  expect(demo.say('刚才没忍住，冲孩子发了脾气').reply).toContain('刚才是发生了什么')
  const tired = demo.say('可每次都要我调整，我也很累')
  expect(tired.reply).not.toMatch(/？|可以|建议/)
  expect(demo.say('那我怎么跟他说？').reply).toContain('刚才我太大声了，对不起')
  expect(demo.say('这话我说不出口，太肉麻了').reply).toContain('咱们重新说')
  expect(demo.state.turns.every(turn => turn.sources.length === 0)).toBe(true)
})
test('school, homework and screens switch subjects and accept meaningful follow-ups', () => {
  const demo = conversation()
  expect(demo.say('孩子不愿意跟我说学校的事').reply).toContain('最近才这样')
  expect(demo.say('是最近才这样').reply).toContain('这个变化')
  expect(demo.say('试过了，还是不说').reply).toContain('还有什么跟以前不一样')
  expect(demo.say('写作业也一直拖拉').reply).toContain('坐下来很难')
  expect(demo.say('我该怎么开口').reply).toContain('哪一道最难开始')
  expect(demo.say('他总是玩手机不肯放下').reply).toContain('提前说好')
  expect(demo.say('那怎么办').reply).toContain('这局结束')
})
test('artwork citations use bundled sources and corrections never diagnose the child', () => {
  const demo = conversation()
  const overview = demo.say('想聊聊孩子最近的画')
  expect(overview.sources.map(work => work.sourceId)).toEqual(['demo-boat', 'demo-tree'])
  const tree = demo.say('这幅怎么聊', 'demo-tree')
  expect(tree.reply).toContain('小森林')
  expect(tree.sources).toHaveLength(1)
  expect(demo.say('其实那不是树，是他设计的天线').reply).toContain('他设计的天线')
  expect(demo.say('这说明他很孤独吗').reply).toContain('单凭一幅画，看不出这些')
  expect(demo.say('他说不知道').reply).toContain('不追问')
  expect(demo.say('今天他在学校不开心').sources).toEqual([])
  expect(demoArtworkKind('demo-tree')).toBe('nature')
  expect(demoArtworkKind('real-analysis')).toBeUndefined()
})
test('English demo is authored in English and ordinary unsupported messages invite context', () => {
  const demo = conversation('en')
  expect(demo.say('My child will not talk about school').reply).toContain('quiet about school')
  expect(demo.say('I tried but it did not work').reply).toContain('changed')
  expect(demo.say('I am exhausted').reply).not.toMatch(/[\u4e00-\u9fff]/)
  expect(demo.state.memory.works[0].title).toContain('boat')
  expect(conversation().say('有件事情想聊聊').reply).toContain('哪一件事')
})
test('demo storage is bounded, isolated by child and language, and never restores external image URLs', () => {
  const demo = conversation()
  for (let i = 0; i < 36; i++) demo.say('聊聊这幅画', 'demo-boat')
  demo.state.turns[0].sources[0].imageUrl = 'https://untrusted.test/image'
  saveDemoChat('child', 'zh', demo.state)
  const loaded = loadDemoChat('child', 'zh')
  expect(loaded.turns).toHaveLength(30)
  expect(loaded.turns.every(turn => turn.sources.every(work => work.imageUrl === null))).toBe(true)
  expect(loadDemoChat('another-child', 'zh').turns).toEqual([])
  expect(loadDemoChat('child', 'en').turns).toEqual([])
  sessionStorage.setItem('luma_parent_chat_demo_v1:child:zh', '{')
  expect(loadDemoChat('child', 'zh').turns).toEqual([])
})
test('clear danger statements do not receive a casual parenting script', () => {
  expect(conversation().say('气死了，我现在想打孩子').reply).toContain('先别动手')
  expect(conversation().say('我不想活了').reply).toContain('立即危险')
})
test('disabled browser storage does not prevent a guest conversation', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementationOnce(() => { throw new Error('blocked') })
  const state = loadDemoChat('child', 'zh')
  expect(state.available).toBe(true)
  vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => { throw new Error('blocked') })
  expect(() => saveDemoChat('child', 'zh', state)).not.toThrow()
})
