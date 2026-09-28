import type { DrawingSketch } from './sketch'
import { validateProposal, type DrawingProposal } from './proposals'
import { needsSceneIdea, type SceneGuide } from './sceneWorkflow'
import { simpleVoiceActions, isVoiceSuggestion, isNewDrawingRequest } from './voiceActions'

export type DetailKind = 'dots' | 'stripes' | 'waves' | 'smile' | 'sad' | 'pattern' | 'decoration'
export type DetailChoice = 'self' | 'hint' | 'outline'
export interface DetailRequest { kind: DetailKind; targetId?: string; targetName?: string }
export interface DetailInvitation {
  request: DetailRequest
  mode: 'offer' | 'hint' | 'outline'
  message: string
  steps: string[]
  example?: DrawingSketch
}

/** A narrow, local invitation for finishable details, never a gate on a scene or
 * a geometry/material operation. Unknown requests keep their normal routing. */
export function detailRequest(text: string, scene: SceneGuide): DetailRequest | null {
  if (text.length > 180 || needsSceneIdea(text) || isVoiceSuggestion(text) || simpleVoiceActions(text)
    || /哪种|什么.*(?:好|合适)|好看吗|要不要|\b(?:what|which)\b.*\bshould\b/i.test(text)
    || /移|挪|缩小|放大|大一点|小一点|换成|替换|换一个|换个画法|删除|去掉|不要|别加|不加|不想|然后|并且|同时|还有|和|与|、|;|；|\b(?:move|resize|bigger|smaller|replace|remove|delete|instead|do not|don't|and)\b/i.test(text)) return null
  if (!/加|添|画|改|变|装饰|笑|\b(?:add|draw|paint|make|decorate|give)\b/i.test(text)) return null
  const matches: [DetailKind, RegExp][] = [['dots', /圆点|点点|波点|\b(?:dots?|polka dots?)\b/i], ['stripes', /条纹|\bstripes?\b/i],
    ['waves', /波浪(?:纹|线)|\bwavy (?:lines?|pattern)\b/i], ['smile', /笑脸|微笑|笑一笑|笑一下|开心(?:一点|点|的表情)|\b(?:smile|smiling|happy face)\b/i],
    ['sad', /哭脸|难过的表情|伤心的表情|\bsad face\b/i], ['pattern', /花纹|\bpatterns?\b/i], ['decoration', /小装饰|装饰一下|加点装饰|\b(?:small|little) decorations?\b/i]]
  const kinds = matches.filter(([, regex]) => regex.test(text)).map(([kind]) => kind)
  const specific = kinds.filter(kind => !['pattern', 'decoration'].includes(kind))
  if (specific.length > 1) return null // Never silently drop another requested detail.
  const kind = specific[0] ?? kinds[0]
  if (!kind) return null
  const named = scene.plan.objects.filter(object => [object.name, ...object.aliases].some(name => name && text.toLowerCase().includes(name.toLowerCase())))
  if (named.length > 1) return null
  const pureDetail = /^(?:(?:请|你|帮我|给我|再|我想|想|一下|吧|画|绘制|添|加|一个|一些|一点|个|小)+\s*)?(?:圆点|点点|波点|条纹|波浪线|波浪纹|笑脸|哭脸|花纹|小装饰)[吧呀啊。！!\s]*$/u.test(text.trim())
    || /^(?:please\s+)?(?:draw|paint|add)\s+(?:(?:a|an|some|little)\s+)?(?:dots?|stripes?|wavy lines?|a?\s*smile|happy face|sad face|patterns?|little decorations?)[.!\s]*$/i.test(text.trim())
  // A striped tiger or smiling robot is a new subject, not a detail to put on
  // whichever old object happens to be selected.
  if (isNewDrawingRequest(text) && !pureDetail) return null
  if (/^(?:(?:请|你|帮我|给我|再|我想)\s*)*画|^(?:please\s+)?(?:draw|paint)\b/i.test(text.trim()) && !pureDetail
    && !(named.length === 1 && /上的|的(?:圆点|条纹|花纹|笑脸)|\b(?:on|to|for)\b/i.test(text))) return null
  if (named.length === 0 && !pureDetail && /(?:给|在|把|让).+(?:加|添|画|改|变)|\b(?:on|to|for)\s+/i.test(text)
    && !/它|这个|那个|\b(?:it|this|that)\b/i.test(text)) return null
  const target = named.length === 1 ? named[0] : named.length === 0
    ? scene.plan.objects.find(object => object.id === scene.selectedId) ?? (scene.plan.objects.length === 1 ? scene.plan.objects[0] : undefined) : undefined
  return { kind, ...(target ? { targetId: target.id, targetName: target.name } : {}) }
}

export function detailChoice(text: string): DetailChoice | null {
  const value = text.trim().replace(/[，,。！!？?]/g, '')
  if (/^(?:好(?:的)?|那)?(?:我来试试|我试试|让我试试|我自己画|我来画|I'll try|let me try|I will try)$/i.test(value)) return 'self'
  if (/^(?:给我(?:一点|个)?提示|教(?:教)?我|怎么画|我(?:还是)?不会(?:画)?|不会(?:画)?|I (?:still )?(?:can't|cannot)(?: draw)?|help me|give me (?:a )?hint|how do I draw it)$/i.test(value)) return 'hint'
  if (/^(?:(?:请|你|再|还是|那|帮我|给我|直接|一下|吧|好)+)?(?:画(?:个|一个|一点)?(?:轮廓|示范|例子)?|你来画|帮(?:帮)?我画|draw (?:it|an outline|a guide|an example)(?: for me)?|show me an outline)(?:一下|吧)?$/i.test(value)) return 'outline'
  return null
}

export function explicitDetailHelp(text: string): 'hint' | 'outline' | null {
  if (/轮廓|示范|\b(?:outline|example)\b|(?:请|直接|你来|帮我|给我).*画|\b(?:please draw|draw .*for me|help me draw)\b/i.test(text)) return 'outline'
  return /不会|教我|怎么画|\b(?:can't|cannot|teach|how to)\b/i.test(text) ? 'hint' : null
}

const names: Record<DetailKind, [string, string]> = {
  dots: ['圆点', 'dots'], stripes: ['条纹', 'stripes'], waves: ['波浪线', 'wavy lines'],
  smile: ['笑脸', 'a smile'], sad: ['难过的表情', 'a sad face'], pattern: ['花纹', 'a pattern'], decoration: ['小装饰', 'little decorations'],
}
const instructions: Record<DetailKind, [string[], string[]]> = {
  dots: [['先选一小块想装饰的地方。', '画三个分开的圆圈，圆圈之间留一点空。', '喜欢的话，再添一排大小不同的圆圈。'], ['Choose a small area to decorate.', 'Draw three separate circles, leaving a little space between them.', 'Add another row with different sizes if you like.']],
  stripes: [['先画一条短线。', '隔开一点，再画一条朝向相同的线。', '重复两三次，想留白的地方就停下来。'], ['Start with one short line.', 'Leave a gap and draw another line in the same direction.', 'Repeat two or three times, leaving some blank space.']],
  waves: [['先让线条轻轻向上弯。', '接着向下弯，像小山连着小山谷。', '再画一条跟着它走的线，不用完全一样。'], ['Curve a line gently upward.', 'Then curve it downward, like a hill and a valley.', 'Draw another line beside it; they do not have to match exactly.']],
  smile: [['先选眼睛的位置，画两个小圆圈。', '在眼睛下方画一条向上翘的弯线。', '想让它更开心，可以给嘴角各添一条小短线。'], ['Place two small circles for the eyes.', 'Draw a curved smile below them, with the ends turned up.', 'You can add a tiny line at each corner of the smile.']],
  sad: [['先画两个小圆圈作为眼睛。', '在下面画一条中间高、两头低的弯线。', '在眼睛上方添两条斜斜的眉毛，就有不同的表情了。'], ['Draw two small circles for the eyes.', 'Below them, draw a curve with its middle higher than its ends.', 'Add two slanted eyebrows to change the expression.']],
  pattern: [['先选一种花纹，比如圆点或条纹。', '只在一小块地方画三次，让花纹重复起来。', '看一看，再决定要不要延伸到旁边。'], ['Choose a pattern, such as dots or stripes.', 'Repeat it three times in one small area.', 'Look at it before deciding whether to continue.']],
  decoration: [['先挑一小块留白的地方。', '试着画三个小圆圈，大小可以不同。', '把圆圈连成一串，或让它们散开，由你决定。'], ['Choose a small blank area.', 'Try three little circles in different sizes.', 'You decide whether to join them or spread them out.']],
}

export function detailSteps(kind: DetailKind, locale: 'zh' | 'en') { return [...instructions[kind][locale === 'en' ? 1 : 0]] }
export function createDetailReplyPicker() {
  const last = new Map<string, number>()
  return (kind: DetailKind, locale: 'zh' | 'en') => {
    const name = names[kind][locale === 'en' ? 1 : 0]
    const choices = locale === 'en'
      ? [`Would you like to try ${name}? I can give you a hint or a little outline.`, `We can add ${name} together. Try it yourself, ask for a hint, or let me show an outline.`, `Your turn to shape ${name}! A hint or an outline is here if you want one.`]
      : [`这部分${name}想自己试试吗？也可以让我给点提示，或画个小轮廓。`, `${name}可以由你来设计。自己试一试、看提示，或者先看我的轮廓示范，都可以。`, `我们一起来添${name}吧。你可以先试试，也可以选一个提示或轮廓。`]
    const key = `${kind}:${locale}`, indices = choices.map((_, i) => i).filter(i => i !== last.get(key))
    const index = indices[Math.floor(Math.random() * indices.length)]; last.set(key, index)
    return choices[index]
  }
}

export function detailSketch(kind: DetailKind): DrawingSketch {
  if (kind === 'smile' || kind === 'sad') return { aspect: 1.5, paths: [
    [['E', .3, .25, .035, .05]], [['E', .7, .25, .035, .05]],
    kind === 'smile' ? [['M', .2, .52], ['Q', .5, .98, .8, .52]] : [['M', .2, .8], ['Q', .5, .32, .8, .8]],
  ] }
  if (kind === 'dots' || kind === 'decoration') return { aspect: 2, paths: [[['E', .15, .5, .08, .16]], [['E', .5, .5, .08, .16]], [['E', .85, .5, .08, .16]]] }
  if (kind === 'waves') return { aspect: 2, paths: [
    [['M', .06, .3], ['C', .2, .04, .35, .56, .5, .3], ['C', .65, .04, .8, .56, .94, .3]],
    [['M', .06, .7], ['C', .2, .44, .35, .96, .5, .7], ['C', .65, .44, .8, .96, .94, .7]],
  ] }
  return { aspect: 2, paths: [
    [['M', .18, .15], ['L', .18, .85]], [['M', .5, .15], ['L', .5, .85]], [['M', .82, .15], ['L', .82, .85]],
  ] }
}

/** The example is its own movable reference, never an asserted edit to pixels
 * inside an unknown raster. If paper has no room, the card still shows it. */
export function detailProjection(request: DetailRequest, aspect: number, obstacles: {x:number;y:number;width:number;height:number}[], color: string, locale: 'zh' | 'en'): DrawingProposal | null {
  const sketch = detailSketch(request.kind), width = Math.min(.18, .25 / aspect), height = width * aspect / sketch.aspect
  const overlap = (a: {x:number;y:number;width:number;height:number}, b: {x:number;y:number;width:number;height:number}) => a.x < b.x + b.width + .012 && a.x + a.width > b.x - .012 && a.y < b.y + b.height + .012 && a.y + a.height > b.y - .012
  for (const y of [.98 - height, .02, .5 - height / 2]) for (const x of [.02, .98 - width, .5 - width / 2]) {
    const box = { x, y, width, height }
    if (obstacles.some(obstacle => overlap(box, obstacle))) continue
    return validateProposal({ ...box, template: 'custom', subject: locale === 'en' ? 'Detail example' : '细节画法示范', sketch,
      rotation: 0, color, strokeWidth: 3, target: 'whole picture', relation: locale === 'en' ? 'A movable drawing example, separate from your picture' : '可以移动的画法示范，不是已经画进作品的内容', contribution: 'object', placementPolicy: 'free' })
  }
  return null
}
