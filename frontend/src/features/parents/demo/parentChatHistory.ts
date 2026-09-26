import type { ParentChatSnapshot, ParentChatTurn } from '@/lib/api/communicationApi'
import { randomId } from '@/lib/randomId'
import { demoArtworkMemory, loadDemoChat } from './parentChatDemo'

type Locale = 'zh' | 'en'
export interface DemoConversation { id: string; title: string; snapshot: ParentChatSnapshot }
export interface DemoChatHistory { activeId: string; conversations: DemoConversation[] }
export const MAX_DEMO_CONVERSATIONS = 30
const key = (scope: string, locale: Locale) => `luma_parent_chat_history_v1:${encodeURIComponent(scope)}:${locale}`

function emptyConversation(locale: Locale): DemoConversation {
  const works = demoArtworkMemory(locale)
  return { id: randomId(), title: '', snapshot: { revision: 0, available: true, turns: [], memory: { works, scannedCount: works.length, limit: works.length } } }
}

export function activeDemoConversation(history: DemoChatHistory) {
  return history.conversations.find(item => item.id === history.activeId)!
}

export function loadDemoHistory(scope: string, locale: Locale): DemoChatHistory {
  const works = demoArtworkMemory(locale)
  try {
    const raw = localStorage.getItem(key(scope, locale))
    if (raw && raw.length < 5_000_000) {
      const value = JSON.parse(raw)
      if (Array.isArray(value.conversations)) {
        const ids = new Set<string>()
        const conversations: DemoConversation[] = []
        for (const item of value.conversations.slice(0, MAX_DEMO_CONVERSATIONS)) {
          if (typeof item?.id !== 'string' || !item.id || item.id.length > 100 || ids.has(item.id)
            || !Number.isSafeInteger(item.revision) || item.revision < 0 || !Array.isArray(item.turns)) continue
          const turnIds = new Set<string>()
          const turns: ParentChatTurn[] = []
          for (const turn of item.turns.slice(-30)) {
            if (typeof turn?.id !== 'string' || turnIds.has(turn.id) || typeof turn.userText !== 'string' || turn.userText.length > 2000
              || typeof turn.reply !== 'string' || turn.reply.length > 2400 || typeof turn.createdAt !== 'string'
              || !Number.isFinite(Date.parse(turn.createdAt)) || !Array.isArray(turn.sourceIds)) continue
            turnIds.add(turn.id)
            turns.push({ id: turn.id, userText: turn.userText, reply: turn.reply, createdAt: turn.createdAt,
              sourceId: works.some(work => work.sourceId === turn.sourceId) ? turn.sourceId : null,
              sources: works.filter(work => turn.sourceIds.includes(work.sourceId)) })
          }
          ids.add(item.id)
          conversations.push({ id: item.id, title: typeof item.title === 'string' ? item.title.slice(0, 2000) : turns[0]?.userText ?? '', snapshot: { revision: item.revision, available: true, turns,
            memory: { works, scannedCount: works.length, limit: works.length } } })
        }
        if (conversations.length) return { activeId: ids.has(value.activeId) ? value.activeId : conversations[0].id, conversations }
      }
    }
  } catch { /* A blocked or malformed store must not prevent chatting. */ }
  const conversation = emptyConversation(locale)
  // Preserve the conversation created before multi-conversation history existed.
  conversation.snapshot = loadDemoChat(scope, locale)
  conversation.title = conversation.snapshot.turns[0]?.userText ?? ''
  return { activeId: conversation.id, conversations: [conversation] }
}

export function saveDemoHistory(scope: string, locale: Locale, history: DemoChatHistory): boolean {
  try {
    localStorage.setItem(key(scope, locale), JSON.stringify({ activeId: history.activeId,
      conversations: history.conversations.map(({ id, title, snapshot }) => ({ id, title, revision: snapshot.revision,
        turns: snapshot.turns.slice(-30).map(({ sources, ...turn }) => ({ ...turn, sourceIds: sources.map(work => work.sourceId) })) })) }))
  } catch { return false }
  // Remove the old copy only after the persistent write succeeds, so a deleted
  // conversation cannot reappear via migration on a later visit.
  try { sessionStorage.removeItem(`luma_parent_chat_demo_v1:${encodeURIComponent(scope)}:${locale}`) } catch { /* Unavailable storage. */ }
  return true
}

export function updateDemoConversation(history: DemoChatHistory, snapshot: ParentChatSnapshot): DemoChatHistory {
  return { ...history, conversations: history.conversations.map(item => item.id === history.activeId
    ? { ...item, snapshot, title: snapshot.turns.length ? item.title || snapshot.turns[0].userText : '' } : item) }
}

export function newDemoConversation(history: DemoChatHistory, locale: Locale): DemoChatHistory {
  if (!activeDemoConversation(history).snapshot.turns.length) return history
  const conversations = history.conversations.filter(item => item.snapshot.turns.length)
  if (conversations.length >= MAX_DEMO_CONVERSATIONS) return history
  const conversation = emptyConversation(locale)
  return { activeId: conversation.id, conversations: [conversation, ...conversations] }
}

export function deleteDemoConversation(history: DemoChatHistory, id: string, locale: Locale): DemoChatHistory {
  const remaining = history.conversations.filter(item => item.id !== id)
  const conversations = remaining.length ? remaining : [emptyConversation(locale)]
  return { activeId: history.activeId === id ? conversations[0].id : history.activeId, conversations }
}
