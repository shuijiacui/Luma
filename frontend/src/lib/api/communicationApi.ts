import { authFetch } from './authFetch'

export interface CommunicationGuide {
  id: string
  sourceId: string
  createdAt: string
  imageUrl: string | null
  subject: string | null
  focus: 'story' | 'process'
  title: string
  observation: string
  evidenceIds: string[]
  provenanceNote: string | null
  opener: string
  followUp: string
  alternative: string
}

export interface CommunicationResponse {
  version: string
  locale: 'zh' | 'en'
  cards: CommunicationGuide[]
  mode: 'template' | 'model'
  emptyReason: 'no_observations' | 'age_out_of_scope' | null
  generatedAt: string
}

export function getCommunicationGuides(childId: string, token: string, locale: 'zh' | 'en', signal: AbortSignal) {
  return authFetch<CommunicationResponse>(`/children/${encodeURIComponent(childId)}/communication`, {
    method: 'POST', token, body: { locale }, signal,
  })
}

export interface ArtworkMemory {
  sourceId: string
  createdAt: string
  imageUrl: string | null
  title: string
  observation: string
  evidenceIds: string[]
  provenance: string
}

export interface ParentChatTurn {
  id: string
  userText: string
  reply: string
  createdAt: string
  sourceId: string | null
  sources: ArtworkMemory[]
}

export interface ParentChatSnapshot {
  conversationId?: string
  conversations?: ParentConversation[]
  revision: number
  available: boolean
  turns: ParentChatTurn[]
  memory: { works: ArtworkMemory[]; scannedCount: number; limit: number }
}

export interface ParentChatInput {
  conversationId?: string
  text: string
  requestId: string
  revision: number
  sourceId: string | null
  locale: 'zh' | 'en'
}

export interface ParentConversation {
  id: string; title: string; lastReply: string; updatedAt: string; turnCount: number
}

export function getParentChat(childId: string, token: string, locale: 'zh' | 'en', signal: AbortSignal, conversationId?: string) {
  return authFetch<ParentChatSnapshot>(`/children/${encodeURIComponent(childId)}/chat?locale=${locale}${conversationId ? `&conversationId=${encodeURIComponent(conversationId)}` : ''}`, { token, signal })
}

export function sendParentChat(childId: string, token: string, body: ParentChatInput, signal: AbortSignal) {
  return authFetch<{ revision: number; turn: ParentChatTurn; conversationId?: string; conversations?: ParentConversation[] }>(`/children/${encodeURIComponent(childId)}/chat`, {
    method: 'POST', token, body, signal,
  })
}

export function clearParentChat(childId: string, token: string, revision: number, signal: AbortSignal, conversationId?: string) {
  return authFetch<{ revision: number }>(`/children/${encodeURIComponent(childId)}/chat/reset`, {
    method: 'POST', token, body: { revision, ...(conversationId ? { conversationId } : {}) }, signal,
  })
}

export function newParentChat(childId: string, token: string, revision: number, locale: 'zh' | 'en', signal: AbortSignal) {
  return authFetch<ParentChatSnapshot>(`/children/${encodeURIComponent(childId)}/chat/conversations`, { method: 'POST', token, body: { revision, locale }, signal })
}

export function deleteParentChat(childId: string, token: string, conversationId: string, revision: number, signal: AbortSignal) {
  return authFetch<{ revision: number }>(`/children/${encodeURIComponent(childId)}/chat/conversations/${encodeURIComponent(conversationId)}`, { method: 'DELETE', token, body: { revision }, signal })
}
