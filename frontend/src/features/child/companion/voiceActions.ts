import { validateVoiceActions, type VoiceAction } from '../../../../../shared/niloVoiceActions.mjs'
import { changePart, changeVariant, objectEditCommand } from './objects'
import { localCommand, validateProposal, type DrawingProposal } from './proposals'

// A fast path must consume the WHOLE sentence. Anything compound, corrective or
// relational goes to the language model rather than executing its first keyword.
export function simpleVoiceActions(text: string): VoiceAction[] | null {
  // A question mark may be ASR punctuation or a request for an opinion. Let the
  // whole-utterance interpreter decide instead of stripping it into a command.
  if(/[?？]/.test(text))return null
  const s = text.trim().toLowerCase().replace(/[。！!?.？]$/u, '')
  const color = '(?:红|蓝|绿|黄|紫|粉|橙|黑)(?:色)?'
  const target = '(?:把)?[^，,；;。.!?\\s再然后并且不要别和或与及也都又]{0,16}'
  const simple = new RegExp(`^(?:${color}|${target}(?:改成|换成|变成)${color}|(?:刚才那个|刚才的|上一个|那个|这只|那只)?(?:缩小|放大|小一点|大一点)|(?:往|向)[左右上下](?:移)?(?:一点)?|[左右上下]移(?:一点)?|(?:删除|删掉|去掉)[^，,；;再然后并且不别和或与及也都又]{1,16}|不要[那这][^，,；;再然后并且不别和或与及也都又]{1,12}了|(?:red|blue|green|yellow|purple|pink|orange|black)|(?:smaller|larger|bigger|left|right|up|down)|move (?:it )?(?:left|right|up|down)|(?:delete|remove) (?:it|that)|换个画法)$`)
  const basic=localCommand(s)
  if (!simple.test(s) && !(basic && (typeof basic==='object'||['smaller','larger','left','right','up','down'].includes(basic)))) return null
  const requestedColor=s.match(/(?:改成|换成|变成)((?:红|蓝|绿|黄|紫|粉|橙|黑)(?:色)?)$/)?.[1]
  const cmd = (requestedColor?objectEditCommand(`改成${requestedColor}`):objectEditCommand(s)) ?? basic ?? objectEditCommand(`改成${s}`)
  if (cmd && typeof cmd === 'object' && 'color' in cmd) return [{type:'color',value:cmd.color}]
  if (cmd === 'smaller' || cmd === 'larger') return [{type:'scale',factor:cmd === 'smaller' ? .85 : 1.15}]
  if (cmd === 'left' || cmd === 'right') return [{type:'move',dx:cmd === 'left' ? -.035 : .035,dy:0}]
  if (cmd === 'up' || cmd === 'down') return [{type:'move',dx:0,dy:cmd === 'up' ? -.035 : .035}]
  if (cmd === 'delete') return [{type:'delete'}]
  if (s === '换个画法') return [{type:'variant'}]
  return null
}

export function isVoiceEditRequest(text: string) {
  return !!simpleVoiceActions(text) || /移|挪|放到|改|换|变|缩|放大|小一点|大一点|靠近|删|去掉|拿掉|不要|不是|别|尾巴|翅膀|船帆|这个|那个|这只|那只|\b(move|make|change|replace|put|remove|delete|smaller|larger|bigger|not|don't|instead|tail|wing|sail)\b/i.test(text)
}

/** Asking for an opinion is not permission to change the child's picture. */
export function isVoiceSuggestion(text: string) {
  return /会不会.*(?:更好|好看)|(?:你觉得|你认为).*(?:好|颜色|蓝|红|绿)|(?:what do you think|would .* look better|which colou?r .* better)/i.test(text)
}

/** Requesting another object is a new guide, not an edit to an unnamed stroke. */
export function isNewDrawingRequest(text: string) {
  return /^(?:请|你|帮我|给我|再|\s)*(?:画|绘制|添|加|换|来)(?:一个|一只|一朵|一棵|一颗|一幅|个|只|朵|棵|颗)(?!画法|造型|姿势).+/u.test(text.trim())
    || /^(?:please\s+)?(?:draw|paint|add)\s+(?:another|a|an)\s+/i.test(text.trim())
}

export function proposalBounds(items: DrawingProposal[]) {
  const x=Math.min(...items.map(p=>p.x)), y=Math.min(...items.map(p=>p.y))
  return {x,y,width:Math.max(...items.map(p=>p.x+p.width))-x,height:Math.max(...items.map(p=>p.y+p.height))-y}
}

export function applyVoiceActions(source: DrawingProposal[], input: VoiceAction[], referenceBounds?: {x:number;y:number;width:number;height:number}):
  {ok:true;items:DrawingProposal[];deleting:boolean}|{ok:false;reason:'unsupported'|'geometry'} {
  const actions=validateVoiceActions(input)
  if(!actions||!source.length)return {ok:false,reason:'unsupported'}
  let items=structuredClone(source)
  let frame=referenceBounds?{...referenceBounds}:undefined
  for(const action of actions){
    if(action.type==='delete')return {ok:true,items,deleting:true}
    if(action.type==='color'){items=items.map(p=>({...p,color:action.value}));continue}
    if(action.type==='variant'||action.type==='part'){
      if(items.length!==1)return {ok:false,reason:'unsupported'}
      const next=action.type==='variant'?changeVariant(items[0]):changePart(items[0],action.part,action.factor)
      if(!next)return {ok:false,reason:'unsupported'}
      items=[next];continue
    }
    const b=frame??proposalBounds(items),cx=b.x+b.width/2,cy=b.y+b.height/2
    const factor=action.type==='scale'?action.factor:1
    const dx=action.type==='move'?action.dx:action.type==='place'?action.x-cx:0
    const dy=action.type==='move'?action.dy:action.type==='place'?action.y-cy:0
    items=items.map(p=>{
      const next:DrawingProposal={...p,x:cx+(p.x-cx)*factor+dx,y:cy+(p.y-cy)*factor+dy,width:p.width*factor,height:p.height*factor,contribution:'object',placementPolicy:'free'}
      delete next.attachment;delete next.contact;delete next.anchor;delete next.placement
      return next
    })
    if(frame)frame={x:cx+(frame.x-cx)*factor+dx,y:cy+(frame.y-cy)*factor+dy,width:frame.width*factor,height:frame.height*factor}
  }
  // Validate the complete result before exposing any change. Never clamp one
  // operation independently: doing so can distort a compound object.
  if(items.some(p=>p.x<0||p.y<0||p.x+p.width>1||p.y+p.height>1||!validateProposal(p)))return {ok:false,reason:'geometry'}
  return {ok:true,items,deleting:false}
}
