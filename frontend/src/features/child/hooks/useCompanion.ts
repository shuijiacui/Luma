import { changeVariant, changePart, objectEditCommand, resolveObject, type EditableNiloObject } from '../companion/objects'
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { t } from '@/i18n'
import { randomId } from '@/lib/randomId'
import { authFetch } from '@/lib/api/authFetch'
import { ApiError } from '@/lib/api/client'
import type { DrawingCanvasHandle } from '../components/DrawingCanvas'
import { getCanvasProvenance } from '../canvasDocument'
import { refineAttachment } from '../companion/attachmentGrounding'
import { encodeOccupancy } from '../../../../../shared/niloOccupancy.mjs'
import { contactSamples } from '../../../../../shared/niloContact.mjs'
import { recordTurnOutcome } from '../companion/diagnostics'
import type { BrushKind } from '../brushes'
import { clarificationReasons, emptyMemory, localCommand, drawingPlanFits, prepareDrawingPlan, prepareTurnProposal, proposalStrokes, readMemory, saveMemory, summarizeStroke, validateProposal, type CompanionReply, type DrawingProposal, type StoryMemory } from '../companion/proposals'

// Reserve space for the child's words even after many Nilo-only turns.
function retainHistory(items: {role:'user'|'assistant';text:string}[]) {
  let child=0,assistant=0
  return [...items].reverse().filter(item=>item.role==='user'?++child<=4:++assistant<=2).reverse()
}
type Phase = 'idle' | 'thinking' | 'sketching' | 'projected'
export interface Projection { pristineEdit?: boolean; editTargetId?: string; deleting?: boolean; id: string; revision: number; proposal: DrawingProposal; additions: DrawingProposal[]; alternatives: DrawingProposal[]; aspect: number; turn?: boolean; durationMs?: number; turnSource?: 'ai' | 'local' }
const planItems = (preview: Projection) => [preview.proposal, ...preview.additions]
function attachmentFits(p: DrawingProposal, canvas: DrawingCanvasHandle, aspect = 1) {
  const tipScale = { round: 1, pencil: .4, marker: 1.8, crayon: 1, star: 2.5 }[p.brushKind ?? 'round']
  if (p.contact) return contactSamples(p.contact, aspect).every(point => canvas.hasInkAt(point, p.strokeWidth * tipScale / 2 + .5))
  if (!p.attachment) return true
  return canvas.hasInkAt(p.attachment, p.strokeWidth * tipScale / 2 + .5)
}
interface Options {
  ownerId: string; artworkId?: string; token?: string; locale: 'zh' | 'en'; enabled: boolean
  allowDrawing?: boolean
  canvas: RefObject<DrawingCanvasHandle | null>
  aspect: () => number
  drawingStyle?: () => { brushKind: BrushKind; color: string; brushSize: number }
  surfaceSize?: () => { width: number; height: number }
  onSpeak: (message: string) => void
  onCommitted: () => void
  onUnavailable?: () => void
}

function requestFailureMessage(error: unknown, timedOut: boolean) {
  if (timedOut || (error instanceof ApiError && error.status === 504)) return '这次连接有点慢，稍后再点我试试。'
  if (error instanceof ApiError) {
    if (error.status === 401 || error.status === 403) return '请大人帮忙重新登录，再来叫我吧。你的画还在这里。'
    if (error.status === 404) return '画画伙伴正在更新，稍后再点我试试。'
    if (error.status === 429) return '现在有点忙，等一小会儿再叫我吧。'
    if (error.status >= 500) return '画画伙伴暂时没连上，稍后再点我试试。'
    return '这次没能把画送过去，再点我试试吧。'
  }
  return '网络暂时没连上，连好后再点我试试吧。'
}

