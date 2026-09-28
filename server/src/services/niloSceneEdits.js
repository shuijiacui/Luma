import { validateVoiceActions } from '../../../shared/niloVoiceActions.mjs'
import { connectScenePaths as connectPaths } from './niloSceneLayout.js'

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const canonical = value => JSON.stringify(value, (_key, item) => record(item)
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item)
const same = (a, b) => canonical(a) === canonical(b)
const names = object => [object.name, ...(object.aliases ?? [])].filter(value => typeof value === 'string' && value.trim())
const noun = value => value.trim().toLowerCase().replace(/^(?:the|a|an)\s+/i, '').replace(/^(?:这|那)?(?:一)?(?:个|只|棵|朵|颗|座|艘|辆)/u, '').trim()
const positions = {
  左上角: [0, 0], 右上角: [1, 0], 左下角: [0, 1], 右下角: [1, 1],
  左边: [0, null], 右边: [1, null], 上方: [null, 0], 下方: [null, 1], 中间: [.5, .5], 中央: [.5, .5], 中心: [.5, .5],
  'top left': [0, 0], 'upper left': [0, 0], 'top right': [1, 0], 'upper right': [1, 0],
  'bottom left': [0, 1], 'lower left': [0, 1], 'bottom right': [1, 1], 'lower right': [1, 1],
  left: [0, null], right: [1, null], top: [null, 0], bottom: [null, 1], center: [.5, .5], centre: [.5, .5],
}

