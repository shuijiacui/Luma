import { editableObjects } from '../companion/objects'
import type { CanvasEditTarget } from '../companion/editTargets'
import type { VoiceAction } from '../../../../../shared/niloVoiceActions.mjs'
import { prepareAssistedEdit } from '../canvasEditing'
import { boundsOfStrokes } from '../../../../../shared/niloCanvasEdits.mjs'
import { buildStrokeSelection, type SelectableStroke } from '../companion/strokeSelection'
import type { SelectionCandidate } from '../companion/selectionGeometry'
import type { DrawingProposal } from '../companion/proposals'
import { pixelOccupancy } from '../../../../../shared/niloOccupancy.mjs'
import type { InkPixels } from '../../../../../shared/niloContact.mjs'
import { t, useLocale } from '@/i18n'
import type { NiloStrokeSpec } from '@/lib/api/lumaApi'
import { randomId } from '@/lib/randomId'
import { BRUSHES, createStrokePainter, type BrushKind } from '../brushes'
import { visibleOperations, canvasUndoCounts, cloneCanvasDocument, getCanvasProvenance, paintCanvasOperation, undoCanvasOwner, lastUndoOwner, type CanvasDocument, type CanvasOperation } from '../canvasDocument'
import { getCompanionScene, type CompanionScene } from '../companionScene'
import { exportCompanionFocus } from '../companion/focus'
import type { CanvasDraft } from '../draft'
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, type PointerEvent as ReactPointerEvent } from 'react'

export interface DrawingCanvasHandle {
  flushDraft: () => void
  /** Undo the latest committed contribution, regardless of its author. */
  undo: () => boolean
  clear: () => void
  download: () => void
  exportImage: () => string | null
  exportSnapshot: () => string | null
  exportChildImage: () => string | null
  /** Compact child-only observation; legacy base images remain explicitly unknown. */
  exportObservation: () => string | null
  /** Confirmed child + Nilo image for collaboration; never used for child-only analysis. */
  exportCompanionObservation: () => string | null
  exportCompanionFocus?: () => ReturnType<typeof exportCompanionFocus>
  getCompanionScene: () => CompanionScene
  getDocument: () => CanvasDocument
  getRevision: () => number
  commitCompanionStrokes: (specs: NiloStrokeSpec[], expectedRevision: number, object?: { proposals: DrawingProposal[]; aspect: number }, targetId?: string) => boolean
  getEditableObjects?: () => ReturnType<typeof editableObjects>
  getEditableTargets?: () => CanvasEditTarget[]
  getSelectedTarget?: () => CanvasEditTarget | null
  selectEditTarget?: (id: string) => boolean
  applyAssistedEdit?: (targetId: string, actions: VoiceAction[], expectedRevision: number) => boolean
  requestSelection?: () => void
  getSelection?: () => { groupIds: string[]; bounds: { x:number; y:number; width:number; height:number } | null }
  setSelection?: (groupIds: string[]) => void
  getSelectionCandidates?: () => SelectionCandidate[]
  previewWithoutObject?: (id: string | null) => void
  getOccupancyWithoutObject?: (id: string, size?: number) => number[]
  drawCompanionStroke: (spec: NiloStrokeSpec) => Promise<void>
  getLastStroke: () => { points: { x: number; y: number }[]; color: string; width: number; brushKind?: BrushKind } | null
  /** Most recent visible child stroke, in current CSS pixels (not backing-store pixels). */
  getLastDrawingStyle: () => { brushKind: BrushKind; color: string; size: number } | null
  getInkGrid: (size?: number) => number[]
  getOccupancy: (size?: number) => number[]
  /** Current original pixels, read only for contact-boundary refinement. */
  getCollisionPixels?: () => InkPixels | undefined
  /** Exact visible-ink contact at a normalized point; radius is in CSS pixels. */
  hasInkAt: (point: { x: number; y: number }, radius: number) => boolean
  undoCompanionStroke: () => boolean
  getUndoCounts: () => { child: number; nilo: number }
}

interface DrawingCanvasProps {
  color: string
  brushSize: number
  brushKind?: BrushKind
  isEraser: boolean
  onStrokeComplete: () => void
  onStrokeStart?: () => void
  draft: CanvasDraft
  disabled?: boolean
  onSelectionChange?: () => void
  onRequestSelection?: () => void
  guideVisible?: boolean
  tracingContext?: { guideId: string; name: string; subjects: string[]; bounds: { x:number; y:number; width:number; height:number } }
}

