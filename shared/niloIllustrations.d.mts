export interface DrawingIllustration {
  id: string; subject: string; name: string; label: string; kind: 'illustration';
  style: 'storybook' | 'illustrated' | 'realistic'; category: string; related: string[]; aliases: string[];
  aspect: number; src: string; minPixels: number; ageBands: string[];
  source: string; learning: string; detail: 'simple' | 'moderate' | 'rich'; difficulty: 'beginner' | 'medium' | 'detailed'; tracing: string;
}
export const drawingIllustrations: DrawingIllustration[]
export function getDrawingIllustration(id: string): DrawingIllustration | undefined
export function illustrationCatalogue(): Pick<DrawingIllustration, 'id'|'subject'|'name'|'style'|'category'|'aspect'|'ageBands'|'difficulty'|'detail'|'learning'|'tracing'>[]
export function matchingIllustrationSubjects(text: string, exact?: boolean): string[]
export function preferredIllustrationDetail(utterance: string): 'simple' | 'moderate' | 'rich' | undefined
export function illustrationsForDetail<T extends { subject: string; detail: string }>(items: T[], detail?: 'simple' | 'moderate' | 'rich'): T[]
