import { needsCreativeScenePlanning } from '../../../../../shared/niloSceneScope.mjs'
import { sanitizeScenePlan, type ScenePlan } from '../../../../../shared/niloScenePlan.mjs'
import { validateProposal, type DrawingProposal } from './proposals'
import { applyVoiceActions, simpleVoiceActions } from './voiceActions'
import { hasUnresolvedEditName } from './editTargets'

export interface SceneGuide {
  plan: ScenePlan
  objectIds: string[]
  /** `color` is accepted only for saved guides from the earlier reference view. */
  view: 'color' | 'outline'
  selectedId?: string
}

/** Keep browser routing and server understanding on the same scope boundary. */
export const needsSceneIdea = needsCreativeScenePlanning

/** A specified unusual object can use composition without another permission question. */
export function isCompositeDrawingRequest(text: string): boolean {
  const value = text.trim().replace(/^nilo[，,、\s]*/i, '')
  const drawing = /^(?:请|我想要?|我要|帮我|给我|你|再|能不能|可以|\s)*(?:画|绘制)|^(?:请|帮我|给我)?在.+(?:画|绘制)/u.test(value)
    || /^(?:(?:please|can you|could you|I want to)\s+)*(?:draw|paint)\b/i.test(value)
  return drawing && /(?:长着?|带着?).*(?:翅膀|尾巴)|戴着?.*(?:头盔|宇航)|(?:会游泳|会飞|会走路)的|\b(?:winged|wearing .*helmet|flying castle|walking flower)\b|(?:画|绘制).+(?:旁边?|边上|前面|后面|上面?|下面?|左边|右边|里面?|外面?)(?:的|有).+|在.+(?:旁边?|边上|前面|后面|上面?|下面?|左边|右边|里面?|外面?)(?:再)?(?:画|绘制).+|\b(?:draw|paint)\b.+\b(?:next to|beside|in front of|behind|under|above|below|on top of)\b.+/i.test(value)
}