/** Drawing invitations leave undoable ink; explicitly requested previews await acceptance. */
export function useCompanion(options: Options) {
  const ref = useRef(options); ref.current = options
  const [phase, setPhaseState] = useState<Phase>('idle')
  const phaseRef = useRef<Phase>('idle')
  const setPhase = useCallback((next: Phase) => { phaseRef.current = next; setPhaseState(next) }, [])
  const [message, setMessage] = useState('')
  const [projection, setProjectionState] = useState<Projection | null>(null)
  const [objectChoices, setObjectChoices] = useState<{objects:EditableNiloObject[];text:string}|null>(null)
  const current = useRef<Projection | null>(null)
  const [memory, setMemoryState] = useState<StoryMemory>(() => readMemory(options.ownerId, options.artworkId))
  const memoryRef = useRef(memory)
  const usedRecipes = useRef<string[]>([])
  const history = useRef<{ role: 'user' | 'assistant'; text: string }[]>([])
  const generation = useRef(0)
  const active = useRef<AbortController | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const busy = useRef(false)
  const lastRequest = useRef(-Infinity)
  const metrics = useRef({ requests: 0, accepted: 0, rejected: 0, stale: 0, localEdits: 0 })
  const identity = useRef({ ownerId: options.ownerId, artworkId: options.artworkId })

  const remember = useCallback((next: StoryMemory) => {
    memoryRef.current = next; setMemoryState(next)
    const { ownerId, artworkId } = ref.current
    if (artworkId) saveMemory(ownerId, artworkId, next)
  }, [])
  const rememberPlan = useCallback((items: DrawingProposal[], accepted: boolean) => {
    usedRecipes.current=[...usedRecipes.current,...items.flatMap(p=>p.recipeId?[p.recipeId]:[])].slice(-12)
    const previous = memoryRef.current
    const templates = items.filter(item => item.template !== 'custom').map(item => item.template)
    const subjects = items.flatMap(item => item.template === 'custom' && item.subject ? [item.subject] : [])
    // Rejecting a robot must not disable every future custom drawing.
    const recent = (old: string[], next: string[]) => [...new Set([...old, ...next])].slice(-4)
    remember(accepted
      ? { ...previous, recentTemplates: recent(previous.recentTemplates, templates), recentSubjects: recent(previous.recentSubjects, subjects) }
      : { ...previous, rejectedTemplates: recent(previous.rejectedTemplates, templates), rejectedSubjects: recent(previous.rejectedSubjects, subjects) })
  }, [remember])
  const setProjection = useCallback((value: Projection | null) => { current.current = value; setProjectionState(value) }, [])
  const say = useCallback((text: string, speak = true) => {
    setMessage(text)
    if (speak) ref.current.onSpeak(t(text, ref.current.locale))
  }, [])
  const cancel = useCallback((clearMessage = true) => {
    generation.current++
    active.current?.abort(); active.current = null
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    busy.current = false
    ref.current.canvas.current?.previewWithoutObject?.(null)
    setObjectChoices(null)
    setProjection(null); setPhase('idle')
    if (clearMessage) setMessage('')
  }, [setProjection, setPhase])
  useEffect(() => {
    if (!options.enabled) cancel()
  }, [options.enabled, cancel])
  useEffect(() => { if (options.allowDrawing === false) cancel() }, [options.allowDrawing, cancel])
  useEffect(() => {
    const previous = identity.current
    if (previous.ownerId === options.ownerId && previous.artworkId === options.artworkId) return
    identity.current = { ownerId: options.ownerId, artworkId: options.artworkId }
    cancel(); lastRequest.current = -Infinity; usedRecipes.current=[]
    if (!(previous.ownerId === options.ownerId && !previous.artworkId && options.artworkId)) history.current = []
    // Saving a fresh draft assigns its first artwork id; retain that draft's own story.
    if (previous.ownerId === options.ownerId && !previous.artworkId && options.artworkId) remember(memoryRef.current)
    else remember(readMemory(options.ownerId, options.artworkId))
  }, [options.ownerId, options.artworkId, cancel, remember])
  useEffect(() => {
    cancel()
    history.current = []
  }, [options.locale, cancel])
  useEffect(() => {
    const lifecycle = { generation, active, timer }
    const hide = () => { if (document.visibilityState !== 'visible') cancel() }
    document.addEventListener('visibilitychange', hide)
    return () => { document.removeEventListener('visibilitychange', hide); lifecycle.generation.current++; lifecycle.active.current?.abort(); if (lifecycle.timer.current) clearTimeout(lifecycle.timer.current) }
  }, [cancel])

  const valid = useCallback((p: Projection) => {
    const canvas = ref.current.canvas.current
    return !!canvas && canvas.getRevision() === p.revision && (p.pristineEdit || p.deleting || (planItems(p).every(item => attachmentFits(item, canvas, p.aspect))
      && drawingPlanFits(planItems(p), (p.editTargetId ? canvas.getOccupancyWithoutObject?.(p.editTargetId,256) ?? canvas.getOccupancy(256) : canvas.getOccupancy(256)), p.aspect, ref.current.surfaceSize?.(), p.proposal.contact ? canvas.getCollisionPixels?.() : undefined)))
  }, [])
  // Saving exports committed ink only; it never accepts a preview.
  const finishTurn = useCallback(() => true, [])
  const show = useCallback((p: Projection, spoken: string, speak = true) => {
    if (!valid(p)) { cancel(false); say('这里还没有合适的位置。告诉我想加什么，或继续画吧。', speak); return }
    ref.current.canvas.current?.previewWithoutObject?.(p.editTargetId ?? null)
    setProjection(p); setPhase('sketching')
    setMessage(t('我画好一个小主意，先放给你看看。', ref.current.locale))
    const version = generation.current
    timer.current = setTimeout(() => {
      timer.current = null
      if (version !== generation.current || current.current?.id !== p.id) return
      if (!valid(p)) { cancel(false); return }
      setPhase('projected')
      say(spoken || '先看看这个小主意，喜欢的话就留下来。', speak)
    }, window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : 550)
  }, [cancel, say, setPhase, setProjection, valid])

  const drawTurn = useCallback((proposal: DrawingProposal, revision: number, aspect: number, caption = 'Nilo 正在接着画…', turnSource: 'ai' | 'local' = 'ai') => {
    const version = generation.current
    const durationMs = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : 1200
    const turn: Projection = { id: randomId(), revision, proposal, additions: [], alternatives: [], aspect, turn: true, durationMs, turnSource }
    setProjection(turn); setPhase('sketching'); say(caption, false)
    timer.current = setTimeout(() => {
      timer.current = null
      if (generation.current === version && current.current?.id === turn.id) {
        if (!valid(turn)) { cancel(false); return }
        setProjection({...turn,turn:false});setPhase('projected');say('先看看这个小主意，喜欢的话就留下来。',false)
      }
    }, durationMs)
  }, [valid, cancel, say, setPhase, setProjection])

  const ask = useCallback(async (utterance: string, requestDrawing = false, feedback: { speak?: boolean; inferDrawingIntent?: boolean; takeTurn?: boolean; commitDrawing?: boolean } = {}) => {
    const speak = feedback.speak !== false
    const opt = ref.current
    if (!opt.enabled || !utterance.trim() || document.visibilityState === 'hidden') return
    const canvas = opt.canvas.current
    if (!canvas) return
    if (busy.current) cancel(false)
    if (!feedback.takeTurn && Date.now() - lastRequest.current < 1500) { say('我在这里，稍等一下再说吧。', speak); return }
    requestDrawing = requestDrawing && opt.allowDrawing !== false
    const inferDrawingIntent = feedback.inferDrawingIntent === true && opt.allowDrawing !== false
    const canPropose = requestDrawing || inferDrawingIntent
    const takeTurn = feedback.takeTurn === true && requestDrawing
    const pending = current.current
    const sceneDrawing=takeTurn||(requestDrawing&&!pending&&!!canvas.getCompanionScene().childBounds)
    cancel(false)
    const version = generation.current
    const revision = canvas.getRevision()
    const aspect = opt.aspect()
    const controller = new AbortController(); active.current = controller
    // One bounded request per click. Only model-selected drawing data becomes a preview.
    const timeout = setTimeout(() => controller.abort(), takeTurn ? 16000 : 28000)
    const progress = takeTurn ? setTimeout(() => {
      if (version === generation.current && phaseRef.current === 'thinking') say('我在找一个能接上你这幅画的小主意…', false)
    }, 3500) : undefined
    if (takeTurn) recordTurnOutcome('requested')
    busy.current = true; setPhase('thinking'); say(speak ? '我在认真听，也在看看你的画。' : '轮到我啦，我先看看你的画。', false)
    lastRequest.current = Date.now(); metrics.current.requests++
    const userText = utterance.trim().slice(0, 400)
    const previous = history.current.slice(-6)
    const previousTheme = memoryRef.current.theme
    if (!takeTurn) history.current = [...previous, { role: 'user', text: userText }]
    const reportTurnFailure = (reason = 'invalid_response') => {
      if (!takeTurn || version !== generation.current || canvas.getRevision() !== revision
        || !ref.current.enabled || ref.current.allowDrawing === false || document.visibilityState === 'hidden') return false
      recordTurnOutcome(reason)
      history.current = previous
      setPhase('idle')
      say(reason === 'timeout' ? '这次连接有点慢，稍后再点我试试。'
        : reason === 'network_error' || reason === 'provider_error' || reason === 'model_unavailable'
          ? '画画伙伴暂时没连上，稍后再点我试试。'
          : '这次画笔数据没传好，再点我试试。', false)
      return true
    }
    let onAbort: (() => void) | undefined
    try {
      const image = canPropose || /画|这里|这个|这边|picture|drawing|here|this/i.test(utterance) ? canvas.exportCompanionObservation() : null
      const provenance = getCanvasProvenance(canvas.getDocument())
      const focusImage = image && canPropose ? canvas.exportCompanionFocus?.() : null
      const requestBody = { imageBase64: image?.split(',')[1], ...(focusImage ? { focusImage } : {}), context: {
          locale: opt.locale, utterance: userText, requestDrawing, inferDrawingIntent, takeTurn:sceneDrawing, useDrawingKnowledge:sceneDrawing, turnScope: sceneDrawing ? 'scene' : undefined, revision,
          drawingProtocol: sceneDrawing ? 3 : undefined, collisionMap: sceneDrawing ? encodeOccupancy(canvas.getOccupancy(256)) : undefined,
          imageProvenance: provenance === 'unknown' ? 'unknown' : provenance === 'co-created' ? 'composite' : 'child',
          theme: memoryRef.current.theme, history: previous,
          recentTemplates: memoryRef.current.recentTemplates, rejectedTemplates: memoryRef.current.rejectedTemplates,
          recentRecipeIds: [...(canvas.getEditableObjects?.().flatMap(o=>o.proposals.flatMap(p=>p.recipeId?[p.recipeId]:[]))??[]),...usedRecipes.current].slice(-12),
          recentSubjects: memoryRef.current.recentSubjects, rejectedSubjects: memoryRef.current.rejectedSubjects,
          currentProposal: pending?.proposal, currentAdditions: pending?.additions,
          inkGrid: canvas.getInkGrid(8), lastStroke: summarizeStroke(canvas.getLastStroke()), canvasAspect: aspect,
          scene: canvas.getCompanionScene(), canvasSize: opt.surfaceSize?.(),
          drawingStyle: opt.drawingStyle?.(),
        } }
      const aborted = new Promise<never>((_resolve, reject) => {
        onAbort = () => reject(new Error('companion_request_cancelled'))
        controller.signal.addEventListener('abort', onAbort, { once: true })
        if (controller.signal.aborted) onAbort()
      })
      const fetchPlan = () => Promise.race([
        authFetch<CompanionReply>('/nilo/companion', {
          method: 'POST', token: opt.token, signal: controller.signal,
          body: requestBody,
        }), aborted,
      ])
      const result = await fetchPlan()
      if (controller.signal.aborted || version !== generation.current || !ref.current.enabled) { metrics.current.stale++; return }
      if (canvas.getRevision() !== revision) { metrics.current.stale++; setPhase('idle'); say('你又添了新内容，等你画好再叫我吧。', speak); return }
      if (result.status === 'unavailable') {
        // Transport/model failures are not part of the child's story. Stop an
        // ongoing voice session so failures cannot create a spoken retry loop.
        history.current = previous
        ref.current.onUnavailable?.()
        if (reportTurnFailure(result.reason)) return
        setPhase('idle')
        say(typeof result.reply === 'string' && result.reply.trim() ? result.reply.slice(0, 400) : '画画伙伴暂时没连上，稍后再点我试试。', speak)
        return
      }
      // These reason codes and questions are authored by the server after a
      // failed review. Preserve the actionable question instead of replacing
      // every failure with the same generic caption. Unreasoned model prose
      // still cannot pretend that a drawing was committed.
      if (canPropose && !result.proposal && result.status === 'clarify'
        && clarificationReasons.some(reason => reason === result.reason) && result.reply?.trim()) {
        history.current = previous
        if (reportTurnFailure(result.reason)) return
        setPhase('idle'); say(result.reply.slice(0, 400), speak)
        return
      }
      if (typeof result.theme === 'string' && result.theme.trim()) remember({ ...memoryRef.current, theme: result.theme.trim().slice(0, 160) })
      const reply = typeof result.reply === 'string' ? result.reply.slice(0, 400) : t('你先画，我在这里陪你。', opt.locale)
      // Drawing prose is a plan, never an execution receipt or story evidence.
      if (!requestDrawing && !result.proposal) history.current = retainHistory([...history.current, { role: 'assistant' as const, text: reply }])
      const document = canvas.getDocument()
      const prepareCandidate = (raw: unknown) => {
        const p = validateProposal(raw)
        const grounded = p ? result.geometryReviewed ? p : refineAttachment(p, document, aspect) : null
        return grounded && attachmentFits(grounded, canvas, aspect) ? grounded : null
      }
      const proposed = canPropose ? prepareCandidate(result.proposal) : null
      const alternatives = (Array.isArray(result.alternatives) ? result.alternatives : []).map(prepareCandidate).filter((p): p is DrawingProposal => p !== null).slice(0, 1)
      if (takeTurn) {
        const prepared = proposed && !result.additions?.length
          ? result.geometryReviewed
            ? drawingPlanFits([proposed], canvas.getOccupancy(256), aspect, opt.surfaceSize?.(), proposed.contact ? canvas.getCollisionPixels?.() : undefined) ? proposed : null
            : prepareTurnProposal(proposed, canvas.getOccupancy(256), aspect, opt.surfaceSize?.(), proposed.contact ? canvas.getCollisionPixels?.() : undefined) : null
        if (prepared) drawTurn(prepared, revision, aspect)
        else reportTurnFailure(result.proposal ? 'geometry_rejected' : 'invalid_response')
        return
      }
      if (proposed) {
        const rawAdditions = result.additions ?? []
        const additions = Array.isArray(rawAdditions) && rawAdditions.length <= 3 ? rawAdditions.map(prepareCandidate) : [null]
        const occupancy = pending?.editTargetId ? canvas.getOccupancyWithoutObject?.(pending.editTargetId,256) ?? canvas.getOccupancy(256) : canvas.getOccupancy(256)
        const prepared = result.geometryReviewed && !additions.length
          ? drawingPlanFits([proposed],occupancy,aspect,opt.surfaceSize?.(),proposed.contact?canvas.getCollisionPixels?.():undefined)?[proposed]:null
          : additions.every((p): p is DrawingProposal => p !== null)
          ? prepareDrawingPlan([proposed, ...additions], occupancy, aspect, opt.surfaceSize?.(), proposed.contact ? canvas.getCollisionPixels?.() : undefined) : null
        const cached = additions.length === 0 ? alternatives.flatMap(item => prepareDrawingPlan([item], occupancy, aspect, opt.surfaceSize?.(), item.contact ? canvas.getCollisionPixels?.() : undefined) ?? []) : []
        if (prepared) {
          const plan = { editTargetId:pending?.editTargetId, id: randomId(), revision, proposal: prepared[0], additions: prepared.slice(1), alternatives: cached, aspect }
          show(plan, reply, speak)
        }
        else if (cached.length) show({ id: randomId(), revision, proposal: cached[0], additions: [], alternatives: [], aspect }, t('先看看这个小主意，喜欢的话就留下来。', opt.locale), speak)
        else { setPhase('idle'); say('这组小主意放在这里有点挤。你可以让我换个位置，或添别的内容。', speak) }
      } else if (canPropose && result.proposal != null) {
        setPhase('idle'); say(result.proposal.attachment
          ? '这次还没接到你的线条上。你可以告诉我从哪里接。'
          : '这次绘画建议没准备完整。你可以再叫我试一次。', speak)
      } else if (requestDrawing) {
        setPhase('idle'); say('这次还没有画上，我还没找到合适的接法。你可以告诉我从哪里接。', speak)
      } else if (!requestDrawing && pending && valid(pending) && memoryRef.current.theme === previousTheme) {
        // Conversation and praise do not discard or silently replace an existing preview.
        setProjection(pending); setPhase('projected'); say(reply, speak)
      } else { setPhase('idle'); say(reply, speak) }
    } catch (error) {
      if (version === generation.current && ref.current.enabled) {
        history.current = previous
        ref.current.onUnavailable?.()
        if (reportTurnFailure(controller.signal.aborted ? 'timeout' : 'network_error')) return
        setPhase('idle')
        say(requestFailureMessage(error, controller.signal.aborted), speak)
      }
    } finally {
      clearTimeout(timeout)
      clearTimeout(progress)
      if (onAbort) controller.signal.removeEventListener('abort', onAbort)
      if (version === generation.current) { busy.current = false; active.current = null }
    }
  }, [cancel, drawTurn, remember, say, setPhase, setProjection, show, valid])

  const takeTurn = useCallback(() => {
    if (ref.current.allowDrawing === false || phaseRef.current !== 'idle') return
    return ask(t('轮到你了，请接着我的画继续创作。', ref.current.locale), true, { speak: false, takeTurn: true })
  }, [ask])


  const accept = useCallback((feedback: { speak?: boolean } = {}) => {
    const speak = feedback.speak !== false
    if (!ref.current.enabled || ref.current.allowDrawing === false || document.visibilityState === 'hidden') return
    if (phaseRef.current === 'sketching' || phaseRef.current === 'thinking') { if (speak) ref.current.onSpeak(''); return }
    const p = current.current, canvas = ref.current.canvas.current
    if (!p || !canvas) { say('现在没有要留下的投影。', speak); return }
    if (!valid(p)) { cancel(); say('画面已经变了，我们重新看一下吧。', speak); return }
    if(p.pristineEdit){cancel(false);return}
    if (!canvas.commitCompanionStrokes(p.deleting ? [] : planItems(p).flatMap(item => proposalStrokes(item, p.aspect)), p.revision, {proposals:planItems(p),aspect:p.aspect}, p.editTargetId)) {
      cancel(); say('画面已经变了，我们重新看一下吧。', speak); return
    }
    metrics.current.accepted++
    if(p.turnSource)recordTurnOutcome(p.turnSource==='local'?'local_committed':'ai_committed')
    rememberPlan(planItems(p), true)
    history.current = retainHistory([...history.current,{role:'assistant',text:'已落笔：'+planItems(p).map(i=>i.subject??i.template).join('、')}])
    cancel(false); ref.current.onCommitted(); say(p.editTargetId?'修改好啦，接下来轮到你。':'留下啦，接下来轮到你。', speak)
  }, [cancel, rememberPlan, say, valid])
  const dismiss = useCallback((feedback: { speak?: boolean } = {}) => {
    if (current.current) {
      rememberPlan(planItems(current.current), false)
      metrics.current.rejected++
    }
    cancel(false); say('收起来啦，你的画没有改变。', feedback.speak !== false)
  }, [cancel, rememberPlan, say])
  const alternative = useCallback((feedback: { speak?: boolean } = {}) => {
    const speak = feedback.speak !== false
    if (!ref.current.enabled) return
    if (phaseRef.current !== 'projected') { if (speak) ref.current.onSpeak(''); return }
    const p = current.current
    if (!p || !valid(p)) { cancel(); say('画面已经变了，我们重新看一下吧。', speak); return }
    rememberPlan(planItems(p), false)
    metrics.current.rejected++
    const variant = changeVariant(p.proposal)
    if (variant) {
      const next={...p,pristineEdit:false,deleting:false,proposal:variant,id:randomId()}
      if(valid(next)){show(next,'换个画法，看看这个怎么样。',speak);return}
    }
    if (p.alternatives.length) {
      cancel(false)
      show({ ...p, id: randomId(), proposal: p.alternatives[0], additions: [], alternatives: p.alternatives.slice(1) }, t('换个小主意，看看这个怎么样。', ref.current.locale), speak)
    } else void ask(t('请换一个和我的画有关的小主意。', ref.current.locale), true, feedback)
  }, [ask, cancel, rememberPlan, say, show, valid])
  const edit = useCallback((patch: Partial<DrawingProposal>, speak = false) => {
    if (!ref.current.enabled) return
    if (phaseRef.current !== 'projected') { ref.current.onSpeak(''); return }
    const p = current.current
    if (!p || !valid(p)) { cancel(); say('画面已经变了，我们重新看一下吧。'); return }
    const repositioning = ['x', 'y', 'width', 'height'].some(key => key in patch)
    const userPositioned = (item: DrawingProposal): DrawingProposal => {
      if (!repositioning) return item
      const moved = { ...item, contribution: 'object' as const, placementPolicy: 'free' as const }
      delete moved.attachment; delete moved.contact; delete moved.anchor; delete moved.placement
      return moved
    }
    const main = validateProposal({ ...userPositioned(p.proposal), ...patch })
    const sx = main ? main.width / p.proposal.width : 1, sy = main ? main.height / p.proposal.height : 1
    const additions = main ? p.additions.map(item => validateProposal({ ...userPositioned(item),
      x: main.x + (item.x - p.proposal.x) * sx, y: main.y + (item.y - p.proposal.y) * sy,
      width: item.width * sx, height: item.height * sy,
      ...(patch.color !== undefined ? { color: patch.color } : {}),
      ...(patch.brushKind !== undefined ? { brushKind: patch.brushKind } : {}),
      ...(patch.strokeWidth !== undefined ? { strokeWidth: patch.strokeWidth } : {}),
    })) : []
    if (!main || additions.some(item => !item) || !drawingPlanFits([main, ...additions as DrawingProposal[]], (p.editTargetId ? ref.current.canvas.current!.getOccupancyWithoutObject?.(p.editTargetId,256) ?? ref.current.canvas.current!.getOccupancy(256) : ref.current.canvas.current!.getOccupancy(main.contact ? 256 : 64)), p.aspect, ref.current.surfaceSize?.(), main.contact ? ref.current.canvas.current!.getCollisionPixels?.() : undefined)) { say('这个位置会碰到你的画，换个位置试试吧。', speak); if (!speak) ref.current.onSpeak(''); return }
    metrics.current.localEdits++
    ref.current.canvas.current?.previewWithoutObject?.(p.editTargetId??null)
    setProjection({ ...p, pristineEdit:false, deleting:false, id: randomId(), proposal: main, additions: additions as DrawingProposal[], alternatives: [] })
    setPhase('projected'); say('调整好啦，喜欢的话就留下来。', speak)
    if (!speak) ref.current.onSpeak('')
  }, [cancel, say, setPhase, setProjection, valid])
  const forget = useCallback(() => { cancel(); history.current = []; remember(emptyMemory()); say('我们从新的想法开始吧。') }, [cancel, remember, say])
  const beginObjectEdit = useCallback((object: EditableNiloObject) => {
    const canvas=ref.current.canvas.current
    if(!canvas || ref.current.allowDrawing===false || !ref.current.enabled)return
    cancel(false)
    setProjection({id:randomId(),revision:canvas.getRevision(),proposal:object.proposals[0],additions:object.proposals.slice(1),alternatives:[],aspect:object.aspect,editTargetId:object.id,pristineEdit:true})
    say('选好了，可以移动、换色或换个画法。',false)
    setPhase('projected')
  },[cancel,say,setProjection,setPhase])
  const receive = useCallback((text: string, feedback: { speak?: boolean; selectedObjectId?: string } = {}) => {
    if (!ref.current.enabled || document.visibilityState === 'hidden') return
    if(ref.current.allowDrawing===false){void ask(text,false,{...feedback,inferDrawingIntent:true});return}
    const basic=localCommand(text), parsed=objectEditCommand(text)
    if (basic === 'accept') {
      if(/确认移除|confirm removal/i.test(text)&&!current.current?.deleting)return
      accept(feedback); return
    }
    if (basic === 'dismiss' && !/不要那|不要这/.test(text)) { dismiss(feedback); return }
    if (basic === 'stop') { cancel(); ref.current.onSpeak(''); return }
    if (basic === 'forget') { forget(); return }
    if(parsed==='undo'){
      cancel(false)
      const canvas=ref.current.canvas.current
      if(canvas?.getDocument().operations.at(-1)?.type==='edit'&&canvas.undoCompanionStroke()){ref.current.onCommitted();say('恢复刚才的样子啦。',feedback.speak!==false)}
      else say('现在没有可恢复的修改。',feedback.speak!==false)
      return
    }
    const editIntent=!!parsed||/移到|放到|挪到|改成|换成|换一种|变成|变大|变小|靠近|删除|\b(move|make|change|replace|put|remove|delete)\b/i.test(text)
    if(!current.current&&editIntent){
      const objects=ref.current.canvas.current?.getEditableObjects?.()??[]
      const matches=resolveObject(text,objects)
      if(matches.length!==1){setObjectChoices({objects:matches,text});say(matches.length?'想改哪一个？点一下就好。':'还没有可以修改的 Nilo 作品。',feedback.speak!==false);return}
      beginObjectEdit(matches[0])
    }
    if(current.current?.editTargetId&&editIntent&&!feedback.selectedObjectId){
      const objects=ref.current.canvas.current?.getEditableObjects?.()??[]
      const named=resolveObject(text,objects,true)
      if(named.length>1){setObjectChoices({objects:named,text});say('想改哪一个？点一下就好。',feedback.speak!==false);return}
      if(named.length===1&&named[0].id!==current.current.editTargetId)beginObjectEdit(named[0])
    }
    const p=current.current?.proposal
    const command=parsed??basic
    if(p&&command){
      const speak=feedback.speak!==false
      if(command==='alternative'||command==='variant'){alternative(feedback);return}
      if(command==='delete'){
        if(current.current?.editTargetId){ref.current.canvas.current?.previewWithoutObject?.(current.current.editTargetId);setProjection({...current.current,pristineEdit:false,deleting:true});setPhase('projected');say('先收起来，确认后才会移除。',speak)}
        else dismiss(feedback)
        return
      }
      if(typeof command==='object'){
        if('color'in command)edit({color:command.color},speak)
        else {const next=changePart(p,command.part,command.factor);if(next)edit({sketch:next.sketch,x:next.x,y:next.y,width:next.width,height:next.height},speak);else say('这个部位暂时不能单独调整，可以换个画法。',speak)}
      }else if(command==='smaller'||command==='larger'){
        const ratio=command==='smaller'?.85:1.15,items=planItems(current.current!)
        const cx=(Math.min(...items.map(i=>i.x))+Math.max(...items.map(i=>i.x+i.width)))/2
        const cy=(Math.min(...items.map(i=>i.y))+Math.max(...items.map(i=>i.y+i.height)))/2
        edit({width:p.width*ratio,height:p.height*ratio,x:cx+(p.x-cx)*ratio,y:cy+(p.y-cy)*ratio},speak)
      }else if(command==='left'||command==='right')edit({x:p.x+(command==='left'?-.035:.035)},speak)
      else if(command==='up'||command==='down')edit({y:p.y+(command==='up'?-.035:.035)},speak)
      return
    }
    if(basic==='alternative'){alternative(feedback);return}
    const requestsDrawing=/帮.*画|请.*画|你.*画|你来|轮到你|添|加.*(点|个|一)|画.*给我|^(?:请|帮我|给我)?\s*(?:画|绘制).+|\b(draw|add)\b|your turn|help.*(paint|sketch)/i.test(text)
    void ask(text,requestsDrawing||(!!p&&editIntent),{...feedback,inferDrawingIntent:!requestsDrawing&&!editIntent})
  },[accept,alternative,ask,beginObjectEdit,cancel,dismiss,edit,forget,say,setPhase,setProjection])
  const chooseObject=useCallback((id:string)=>{
    const choice=objectChoices?.objects.find(o=>o.id===id),text=objectChoices?.text
    if(!choice)return
    beginObjectEdit(choice)
    if(text)receive(text,{speak:false,selectedObjectId:choice.id})
  },[beginObjectEdit,objectChoices,receive])
  const openObjects=useCallback(()=>{
    const objects=ref.current.canvas.current?.getEditableObjects?.()??[]
    if(objects.length)setObjectChoices({objects,text:''})
    else say('还没有可以修改的 Nilo 作品。',false)
  },[say])

  return { objectChoices, chooseObject, openObjects, phase, message, projection, memory, metrics: metrics.current, ask, takeTurn, receive, accept, dismiss, alternative, edit, cancel, finishTurn, say, forget }
}
