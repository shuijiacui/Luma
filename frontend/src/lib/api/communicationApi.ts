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
