import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { t } from '@/i18n'
import { authFetch } from '@/lib/api/authFetch'
import { ApiError } from '@/lib/api/client'
import type { DrawingCanvasHandle } from '../components/DrawingCanvas'
import { getCanvasProvenance } from '../canvasDocument'
import { refineAttachment } from '../companion/attachmentGrounding'
import type { BrushKind } from '../brushes'
import { emptyMemory, localCommand, drawingPlanFits, prepareDrawingPlan, prepareTurnProposal, proposalStrokes, readMemory, saveMemory, summarizeStroke, validateProposal, type CompanionReply, type DrawingProposal, type StoryMemory } from '../companion/proposals'

type Phase = 'idle' | 'thinking' | 'sketching' | 'projected'
export interface Projection { id: string; revision: number; proposal: DrawingProposal; additions: DrawingProposal[]; alternatives: DrawingProposal[]; aspect: number; turn?: boolean; durationMs?: number }
const planItems = (preview: Projection) => [preview.proposal, ...preview.additions]
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
  const current = useRef<Projection | null>(null)
  const [memory, setMemoryState] = useState<StoryMemory>(() => readMemory(options.ownerId, options.artworkId))
  const memoryRef = useRef(memory)
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
    cancel(); history.current = []; lastRequest.current = -Infinity
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
    return !!canvas && canvas.getRevision() === p.revision && drawingPlanFits(planItems(p), canvas.getOccupancy(64), p.aspect, ref.current.surfaceSize?.())
  }, [])
  const commit = useCallback((p: Projection, speak = false) => {
    const opt = ref.current, canvas = opt.canvas.current
    if (!opt.enabled || opt.allowDrawing === false || !canvas || !valid(p)
      || !canvas.commitCompanionStrokes(planItems(p).flatMap(item => proposalStrokes(item, p.aspect)), p.revision)) {
      cancel(false); say('画面已经变了，我们重新看一下吧。', speak); return false
    }
    metrics.current.accepted++; rememberPlan(planItems(p), true)
    history.current = [...history.current, { role: 'assistant' as const, text: `已落笔：${planItems(p).map(item => item.subject ?? item.relation ?? item.template).join('、')}` }].slice(-6)
    cancel(false); opt.onCommitted(); say('已经画上啦，接着画吧。不喜欢可以撤销我的这一笔。', speak)
    return true
  }, [cancel, rememberPlan, say, valid])
  // Saving is an explicit request to retain an already authorized click turn.
  // It does not accept a preview or await an unfinished network request.
  const finishTurn = useCallback(() => {
    const p = current.current
    if (p?.turn) return commit(p)
    return true
  }, [commit])
  const show = useCallback((p: Projection, spoken: string, speak = true) => {
    if (!valid(p)) { cancel(false); say('这里还没有合适的位置。告诉我想加什么，或继续画吧。', speak); return }
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

  const ask = useCallback(async (utterance: string, requestDrawing = false, feedback: { speak?: boolean; inferDrawingIntent?: boolean; takeTurn?: boolean; commitDrawing?: boolean } = {}) => {
    const speak = feedback.speak !== false
    const opt = ref.current
    if (!opt.enabled || !utterance.trim() || document.visibilityState === 'hidden') return
    const canvas = opt.canvas.current
    if (!canvas) return
    if (busy.current) cancel(false)
    if (Date.now() - lastRequest.current < 1500) { say('我在这里，稍等一下再说吧。', speak); return }
    requestDrawing = requestDrawing && opt.allowDrawing !== false
    const inferDrawingIntent = feedback.inferDrawingIntent === true && opt.allowDrawing !== false
    const canPropose = requestDrawing || inferDrawingIntent
    const takeTurn = feedback.takeTurn === true && requestDrawing
    const pending = current.current
    cancel(false)
    const version = generation.current
    const revision = canvas.getRevision()
    const aspect = opt.aspect()
    const controller = new AbortController(); active.current = controller
    // At most one geometry repair, sharing the snapshot and cancellation signal.
    const timeout = setTimeout(() => controller.abort(), takeTurn ? 52000 : 28000)
    busy.current = true; setPhase('thinking'); say(speak ? '我在认真听，也在看看你的画。' : '轮到我啦，我先看看你的画。', false)
    lastRequest.current = Date.now(); metrics.current.requests++
    const userText = utterance.trim().slice(0, 400)
    const previous = history.current.slice(-6)
    const previousTheme = memoryRef.current.theme
    history.current = [...previous, { role: 'user', text: userText }]
    let onAbort: (() => void) | undefined
    try {
      const image = canPropose || /画|这里|这个|这边|picture|drawing|here|this/i.test(utterance) ? canvas.exportCompanionObservation() : null
      const provenance = getCanvasProvenance(canvas.getDocument())
      const requestBody = { imageBase64: image?.split(',')[1], context: {
          locale: opt.locale, utterance: userText, requestDrawing, inferDrawingIntent, takeTurn, revision,
          imageProvenance: provenance === 'unknown' ? 'unknown' : provenance === 'co-created' ? 'composite' : 'child',
          theme: memoryRef.current.theme, history: previous,
          recentTemplates: memoryRef.current.recentTemplates, rejectedTemplates: memoryRef.current.rejectedTemplates,
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
      const fetchPlan = (renderFeedback?: { reason: 'ink_collision'; proposal: DrawingProposal }) => Promise.race([
        authFetch<CompanionReply>('/nilo/companion', {
          method: 'POST', token: opt.token, signal: controller.signal,
          body: { ...requestBody, context: { ...requestBody.context, ...(renderFeedback ? { renderFeedback } : {}) } },
        }), aborted,
      ])
      let result = await fetchPlan()
      if (takeTurn && !controller.signal.aborted && version === generation.current && canvas.getRevision() === revision
        && result.status !== 'unavailable' && !result.additions?.length) {
        const candidate = validateProposal(result.proposal)
        const grounded = candidate && refineAttachment(candidate, canvas.getDocument(), aspect)
        if (grounded && !prepareTurnProposal(grounded, canvas.getOccupancy(64), aspect, opt.surfaceSize?.())) {
          say('这笔的位置还不合适，我调整一下…', false)
          result = await fetchPlan({ reason: 'ink_collision', proposal: grounded })
        }
      }
      if (controller.signal.aborted || version !== generation.current || !ref.current.enabled) { metrics.current.stale++; return }
      if (canvas.getRevision() !== revision) { metrics.current.stale++; setPhase('idle'); say('你又添了新内容，等你画好再叫我吧。', speak); return }
      if (result.status === 'unavailable') {
        // Transport/model failures are not part of the child's story. Stop an
        // ongoing voice session so failures cannot create a spoken retry loop.
        history.current = previous
        setPhase('idle'); ref.current.onUnavailable?.()
        say(typeof result.reply === 'string' && result.reply.trim() ? result.reply.slice(0, 400) : '画画伙伴暂时没连上，稍后再点我试试。', speak)
        return
      }
      if (typeof result.theme === 'string' && result.theme.trim()) remember({ ...memoryRef.current, theme: result.theme.trim().slice(0, 160) })
      const reply = typeof result.reply === 'string' ? result.reply.slice(0, 400) : t('你先画，我在这里陪你。', opt.locale)
      // Drawing prose is a plan, never an execution receipt or story evidence.
      if (!requestDrawing && !result.proposal) history.current = [...history.current, { role: 'assistant' as const, text: reply }].slice(-6)
      const document = canvas.getDocument()
      const prepareCandidate = (raw: unknown) => {
        const p = validateProposal(raw)
        return p ? refineAttachment(p, document, aspect) : null
      }
      const proposed = canPropose ? prepareCandidate(result.proposal) : null
      const alternatives = (Array.isArray(result.alternatives) ? result.alternatives : []).map(prepareCandidate).filter((p): p is DrawingProposal => p !== null).slice(0, 1)
      if (proposed) {
        if (takeTurn) {
          // This click permits only one contribution, never a hidden group.
          if (result.additions?.length) { setPhase('idle'); say('这次想法太多了，再点我一次，我只接一小笔。', false); return }
          const prepared = prepareTurnProposal(proposed, canvas.getOccupancy(64), aspect, opt.surfaceSize?.())
          if (!prepared) { setPhase('idle'); say('这次还没有画上，我还没找到合适的接法。你可以告诉我从哪里接。', false); return }
          // Show the actual paths being drawn, then commit the same contribution
          // atomically. Starting a child stroke cancels this temporary layer.
          const durationMs = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : 1200
          const turn: Projection = { id: crypto.randomUUID(), revision, proposal: prepared, additions: [], alternatives: [], aspect, turn: true, durationMs }
          setProjection(turn); setPhase('sketching'); say('Nilo 正在接着画…', false)
          timer.current = setTimeout(() => {
            timer.current = null
            if (generation.current !== version || current.current?.id !== turn.id) return
            commit(turn)
          }, durationMs)
          return
        }
        const rawAdditions = result.additions ?? []
        const additions = Array.isArray(rawAdditions) && rawAdditions.length <= 3 ? rawAdditions.map(prepareCandidate) : [null]
        const occupancy = canvas.getOccupancy(64)
        const prepared = additions.every((p): p is DrawingProposal => p !== null)
          ? prepareDrawingPlan([proposed, ...additions], occupancy, aspect, opt.surfaceSize?.()) : null
        const cached = additions.length === 0 ? alternatives.flatMap(item => prepareDrawingPlan([item], occupancy, aspect, opt.surfaceSize?.()) ?? []) : []
        if (prepared) {
          const plan = { id: crypto.randomUUID(), revision, proposal: prepared[0], additions: prepared.slice(1), alternatives: cached, aspect }
          if (feedback.commitDrawing) commit(plan, speak)
          else show(plan, reply, speak)
        }
        else if (cached.length) show({ id: crypto.randomUUID(), revision, proposal: cached[0], additions: [], alternatives: [], aspect }, t('先看看这个小主意，喜欢的话就留下来。', opt.locale), speak)
        else { setPhase('idle'); say('这组小主意放在这里有点挤。你可以让我换个位置，或添别的内容。', speak) }
      } else if (canPropose && result.proposal != null) {
        setPhase('idle'); say('这次绘画建议没准备完整。你可以再叫我试一次。', speak)
      } else if (requestDrawing) {
        setPhase('idle'); say('这次还没有画上，我还没找到合适的接法。你可以告诉我从哪里接。', speak)
      } else if (!requestDrawing && pending && valid(pending) && memoryRef.current.theme === previousTheme) {
        // Conversation and praise do not discard or silently replace an existing preview.
        setProjection(pending); setPhase('projected'); say(reply, speak)
      } else { setPhase('idle'); say(reply, speak) }
    } catch (error) {
      if (version === generation.current && ref.current.enabled) {
        history.current = previous
        setPhase('idle'); ref.current.onUnavailable?.()
        say(requestFailureMessage(error, controller.signal.aborted), speak)
      }
    } finally {
      clearTimeout(timeout)
      if (onAbort) controller.signal.removeEventListener('abort', onAbort)
      if (version === generation.current) { busy.current = false; active.current = null }
    }
  }, [cancel, commit, remember, say, setPhase, setProjection, show, valid])

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
    if (!canvas.commitCompanionStrokes(planItems(p).flatMap(item => proposalStrokes(item, p.aspect)), p.revision)) {
      cancel(); say('画面已经变了，我们重新看一下吧。', speak); return
    }
    metrics.current.accepted++
    rememberPlan(planItems(p), true)
    cancel(false); ref.current.onCommitted(); say('留下啦，接下来轮到你。', speak)
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
    if (p.alternatives.length) {
      cancel(false)
      show({ ...p, id: crypto.randomUUID(), proposal: p.alternatives[0], additions: [], alternatives: p.alternatives.slice(1) }, t('换个小主意，看看这个怎么样。', ref.current.locale), speak)
    } else void ask(t('请换一个和我的画有关的小主意。', ref.current.locale), true, feedback)
  }, [ask, cancel, rememberPlan, say, show, valid])
  const edit = useCallback((patch: Partial<DrawingProposal>, speak = false) => {
    if (!ref.current.enabled) return
    if (phaseRef.current !== 'projected') { ref.current.onSpeak(''); return }
    const p = current.current
    if (!p || !valid(p)) { cancel(); say('画面已经变了，我们重新看一下吧。'); return }
    const main = validateProposal({ ...p.proposal, ...patch })
    const sx = main ? main.width / p.proposal.width : 1, sy = main ? main.height / p.proposal.height : 1
    const additions = main ? p.additions.map(item => validateProposal({ ...item,
      x: main.x + (item.x - p.proposal.x) * sx, y: main.y + (item.y - p.proposal.y) * sy,
      width: item.width * sx, height: item.height * sy,
      ...(patch.color !== undefined ? { color: patch.color } : {}),
      ...(patch.brushKind !== undefined ? { brushKind: patch.brushKind } : {}),
      ...(patch.strokeWidth !== undefined ? { strokeWidth: patch.strokeWidth } : {}),
    })) : []
    if (!main || additions.some(item => !item) || !drawingPlanFits([main, ...additions as DrawingProposal[]], ref.current.canvas.current!.getOccupancy(64), p.aspect, ref.current.surfaceSize?.())) { say('这个位置会碰到你的画，换个位置试试吧。', speak); if (!speak) ref.current.onSpeak(''); return }
    metrics.current.localEdits++
    setProjection({ ...p, id: crypto.randomUUID(), proposal: main, additions: additions as DrawingProposal[], alternatives: [] })
    setPhase('projected'); say('调整好啦，喜欢的话就留下来。', speak)
    if (!speak) ref.current.onSpeak('')
  }, [cancel, say, setPhase, setProjection, valid])
  const forget = useCallback(() => { cancel(); history.current = []; remember(emptyMemory()); say('我们从新的想法开始吧。') }, [cancel, remember, say])
  const receive = useCallback((text: string, feedback: { speak?: boolean } = {}) => {
    if (!ref.current.enabled || document.visibilityState === 'hidden') return
    const command = localCommand(text)
    if (command === 'accept') { accept(feedback); return }
    if (command === 'dismiss') { dismiss(feedback); return }
    if (command === 'alternative') { alternative(feedback); return }
    if (command === 'stop') { cancel(); ref.current.onSpeak(''); return }
    if (command === 'forget') { forget(); return }
    const p = current.current?.proposal
    if (command && !p) { say('现在没有要留下的投影。'); return }
    if (p && command) {
      const speak = feedback.speak !== false
      if (typeof command === 'object') edit({ color: command.color }, speak)
      else if (command === 'smaller' || command === 'larger') {
        const ratio = command === 'smaller' ? .85 : 1.15
        const items = planItems(current.current!)
        const cx = (Math.min(...items.map(item => item.x)) + Math.max(...items.map(item => item.x + item.width))) / 2
        const cy = (Math.min(...items.map(item => item.y)) + Math.max(...items.map(item => item.y + item.height))) / 2
        edit({ width: p.width * ratio, height: p.height * ratio, x: cx + (p.x - cx) * ratio, y: cy + (p.y - cy) * ratio }, speak)
      } else if (command === 'left' || command === 'right') edit({ x: p.x + (command === 'left' ? -.035 : .035) }, speak)
      else if (command === 'up' || command === 'down') edit({ y: p.y + (command === 'up' ? -.035 : .035) }, speak)
      return
    }
    const requestsDrawing = /帮.*画|请.*画|你.*画|你来|轮到你|添|加.*(点|个|一)|画.*给我|^(?:请|帮我|给我)?\s*(?:画|绘制).+|\b(draw|add)\b|your turn|help.*(paint|sketch)/i.test(text)
    const editsPreview = !!p && /放到|移到|挪到|改成|换成|换一|变成|变大|变小|靠近|\b(move|make|change|replace|put)\b/i.test(text)
    const requestDrawing = requestsDrawing || editsPreview
    // The fast path is only a hint. Natural requests that miss it still reach
    // semantic intent detection in the same model call, with a canvas to ground them.
    const previewRequested = /预览|先.*(?:看看|看一下)|给我看看|\bpreview\b|show me first/i.test(text)
    void ask(text, requestDrawing, { ...feedback, inferDrawingIntent: !requestDrawing, commitDrawing: !previewRequested && !current.current })
  }, [accept, alternative, ask, cancel, dismiss, edit, forget, say])
  return { phase, message, projection, memory, metrics: metrics.current, ask, takeTurn, receive, accept, dismiss, alternative, edit, cancel, finishTurn, say, forget }
}
