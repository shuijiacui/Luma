import { getDrawingIllustration, drawingIllustrations, matchingIllustrationSubjects, preferredIllustrationDetail, illustrationsForDetail } from '../../../shared/niloIllustrations.mjs'
import { getDrawingRecipe } from '../../../shared/niloRecipes.mjs'
import { getMaterialChoices } from '../../../shared/niloMaterialLibrary.mjs'
import { isMaterialEnabled, getRetiredMaterialIdentity } from '../../../shared/niloCuration.mjs'
import { creativeObjectSize, placeCreativeObject } from './niloCreativeTurn.js'
import { decodeOccupancy } from '../../../shared/niloOccupancy.mjs'

const detailPhrase = '(?:太难(?:了)?|简单(?:一)?点|容易(?:一)?点|简化(?:一)?点|少(?:一)?点细节|细节少(?:一)?点|细节多(?:一)?点|多(?:一)?点细节|漂亮(?:一)?点|像真的(?:一样)?)'
const restylePattern = new RegExp('^(?:(?:把|让|帮我把)?(?:这个|它|底图|参考图))?(?:(?:画得|变得|画|变|再|换成|换个|换一个))?(?:更|再)?' + detailPhrase + '(?:的|了|吧|呀)?$')
const stripStyle = value => value
  .replace(/^(?:(?:更)?(?:简单(?:一)?点|简单|容易|可爱(?:风)?|圆圆的?|精美(?:风)?|精致|写实(?:风)?|细节多(?:一)?点|像真的(?:一样)?)(?:的)?\s*)+/i, '')
  .replace(/^(?:(?:simple|simpler|easy|cute|storybook|detailed|realistic|illustrated)\s+)+/i, '')
  .replace(new RegExp('(?:[，,]\\s*)?' + detailPhrase + '$'), '').trim()

/** Parse only one named whole-object request; modifiers and multiple subjects
 * continue through visual planning. This vocabulary survives SVG retirement. */
function illustrationRequest(utterance) {
  let text = utterance.trim().replace(/[。！!？?]+$/, '').replace(/(?:好吗|吧|呀|吗)$/, '').replace(/\s+please$/i, '').trim()
  let region
  const corners = { 左上角: 'top-left', 右上角: 'top-right', 左下角: 'bottom-left', 右下角: 'bottom-right' }
  text = text.replace(/^(?:在|到)?(?:画布|纸)?(?:的)?(左上角|右上角|左下角|右下角)[，,]?\s*/, (_all, corner) => { region = corners[corner]; return '' })
  text = text.replace(/[，,]?\s*(?:放|画)?(?:在|到)(?:画布|纸)?(?:的)?(左上角|右上角|左下角|右下角)$/, (_all, corner) => { region = corners[corner]; return '' })
  const zh = /^(?:(?:请你|请|帮我|给我|我想要|我想|我要|可以|能不能)\s*)?(画|来|换成|改成|换)(?:(?:一)?(?:个|位|座|间|所|名|幅|只|条|朵|颗|棵|片|束|辆|架|艘|台|本|把))?\s*(.+)$/.exec(text)
  const en = /^(?:(?:please|can you|could you|i want(?: you to)?)\s+)?(draw|paint|make|add|replace(?: it)? with)\s+(?:(?:a|an|the)\s+)?(.+)$/i.exec(text)
  const match = zh ?? en
  if (!match) return null
  const noun = stripStyle(match[2])
  let subjects = matchingIllustrationSubjects(noun, true)
  if (!subjects.length && noun.startsWith('小')) subjects = matchingIllustrationSubjects(noun.slice(1), true)
  if (subjects.length !== 1) return null
  return { subject: subjects[0], replace: /^(?:换|改|replace)/i.test(match[1]), region }
}

// A narrow shortcut for explicit whole-object requests. When there is existing
// drawing context, the visual planner chooses a reference from the picture.
export function planIllustrationDrawing(context) {
  if (!context.tracingGuide || (!context.requestDrawing && !context.inferDrawingIntent) || context.currentAdditions?.length) return null
  const utterance = (context.utterance ?? '').trim(), requestedDetail = preferredIllustrationDetail(utterance)
  const previous=context.currentProposal
  const previousSubjects=matchingIllustrationSubjects(previous?.subject??'',true)
  const current=getDrawingIllustration(previous?.illustrationId)??getDrawingRecipe(previous?.recipeId)
    ??getRetiredMaterialIdentity(previous?.recipeId)
    ??(previousSubjects.length===1?drawingIllustrations.find(item=>item.subject===previousSubjects[0]):undefined)
  const feedback = utterance.replace(/[。！!？?]+$/, '').trim()
  const restyle = !!current && !!requestedDetail && (restylePattern.test(feedback)
    || /^(?:(?:make|keep|draw|change)\s+(?:it|this)\s+)?(?:simpler|easier|less detail|more detail(?:ed)?|like (?:a )?real(?: one)?)$/i.test(feedback))
  if (!restyle && /不要|不用|别|\b(?:not|without|don't)\b/i.test(utterance)) return null
  const request = restyle ? null : illustrationRequest(utterance)
  if (!request && !restyle) return null
  const subject = request?.subject ?? current?.subject
  const hasInk = context.scene?.childBounds || context.inkGrid?.some(n => n > .025)
  if (!requestedDetail && !restyle && !request?.replace && hasInk) return null
  const desiredDetail = requestedDetail ?? 'simple'
  const choices = drawingIllustrations.filter(material => material.subject === subject && isMaterialEnabled(material.id))
  const material = illustrationsForDetail(choices, desiredDetail)[0]
  if (!material) return null
  // Before a beginner PNG arrives, an ordinary named request can still use its
  // existing eligible beginner vector. This never revives archived people/art.
  if (!requestedDetail && !restyle && !request?.replace && material.difficulty !== 'beginner'
    && getMaterialChoices(subject).some(item => item.kind === 'recipe')) return null
  const aspect = context.canvasAspect || 1
  const source = restyle || request?.replace ? context.currentProposal : null
  const size = source ? { width: source.width, height: source.height }
    : creativeObjectSize({ scale: .68 }, material, context, { subjects: [] }, material)
  const { width, height } = size, corner = request?.region
  const x = source ? source.x : corner ? (corner.endsWith('right') ? .96 - width : .04) : (1 - width) / 2
  const y = source ? source.y : corner ? (corner.startsWith('bottom') ? .96 - height : .04) : (1 - height) / 2
  const style = context.drawingStyle ?? {}
  let proposal = { template: 'illustration', illustrationId: material.id, subject: context.locale === 'en' ? material.subject : material.name,
    x, y, width, height, rotation: source?.rotation ?? 0, color: source?.color ?? style.color ?? '#568570',
    strokeWidth: source?.strokeWidth ?? style.brushSize ?? 4, brushKind: source?.brushKind ?? style.brushKind ?? 'round',
    target: material.name, relation: 'A picture-book reference for optional tracing', contribution: 'object', placementPolicy: 'free' }
  const occupancy = decodeOccupancy(context.collisionMap)
  if (occupancy && !source && !corner) proposal = placeCreativeObject(proposal, occupancy, aspect, context.canvasSize)
  return { status: 'ready', placementLocked: true, proposal,
    reply: context.locale === 'en' ? `Here's a ${material.subject} reference. You can move or enlarge it and start with just the outer shape.`
      : `${material.name}的参考图来啦。可以先放大、挪一挪，再挑外轮廓画起，细节慢慢来。` }
}
