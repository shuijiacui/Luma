import { applyVoiceActions, simpleVoiceActions, isVoiceEditRequest, isVoiceSuggestion, isNewDrawingRequest, proposalBounds } from '../companion/voiceActions'
import { hasUnresolvedEditName, namedEditTargets, type CanvasEditTarget, type CompanionEditChoice } from '../companion/editTargets'
import { newVoiceTrace, recordVoiceEvent } from '../companion/voiceDiagnostics'
import { validateAssistedActions, validateVoicePlan, type VoicePlan } from '../../../../../shared/niloVoiceActions.mjs'
import { changeVariant, objectEditCommand, resolveObject, type EditableNiloObject } from '../companion/objects'
import { fitVariantToFrame, variantSubjectName } from '../../../../../shared/niloVariants.mjs'
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
import { placementFits } from '../../../../../shared/niloCollision.mjs'
import type { TracingGuide } from '../companion/tracingGuide'
import { createReplyPicker, tracingReply } from '../companion/replies'
import { refreshMaterialCuration } from '../companion/materialCuration'
import { createMaterialProposal, getMaterial, listMaterialSubjects, materialSubjectForProposal, rankMaterials, type MaterialSubject } from '../../../../../shared/niloMaterialLibrary.mjs'
import { appendMaterialChoice, preferredMaterials, readMaterialChoices, saveMaterialChoices } from '../companion/materialPreferences'
import { recordTurnOutcome } from '../companion/diagnostics'
import type { BrushKind } from '../brushes'
import { clarificationReasons, emptyMemory, localCommand, drawingPlanFits, prepareDrawingPlan, prepareTurnProposal, proposalStrokes, readMemory, saveMemory, summarizeStroke, validateProposal, type CompanionReply, type DrawingProposal, type StoryMemory } from '../companion/proposals'