function preservationClause(value, previous) {
  if (/^(?:其他|其余|别的)(?:物体|部分|东西)?(?:都|全部)?(?:保持原样|保持不变|不变|不要改|不要动|别动|不动|不改)$/u.test(value)
    || /^(?:keep|leave) (?:everything else|the rest|all other objects) (?:unchanged|the same|as (?:it is|they are))$/i.test(value)) return true
  let remaining = value
  for (const name of previous.objects.flatMap(names).sort((a, b) => b.length - a.length)) remaining = remaining.split(name.toLowerCase()).join('')
  return /^(?:和|与|、|及|都|位置|形状|大小|的|\s)*(?:保持原样|保持不变|不要改|不要动|别动|不动|不改)$/u.test(remaining)
    || /^(?:keep|leave)\s*(?:and|the|,|\s)*(?:unchanged|the same)$/i.test(remaining)
    || /^(?:don't|do not) change\s*(?:and|the|,|\s)*$/i.test(remaining)
}

/** Strict whole-command fast path. Unknown names, questions, compound edits and
 * unrecognized qualifications remain with planning; no selected-target guess. */
export function parseExplicitSceneEdit(text, previousPlan) {
  if (typeof text !== 'string' || !Array.isArray(previousPlan?.objects) || /[?？]/u.test(text)) return null
  const clauses = text.trim().toLowerCase().replace(/[。！!.]+$/u, '').replace(/\s+/g, ' ')
    .split(/[，,；;。]|\s+and\s+(?=(?:keep|leave|don't|do not)\b)/u).map(value => value.trim()).filter(Boolean)
  if (!clauses.length || clauses.slice(1).some(value => !preservationClause(value, previousPlan))) return null
  const command = clauses[0].replace(/^(?:请|帮我|给我|麻烦)+/u, '').replace(/^please\s+/i, '')
  let type, target, destination, direction, factor, replacement, match
  if ((match = command.match(/^(?:把)?(.+?)(?:移动到|移到|挪到|放到)(左上角|右上角|左下角|右下角|左边|右边|上方|下方|中间|中央|中心)$/u))) {
    type = 'move'; [, target, destination] = match
  } else if ((match = command.match(/^(?:move|put|place) (.+?) (?:to|in|at) (?:the )?((?:top|upper|bottom|lower)[ -](?:left|right)|left|right|top|bottom|cent(?:er|re))(?: corner)?$/i))) {
    type = 'move'; [, target, destination] = match; destination = destination.replace('-', ' ')
  } else if ((match = command.match(/^(?:把)?(.+?)(?:往|向)(左|右|上|下)(?:移动|移|挪)?(?:一点|一些)?$/u))) {
    type = 'move'; [, target, direction] = match
  } else if ((match = command.match(/^move (.+?) (left|right|up|down)(?: a (?:bit|little))?$/i))) {
    type = 'move'; [, target, direction] = match
  } else if ((match = command.match(/^(?:把)?(.+?)(放大|缩小|大一点|小一点)(?:一点|一些)?$/u))) {
    type = 'resize'; target = match[1]; factor = /放大|大一点/u.test(match[2]) ? 1.15 : .85
  } else if ((match = command.match(/^(放大|缩小)(.+?)(?:一点|一些)?$/u))) {
    type = 'resize'; target = match[2]; factor = match[1] === '放大' ? 1.15 : .85
  } else if ((match = command.match(/^(?:make (.+?) (bigger|larger|smaller)|(enlarge|shrink) (.+?))$/i))) {
    type = 'resize'; target = match[1] ?? match[4]; factor = /bigger|larger|enlarge/i.test(match[2] ?? match[3]) ? 1.15 : .85
  } else if ((match = command.match(/^(?:把)?(.+?)(?:替换成|换成|改成)(.+)$/u))
    || (match = command.match(/^(?:replace (.+?) with|change (.+?) (?:to|into)) (.+)$/i))) {
    type = 'replace'; target = match[1] ?? match[2]; replacement = noun(match.length === 3 ? match[2] : match[3])
    if (!replacement || replacement.length > 40 || /和|与|再|然后|并且|不要|别|画法|造型|姿势|风格|样子|\b(?:and|then|but|not|style|pose|version)\b/u.test(replacement)
      || /^(?:[红橙黄绿青蓝紫粉黑白灰棕金银]色?|大一点|小一点|更大|更小|red|orange|yellow|green|blue|purple|pink|black|white|gr[ae]y|brown|bigger|smaller)$/u.test(replacement)) return null
  } else return null
  const candidates = previousPlan.objects.filter(object => names(object).some(name => noun(name) === noun(target)))
  if (candidates.length !== 1) return null
  const object = candidates[0], box = object.box
  if (type === 'replace') return { type, targetId: object.id, replacement }
  let action
  if (type === 'resize') action = { type: 'scale', factor }
  else if (destination) {
    const [x, y] = positions[destination], coordinate = (at, start, length) => at === null ? start + length / 2 : at === .5 ? .5 : at === 0 ? .03 + length / 2 : .97 - length / 2
    action = { type: 'place', x: coordinate(x, box.x, box.width), y: coordinate(y, box.y, box.height) }
  } else {
    action = { type: 'move', dx: /^(?:左|left)$/u.test(direction) ? -.035 : /^(?:右|right)$/u.test(direction) ? .035 : 0,
      dy: /^(?:上|up)$/u.test(direction) ? -.035 : /^(?:下|down)$/u.test(direction) ? .035 : 0 }
  }
  return validateVoiceActions([action]) ? { type, targetId: object.id, action, destination, direction } : null
}

function normalizedPreserve(raw, previous, repairs, issues) {
  if (raw.preserve === undefined) return raw
  if (!Array.isArray(raw.preserve) || raw.preserve.length > 12) { issues.push('preserve must be an array of at most 12 nonempty strings, never scene objects.'); return raw }
  const preserve = raw.preserve.map((item, index) => {
    if (typeof item === 'string' && item.trim() && item.length <= 160 && !/[\u0000-\u001f\u007f]/u.test(item)) return item
    const old = record(item) && previous?.objects?.find(object => object.id === item.id)
    if (old && Object.keys(item).every(key => ['id', 'box', 'connectTo'].includes(key))
      && (!Object.hasOwn(item, 'box') || same(item.box, old.box))
      && (!Object.hasOwn(item, 'connectTo') || item.connectTo === old.connectTo)) {
      repairs.push(`Normalized preserve[${index}] for verified previous object ${old.id} to a string.`)
      return `${old.name} (${old.id})`
    }
    issues.push(`preserve[${index}] must be a nonempty string of at most 160 characters. Object entries can only refer to a verified previous ID with its unchanged box/connectTo; do not encode new geometry or unknown objects here.`)
    return item
  })
  return { ...raw, preserve }
}

/** Restore authoritatively known edit invariants before layout. This only acts
 * on a complete, unambiguous command and never invents replacement geometry. */
export function constrainExplicitSceneEdit(raw, { context = {}, previousPlan } = {}) {
  const repairs = [], issues = []
  if (!record(raw) || !Array.isArray(raw.objects)) return { plan: raw, repairs, issues }
  let plan = normalizedPreserve(raw, previousPlan, repairs, issues)
  const edit = parseExplicitSceneEdit(context.utterance, previousPlan)
  if (!edit) return { plan, repairs, issues }
  const old = previousPlan.objects.find(object => object.id === edit.targetId)
  let target = structuredClone(old)
  if (edit.type === 'replace') {
    const candidates = raw.objects.filter(object => record(object) && (object.id === old.id || !previousPlan.objects.some(prior => prior.id === object.id))
      && names(object).some(name => noun(name) === edit.replacement))
    if (candidates.length !== 1) {
      issues.push(`Replace only ${old.id} with the explicitly requested ${edit.replacement}; provide exactly one matching replacement object and retain every other previous object unchanged.`)
      return { plan, repairs, issues }
    }
    target = { ...structuredClone(candidates[0]), id: old.id, role: old.role, box: { ...old.box }, color: old.color,
      ...(old.rotation !== undefined ? { rotation: old.rotation } : {}) }
    if (old.rotation === undefined) delete target.rotation
    delete target.placement; delete target.connectTo
  } else {
    const { action } = edit, box = old.box, cx = box.x + box.width / 2, cy = box.y + box.height / 2
    if (action.type === 'scale') {
      target.box = { x: cx - box.width * action.factor / 2, y: cy - box.height * action.factor / 2,
        width: box.width * action.factor, height: box.height * action.factor }
    } else if (action.type === 'place') {
      const [x, y] = positions[edit.destination]
      const at = (value, start, length) => value === null ? start : value === .5 ? (1 - length) / 2 : value === 0 ? .03 : .97 - length
      target.box = { ...box, x: at(x, box.x, box.width), y: at(y, box.y, box.height) }
    } else target.box = { ...box, x: box.x + action.dx, y: box.y + action.dy }
    // A manually transformed path no longer follows its old automatic anchor.
    delete target.connectTo
  }
  const box = target.box, registered = ['recipe', 'illustration', 'generated'].includes(target.render?.kind), max = registered ? .9 : .45, area = registered ? .81 : .16
  if (box.x < 0 || box.y < 0 || box.x + box.width > 1 || box.y + box.height > 1 || box.width < .025 || box.height < .025
    || box.width > max || box.height > max || box.width * box.height > area + 1e-9) issues.push(`The requested ${edit.type} of ${old.id} cannot fit its unchanged shape inside the canvas. Do not clamp or substitute the object.`)
  plan = { ...plan, objects: previousPlan.objects.map(object => object.id === old.id ? target : structuredClone(object)), palette: structuredClone(previousPlan.palette ?? raw.palette) }
  const english = context.locale === 'en'
  const relativeDirection = { left: '左', right: '右', up: '上', down: '下' }[edit.direction] ?? edit.direction
  const change = edit.type === 'replace' ? english ? `${target.name} takes ${old.name}'s previous place and size` : `${target.name}放在原来${old.name}的位置，保持原来的大小`
    : edit.type === 'resize' ? english ? `${old.name} is a little ${edit.action.factor > 1 ? 'larger' : 'smaller'}` : `${old.name}比原来${edit.action.factor > 1 ? '大' : '小'}一点`
      : english ? `${old.name} is ${edit.destination ? `at the ${edit.destination}` : `a little further ${edit.direction}`}` : `${old.name}${edit.destination ? `位于${edit.destination}` : `往${relativeDirection}移动一点`}`
  plan.summary = english ? `${change}; everything else stays unchanged.` : `${change}，其他物体保持原样。`
  // Model-proposed relations on unchanged paths/anchors must not reflow them.
  delete plan.relations
  repairs.push(`Preserved previous identities, geometry and unrelated objects for explicit ${edit.type} of ${old.id}.`)
  return { plan, repairs, issues, editedObjectId: old.id }
}

/** Already rendered unchanged guides are exact cached values. Reconnecting an
 * old road can accumulate floating-point movement even with unchanged anchors. */
export function connectScenePaths(plan, rendered, aspect, previousScene) {
  if (!previousScene) return connectPaths(plan, rendered, aspect)
  const unchanged = new Map()
  for (const object of plan.objects) {
    const old = previousScene.plan.objects.find(item => item.id === object.id), cached = previousScene.objects.find(item => item.id === object.id)
    const current = rendered.find(item => item.id === object.id)
    // A requested generated variant retains the plan but contains new pixels.
    // Only already-reused proposals qualify for exact cache restoration.
    if (old && cached && current && same(object, old) && same(current, cached)) unchanged.set(object.id, cached)
  }
  const connectionPlan = { ...plan, objects: plan.objects.map(object => {
    if (!unchanged.has(object.id) || !object.connectTo) return object
    const copy = { ...object }; delete copy.connectTo; return copy
  }) }
  const connected = connectPaths(connectionPlan, rendered, aspect)
  return connected?.map(object => unchanged.has(object.id) ? structuredClone(unchanged.get(object.id)) : object) ?? null
}