export const DrawingCanvas = forwardRef<DrawingCanvasHandle, DrawingCanvasProps>(function DrawingCanvas(
  { color, brushSize, brushKind = 'round', isEraser, onStrokeComplete, onStrokeStart, draft, disabled, onSelectionChange, onRequestSelection, tracingContext, guideVisible }, forwardedRef,
) {
  useLocale()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const documentRef = useRef<CanvasDocument>(draft.document ? cloneCanvasDocument(draft.document) : {
    version: 1, baseSource: draft.history.at(-1) ? 'unknown' : 'child',
    ...(draft.history.at(-1) ? { baseImage: draft.history.at(-1) } : {}), operations: [],
  })
  const hiddenObjectRef = useRef<string | null>(null)
  const baseImageRef = useRef<HTMLImageElement | null>(null)
  const restoringRef = useRef(false)
  const revisionRef = useRef(0)
  const pointerRef = useRef<number | null>(null)
  const painterRef = useRef<ReturnType<typeof createStrokePainter> | null>(null)
  const currentStrokeRef = useRef<Extract<CanvasOperation, { type: 'stroke' }> | null>(null)
  const selectionRef = useRef<{ id: string; groupIds: string[] }>({ id: randomId(), groupIds: [] })
  const resolvedInkRef = useRef<{ revision:number; strokes:Extract<CanvasOperation,{type:'stroke'}>[] }>({revision:-1,strokes:[]})
  const selectionInkRef = useRef<{ revision:number; records:SelectableStroke[] }>({revision:-1,records:[]})

  function drawingStrokes() {
    if (resolvedInkRef.current.revision !== revisionRef.current) {
      resolvedInkRef.current = { revision:revisionRef.current, strokes:visibleOperations(documentRef.current,{maskErasers:true}).filter((op): op is Extract<CanvasOperation,{type:'stroke'}> => op.type === 'stroke' && !op.eraser) }
    }
    return resolvedInkRef.current.strokes
  }

  function selectableInk() {
    if (selectionInkRef.current.revision !== revisionRef.current) {
      const canvas = canvasRef.current
      selectionInkRef.current = { revision: revisionRef.current, records: canvas ? buildStrokeSelection(drawingStrokes(), canvas.width, canvas.height) : [] }
    }
    return selectionInkRef.current.records
  }

  function advanceContextRevision() {
    const previous = revisionRef.current++
    // Selection and pointer-start invalidate pending voice commands, but do not
    // change committed ink. Keep the expensive erased-ink coverage cache valid.
    if (resolvedInkRef.current.revision === previous) resolvedInkRef.current.revision = revisionRef.current
    if (selectionInkRef.current.revision === previous) selectionInkRef.current.revision = revisionRef.current
  }

  function selectedBounds(groupIds: string[]) {
    const ids=new Set(groupIds)
    return boundsOfStrokes(drawingStrokes().filter(op=>ids.has(op.groupId)))
  }

  function visibleBounds(bounds: {x:number;y:number;width:number;height:number} | null) {
    if (!bounds) return null
    const x = Math.max(0, bounds.x), y = Math.max(0, bounds.y)
    const right = Math.min(1, bounds.x + bounds.width), bottom = Math.min(1, bounds.y + bounds.height)
    return right > x && bottom > y ? { x, y, width: right-x, height: bottom-y } : null
  }

  function selectedTarget(): CanvasEditTarget | null {
    if (!selectionRef.current.groupIds.length) return null
    const visible = new Set(selectableInk().map(item => item.stroke.groupId))
    const groupIds = selectionRef.current.groupIds.filter(id => visible.has(id))
    if (!groupIds.length) return null
    const transformBounds = selectedBounds(groupIds)
    const bounds = visibleBounds(transformBounds)
    if (!bounds) return null
    const source = drawingStrokes().filter(op => groupIds.includes(op.groupId))
    const guide = source[0]?.guidance
    const sameGuide = guide && source.every(op => op.guidance?.guideId === guide.guideId)
    const wholeGuide = sameGuide && drawingStrokes().filter(op => op.guidance?.guideId === guide.guideId).every(op => groupIds.includes(op.groupId))
    const legacy = groupIds.length === 1 ? source.find(op => op.object)?.object : undefined
    return { id: selectionRef.current.id, groupIds, bounds, ...(transformBounds ? {transformBounds} : {}), name: sameGuide ? guide.name : legacy?.name ?? '选中的画',
      subjects: sameGuide ? guide.subjects : legacy?.proposals.map(p => p.subject ?? p.template) ?? [], source: sameGuide ? 'guided' : source.every(op => op.owner === 'nilo') ? 'nilo' : 'child',
      ...(wholeGuide ? { guideId: guide.guideId } : {}) }
  }

  function editableTargets(): CanvasEditTarget[] {
    const groups = new Map<string, CanvasEditTarget>()
    for (const {stroke:op,candidate} of selectableInk()) {
      const guidance = op.guidance
      // Ungrouped child ink requires an explicit selection; a recent stroke is
      // not a reliable semantic object. Legacy Nilo groups remain addressable.
      if (!guidance && op.owner !== 'nilo') continue
      const id = guidance ? `guide:${guidance.guideId}` : `ink:${op.groupId}`
      const existing = groups.get(id)
      const groupIds = [...new Set([...(existing?.groupIds ?? []), op.groupId])]
      const bounds = existing?.bounds ? (() => {
        const b=candidate.bounds,old=existing.bounds
        const x=Math.min(old.x,b.x),y=Math.min(old.y,b.y)
        return {x,y,width:Math.max(old.x+old.width,b.x+b.width)-x,height:Math.max(old.y+old.height,b.y+b.height)-y}
      })() : candidate.bounds
      groups.set(id, { id, groupIds, bounds, source: guidance ? 'guided' : 'nilo',
        name: guidance?.name ?? op.object?.name ?? existing?.name ?? '画布上的图形', subjects: guidance?.subjects ?? op.object?.proposals.map(p => p.subject ?? p.template) ?? existing?.subjects ?? [],
        ...(guidance ? { guideId: guidance.guideId } : {}) })
    }
    for (const target of groups.values()) {
      target.transformBounds = selectedBounds(target.groupIds) ?? undefined
      // Keep AI positioning and the edit engine's centre identical. The alpha
      // coverage controls selection, not the historical object's transform frame.
      target.bounds = visibleBounds(target.transformBounds ?? null) ?? target.bounds
    }
    const selected = selectedTarget()
    if (selected) {
      // Avoid duplicate candidates for exactly the same selected object.
      for (const [id, target] of groups) if (target.groupIds.length === selected.groupIds.length && target.groupIds.every(g => selected.groupIds.includes(g))) groups.delete(id)
      groups.set(selected.id, selected)
    }
    return [...groups.values()].slice(-40)
  }

  function setSelection(groupIds: string[], targetId?: string) {
    if (disabled || restoringRef.current || pointerRef.current !== null) return
    const visible = new Set(selectableInk().map(item => item.stroke.groupId))
    const next = [...new Set(groupIds)].filter(id => visible.has(id)).slice(0,256)
    if (!targetId && next.length === selectionRef.current.groupIds.length && next.every(id => selectionRef.current.groupIds.includes(id))) return
    selectionRef.current = { id: targetId ?? randomId(), groupIds: next }
    advanceContextRevision() // Also invalidates interpretation of a previous selection.
    onSelectionChange?.()
  }

  function renderDocument(context: CanvasRenderingContext2D, width: number, height: number, childOnly = false, source = documentRef.current, hiddenId: string | null = null) {
    context.clearRect(0, 0, width, height)
    const base = baseImageRef.current
    if (base && source.baseImage) {
      const scale = Math.min(width / base.width, height / base.height)
      context.drawImage(base, (width - base.width * scale) / 2, (height - base.height * scale) / 2, base.width * scale, base.height * scale)
    }
    for (const op of visibleOperations(source)) if ((!hiddenId || op.owner !== 'nilo' || op.groupId !== hiddenId) && (!childOnly || op.owner === 'child')) paintCanvasOperation(context, width, height, op)
  }

  function makeCanvas(childOnly = false, maxSide?: number) {
    const canvas = canvasRef.current
    if (!canvas || restoringRef.current || pointerRef.current !== null || !canvas.width || !canvas.height) return null
    if (childOnly && getCanvasProvenance(documentRef.current) === 'unknown') return null
    // Replaying original positions together with later child marks would invent
    // a scene that never existed. Keep the work saved, but do not label that
    // mixture as an independent child-only analysis image.
    if (childOnly && documentRef.current.operations.some(op => op.type === 'assist')) return null
    const result = document.createElement('canvas')
    const ratio = maxSide ? Math.min(1, maxSide / Math.max(canvas.width, canvas.height)) : 1
    result.width = Math.max(1, Math.round(canvas.width * ratio))
    result.height = Math.max(1, Math.round(canvas.height * ratio))
    const context = result.getContext('2d')
    if (!context) return null
    renderDocument(context, result.width, result.height, childOnly)
    context.save()
    context.globalCompositeOperation = 'destination-over'
    context.fillStyle = '#fffdf8'
    context.fillRect(0, 0, result.width, result.height)
    context.restore()
    return result
  }

  const persist = useCallback(() => {
    draft.document = cloneCanvasDocument(documentRef.current)
    if (canvasRef.current) draft.history = [canvasRef.current.toDataURL('image/png')]
  }, [draft])

  function repaint() {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    renderDocument(context, canvas.width, canvas.height)
    persist()
  }

  useEffect(() => {
    if (guideVisible && !documentRef.current.guided) {
      documentRef.current.guided = true
      persist()
    }
  }, [guideVisible, persist])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let disposed = false
    function resize() {
      if (!canvas) return
      if (currentStrokeRef.current) finishStroke()
      const rect = canvas.getBoundingClientRect()
      const ratio = Math.min(window.devicePixelRatio || 1, 2)
      const width = Math.round(rect.width * ratio), height = Math.round(rect.height * ratio)
      if (width < 1 || height < 1 || (width === canvas.width && height === canvas.height)) return
      canvas.width = width
      canvas.height = height
      revisionRef.current++
      if (!restoringRef.current) repaint()
    }
    restoringRef.current = !!documentRef.current.baseImage
    resize()
    if (documentRef.current.baseImage) {
      const image = new Image()
      image.onload = () => {
        if (disposed) return
        baseImageRef.current = image
        restoringRef.current = false
        repaint()
      }
      // An unreadable legacy image must not silently turn into a new blank painting.
      image.onerror = () => { if (!disposed) restoringRef.current = true }
      image.src = documentRef.current.baseImage
    } else repaint()
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    return () => { disposed = true; observer.disconnect() }
  }, [])

  function undoOwner(owner: 'child' | 'nilo') {
    if (disabled || restoringRef.current || pointerRef.current !== null || !undoCanvasOwner(documentRef.current, owner)) return false
    revisionRef.current++
    repaint()
    onSelectionChange?.()
    return true
  }

  function applyAssistedEdit(targetId: string, actions: VoiceAction[], expectedRevision: number) {
    const canvas = canvasRef.current, context = canvas?.getContext('2d')
    if (disabled || restoringRef.current || pointerRef.current !== null || !canvas || !context || revisionRef.current !== expectedRevision) return false
    const target = editableTargets().find(item => item.id === targetId)
    if (!target || !actions.length || actions.some(action => !['color','move','scale','place'].includes(action.type))) return false
    const next = prepareAssistedEdit(documentRef.current, target.groupIds, actions, randomId())
    if (!next) return false
    // Stage the full transaction before exposing a single pixel or changing the
    // source document. An unavailable canvas must not leave a half-applied edit.
    const staging = document.createElement('canvas')
    staging.width = canvas.width; staging.height = canvas.height
    const stagingContext = staging.getContext('2d')
    if (!stagingContext) return false
    try {
      renderDocument(stagingContext, staging.width, staging.height, false, next)
      const snapshot = staging.toDataURL('image/png')
      context.save()
      try { context.globalCompositeOperation = 'copy'; context.drawImage(staging, 0, 0) }
      finally { context.restore() }
      hiddenObjectRef.current = null
      documentRef.current = next
      revisionRef.current++
      draft.document = cloneCanvasDocument(next)
      draft.history = [snapshot]
      // Selection identity stays stable; only its derived bounds change.
      return true
    } catch { return false }
  }

  function commitCompanionStrokes(specs: NiloStrokeSpec[], expectedRevision: number, object?: { proposals: DrawingProposal[]; aspect: number }, targetId?: string) {
    if (object?.proposals.some(proposal => proposal.template === 'illustration')) return false
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (disabled || restoringRef.current || pointerRef.current !== null || !canvas || !context || expectedRevision !== revisionRef.current
      || !Array.isArray(specs) || (!specs.length && !targetId) || specs.length > 64) return false
    if (specs.some(spec => !/^#[0-9a-f]{6}$/i.test(spec.color) || !Number.isFinite(spec.width) || spec.width < 1 || spec.width > 32
      || (spec.brushKind !== undefined && !BRUSHES.some(brush => brush.id === spec.brushKind))
      || !Array.isArray(spec.points) || !spec.points.length || spec.points.length > 4096
      || spec.points.some(point => !Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1))) return false
    if (targetId && !visibleOperations(documentRef.current).some(op=>op.owner==='nilo'&&op.groupId===targetId)) return false
    const groupId = targetId ?? randomId()
    const scale = canvas.width / (canvas.getBoundingClientRect().width || canvas.width)
    const ops: Extract<CanvasOperation,{type:'stroke'}>[] = specs.map((spec, index) => ({ owner: 'nilo', type: 'stroke', groupId, points: spec.points.map(point => ({ ...point })),
      ...(index===0&&object?{object:{...structuredClone(object),name:object.proposals.map(p=>p.subject??p.template).join('、').slice(0,240)}}:{}),
      color: spec.color, size: spec.width * scale, brushKind: spec.brushKind ?? 'round', eraser: false, referenceWidth: canvas.width, referenceHeight: canvas.height }))
    // Prepare in isolation: rejected contributions never leave partial marks.
    const next: CanvasDocument = { ...documentRef.current, coCreated: true, operations: [...documentRef.current.operations, ...(targetId?[{type:'edit' as const, owner:'nilo' as const, groupId:randomId(),targetId,replacement:ops}]:ops)] }
    const staging = document.createElement('canvas')
    staging.width = canvas.width; staging.height = canvas.height
    const stagingContext = staging.getContext('2d')
    if (!stagingContext) return false
    try {
      renderDocument(stagingContext, staging.width, staging.height, false, next)
      const snapshot = staging.toDataURL('image/png')
      context.save()
      try {
        context.globalCompositeOperation = 'copy'
        context.drawImage(staging, 0, 0)
      } finally { context.restore() }
      hiddenObjectRef.current = null
      documentRef.current = next
      revisionRef.current++
      draft.document = cloneCanvasDocument(next)
      draft.history = [snapshot]
      return true
    } catch { return false }
  }

  function getOccupancy(size = 32, hiddenId?: string) {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    const cells = Math.max(2, Math.min(256, Number.isFinite(size) ? Math.round(size) : 32))
    const hits = new Array<number>(cells * cells).fill(0)

    if (!canvas || !context) return hits
    try {
      const staging = document.createElement('canvas'); staging.width=canvas.width;staging.height=canvas.height
      const ctx=staging.getContext('2d');if(!ctx)return hits
      renderDocument(ctx,staging.width,staging.height,false,documentRef.current,hiddenId??null)
      return pixelOccupancy(ctx.getImageData(0, 0, staging.width, staging.height), cells)
    } catch { return hits }
  }

  function hasInkAt(point: { x: number; y: number }, radius: number) {
    const canvas = canvasRef.current
    if (!canvas || restoringRef.current || pointerRef.current !== null || !canvas.width || !canvas.height
      || ![point.x, point.y, radius].every(Number.isFinite) || point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1
      || radius <= 0 || radius > 64) return false
    const rect = canvas.getBoundingClientRect(), context = canvas.getContext('2d')
    if (!context || rect.width <= 0 || rect.height <= 0) return false
    const sx = canvas.width / rect.width, sy = canvas.height / rect.height
    const cx = point.x * canvas.width, cy = point.y * canvas.height
    const left = Math.max(0, Math.floor(cx - radius * sx)), top = Math.max(0, Math.floor(cy - radius * sy))
    const right = Math.min(canvas.width, Math.ceil(cx + radius * sx)), bottom = Math.min(canvas.height, Math.ceil(cy + radius * sy))
    if (right <= left || bottom <= top) return false
    try {
      // Read only the brush-sized patch. Coarse occupancy cells cannot establish
      // a real connection, especially after erasure or on high-DPI canvases.
      const { data, width, height } = context.getImageData(left, top, right - left, bottom - top)
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4
        if (data[i + 3] <= 8 || Math.min(data[i], data[i + 1], data[i + 2]) >= 242) continue
        const dx = Math.max(left + x - cx, cx - left - x - 1, 0) / sx
        const dy = Math.max(top + y - cy, cy - top - y - 1, 0) / sy
        if (Math.hypot(dx, dy) <= radius) return true
      }
    } catch { /* An unreadable canvas is not proof of a joint. */ }
    return false
  }

  function lastChildStroke() {
    const operation = [...visibleOperations(documentRef.current)].reverse().find(item => item.type === 'clear' || (item.owner === 'child' && item.type==='stroke' && !item.eraser))
    return operation?.type === 'stroke' ? operation : null
  }

  function strokeCssSize(operation: Extract<CanvasOperation, { type: 'stroke' }>) {
    const canvas = canvasRef.current
    const cssWidth = canvas?.getBoundingClientRect().width
      || (canvas?.width ?? operation.referenceWidth) / Math.min(window.devicePixelRatio || 1, 2)
    return operation.size * cssWidth / operation.referenceWidth
  }

  useImperativeHandle(forwardedRef, () => ({
    flushDraft: finishStroke,
    undo: () => {
      const owner = lastUndoOwner(documentRef.current)
      return owner ? undoOwner(owner) : false
    },
    undoCompanionStroke: () => undoOwner('nilo'),
    getUndoCounts: () => canvasUndoCounts(documentRef.current),
    getDocument: () => cloneCanvasDocument(documentRef.current),
    getRevision: () => revisionRef.current,
    commitCompanionStrokes,
    getEditableObjects: () => editableObjects(documentRef.current),
    getEditableTargets: editableTargets,
    getSelectedTarget: selectedTarget,
    selectEditTarget: id => {
      const target = editableTargets().find(item => item.id === id)
      if (!target || disabled || restoringRef.current || pointerRef.current !== null) return false
      setSelection(target.groupIds, target.id)
      return true
    },
    applyAssistedEdit,
    requestSelection: () => onRequestSelection?.(),
    getSelection: () => {
      const target = selectedTarget()
      return { groupIds: target?.groupIds ?? [], bounds: target?.bounds ?? null }
    },
    setSelection,
    getSelectionCandidates: () => selectableInk().map(item => item.candidate),
    previewWithoutObject: id => { hiddenObjectRef.current=id; repaint() },
    getOccupancyWithoutObject: (id, size=256) => getOccupancy(size,id),
    async drawCompanionStroke(spec) { commitCompanionStrokes([spec], revisionRef.current) },
    clear() {
      if (disabled || restoringRef.current || pointerRef.current !== null) return
      documentRef.current.operations.push({ owner: 'child', type: 'clear', groupId: randomId() })
      selectionRef.current = { id: randomId(), groupIds: [] }
      revisionRef.current++
      repaint()
      onSelectionChange?.()
      onStrokeComplete()
    },
    download() {
      const output = makeCanvas()
      if (!output) return
      const link = document.createElement('a')
      link.download = `luma-creation-${Date.now()}.png`
      link.href = output.toDataURL('image/png')
      link.click()
    },
    exportImage: () => makeCanvas()?.toDataURL('image/png').split(',')[1] ?? null,
    exportChildImage: () => makeCanvas(true)?.toDataURL('image/png').split(',')[1] ?? null,
    exportObservation: () => makeCanvas(getCanvasProvenance(documentRef.current) !== 'unknown', 768)?.toDataURL('image/png') ?? null,
    exportCompanionObservation: () => makeCanvas(false, 768)?.toDataURL('image/png') ?? null,
    exportCompanionFocus: () => {
      try {
        const source = makeCanvas(false)
        return source ? exportCompanionFocus(source, getCompanionScene(documentRef.current)) : null
      } catch { return null } // Optional magnification must not block the full view.
    },
    getCompanionScene: () => getCompanionScene(documentRef.current),
    exportSnapshot: () => restoringRef.current || pointerRef.current !== null ? null : canvasRef.current?.toDataURL('image/png') ?? null,
    getLastStroke() {
      const op = lastChildStroke()
      return op ? { points: op.points.map(point => ({ ...point })), color: op.color, width: strokeCssSize(op), brushKind: op.brushKind } : null
    },
    getLastDrawingStyle() {
      const op = lastChildStroke()
      return op ? { brushKind: op.brushKind, color: op.color, size: strokeCssSize(op) } : null
    },
    getOccupancy,
    getCollisionPixels: () => {
      const canvas = canvasRef.current
      if (!canvas || restoringRef.current || pointerRef.current !== null
        || canvas.width * canvas.height > 4194304 || canvas.width > 4096 || canvas.height > 4096) return undefined
      try { return canvas.getContext('2d')?.getImageData(0, 0, canvas.width, canvas.height) }
      catch { return undefined }
    },
    hasInkAt,
    getInkGrid(size = 4) {
      const grid = getOccupancy(size)
      const maximum = Math.max(0.001, ...grid)
      return grid.map(cell => cell / maximum)
    },
  }))

  function getPoint(event: { clientX: number; clientY: number }) {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    return { x: Math.max(0, Math.min(canvas.width, (event.clientX - rect.left) * canvas.width / rect.width)),
      y: Math.max(0, Math.min(canvas.height, (event.clientY - rect.top) * canvas.height / rect.height)) }
  }

  function startDrawing(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (disabled || restoringRef.current || pointerRef.current !== null || !event.isPrimary || event.button !== 0) return
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    canvas.setPointerCapture(event.pointerId)
    pointerRef.current = event.pointerId
    advanceContextRevision()
    onStrokeStart?.()
    const point = getPoint(event)
    const scale = canvas.width / (canvas.getBoundingClientRect().width || canvas.width)
    const settings = { kind: brushKind, color, size: brushSize * scale, eraser: isEraser }
    currentStrokeRef.current = { owner: 'child', type: 'stroke', groupId: randomId(),
      points: [{ x: point.x / canvas.width, y: point.y / canvas.height }], color, size: settings.size, brushKind, eraser: isEraser,
      referenceWidth: canvas.width, referenceHeight: canvas.height,
      ...(!isEraser && tracingContext ? {guidance:{guideId:tracingContext.guideId,name:tracingContext.name,subjects:[...tracingContext.subjects]}} : {}) }
    painterRef.current = createStrokePainter(context, settings, point)
  }

  function addPoint(event: { clientX: number; clientY: number }) {
    const op = currentStrokeRef.current
    if (!op) return
    const point = getPoint(event)
    painterRef.current?.moveTo(point)
    const normalized = { x: point.x / op.referenceWidth, y: point.y / op.referenceHeight }
    const previous = op.points.at(-1)
    if (!previous || previous.x !== normalized.x || previous.y !== normalized.y) op.points.push(normalized)
  }

  function draw(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (pointerRef.current !== event.pointerId) return
    const samples = event.nativeEvent.getCoalescedEvents?.() ?? []
    if (samples.length) samples.forEach(addPoint)
    else addPoint(event)
  }

  function finishStroke() {
    const pointerId = pointerRef.current
    const op = currentStrokeRef.current
    pointerRef.current = null
    painterRef.current = null
    currentStrokeRef.current = null
    if (pointerId !== null && canvasRef.current?.hasPointerCapture(pointerId)) canvasRef.current.releasePointerCapture(pointerId)
    if (op) {
      documentRef.current.operations.push(op)
      revisionRef.current++
      persist()
      onStrokeComplete()
    }
  }

  function finishDrawing(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (pointerRef.current !== event.pointerId) return
    if (event.type === 'pointerup') addPoint(event)
    finishStroke()
  }

  return <canvas ref={canvasRef} className="relative z-[1] block h-full min-h-0 w-full cursor-crosshair touch-none rounded-[1.5rem]"
    aria-label={t('自由绘画画布')} onPointerDown={startDrawing} onPointerMove={draw} onPointerUp={finishDrawing}
    onPointerCancel={finishDrawing} onLostPointerCapture={finishDrawing} />
})