// Reserve space for the child's words even after many Nilo-only turns.
function retainHistory(items: {role:'user'|'assistant';text:string}[]) {
  let child=0,assistant=0
  return [...items].reverse().filter(item=>item.role==='user'?++child<=4:++assistant<=2).reverse()
}
type Phase = 'idle' | 'thinking' | 'sketching' | 'projected'
interface VoiceFeedback { speak?: boolean; selectedObjectId?: string; traceId?: string; alternatives?: string[] }
export interface Projection { tracing?: boolean; pristineEdit?: boolean; editTargetId?: string; deleting?: boolean; id: string; revision: number; proposal: DrawingProposal; additions: DrawingProposal[]; alternatives: DrawingProposal[]; aspect: number; turn?: boolean; durationMs?: number; turnSource?: 'ai' | 'local' }
const planItems = (preview: Projection) => [preview.proposal, ...preview.additions]
function attachmentFits(p: DrawingProposal, canvas: DrawingCanvasHandle, aspect = 1) {
  const tipScale = { round: 1, pencil: .4, marker: 1.8, crayon: 1, star: 2.5 }[p.brushKind ?? 'round']
  if (p.contact) return contactSamples(p.contact, aspect).every(point => canvas.hasInkAt(point, p.strokeWidth * tipScale / 2 + .5))
  if (!p.attachment) return true
  return canvas.hasInkAt(p.attachment, p.strokeWidth * tipScale / 2 + .5)
}
interface Options {
  ownerId: string; artworkId?: string; token?: string; locale: 'zh' | 'en'; enabled: boolean
  /** Only an authenticated child's account ID may persist chosen drawing styles. */
  preferenceChildId?: string
  allowDrawing?: boolean
  /** Default to guides; false retains the previous ink-preview workflow. */
  tracing?: boolean
  initialGuide?: TracingGuide
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

/** New ideas stay as tracing guides. Only edits to existing ink need confirmation. */
export function useCompanion(options: Options) {
  const ref = useRef(options); ref.current = options
  const [phase, setPhaseState] = useState<Phase>('idle')
  const phaseRef = useRef<Phase>('idle')
  const setPhase = useCallback((next: Phase) => { phaseRef.current = next; setPhaseState(next) }, [])
  const [message, setMessage] = useState('')
  const [projection, setProjectionState] = useState<Projection | null>(() => options.initialGuide
    ? { ...options.initialGuide, id: options.initialGuide.id ?? randomId(), revision: 0, alternatives: [], tracing: true } : null)
  const [objectChoices, setObjectChoices] = useState<{objects:CompanionEditChoice[];text:string}|null>(null)
  const [materialPicker, setMaterialPicker] = useState<{ guideId: string; subject: string | null; subjects: MaterialSubject[]; busy?: boolean; error?: string } | null>(null)
  const [materialChoices, setMaterialChoices] = useState(() => readMaterialChoices(options.preferenceChildId))
  const choicesRef = useRef(materialChoices)
  const materialRequest = useRef(0)
  const closeMaterialPicker = useCallback(() => { materialRequest.current++; setMaterialPicker(null) }, [])
  const current = useRef<Projection | null>(projection)
  const [memory, setMemoryState] = useState<StoryMemory>(() => readMemory(options.ownerId, options.artworkId))
  const memoryRef = useRef(memory)
  const usedRecipes = useRef<string[]>([])
  const history = useRef<{ role: 'user' | 'assistant'; text: string }[]>([])
  const recentReplies = useRef<string[]>([])
  const pickReply = useRef(createReplyPicker())
  const generation = useRef(0)
  const active = useRef<AbortController | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const busy = useRef(false)
  const lastRequest = useRef(-Infinity)
  const voiceTarget = useRef<string | null>(null)
  const awaitingSelection = useRef<{ text: string; feedback: VoiceFeedback } | null>(null)
  const metrics = useRef({ requests: 0, accepted: 0, rejected: 0, stale: 0, localEdits: 0 })
  const identity = useRef({ ownerId: options.ownerId, artworkId: options.artworkId })
  useEffect(() => {
    if (!options.enabled) return
    const refresh = () => { if (document.visibilityState === 'visible') void refreshMaterialCuration() }
    refresh()
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [options.enabled])

  const remember = useCallback((next: StoryMemory) => {
    memoryRef.current = next; setMemoryState(next)
    const { ownerId, artworkId } = ref.current
    if (artworkId) saveMemory(ownerId, artworkId, next)
  }, [])
  const rememberPlan = useCallback((items: DrawingProposal[], accepted: boolean) => {
    usedRecipes.current=[...usedRecipes.current,...items.flatMap(p=>p.illustrationId?[p.illustrationId]:p.recipeId?[p.recipeId]:[])].slice(-12)
    const previous = memoryRef.current
    const templates = items.filter(item => item.template !== 'custom' && item.template !== 'illustration').map(item => item.template)
    const subjects = items.flatMap(item => (item.template === 'custom' || item.template === 'illustration') && item.subject ? [item.subject] : [])
    // Rejecting a robot must not disable every future custom drawing.
    const recent = (old: string[], next: string[]) => [...new Set([...old, ...next])].slice(-4)
    remember(accepted
      ? { ...previous, recentTemplates: recent(previous.recentTemplates, templates), recentSubjects: recent(previous.recentSubjects, subjects) }
      : { ...previous, rejectedTemplates: recent(previous.rejectedTemplates, templates), rejectedSubjects: recent(previous.rejectedSubjects, subjects) })
  }, [remember])
  const setProjection = useCallback((value: Projection | null) => { current.current = value; setProjectionState(value); closeMaterialPicker() }, [closeMaterialPicker])
  const say = useCallback((text: string, speak = true) => {
    const localized = t(text, ref.current.locale)
    setMessage(localized)
    if (speak) {
      // Wording memory only; never evidence of a child's story or authored marks.
      recentReplies.current = [...recentReplies.current, localized].slice(-3)
      ref.current.onSpeak(localized)
    }
  }, [])
  const cancel = useCallback((clearMessage = true, preserveGuide = false) => {
    const guide = preserveGuide && current.current?.tracing ? { ...current.current, turn: false } : null
    generation.current++
    active.current?.abort(); active.current = null
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    busy.current = false
    awaitingSelection.current = null
    ref.current.canvas.current?.previewWithoutObject?.(null)
    setObjectChoices(null)
    setProjection(guide); setPhase(guide ? 'projected' : 'idle')
    if (clearMessage) setMessage('')
  }, [setProjection, setPhase])
  const interrupt = useCallback(() => cancel(true, true), [cancel])
  useEffect(() => {
    if (!options.enabled) interrupt()
  }, [options.enabled, interrupt])
  useEffect(() => { if (options.allowDrawing === false) cancel() }, [options.allowDrawing, cancel])
  useEffect(() => {
    const previous = identity.current
    if (previous.ownerId === options.ownerId && previous.artworkId === options.artworkId) return
    identity.current = { ownerId: options.ownerId, artworkId: options.artworkId }
    cancel(true, previous.ownerId === options.ownerId && !previous.artworkId && !!options.artworkId); lastRequest.current = -Infinity; usedRecipes.current=[]; voiceTarget.current=null
    if (!(previous.ownerId === options.ownerId && !previous.artworkId && options.artworkId)) {
      history.current = []; recentReplies.current = []; pickReply.current = createReplyPicker()
    }
    // Saving a fresh draft assigns its first artwork id; retain that draft's own story.
    if (previous.ownerId === options.ownerId && !previous.artworkId && options.artworkId) remember(memoryRef.current)
    else remember(readMemory(options.ownerId, options.artworkId))
  }, [options.ownerId, options.artworkId, cancel, remember])
  useEffect(() => {
    const choices = readMaterialChoices(options.preferenceChildId)
    choicesRef.current = choices; setMaterialChoices(choices); closeMaterialPicker()
  }, [options.ownerId, options.preferenceChildId, closeMaterialPicker])
  useEffect(() => {
    interrupt()
    history.current = []
    recentReplies.current = []
    pickReply.current = createReplyPicker()
  }, [options.locale, interrupt])
  useEffect(() => {
    const lifecycle = { generation, active, timer }
    const hide = () => { if (document.visibilityState !== 'visible') interrupt() }
    document.addEventListener('visibilitychange', hide)
    return () => { document.removeEventListener('visibilitychange', hide); lifecycle.generation.current++; lifecycle.active.current?.abort(); if (lifecycle.timer.current) clearTimeout(lifecycle.timer.current) }
  }, [interrupt])

  const valid = useCallback((p: Projection) => {
    const canvas = ref.current.canvas.current
    if (p.tracing) return !!canvas && planItems(p).every(item => !!validateProposal(item) && placementFits(item, p.aspect, ref.current.surfaceSize?.()))
    return !!canvas && canvas.getRevision() === p.revision && (p.pristineEdit || p.deleting || (planItems(p).every(item => attachmentFits(item, canvas, p.aspect))
      && drawingPlanFits(planItems(p), (p.editTargetId ? canvas.getOccupancyWithoutObject?.(p.editTargetId,256) ?? canvas.getOccupancy(256) : canvas.getOccupancy(256)), p.aspect, ref.current.surfaceSize?.(), p.proposal.contact ? canvas.getCollisionPixels?.() : undefined)))
  }, [])
  // Saving exports committed ink only; it never accepts a preview.
  const finishTurn = useCallback(() => true, [])
  const show = useCallback((p: Projection, spoken: string, speak = true) => {
    const hasIllustration = planItems(p).some(item => item.template === 'illustration')
    if (hasIllustration) p = { ...p, tracing: true, editTargetId: undefined, pristineEdit: false, deleting: false }
    if (!valid(p)) { cancel(false); say('这里还没有合适的位置。告诉我想加什么，或继续画吧。', speak); return }
    ref.current.canvas.current?.previewWithoutObject?.(p.editTargetId ?? null)
    if (hasIllustration || ref.current.canvas.current?.getEditableTargets || (!p.editTargetId && ref.current.tracing !== false)) {
      setProjection({ ...p, tracing: true }); setPhase('projected')
      rememberPlan(planItems(p), true); say(tracingReply(t(spoken, ref.current.locale), ref.current.locale, pickReply.current, hasIllustration), speak)
      return
    }
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
  }, [cancel, rememberPlan, say, setPhase, setProjection, valid])

  const drawTurn = useCallback((proposal: DrawingProposal, revision: number, aspect: number, spoken: string, turnSource: 'ai' | 'local' = 'ai', speak = true) => {
    if (proposal.template === 'illustration') {
      show({ id: randomId(), revision, proposal, additions: [], alternatives: [], aspect, tracing: true }, spoken, speak)
      return
    }
    const version = generation.current
    const durationMs = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : 1200
    const turn: Projection = { id: randomId(), revision, proposal, additions: [], alternatives: [], aspect, turn: true, durationMs, turnSource, tracing: !!ref.current.canvas.current?.getEditableTargets || ref.current.tracing !== false }
    if (turn.tracing) rememberPlan([proposal], true)
    setProjection(turn); setPhase('sketching'); say('Nilo 正在接着画…', false)
    timer.current = setTimeout(() => {
      timer.current = null
      if (generation.current === version && current.current?.id === turn.id) {
        if (!valid(turn)) { cancel(false); return }
        setProjection({...turn,turn:false});setPhase('projected');say(turn.tracing
          ? tracingReply(t(spoken, ref.current.locale), ref.current.locale, pickReply.current)
          : spoken || '先看看这个小主意，喜欢的话就留下来。',speak)
      }
    }, durationMs)
  }, [valid, cancel, rememberPlan, say, setPhase, setProjection, show])

  const ask = useCallback(async (utterance: string, requestDrawing = false, feedback: { alternatives?: string[]; speak?: boolean; inferDrawingIntent?: boolean; takeTurn?: boolean; commitDrawing?: boolean; voiceEdit?: boolean; variantOnly?: boolean; selectedDrawing?: CanvasEditTarget } = {}) => {
    const speak = feedback.speak !== false
    const opt = ref.current
    if (!opt.enabled || !utterance.trim() || document.visibilityState === 'hidden') return
    const canvas = opt.canvas.current
    if (!canvas) return
    if (busy.current) cancel(false, true)
    if (!feedback.takeTurn && !feedback.voiceEdit && Date.now() - lastRequest.current < 1500) { say('我在这里，稍等一下再说吧。', speak); return }
    requestDrawing = requestDrawing && opt.allowDrawing !== false
    const inferDrawingIntent = feedback.inferDrawingIntent === true && opt.allowDrawing !== false
    const canPropose = requestDrawing || inferDrawingIntent
    const takeTurn = feedback.takeTurn === true && requestDrawing
    const pending = current.current
    const variantOnly = feedback.variantOnly === true && requestDrawing && !!pending
    const sceneDrawing=!variantOnly&&(takeTurn||(requestDrawing&&!pending&&!!canvas.getCompanionScene().childBounds&&!/一半|半个|半边|左上角|右上角|左下角|右下角|\bhalf\b|(?:top|bottom) (?:left|right)/i.test(utterance)))
    cancel(false, true)
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
    if (!takeTurn && !variantOnly) history.current = [...previous, { role: 'user', text: userText }]
    const reportTurnFailure = (reason = 'invalid_response') => {
      if (!takeTurn || version !== generation.current || canvas.getRevision() !== revision
        || !ref.current.enabled || ref.current.allowDrawing === false || document.visibilityState === 'hidden') return false
      recordTurnOutcome(reason)
      history.current = previous
      setPhase('idle')
      say(reason === 'timeout' ? '这次连接有点慢，稍后再点我试试。'
        : reason === 'network_error' || reason === 'provider_error' || reason === 'model_unavailable'
          ? '画画伙伴暂时没连上，稍后再点我试试。'
          : '这次画笔数据没传好，再点我试试。', speak)
      return true
    }
    let onAbort: (() => void) | undefined
    try {
      const image = canPropose || /画|这里|这个|这边|picture|drawing|here|this/i.test(utterance) ? canvas.exportCompanionObservation() : null
      const provenance = getCanvasProvenance(canvas.getDocument())
      const focusImage = image && canPropose ? canvas.exportCompanionFocus?.() : null
      const requestBody = { imageBase64: image?.split(',')[1], ...(focusImage ? { focusImage } : {}), context: {
          locale: opt.locale, utterance: userText, asrAlternatives: feedback.alternatives, requestDrawing, inferDrawingIntent, tracingGuide: opt.tracing !== false && !pending?.editTargetId, takeTurn:sceneDrawing, useDrawingKnowledge:sceneDrawing, turnScope: sceneDrawing ? 'scene' : undefined, revision,
          ...(variantOnly ? { variantOnly: true } : {}),
          drawingProtocol: sceneDrawing ? 3 : undefined, collisionMap: sceneDrawing ? encodeOccupancy(canvas.getOccupancy(256)) : undefined,
          imageProvenance: provenance === 'unknown' ? 'unknown' : provenance === 'co-created' ? 'composite' : 'child',
          theme: memoryRef.current.theme, history: previous, recentReplies: recentReplies.current,
          recentTemplates: memoryRef.current.recentTemplates, rejectedTemplates: memoryRef.current.rejectedTemplates,
          recentRecipeIds: [...(canvas.getEditableObjects?.().flatMap(o=>o.proposals.flatMap(p=>p.recipeId?[p.recipeId]:[]))??[]),...usedRecipes.current].slice(-12),
          recentSubjects: memoryRef.current.recentSubjects, rejectedSubjects: memoryRef.current.rejectedSubjects,
          currentProposal: feedback.selectedDrawing ? undefined : pending?.proposal, currentAdditions: feedback.selectedDrawing ? undefined : pending?.additions,
          selectedDrawing: feedback.selectedDrawing ? { id: feedback.selectedDrawing.id, name: feedback.selectedDrawing.name, bounds: feedback.selectedDrawing.bounds, source: feedback.selectedDrawing.source } : undefined,
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
      if (variantOnly && pending) {
        // Changing a drawing style never rejects its subject or changes the
        // story. Do not trust old backends/cached alternatives to keep it.
        history.current = previous
        const candidate = validateProposal(result.proposal)
        const proposal = candidate ? validateProposal(fitVariantToFrame(pending.proposal, candidate, pending.aspect)) : null
        const next = proposal ? { ...pending, id: randomId(), revision, proposal, alternatives: [], pristineEdit: false, deleting: false } : null
        if (next && valid(next)) show(next, '换个画法，看看这个怎么样。', speak)
        else {
          setProjection(pending); setPhase('projected')
          say('这次没换好，我先保留原来的底图。可以再试一次。', speak)
        }
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
        if (prepared) drawTurn(prepared, revision, aspect, reply, undefined, speak)
        else reportTurnFailure(result.proposal ? 'geometry_rejected' : 'invalid_response')
        return
      }
      if (proposed) {
        const rawAdditions = result.additions ?? []
        const additions = Array.isArray(rawAdditions) && rawAdditions.length <= 3 ? rawAdditions.map(prepareCandidate) : [null]
        const occupancy = pending?.editTargetId ? canvas.getOccupancyWithoutObject?.(pending.editTargetId,256) ?? canvas.getOccupancy(256) : canvas.getOccupancy(256)
        const prepared = (result.geometryReviewed || result.placementLocked) && !additions.length
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
      if(feedback.voiceEdit&&version===generation.current&&pending&&!current.current&&valid(pending)){
        canvas.previewWithoutObject?.(pending.pristineEdit?null:pending.editTargetId??null)
        setProjection(pending);setPhase('projected')
      }
      if (version === generation.current) {
        busy.current = false; active.current = null
        if (current.current?.tracing && !timer.current) setPhase('projected')
      }
    }
  }, [cancel, drawTurn, remember, say, setPhase, setProjection, show, valid])

  const takeTurn = useCallback(() => {
    if (ref.current.allowDrawing === false || phaseRef.current !== 'idle') return
    return ask(t('轮到你了，请接着我的画继续创作。', ref.current.locale), true, { speak: true, takeTurn: true })
  }, [ask])


  const accept = useCallback((feedback: { speak?: boolean } = {}) => {
    const speak = feedback.speak !== false
    if (!ref.current.enabled || ref.current.allowDrawing === false || document.visibilityState === 'hidden') return
    if (phaseRef.current === 'sketching' || phaseRef.current === 'thinking') { if (speak) ref.current.onSpeak(''); return }
    const p = current.current, canvas = ref.current.canvas.current
    if (!p || !canvas) { say('现在没有要留下的投影。', speak); return }
    if (p.tracing || canvas.getEditableTargets || planItems(p).some(item => item.template === 'illustration')) {
      say(pickReply.current(planItems(p).some(item => item.template === 'illustration') ? 'illustrationGuide' : 'guide', ref.current.locale), speak); return
    }
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
    const tracing = current.current?.tracing
    if (current.current && !tracing) {
      rememberPlan(planItems(current.current), false)
      metrics.current.rejected++
    }
    cancel(false); say(tracing ? pickReply.current('guideCleared', ref.current.locale) : '收起来啦，你的画没有改变。', feedback.speak !== false)
  }, [cancel, rememberPlan, say])
  const alternative = useCallback(async (feedback: { speak?: boolean } = {}) => {
    const speak = feedback.speak !== false
    const available = () => ref.current.enabled && ref.current.allowDrawing !== false && document.visibilityState !== 'hidden'
    if (!available()) return
    if (phaseRef.current !== 'projected') { if (speak) ref.current.onSpeak(''); return }
    const p = current.current
    if (!p || !valid(p)) { cancel(); say('画面已经变了，我们重新看一下吧。', speak); return }
    const version = generation.current
    await refreshMaterialCuration()
    if (version !== generation.current || current.current?.id !== p.id || !available()) return
    const variant = changeVariant(p.proposal, p.aspect)
    if (variant) {
      const next={...p,pristineEdit:false,deleting:false,proposal:variant,id:randomId(),alternatives:[]}
      if(valid(next)){metrics.current.localEdits++;show(next,'换个画法，看看这个怎么样。',speak);return}
    }
    if (p.proposal.template === 'illustration') {
      say(ref.current.locale === 'en'
        ? 'There is no other version of this reference yet. You can try adding your own details.'
        : '这张参考图暂时没有别的画法，可以试试自己添细节。', speak)
      return
    }
    const name = variantSubjectName(p.proposal, ref.current.locale)
    const request = ref.current.locale === 'en'
      ? `Show a different way to draw the same ${name} in this guide. Keep its content, size and position.`
      : `请给当前底图中的“${name}”换一种画法，保留原来的内容、大小和位置。`
    void ask(request, true, { ...feedback, voiceEdit: true, variantOnly: true })
  }, [ask, cancel, say, show, valid])
  const materialSubjects = useCallback(() => listMaterialSubjects().map(group => ({ ...group,
    materials: rankMaterials(group.materials, preferredMaterials(choicesRef.current, group.subject)),
  })), [])
  const openMaterialPicker = useCallback(async () => {
    const p = current.current, opt = ref.current
    if (!p || !valid(p) || phaseRef.current !== 'projected' || !opt.enabled || opt.allowDrawing === false) return
    const ticket = ++materialRequest.current, version = generation.current
    await refreshMaterialCuration()
    if (ticket !== materialRequest.current || version !== generation.current || current.current?.id !== p.id
      || !ref.current.enabled || ref.current.allowDrawing === false || document.visibilityState === 'hidden') return
    setMaterialPicker({ guideId: p.id, subject: materialSubjectForProposal(p.proposal), subjects: materialSubjects() })
  }, [materialSubjects, valid])
  const chooseMaterial = useCallback(async (materialId: string) => {
    const p = current.current
    const available = () => ref.current.enabled && ref.current.allowDrawing !== false && document.visibilityState !== 'hidden'
    if (!p || materialPicker?.guideId !== p.id || materialPicker.busy || !valid(p) || phaseRef.current !== 'projected'
      || !available()) return
    const ticket = ++materialRequest.current, version = generation.current
    setMaterialPicker(value => value ? { ...value, busy: true, error: undefined } : null)
    await refreshMaterialCuration()
    if (ticket !== materialRequest.current || version !== generation.current || current.current?.id !== p.id
      || !available()) return
    const material = getMaterial(materialId)
    const proposal = material && validateProposal(createMaterialProposal(materialId, p.proposal, p.aspect))
    const next: Projection | null = proposal ? { id: randomId(), revision: ref.current.canvas.current!.getRevision(),
      proposal, additions: [], alternatives: [], aspect: p.aspect, tracing: true } : null
    if (!material || !next || !valid(next)) {
      const error = ref.current.locale === 'en' ? 'This picture is not available here. Try another one.' : '这张暂时不能放在这里，再挑一张试试吧。'
      setMaterialPicker(value => value ? { ...value, subjects: materialSubjects(), busy: false, error } : null)
      say(error, false)
      return
    }
    show(next, ref.current.locale === 'en' ? 'Your chosen guide is ready. Draw it your way.' : '你选的底图准备好啦，画法由你决定。', false)
    if (current.current?.id !== next.id) return
    const choices = appendMaterialChoice(choicesRef.current, material)
    choicesRef.current = choices; setMaterialChoices(choices)
    saveMaterialChoices(ref.current.preferenceChildId, choices)
  }, [materialPicker, materialSubjects, say, show, valid])
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
    if (!main || additions.some(item => !item) || !(p.tracing
      ? [main, ...additions as DrawingProposal[]].every(item => placementFits(item, p.aspect, ref.current.surfaceSize?.()))
      : drawingPlanFits([main, ...additions as DrawingProposal[]], (p.editTargetId ? ref.current.canvas.current!.getOccupancyWithoutObject?.(p.editTargetId,256) ?? ref.current.canvas.current!.getOccupancy(256) : ref.current.canvas.current!.getOccupancy(main.contact ? 256 : 64)), p.aspect, ref.current.surfaceSize?.(), main.contact ? ref.current.canvas.current!.getCollisionPixels?.() : undefined))) { say(p.tracing ? '底图要放在画纸里面，再挪一点试试吧。' : '这个位置会碰到你的画，换个位置试试吧。', speak); if (!speak) ref.current.onSpeak(''); return }
    metrics.current.localEdits++
    ref.current.canvas.current?.previewWithoutObject?.(p.editTargetId??null)
    setProjection({ ...p, pristineEdit:false, deleting:false, id: randomId(), proposal: main, additions: additions as DrawingProposal[], alternatives: [] })
    setPhase('projected'); say(p.tracing ? pickReply.current('guideAdjusted', ref.current.locale) : '调整好啦，喜欢的话就留下来。', speak)
    if (!speak) ref.current.onSpeak('')
  }, [cancel, say, setPhase, setProjection, valid])
  const forget = useCallback(() => { cancel(); history.current = []; recentReplies.current = []; remember(emptyMemory()); say('我们从新的想法开始吧。') }, [cancel, remember, say])
  const beginObjectEdit = useCallback((object: EditableNiloObject) => {
    const canvas=ref.current.canvas.current
    if(!canvas || ref.current.allowDrawing===false || !ref.current.enabled)return
    cancel(false)
    setProjection({id:randomId(),revision:canvas.getRevision(),proposal:object.proposals[0],additions:object.proposals.slice(1),alternatives:[],aspect:object.aspect,editTargetId:object.id,pristineEdit:true})
    say('选好了，可以移动、换色或换个画法。',false)
    setPhase('projected')
  },[cancel,say,setProjection,setPhase])
  const receiveAssisted = useCallback(async (text: string, feedback: VoiceFeedback) => {
    const canvas=ref.current.canvas.current
    if(!canvas?.getEditableTargets||!canvas.applyAssistedEdit)return
    const speak=feedback.speak!==false,traceId=feedback.traceId??newVoiceTrace(),started=Date.now()
    active.current?.abort();active.current=null
    if(timer.current)clearTimeout(timer.current)
    timer.current=null
    const version=++generation.current,revision=canvas.getRevision(),pending=current.current
    const selected=canvas.getSelectedTarget?.()??null
    const all=canvas.getEditableTargets()
    // Selected sets may span several semantic objects and need their own target.
    const objects=[...(selected?[selected]:[]),...all.filter(o=>o.id!==selected?.id)].slice(0,pending?39:40)
    const preview=pending?{id:'@preview',name:pending.proposal.subject??pending.proposal.template,
      source:'preview' as const,bounds:proposalBounds(planItems(pending)),subjects:planItems(pending).map(p=>p.subject??p.template)}:null
    const targets=[...objects,...(preview?[preview]:[])]
    const selectedId=feedback.selectedObjectId??selected?.id??preview?.id
    const restore=()=>{busy.current=false;setPhase(current.current?'projected':'idle')}
    const choices=(candidates:typeof targets,reason:'target'|'instruction'='target')=>{
      restore()
      if(reason==='instruction'){
        awaitingSelection.current=null;setObjectChoices(null)
        say('这句话我还没理解好，可以换个说法告诉我怎么改吗？',speak);return
      }
      awaitingSelection.current={text,feedback:{...feedback,alternatives:feedback.alternatives?.slice()}}
      const choices=candidates.filter((o):o is CanvasEditTarget=>o.source!=='preview')
      setObjectChoices({objects:choices.length?choices:objects,text})
      say('想改哪一部分？点选或圈起来，选好后我就帮你改。',speak)
      canvas.requestSelection?.()
    }
    let plan:VoicePlan|null=null
    const named=feedback.selectedObjectId?[]:namedEditTargets(text,objects)
    const local=hasUnresolvedEditName(text)&&!named.length&&!feedback.selectedObjectId?null:simpleVoiceActions(text)
    if(!targets.length){choices([]);return}
    if(local){
      const matches=feedback.selectedObjectId?targets.filter(o=>o.id===feedback.selectedObjectId)
        :named.length?named:selectedId?targets.filter(o=>o.id===selectedId):[]
      if(matches.length!==1){choices(matches);return}
      plan={status:'edit',targetId:matches[0].id,actions:local}
    }else{
      const controller=new AbortController();active.current=controller;busy.current=true;setPhase('thinking')
      let onAbort:(()=>void)|undefined
      const timeout=setTimeout(()=>controller.abort(),10000)
      try{
        const abort=new Promise<never>((_,reject)=>{onAbort=()=>reject(new Error('cancelled'));controller.signal.addEventListener('abort',onAbort,{once:true})})
        const raw=await Promise.race([authFetch<unknown>('/nilo/voice/interpret',{method:'POST',token:ref.current.token,signal:controller.signal,
          body:{utterance:text,asrAlternatives:feedback.alternatives,locale:ref.current.locale,editingMode:'assisted',selectedTargetId:selectedId,
            objects:targets.map(o=>({id:o.id,name:o.name,source:o.source,subjects:o.subjects,bounds:o.bounds}))}}),abort])
        plan=validateVoicePlan(raw,targets.map(o=>o.id))
        if(!plan)throw new Error('interpretation_unavailable')
      }catch(error){
        if(version===generation.current){
          restore()
          say(canvas.getRevision()!==revision?'画面已经变了，我们重新看一下吧。':error instanceof ApiError?requestFailureMessage(error,false)
            :controller.signal.aborted?'理解这句话等得有点久，请再试一次。':'语音指令暂时没能理解，原来的画没有改变。',speak)
          recordVoiceEvent({turn:traceId,stage:'understand',outcome:controller.signal.aborted?'timeout':'unavailable',durationMs:Date.now()-started,text})
        }
        return
      }finally{clearTimeout(timeout);if(onAbort)controller.signal.removeEventListener('abort',onAbort);if(version===generation.current){busy.current=false;active.current=null}}
    }
    if(version!==generation.current||!ref.current.enabled||ref.current.allowDrawing===false||document.visibilityState==='hidden')return
    if(canvas.getRevision()!==revision){restore();say('画面已经变了，我们重新看一下吧。',speak);recordVoiceEvent({turn:traceId,stage:'execute',outcome:'stale'});return}
    restore()
    recordVoiceEvent({turn:traceId,stage:'understand',outcome:local?'local':plan.status,durationMs:Date.now()-started,text,plan})
    if(plan.status==='clarify'){choices(targets.filter(o=>plan.candidateIds.includes(o.id)),plan.reason);return}
    if(plan.status==='noop'){say('好，就保持现在的样子。',speak);return}
    if(plan.status==='unhandled'){await ask(text,false,{...feedback,inferDrawingIntent:true,voiceEdit:true});return}
    const target=targets.find(o=>o.id===plan.targetId)
    if(!target){choices([]);return}
    if(plan.status==='redraw'||(plan.status==='edit'&&target.source!=='preview'&&plan.actions.some(a=>a.type==='variant'||a.type==='part'))){
      setObjectChoices(null);awaitingSelection.current=null
      recordVoiceEvent({turn:traceId,stage:'execute',outcome:'delegated_redraw'})
      await ask(text,true,{...feedback,voiceEdit:true,selectedDrawing:target.source==='preview'?undefined:target});return
    }
    if(plan.status!=='edit')return
    if(target.source==='preview'){
      if(!pending||current.current?.id!==pending.id)return
      const result=applyVoiceActions(planItems(pending),plan.actions)
      if(!result.ok){say(result.reason==='geometry'?'这样调整会超出画布，原来的投影先保留。':'这些修改暂时不能一起完成，原来的投影先保留。',speak);return}
      if(result.deleting){dismiss(feedback);return}
      const next:Projection={...pending,id:randomId(),revision,proposal:result.items[0],additions:result.items.slice(1),alternatives:[],tracing:true,editTargetId:undefined,pristineEdit:false,deleting:false}
      if(!valid(next)){say('底图要放在画纸里面，再挪一点试试吧。',speak);return}
      setProjection(next);setPhase('projected');setObjectChoices(null);metrics.current.localEdits++
      say(pickReply.current('guideAdjusted',ref.current.locale),speak)
      recordVoiceEvent({turn:traceId,stage:'execute',outcome:'previewed',actions:plan.actions.map(a=>a.type)});return
    }
    const actions=validateAssistedActions(plan.actions)
    if(!actions){say('我可以帮你换颜色、移动或调整大小，其他变化先用虚线试试看。',speak);return}
    // The guide and traced ink use the SAME group transform, even if the child
    // has only traced one corner of a large reference. Validate both before commit.
    let nextGuide:Projection|null=null
    if(pending?.tracing&&target.guideId===pending.id){
      const transformed=applyVoiceActions(planItems(pending),actions,target.transformBounds??target.bounds)
      if(!transformed.ok||transformed.deleting){say('这样调整会超出画布，原来的画和底图都保留。',speak);return}
      nextGuide={...pending,proposal:transformed.items[0],additions:transformed.items.slice(1),alternatives:[]}
      if(!valid(nextGuide)){say('这样调整会超出画布，原来的画和底图都保留。',speak);return}
    }
    if(!canvas.applyAssistedEdit(target.id,actions,revision)){
      say('这次调整没有完成，原来的画还在。可以重新选一下，或换个位置。',speak)
      recordVoiceEvent({turn:traceId,stage:'execute',outcome:'rejected',actions:actions.map(a=>a.type)});return
    }
    if(nextGuide)setProjection({...nextGuide,revision:canvas.getRevision()})
    awaitingSelection.current=null;setObjectChoices(null);metrics.current.localEdits++
    ref.current.onCommitted();say(pickReply.current('inkEdited',ref.current.locale),speak)
    recordVoiceEvent({turn:traceId,stage:'execute',outcome:'committed',actions:actions.map(a=>a.type)})
  },[ask,dismiss,say,setPhase,setProjection,valid])

  const receive = useCallback(async (text: string, feedback: VoiceFeedback = {}) => {
    if (!ref.current.enabled || document.visibilityState === 'hidden') return
    awaitingSelection.current=null;setObjectChoices(null)
    const traceId=feedback.traceId??newVoiceTrace(),speak=feedback.speak!==false,started=Date.now()
    if(ref.current.allowDrawing===false){await ask(text,false,{...feedback,inferDrawingIntent:true});return}
    const basic=localCommand(text)
    if (basic === 'accept') {
      if(/确认移除|confirm removal/i.test(text)&&!current.current?.deleting)return
      accept(feedback); return
    }
    if (basic === 'dismiss' && !/不要那|不要这/.test(text)) { dismiss(feedback); return }
    if (basic === 'stop') { interrupt(); ref.current.onSpeak(''); return }
    if (basic === 'forget') { forget(); return }
    if(objectEditCommand(text)==='undo'){
      cancel(false)
      const canvas=ref.current.canvas.current
      const operations=canvas?.getDocument().operations??[]
      const reverted=new Set(operations.filter(op=>op.type==='assist-revert').map(op=>op.targetId))
      const last=[...operations].reverse().find(op=>op.owner==='nilo'&&op.type!=='assist-revert'&&!(op.type==='assist'&&reverted.has(op.groupId)))
      if(last&&['edit','assist'].includes(last.type)&&canvas?.undoCompanionStroke()){ref.current.onCommitted();say('恢复刚才的样子啦。',speak)}
      else say('现在没有可恢复的修改。',speak)
      return
    }
    if(basic==='alternative'){alternative(feedback);return}
    if(isVoiceSuggestion(text)){await ask(text,false,{...feedback,voiceEdit:true});return}
    if(isNewDrawingRequest(text)||!isVoiceEditRequest(text)||/^(?:请)?(?:只)?(?:帮我)?(?:画|绘制)(?:一半|半个|半边|一个|个)|^(?:please )?(?:draw|paint) /i.test(text)){
      const requestsDrawing=/^只画|帮.*画|请.*画|你.*画|你来|轮到你|添|加.*(点|个|一)|画.*给我|^(?:请|帮我|给我)?\s*(?:画|绘制).+|\b(draw|add)\b|your turn|help.*(paint|sketch)/i.test(text)
      await ask(text,requestsDrawing,{...feedback,inferDrawingIntent:!requestsDrawing});return
    }
    const canvas=ref.current.canvas.current
    if(!canvas)return
    if(canvas.getEditableTargets&&canvas.applyAssistedEdit){await receiveAssisted(text,feedback);return}
    // Supersede older interpretation without discarding the existing projection.
    active.current?.abort();active.current=null
    if(timer.current)clearTimeout(timer.current)
    const version=++generation.current,revision=canvas.getRevision(),pending=current.current
    if(pending&&!pending.tracing&&pending.revision!==revision){cancel(false);say('画面已经变了，我们重新看一下吧。',speak);return}
    const objects=canvas.getEditableObjects?.()??[]
    const previewId=pending?.editTargetId??'@preview'
    const targets=pending?[...objects.filter(o=>o.id!==previewId),{id:previewId,name:pending.proposal.subject??pending.proposal.template,proposals:planItems(pending),aspect:pending.aspect}]:objects
    const selectedId=feedback.selectedObjectId??(pending?previewId:objects.find(o=>o.id===voiceTarget.current)?.id)
    const restore=()=>{busy.current=false;setPhase(pending?'projected':'idle')}
    const choices=(candidates:EditableNiloObject[],reason:'target'|'instruction'='target')=>{
      restore()
      const visible=candidates.filter(o=>o.id!=='@preview')
      setObjectChoices(reason==='target'&&visible.length?{objects:visible,text}:null)
      say(reason==='instruction'?'这句话我还没理解好，可以换个说法告诉我怎么改吗？':targets.length?'想改哪一个？点一下就好。':'还没有可以修改的 Nilo 作品。',speak)
    }
    let plan:VoicePlan|null=null
    const local=simpleVoiceActions(text)
    if(!targets.length&&!local){restore();void ask(text,false,{...feedback,inferDrawingIntent:true});return}
    if(local){
      const named=feedback.selectedObjectId?[]:resolveObject(text,targets,true)
      const matches=feedback.selectedObjectId?targets.filter(o=>o.id===feedback.selectedObjectId):named.length?named:selectedId?targets.filter(o=>o.id===selectedId):resolveObject(text,targets)
      if(matches.length!==1){choices(matches);return}
      plan={status:'edit',targetId:matches[0].id,actions:local}
    }else{
      const controller=new AbortController();active.current=controller;busy.current=true;setPhase('thinking')
      let onAbort:(()=>void)|undefined
      const timeout=setTimeout(()=>controller.abort(),10000)
      try{
        const abort=new Promise<never>((_,reject)=>{onAbort=()=>reject(new Error('cancelled'));controller.signal.addEventListener('abort',onAbort,{once:true})})
        const raw=await Promise.race([authFetch<unknown>('/nilo/voice/interpret',{method:'POST',token:ref.current.token,signal:controller.signal,body:{utterance:text,asrAlternatives:feedback.alternatives,locale:ref.current.locale,selectedTargetId:selectedId,objects:targets.map(o=>({id:o.id,name:o.name,subjects:o.proposals.map(p=>p.subject??p.template),bounds:proposalBounds(o.proposals)}))}}),abort])
        plan=validateVoicePlan(raw,targets.map(o=>o.id))
        if(!plan)throw new Error('interpretation_unavailable')
      }catch(error){
        if(version===generation.current){
          if(canvas.getRevision()!==revision){cancel(false);say('画面已经变了，我们重新看一下吧。',speak)}
          else{restore();say(error instanceof ApiError?requestFailureMessage(error,false):controller.signal.aborted?'理解这句话等得有点久，请再试一次。':'语音指令暂时没能理解，原来的画没有改变。',speak)}
          recordVoiceEvent({turn:traceId,stage:'understand',outcome:controller.signal.aborted?'timeout':'unavailable',durationMs:Date.now()-started,text})
        }
        return
      }finally{clearTimeout(timeout);if(onAbort)controller.signal.removeEventListener('abort',onAbort);if(version===generation.current){busy.current=false;active.current=null}}
    }
    if(version!==generation.current)return
    if(canvas.getRevision()!==revision){cancel(false);say('画面已经变了，我们重新看一下吧。',speak);recordVoiceEvent({turn:traceId,stage:'execute',outcome:'stale'});return}
    recordVoiceEvent({turn:traceId,stage:'understand',outcome:local?'local':plan.status,durationMs:Date.now()-started,text,plan})
    restore()
    if(plan.status==='clarify'){choices(targets.filter(o=>plan.candidateIds.includes(o.id)),plan.reason);return}
    if(plan.status==='noop'){say('好，就保持现在的样子。',speak);return}
    if(plan.status==='unhandled'){await ask(text,false,{...feedback,inferDrawingIntent:true,voiceEdit:true});return}
    const target=targets.find(o=>o.id===plan.targetId)
    if(!target){choices([]);return}
    if(plan.status==='redraw'){
      if(target.id!=='@preview')beginObjectEdit(target)
      recordVoiceEvent({turn:traceId,stage:'execute',outcome:'delegated_redraw'})
      await ask(text,true,{...feedback,voiceEdit:true});return
    }
    const result=applyVoiceActions(target.proposals,plan.actions)
    if(!result.ok){
      say(result.reason==='geometry'?'这样调整会超出画布，原来的投影先保留。':'这些修改暂时不能一起完成，原来的投影先保留。',speak)
      recordVoiceEvent({turn:traceId,stage:'execute',outcome:result.reason,actions:plan.actions.map(a=>a.type)});return
    }
    if(result.deleting&&target.id==='@preview'){dismiss(feedback);return}
    const next:Projection={id:randomId(),revision,proposal:result.items[0],additions:result.items.slice(1),alternatives:[],aspect:target.aspect,editTargetId:target.id==='@preview'?undefined:target.id,pristineEdit:false,deleting:result.deleting,tracing:target.id==='@preview'&&ref.current.tracing!==false}
    if(!valid(next)){
      say('这些调整会碰到画面里的内容，原来的投影先保留。',speak)
      recordVoiceEvent({turn:traceId,stage:'execute',outcome:'geometry',actions:plan.actions.map(a=>a.type)});return
    }
    setObjectChoices(null);canvas.previewWithoutObject?.(next.editTargetId??null)
    voiceTarget.current=next.editTargetId??null
    setProjection(next);setPhase('projected');metrics.current.localEdits++
    say(next.tracing?pickReply.current('guideAdjusted',ref.current.locale):next.deleting?'先收起来，确认后才会移除。':'调整好啦，喜欢的话就留下来。',speak)
    if(!speak)ref.current.onSpeak('')
    recordVoiceEvent({turn:traceId,stage:'execute',outcome:'previewed',actions:plan.actions.map(a=>a.type)})
  },[accept,alternative,ask,beginObjectEdit,cancel,dismiss,forget,interrupt,receiveAssisted,say,setPhase,setProjection,valid])
  const notifySelectionChanged=useCallback((complete=true)=>{
    // A selection is part of the command's context. Even while adding to a
    // lasso, invalidate old inference; replay only when the child says done.
    active.current?.abort();active.current=null;generation.current++
    if(timer.current)clearTimeout(timer.current)
    timer.current=null;busy.current=false
    if(current.current?.turn)setProjection({...current.current,turn:false,durationMs:undefined})
    setPhase(current.current?'projected':'idle')
    if(!complete)return
    const pending=awaitingSelection.current,selected=ref.current.canvas.current?.getSelectedTarget?.()
    if(!pending||!selected)return
    awaitingSelection.current=null;setObjectChoices(null)
    void receive(pending.text,{...pending.feedback,selectedObjectId:selected.id})
  },[receive,setPhase,setProjection])
  const chooseObject=useCallback((id:string)=>{
    const choice=objectChoices?.objects.find(o=>o.id===id),text=objectChoices?.text
    if(!choice)return
    const canvas=ref.current.canvas.current
    if(canvas?.getEditableTargets&&canvas.selectEditTarget){
      if(canvas.selectEditTarget(id)){
        setObjectChoices(null);notifySelectionChanged()
        if(!text)say('选好了，可以说换颜色、移动或调整大小。',false)
      }
      return
    }
    if(!('proposals' in choice))return
    beginObjectEdit(choice)
    if(text)receive(text,{speak:false,selectedObjectId:choice.id})
  },[beginObjectEdit,notifySelectionChanged,objectChoices,receive,say])
  const openObjects=useCallback(()=>{
    const canvas=ref.current.canvas.current
    if(canvas?.getEditableTargets){
      // Opening the selection tool must not reuse a stale voice request.
      active.current?.abort();active.current=null;generation.current++;busy.current=false
      setPhase(current.current?'projected':'idle')
      setObjectChoices({objects:canvas.getEditableTargets().slice(0,40),text:awaitingSelection.current?.text??''})
      canvas.requestSelection?.();return
    }
    const objects=canvas?.getEditableObjects?.()??[]
    if(objects.length)setObjectChoices({objects,text:''})
    else say('还没有可以修改的 Nilo 作品。',false)
  },[say,setPhase])

  return { objectChoices, chooseObject, openObjects, materialPicker, materialChoices, openMaterialPicker, closeMaterialPicker, chooseMaterial, notifySelectionChanged, phase, message, projection, memory, metrics: metrics.current, ask, takeTurn, receive, accept, dismiss, alternative, edit, cancel, interrupt, finishTurn, say, forget }
}
