import { readFileSync } from 'node:fs'

let sheet
export function hasCompositeDrawing(context) {
  return (context.scene?.recentContributions ?? []).filter(x=>x.owner==='child').reduce((n,x)=>n+(x.strokeCount??1),0)>=3
}
export function drawingReferenceSheet(context) {
  const words=[context.utterance,...(context.history??[]).filter(x=>x.role==='user').map(x=>x.text)].join(' ')
  if (!hasCompositeDrawing(context) && !/人物|小人|人脸|帽子|头发|\b(person|face|hat|hair)\b/i.test(words)) return undefined
  sheet ??= readFileSync(new URL('../../skills/nilo-cocreate/references/person-drawing-references.png',import.meta.url)).toString('base64')
  return { imageBase64:sheet, description:'REFERENCE SHEET ONLY, not part of the child canvas. 2 rows x 3 columns: top row = hat, crown, bowtie; bottom row = eyeglasses, nose, fringe. First five: Google Quick, Draw! contributors (CC BY 4.0); last: original Luma example. These show simple drawable ideas, NOT objects already present in the canvas. Inspect Image 1 independently before choosing. Never transfer reference coordinates or draw the complete sheet.' }
}

export const wholeSubjectPrompt = `WHOLE-SUBJECT CREATIVE CHOICE: a last stroke is an attention hint, NOT the meaning of the entire picture. First inspect the full canvas for a recognizable subject assembled from several strokes. A large head with two eyes, a mouth and two short lines is a person, even if the last line alone looks abstract. When the face already has eyes and a smile, offer a new possibility: fringe/hair accessory, a hat/crown if there is headroom, a bowtie if a neck is visible, or another meaningful character detail. Do not add more eyes/smiles, copy a leg, trace the head or call it a balloon. No special story from the child is required to offer an appropriate idea.
RESOURCE USE: If the canvas has no visible character/head, do not use person accessories; develop its actual subject instead. The optional reference sheet is a small drawing vocabulary, never recognition evidence. Adapt one idea to the child's proportions and actual available space. The dedicated part renderer supports hat, crown, fringe, hair_bow, nose and button, in addition to the existing parts. For fringe/hair_bow/nose use the HEAD or FACE as anchor, placement=inside and position in that head box; keep the eyes and mouth clear. A fringe occupies the forehead, not the middle of the face. hat/crown require placement=above and attachment on the head's visible top outline. If the head nearly reaches the canvas edge, choose a visible forehead accessory instead of squeezing a hat off canvas. button needs visible clothing. Do not add an accessory merely because it appears on the sheet; it must belong to the observed character. Outside these parts, custom remains available. Keep one recognizable contribution and leave the child room to respond.`
