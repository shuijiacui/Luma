import { afterEach, expect, test, vi } from 'vitest'
import { activeDemoConversation, deleteDemoConversation, loadDemoHistory, MAX_DEMO_CONVERSATIONS, newDemoConversation, saveDemoHistory, updateDemoConversation, type DemoChatHistory } from '@/features/parents/demo/parentChatHistory'
import { createDemoTurn, saveDemoChat } from '@/features/parents/demo/parentChatDemo'

afterEach(() => { localStorage.clear(); sessionStorage.clear(); vi.restoreAllMocks() })
function say(history: DemoChatHistory, text: string) {
  const snapshot = activeDemoConversation(history).snapshot
  const turn = createDemoTurn(snapshot, { text, sourceId: null, locale: 'zh', requestId: crypto.randomUUID(), revision: snapshot.revision })
  return updateDemoConversation(history, { ...snapshot, revision: snapshot.revision + 1, turns: [...snapshot.turns, turn].slice(-30) })
}

test('new conversations retain earlier turns, isolate context and persist after the tab session ends', () => {
  let history = say(loadDemoHistory('child', 'zh'), '想聊聊孩子最近的画')
  const firstId = history.activeId
  history = newDemoConversation(history, 'zh')
  expect(activeDemoConversation(history).snapshot.turns).toEqual([])
  history = say(history, '刚才没忍住，冲孩子发了脾气')
  expect(activeDemoConversation(history).snapshot.turns[0].sources).toEqual([])
  expect(history.conversations.find(item => item.id === firstId)?.snapshot.turns[0].sources).toHaveLength(2)
  expect(saveDemoHistory('child', 'zh', history)).toBe(true)
  sessionStorage.clear()
  expect(loadDemoHistory('child', 'zh')).toEqual(history)
  expect(loadDemoHistory('other-child', 'zh').conversations).toHaveLength(1)
  expect(activeDemoConversation(loadDemoHistory('child', 'en')).snapshot.turns).toEqual([])
})

test('legacy chat migrates once and deleted conversations do not reappear', () => {
  const history = say(loadDemoHistory('child', 'zh'), '我也很累')
  saveDemoChat('child', 'zh', activeDemoConversation(history).snapshot)
  const migrated = loadDemoHistory('child', 'zh')
  expect(activeDemoConversation(migrated).title).toBe('我也很累')
  saveDemoHistory('child', 'zh', migrated)
  expect(sessionStorage.getItem('luma_parent_chat_demo_v1:child:zh')).toBeNull()
  const deleted = deleteDemoConversation(migrated, migrated.activeId, 'zh')
  saveDemoHistory('child', 'zh', deleted)
  expect(activeDemoConversation(loadDemoHistory('child', 'zh')).snapshot.turns).toEqual([])
})

test('new chat reuses an empty conversation and capacity never silently drops older history', () => {
  let history = loadDemoHistory('child', 'zh')
  expect(newDemoConversation(history, 'zh')).toBe(history)
  for (let i = 0; i < MAX_DEMO_CONVERSATIONS; i++) {
    history = say(history, `第 ${i} 件事`)
    if (i < MAX_DEMO_CONVERSATIONS - 1) history = newDemoConversation(history, 'zh')
  }
  expect(newDemoConversation(history, 'zh')).toBe(history)
  const firstId = history.conversations.at(-1)!.id
  const reduced = deleteDemoConversation(history, firstId, 'zh')
  expect(reduced.activeId).toBe(history.activeId)
  expect(newDemoConversation(reduced, 'zh').conversations).toHaveLength(MAX_DEMO_CONVERSATIONS)
})

test('clearing retains artwork memory and resets the title; long conversations keep their original title', () => {
  let history = say(loadDemoHistory('child', 'zh'), '想聊聊孩子最近的画')
  for (let i = 0; i < 35; i++) history = say(history, '他说不知道')
  expect(activeDemoConversation(history).snapshot.turns).toHaveLength(30)
  expect(activeDemoConversation(history).title).toBe('想聊聊孩子最近的画')
  const snapshot = activeDemoConversation(history).snapshot
  history = updateDemoConversation(history, { ...snapshot, revision: snapshot.revision + 1, turns: [] })
  expect(activeDemoConversation(history).title).toBe('')
  expect(activeDemoConversation(history).snapshot.memory.works).toHaveLength(4)
})

test('stored references are reprojected onto local artwork and malformed history is ignored', () => {
  const history = say(loadDemoHistory('child', 'zh'), '想聊聊孩子最近的画')
  saveDemoHistory('child', 'zh', history)
  const key = 'luma_parent_chat_history_v1:child:zh'
  const value = JSON.parse(localStorage.getItem(key)!)
  value.activeId = 'missing'
  value.conversations[0].turns[0].sourceIds.push('another-family')
  value.conversations[0].turns[0].sources = [{ imageUrl: 'https://untrusted.test/image' }]
  value.conversations[0].turns.push({ ...value.conversations[0].turns[0] })
  value.conversations.push({ ...value.conversations[0] }, { id: 'invalid', revision: -1, turns: [] })
  localStorage.setItem(key, JSON.stringify(value))
  const restored = loadDemoHistory('child', 'zh')
  expect(restored.conversations).toHaveLength(1)
  const snapshot = activeDemoConversation(restored).snapshot
  expect(snapshot.turns).toHaveLength(1)
  expect(snapshot.turns[0].sources.every(work => work.imageUrl === null && work.sourceId.startsWith('demo-'))).toBe(true)
  localStorage.setItem(key, '{')
  expect(activeDemoConversation(loadDemoHistory('child', 'zh')).snapshot.turns).toEqual([])
})

test('storage failure is reported and keeps the legacy copy available for migration', () => {
  const history = say(loadDemoHistory('child', 'zh'), '我也很累')
  saveDemoChat('child', 'zh', activeDemoConversation(history).snapshot)
  vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => { throw new Error('quota exceeded') })
  expect(saveDemoHistory('child', 'zh', history)).toBe(false)
  expect(sessionStorage.getItem('luma_parent_chat_demo_v1:child:zh')).not.toBeNull()
  expect(loadDemoHistory('child', 'zh').conversations[0].title).toBe('我也很累')
})
