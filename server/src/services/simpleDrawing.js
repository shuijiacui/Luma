// Explicit, whole-utterance requests only. Complex scenes still go to vision.
// This is a requested drawing, never a random fallback for failed model calls.
const subjects = [
  ['stars', '星星', 'star', ['星星', '五角星', '星']],
  ['sun', '太阳', 'sun', ['太阳']], ['moon', '月亮', 'moon', ['月亮', '月牙']],
  ['tree', '树', 'tree', ['树', '小树']], ['flower', '花', 'flower', ['花', '花朵', '小花']],
  ['cloud', '云朵', 'cloud', ['云', '云朵', '白云']], ['fish', '鱼', 'fish', ['鱼', '小鱼']],
  ['boat', '小船', 'boat', ['船', '小船']], ['house', '房子', 'house', ['房子', '小房子']],
  ['heart', '爱心', 'heart', ['爱心', '心形']], ['butterfly', '蝴蝶', 'butterfly', ['蝴蝶']],
  ['bird', '小鸟', 'bird', ['鸟', '小鸟']], ['mountain', '山', 'mountain', ['山', '大山']],
  ['leaf', '叶子', 'leaf', ['叶子', '树叶']],
]
const colors = { 红: '#d74952', 黄: '#edcd70', 蓝: '#4aa5d8', 绿: '#51a06c', 紫: '#7a82d8', 橙: '#f28c38', 粉: '#e889a9', 白: '#ffffff', 黑: '#303c36', red: '#d74952', yellow: '#edcd70', blue: '#4aa5d8', green: '#51a06c', purple: '#7a82d8', orange: '#f28c38', pink: '#e889a9', white: '#ffffff', black: '#303c36' }
const ratios = { stars: 1, sun: 1, moon: .85, tree: .8, flower: .7, cloud: 1.7, fish: 1.55, boat: 1.4, house: 1, heart: 1, butterfly: 1.1, bird: 1.4, mountain: 1.55, leaf: .8 }

export function parseSimpleDrawingRequest(utterance) {
  if (typeof utterance !== 'string') return null
  const text = utterance.trim().replace(/^[Nn]ilo[，,、\s]*/, '').replace(/[。！!？?]+$/g, '').trim()
  const zh = text.match(/^(?:请)?(?:你)?(?:能不能|可以|能)?(?:帮我|给我)?(?:再)?(?:画上|画|加上|加|添上|添|来|换成|换|改成)(?:一下)?(?:一(?:个|颗|朵|棵|条|只|座|片)|个|颗|朵|棵|条|只|座|片)?(?:([红黄蓝绿紫橙粉白黑])色?的?)?(.+?)(?:吧|呀|好吗|好不好|可以吗|吗)?$/)
  const en = text.toLowerCase().match(/^(?:please )?(?:can you |could you )?(?:help me )?(?:draw|add|paint|make|replace it with|change it to)(?: me)? (?:a |an |one |another )?(?:(red|yellow|blue|green|purple|orange|pink|white|black) )?([a-z]+)(?: please)?$/)
  const match = zh ?? en
  if (!match) return null
  const subject = subjects.find(([, , english, aliases]) => zh ? aliases.includes(match[2]) : english === match[2])
  if (!subject) return null
  return { template: subject[0], subject: subject[1], english: subject[2], color: colors[match[1]], replace: /换|改成|replace|change/.test(text) }
}

function oneStar() {
  const points = Array.from({ length: 10 }, (_, i) => {
    const angle = -Math.PI / 2 + i * Math.PI / 5, radius = i % 2 ? .19 : .46
    return [i ? 'L' : 'M', Number((.5 + Math.cos(angle) * radius).toFixed(4)), Number((.5 + Math.sin(angle) * radius).toFixed(4))]
  })
  return { aspect: 1, paths: [[...points, ['Z']]] }
}

function fitsGrid(box, grid) {
  if (!grid.length) return true
  const size = Math.sqrt(grid.length)
  // Leave a little room for the brush; the frontend checks the exact footprint.
  const margin = .012
  for (let y = Math.max(0, Math.floor((box.y - margin) * size)); y <= Math.min(size - 1, Math.floor((box.y + box.height + margin) * size)); y++) {
    for (let x = Math.max(0, Math.floor((box.x - margin) * size)); x <= Math.min(size - 1, Math.floor((box.x + box.width + margin) * size)); x++) {
      if (grid[y * size + x] > .025) return false
    }
  }
  return true
}

export function planSimpleDrawing(context) {
  if (!context.requestDrawing && !context.inferDrawingIntent) return null
  const request = parseSimpleDrawingRequest(context.utterance)
  // Editing a group needs semantic planning so its other members are preserved.
  if (!request || context.currentAdditions?.length) return null
  // On an existing picture, a leaf may be a connected detail of a plant/fruit.
  // Only vision can decide that relationship; never drop the stock icon in a gap.
  if (request.template === 'leaf' && (context.scene?.childBounds || context.scene?.niloBounds || context.lastStroke?.points?.length || context.inkGrid?.some(n => n > .025))) return null
  const en = context.locale === 'en', name = en ? request.english : request.subject
  const current = request.replace ? context.currentProposal : null
  const style = current ?? context.drawingStyle ?? context.lastStroke ?? {}
  const ratio = ratios[request.template], aspect = context.canvasAspect || 1
  let height = .23, width = height * ratio / aspect
  const scale = Math.min(1, .28 / width, .28 / height)
  width *= scale; height *= scale
  const candidates = []
  if (current) candidates.push([current.x + current.width / 2 - width / 2, current.y + current.height / 2 - height / 2])
  // The child named a standalone subject, with no requested spatial relationship.
  // Prefer open space; do not infer a target from an unrelated existing stroke.
  for (const y of [.12, .38, .65]) for (const x of [.38, .08, .68]) candidates.push([x, y])
  const box = candidates.map(([x, y]) => ({ x, y, width, height })).find(box => box.x >= .02 && box.y >= .02 && box.x + width <= .98 && box.y + height <= .98 && fitsGrid(box, context.inkGrid ?? []))
  if (!box) return { status: 'clarify', reply: en ? `Where would you like the ${name}? You can make a little space for it.` : `${name}想放在哪里呢？可以先给它留一小块空白。` }
  const proposal = {
    template: request.template === 'stars' ? 'custom' : request.template,
    ...(request.template === 'stars' ? { subject: name, sketch: oneStar() } : {}),
    ...box, rotation: 0, color: request.color ?? style.color ?? '#5f7065',
    strokeWidth: style.strokeWidth ?? style.brushSize ?? style.width ?? 4,
    brushKind: style.brushKind ?? 'round',
    target: en ? `The ${name} you requested` : `你想要的${name}`,
    relation: en ? 'A preview in open space, awaiting your confirmation' : '先放在空白处预览，等你确认留下',
  }
  return { status: 'ready', reply: en ? `Here's a ${name} to preview. Say “keep it” or tap the button if you like it.` : `先放一个${name}给你看看，喜欢就说“留下来”或点按钮。`, proposal }
}
