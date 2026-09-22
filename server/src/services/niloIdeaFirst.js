import { drawingRecipes, matchingRecipeSubjects } from '../../../shared/niloRecipes.mjs'

const boundedText = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max ? value.trim() : null
export function sanitizeCreativeIdea(raw) {
  const subject = boundedText(raw?.subject, 80), relationship = boundedText(raw?.relationship, 240)
  if (!subject || !relationship || typeof raw.requiresCustom !== 'boolean') return null
  if (!Array.isArray(raw.searchTerms) || raw.searchTerms.length > 4 || !raw.searchTerms.every(s => boundedText(s, 60))) return null
  if (!Array.isArray(raw.details) || !raw.details.length || raw.details.length > 5 || !raw.details.every(s => boundedText(s, 100))) return null
  return { subject, relationship, searchTerms: raw.searchTerms.map(s => s.trim()),
    requiresCustom: raw.requiresCustom, details: raw.details.map(s => s.trim()) }
}

// Exact bilingual subject aliases, not association expansion: no match means
// no candidates. Recent variants rank lower only within the same subject.
export function retrieveIdeaRecipes(idea, recent = []) {
  const named = [...new Set([idea.subject, ...idea.searchTerms].flatMap(matchingRecipeSubjects))]
  return drawingRecipes.filter(r => named.includes(r.subject))
    .sort((a, b) => named.indexOf(a.subject) - named.indexOf(b.subject)
      || Number(recent.includes(a.id)) - Number(recent.includes(b.id)))
    .slice(0, 6)
}

export function creativeIdeationPrompt(context) {
  return `You are Nilo, a playful drawing partner for a child. Look at the whole picture and imagine ONE new addition. Follow the child's explicit request; otherwise choose a complete object with an interesting connection to this scene. Impossible combinations are welcome. Uncertain recognition is not a reason to stop or to assert what the child intended. Do not infer psychology. Do not ask the child to choose from a menu.
This is the IDEA stage. No drawing assets or catalogue are available at this stage. Choose the idea freely before deciding how to draw it. Do not produce paths or recipe IDs.
Return ONLY JSON {"subjects":[{"subject":"visible object, or uncertain marks","family":"character|animal|plant|landscape|vehicle|building|object|abstract","confidence":0.8,"evidence":"visible marks","bounds":{"x":0.1,"y":0.1,"width":0.4,"height":0.5}}],"idea":{"subject":"short name of ONE addition","relationship":"specific connection to this scene or request","searchTerms":["singular English noun for the main object","optional component noun"],"requiresCustom":false,"details":["essential visible feature","another essential feature"]}}.
At most 4 observed subjects, 4 search terms and 5 essential details. Bounds are normalized 0..1 in the full canvas. searchTerms are retrieval hints ONLY, never constraints on your idea. requiresCustom MUST be true for invented combinations, unusual accessories or transformations essential to the idea (a normal object alone would lose the idea); false for an ordinary object with an ordinary pose. Keep the name under 80 characters, relationship under 240, each detail under 100. Write subject, relationship and details in ${context.locale === 'en' ? 'English' : 'Chinese'}.
CHILD CONTEXT: ${JSON.stringify({ utterance: context.utterance, history: context.history, recentSubjects: context.recentSubjects, canvasAspect: context.canvasAspect })}`
}

export function ideaRenderingPrompt(context, observation, idea, candidates) {
  return `You are Nilo's drawing stage. Render the LOCKED IDEA below on the given canvas. Its subject, connection and all essential details are already decided. Do not choose a different idea to fit the assets. No semantic approval round follows: make the silhouette and distinguishing features readable.
Return ONLY JSON {"recipeId":null,"referenceRecipeId":null,"sketch":{"aspect":1,"paths":[]},"color":"#328ab5","at":[0.7,0.5],"scale":0.28,"sizeReason":"why this scale fits the scene"}.
You may set recipeId to an exact CANDIDATES ID ONLY if requiresCustom is false AND that exact drawing depicts the entire idea and all details. Then sketch can be null. Otherwise recipeId MUST be null and provide the complete custom sketch. The candidate paths are optional construction references: you may adapt them and add the essential custom details, returning ALL final paths together. If you actually use one as a reference set referenceRecipeId; otherwise null. Empty candidates means draw freely. Do not substitute a backup object, omit essential details or simply rename a plain asset as an imaginary combination.
PATHS: at most 24 strokes, 96 commands total. Each stroke is an array of command arrays: ["M",x,y], ["L",x,y], ["Q",cx,cy,x,y], ["C",c1x,c1y,c2x,c2y,x,y], ["Z"], or a separate ["E",cx,cy,rx,ry]. Begin open strokes with M. Coordinates and ellipse extents must stay within 0..1. aspect is physical width/height in .2..5. Use a coherent silhouette, recognizable parts and few clear details. Avoid disconnected fragments and accidental overlaps. For physically round ellipses, rx * aspect = ry.
LAYOUT: at is the full-canvas centre, x rightward and y downward. scale is the desired LONG physical side divided by the canvas SHORT side. Choose proportionate size based on existing objects and the idea's role, not a fixed icon size. Prefer clear space near the visual feature mentioned in the relationship; crossing a line is allowed. Choose your own harmonious, visible #RRGGBB color, obeying any explicit child color request. Keep the child's brush texture and thickness.
LOCKED IDEA: ${JSON.stringify(idea)}
CANDIDATES: ${JSON.stringify(candidates.map(({ id, subject, name, label, colors, sketch }) => ({ id, subject, name, pose: label, colors, sketch })))}
OBSERVATION: ${JSON.stringify(observation)}
CHILD CONTEXT: ${JSON.stringify({ utterance: context.utterance, canvasAspect: context.canvasAspect })}`
}
