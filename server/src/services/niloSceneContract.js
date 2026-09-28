/** One approved idea is the source of truth for a newly generated setting.
 * Hidden, optional planner details must not contradict the sentence the child
 * actually approves. Explicit child subjects remain independently mandatory;
 * the final pixel review also checks the complete original request. */
export function alignGeneratedSceneContract(plan, input) {
  if (!input.rasterGeneration || !input.semanticBrief || input.plan || input.context.requestScope !== 'scene'
    || plan?.objects?.length !== 1 || plan.objects[0]?.render?.kind !== 'generated'
    || typeof plan.summary !== 'string' || !plan.summary.trim() || plan.summary.length > 100) return plan
  const summary = additionFeatureText(plan.summary, input)
  if (!summary || summary.length > 100) return plan
  const essential = [summary]
  for (const subject of sceneAdditionRequiredSubjects(input)) {
    if (!essential.some(value => value.toLowerCase().includes(subject.toLowerCase()))) essential.push(subject)
  }
  // Do not silently truncate a long or unusually constrained request.
  if (essential.length > 4) return plan
  return { ...plan, request: input.utterance, objects: [{ ...plan.objects[0], essential }] }
}
import { additionFeatureText } from './niloScenePreservation.js'
import { sceneAdditionRequiredSubjects } from './niloSceneMaterials.js'
