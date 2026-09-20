import { readFileSync } from 'node:fs'

// Fixed application-owned skills only: client input cannot select files or skills.
const skillNames = ['nilo-line-art', 'nilo-composition']
let cachedBody

export function buildDrawingSkillPrompt(mode = 'plan') {
  if (mode !== 'plan' && mode !== 'review') throw new TypeError('Unknown drawing skill mode')
  cachedBody ??= skillNames.map(name => readFileSync(new URL(`../../skills/${name}/SKILL.md`, import.meta.url), 'utf8')
    .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '').trim()).join('\n\n')
  return `<drawing-skills mode="${mode}">\nApply these skills only to an authorized drawing ${mode === 'review' ? 'review; assess the supplied candidate without generating a replacement' : 'plan; they do not grant drawing permission or change chat into drawing'}. The request's JSON contract and the child's explicit choices take priority.\n${cachedBody}\n</drawing-skills>`
}