export function sceneAnswer(text: string): 'yes' | 'no' | 'change' {
  const value = text.trim().replace(/[。！!，,]/gu, '').replace(/\s+/g, ' ')
  if (/^(?:好|好的|好呀|好啊|可以|行|嗯|嗯嗯|是的|同意|就这样|开始|画吧|开始画|好就这样画|可以就这样画|就这样画)(?:吧|呀|啊|了)?$|^(?:yes|yes please|okay|ok|go ahead|draw it|let's do it)$/i.test(value)) return 'yes'
  if (/^(?:不要|不画了|先不画|算了|取消|不用了|不想画了|no|cancel|never mind)$/i.test(value)) return 'no'
  return 'change'
}

export function validateSceneGuide(value: unknown, proposals: DrawingProposal[]): SceneGuide | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as SceneGuide
  const plan = sanitizeScenePlan(raw.plan)
  if (!plan || !Array.isArray(raw.objectIds) || raw.objectIds.length !== proposals.length
    || plan.objects.length !== proposals.length || proposals.length > 8
    || raw.objectIds.some((id, i) => id !== plan.objects[i].id)
    || proposals.some(item => !validateProposal(item))) return null
  return { plan, objectIds: [...raw.objectIds], view: 'outline',
    ...(typeof raw.selectedId === 'string' && raw.objectIds.includes(raw.selectedId) ? { selectedId: raw.selectedId } : {}) }
}

export function sceneRenderResult(raw: unknown): { plan: ScenePlan; proposals: DrawingProposal[]; ids: string[] } | null {
  if (!raw || typeof raw !== 'object') return null
  const result = raw as { status?: string; plan?: unknown; objects?: {id?: string; name?: string; proposal?: unknown}[] }
  const plan = sanitizeScenePlan(result.plan)
  if (result.status !== 'ready' || !plan || !Array.isArray(result.objects) || result.objects.length !== plan.objects.length) return null
  const proposals: DrawingProposal[] = []
  const ids = new Set<string>()
  for (const object of plan.objects) {
    const rendered = result.objects.find(item => item.id === object.id)
    const proposal = validateProposal(rendered?.proposal)
    if (!proposal || ids.has(object.id) || rendered?.name !== object.name) return null
    ids.add(object.id); proposals.push(proposal)
  }
  return { plan, proposals, ids: plan.objects.map(object => object.id) }
}

export function syncSceneGuide(scene: SceneGuide, proposals: DrawingProposal[], ids = scene.objectIds, keepConnections = false): SceneGuide {
  const remaining = ids.map(id => scene.plan.objects.find(item => item.id === id)!)
  const hasMain = remaining.some(object => object.role === 'main')
  const moved = new Set(ids.filter((id, index) => {
    const before = scene.plan.objects.find(item => item.id === id)!.box, after = proposals[index]
    return (['x', 'y', 'width', 'height'] as const).some(key => Math.abs(before[key] - after[key]) > 1e-7)
  }))
  return { ...scene, view: 'outline', objectIds: ids, selectedId: ids.includes(scene.selectedId ?? '') ? scene.selectedId : undefined,
    plan: { ...scene.plan, objects: ids.map((id, index) => {
      const p = proposals[index], object = scene.plan.objects.find(item => item.id === id)!
      const { connectTo, ...base } = object
      // A child's move takes precedence over the original automatic connection.
      const connected = connectTo && ids.includes(connectTo) && (keepConnections || (!moved.has(id) && !moved.has(connectTo)))
      return { ...base, ...(connected ? { connectTo } : {}), role: !hasMain && index === 0 ? 'main' as const : object.role,
        box: { x: p.x, y: p.y, width: p.width, height: p.height }, color: p.color }
    }) } }
}

/** Apply an entire simple request atomically; structural changes go back to planning. */
export function editSceneLocally(text: string, scene: SceneGuide, source: DrawingProposal[]):
  { status: 'edited'; proposals: DrawingProposal[]; scene: SceneGuide } | { status: 'ambiguous' | 'unhandled' | 'invalid' | 'empty' } {
  const lower = text.toLowerCase()
  const named = scene.plan.objects.filter(object => [object.name, ...(object.aliases ?? [])]
    .some(name => name.length > 0 && lower.includes(name.toLowerCase())))
  const plural = /所有|全部|每[一]?棵|这些|那些|\ball\b/i.test(text)
  // Strip only recognized target names before the strict whole-command parser.
  // An unknown noun may never fall back to the selected object.
  let instruction = text.trim().replace(/^(?:请|帮我|给我|把)+/u, '')
  for (const name of named.flatMap(object => [object.name, ...object.aliases]).sort((a, b) => b.length - a.length)) instruction = instruction.split(name).join('')
  instruction = instruction.replace(/^(?:所有|全部|这些|那些|它|这个|那个|选中的|刚才那个)+/u, '').trim()
  const actions = simpleVoiceActions(instruction) ?? (named.length && /^(?:请|把|帮我|给我)*(?:删除|删掉|去掉)/u.test(text) ? simpleVoiceActions(text) : null)
  if (!actions || actions.some(action => action.type === 'variant' || action.type === 'part')) {
    return { status: !named.length && simpleVoiceActions(text) ? 'ambiguous' : 'unhandled' }
  }
  if (!named.length && hasUnresolvedEditName(text)) return { status: 'ambiguous' }
  if (!named.length && instruction !== text.trim() && !/^(?:请|帮我|给我|把|它|这个|那个|选中的|刚才那个)*(?:改成|换成|变成|往|向|缩小|放大|小一点|大一点|删除|删掉|去掉|[红蓝绿黄紫粉橙黑])/.test(text.trim())) return { status: 'ambiguous' }
  const targets = named.length ? named : scene.selectedId ? scene.plan.objects.filter(object => object.id === scene.selectedId)
    : scene.plan.objects.length === 1 ? scene.plan.objects : []
  if (!targets.length || (targets.length > 1 && !plural)) return { status: 'ambiguous' }
  const chosen = new Set(targets.map(object => object.id))
  const proposals: DrawingProposal[] = [], ids: string[] = []
  for (let i = 0; i < source.length; i++) {
    const id = scene.objectIds[i], result = chosen.has(id) ? applyVoiceActions([source[i]], actions) : null
    if (result && !result.ok) return { status: 'invalid' }
    if (result?.ok && result.deleting) continue
    ids.push(id); proposals.push(result?.ok ? result.items[0] : source[i])
  }
  if (!proposals.length) return { status: 'empty' }
  return { status: 'edited', proposals, scene: syncSceneGuide(scene, proposals, ids) }
}

const lines = {
  thinking: {
    zh: ['好的，让我来想想。', '好呀，我想想怎么画。', '嗯，让我想个办法。', '好，我来想想这个主意。'],
    en: ['Okay, let me think.', 'Sure, let me think about how to draw that.', 'Let me work out an idea.'],
  },
  revise: {
    zh: ['哪里想换一换？点麦克风告诉我吧。', '你想怎么改？打开麦克风，我听你说。', '我们一起改主意！点一下麦克风，说说你的想法吧。', '你来做决定。打开麦克风，告诉我想改哪里。'],
    en: ['What would you change? Tap the microphone and tell me.', 'Your idea matters. Open the microphone and tell me what to change.', 'Let’s change it together. Tap the microphone to share your idea.'],
  },
  ready: {
    zh: ['场景的底图准备好啦，你可以接着画，也可以告诉我想改哪里。', '我们的构思变成底图啦！想挪一挪或改大小，告诉我就好。', '快看看我们的场景底图吧。接下来，轮到你的想象啦。'],
    en: ['The scene guide is ready. Keep drawing, or tell me what to change.', 'Our idea is ready as a drawing guide! You can move things or change their size.', 'Take a look at our scene guide. What would you like to add?'],
  },
  edited: {
    zh: ['改好啦，看看现在的样子。', '按你的想法调整好了，还想怎么画？', '这样改好啦，你可以接着画。'],
    en: ['That’s changed. Take a look!', 'I’ve made your change. What would you like next?', 'All adjusted. You can keep drawing.'],
  },
}
export function createSceneReplyPicker() {
  const last = new Map<string, number>()
  return (kind: keyof typeof lines, locale: 'zh' | 'en') => {
    const key = `${kind}:${locale}`, choices = lines[kind][locale]
    const previous = last.get(key)
    const available = choices.map((_, i) => i).filter(i => i !== previous)
    const index = available[Math.floor(Math.random() * available.length)]
    last.set(key, index)
    return choices[index]
  }
}
