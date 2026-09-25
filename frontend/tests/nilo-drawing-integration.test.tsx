import { visibleOperations } from '@/features/child/canvasDocument'
import { getDrawingRecipe } from '../../shared/niloRecipes.mjs'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { ChildCreatePage } from '@/features/child/pages/ChildCreatePage'
import { clearChildDraft, getChildDraft } from '@/features/child/draft'
import { readStoredDraft } from '@/features/child/draftRecovery'
import { analyzeDrawing, requestNiloPraise, requestNiloStroke } from '@/lib/api/lumaApi'
import { authFetch } from '@/lib/api/authFetch'
import type { Artwork } from '@/features/child/artworks'
import { proposalStrokes, type CompanionReply } from '@/features/child/companion/proposals'
import { setLocale } from '@/i18n'
import { customSketchExamples } from './fixtures/customSketches'

const { startTour } = vi.hoisted(() => ({ startTour: vi.fn() }))
vi.mock('@/features/auth/AuthContext', () => ({
  useAuth: () => ({ session: { id: 'guest-child', role: 'child', displayName: '小朋友', isGuest: true } }),
}))
vi.mock('@/features/onboarding/OnboardingContext', () => ({ useOnboarding: () => ({ active: false, completeInteraction: vi.fn() }) }))
vi.mock('@/features/onboarding/useOnboardingTour', () => ({ useOnboardingTour: () => startTour }))
vi.mock('@/lib/api/authFetch', () => ({ authFetch: vi.fn() }))
vi.mock('@/features/child/companion/materialCuration', () => ({ refreshMaterialCuration: vi.fn(async () => {}) }))
vi.mock('../../server/src/services/tracing.js', () => ({ traceLLM: vi.fn(), traceNode: vi.fn() }))
vi.mock('@/lib/api/lumaApi', () => ({ analyzeDrawing: vi.fn(), requestNiloPraise: vi.fn(), requestNiloStroke: vi.fn() }))
vi.mock('framer-motion', async original => ({
  ...await original<typeof import('framer-motion')>(),
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
}))

const proposed: CompanionReply = {
  reply: '水波可以陪着小船旅行，画法由你来决定。', theme: '去旅行的小船',
  proposal: { template: 'waves', x: .55, y: .55, width: .22, height: .13, rotation: 0, color: '#4aa5d8', strokeWidth: 3, target: '船', relation: '下方水面' },
}
let companionReply: (body: unknown) => Promise<CompanionReply>
class PreviewRecognition {
  static current: PreviewRecognition
  onresult?: (event: { results: { isFinal: boolean; 0: { transcript: string } }[] }) => void
  onstart?: () => void
  start = () => this.onstart?.(); stop = vi.fn(); abort = vi.fn()
  constructor() { PreviewRecognition.current = this }
}
let ink: WeakMap<HTMLCanvasElement, Set<string>>
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
  vi.clearAllMocks()
  vi.stubGlobal('SpeechRecognition', PreviewRecognition)
  localStorage.clear(); sessionStorage.clear(); clearChildDraft(); act(() => setLocale('zh'))
  // Audio hardware and recognition have their own permission/race tests.
  localStorage.setItem('luma:voice-sound:guest-child', 'off')
  getChildDraft('guest-child').artworkId = 'open-drawing'
  companionReply = () => Promise.resolve(proposed)
  vi.mocked(authFetch).mockImplementation((path, options) => {
    if (path === '/nilo/voice/config') return Promise.resolve({ asr: false, tts: false })
    if (path === '/nilo/companion') return companionReply(options?.body)
    return Promise.reject(new Error(`Unexpected request: ${path}`))
  })
  vi.mocked(analyzeDrawing).mockResolvedValue({
    features: { rawDescription: '孩子的船', elements: ['船'], colors: null, composition: null, distortions: [], erasureMarks: 0, confidence: {} },
    feedbackText: '看到了你的船', followUp: '它要去哪里呢？',
  })
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
  ink = new WeakMap()
  const contexts = new WeakMap<HTMLCanvasElement, CanvasRenderingContext2D>()
  const getContext = (canvas: HTMLCanvasElement) => {
    if (!contexts.has(canvas)) {
      ink.set(canvas, new Set())
      const ctx = {
        save: vi.fn(), restore: vi.fn(), scale: vi.fn(), translate: vi.fn(), rotate: vi.fn(),
        beginPath: vi.fn(), closePath: vi.fn(), arc: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), setLineDash: vi.fn(), stroke: vi.fn(() => ink.get(canvas)!.add(String(ctx.strokeStyle))),
        clearRect: vi.fn(() => ink.get(canvas)!.clear()),
        fill: vi.fn(() => ink.get(canvas)!.add(String(ctx.fillStyle))),
        fillRect: vi.fn(() => { if (ctx.fillStyle !== '#fffdf8') ink.get(canvas)!.add(String(ctx.fillStyle)) }),
        drawImage: vi.fn((source: CanvasImageSource) => {
          if (source instanceof HTMLCanvasElement) {
            if (ctx.globalCompositeOperation === 'copy') ink.get(canvas)!.clear()
            ink.get(source)?.forEach(color => ink.get(canvas)!.add(color))
          }
        }),
        getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(320 * 240 * 4), width: 320, height: 240 })),
        globalAlpha: 1, globalCompositeOperation: 'source-over', fillStyle: '',
      } as unknown as CanvasRenderingContext2D
      contexts.set(canvas, ctx)
    }
    return contexts.get(canvas)!
  }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) { return getContext(this) })
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(function (this: HTMLCanvasElement) {
    return `data:image/png;base64,${btoa(JSON.stringify([...(ink.get(this) ?? [])].sort()))}`
  })
  vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 320, height: 240 } as DOMRect)
  const elementRect = HTMLElement.prototype.getBoundingClientRect
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (this.hasAttribute('data-drawing-surface') || this.hasAttribute('data-drawing-surface-frame')) {
      return { left: 0, top: 0, width: 320, height: 240 } as DOMRect
    }
    return elementRect.call(this)
  })
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  vi.stubGlobal('Image', class { width = 320; height = 240; onload?: () => void; set src(_value: string) { this.onload?.() } })
})
afterEach(() => {
  cleanup(); clearChildDraft(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.clearAllMocks()
})

function prepare(path = '/child/create') {
  render(<MemoryRouter initialEntries={[path]}><ChildCreatePage /></MemoryRouter>)
  const canvas = document.querySelector('canvas[aria-label="自由绘画画布"]') as HTMLCanvasElement
  if (canvas) { canvas.setPointerCapture = vi.fn(); canvas.hasPointerCapture = vi.fn().mockReturnValue(true); canvas.releasePointerCapture = vi.fn() }
  return canvas
}
function pointer(canvas: HTMLCanvasElement, type: string) {
  const event = new Event(type, { bubbles: true })
  Object.assign(event, { pointerId: 1, isPrimary: true, button: 0, clientX: 20, clientY: 30 })
  fireEvent(canvas, event)
}
function draw(canvas: HTMLCanvasElement) { pointer(canvas, 'pointerdown'); pointer(canvas, 'pointerup') }

test('a recognition failure never substitutes random strokes, releases the button, and permits the next drawing', async () => {
  localStorage.setItem('luma_companion_mode:guest-child', 'together')
  draw(prepare())
  const question = '我还没看清刚画的这一部分。它是什么呀？'
  companionReply = async () => ({ status: 'clarify', reason: 'unclear_target', reply: question })
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Nilo，你来画' })))
  expect(screen.queryByText(question)).toBeNull()
  expect((screen.getByRole('button', { name: 'Nilo，你来画' }) as HTMLButtonElement).disabled).toBe(false)
  expect(operations().some(op => op.owner === 'nilo')).toBe(false)
  await act(async () => vi.advanceTimersByTimeAsync(1200))
  expect(screen.queryByRole('button', { name: '留下来' })).toBeNull()
  expect(operations().some(op => op.owner === 'nilo')).toBe(false)
  expect((screen.getByRole('button', { name: 'Nilo，你来画' }) as HTMLButtonElement).disabled).toBe(false)
  companionReply = async () => proposed
  await act(async () => vi.advanceTimersByTimeAsync(1600))
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Nilo，你来画' })))
  await act(async () => vi.advanceTimersByTimeAsync(1200))
  expect(screen.queryByRole('button', { name: '留下来' })).toBeNull()
  expect(screen.getByLabelText('Nilo 的灰色虚线描摹底图')).toBeTruthy()
})

test('undo removes the latest child stroke while leaving the guide available', async () => {
  localStorage.setItem('luma_companion_mode:guest-child', 'together')
  const canvas = prepare(); draw(canvas)
  const before = structuredClone(operations())
  await project(); draw(canvas)
  expect(operations()).toHaveLength(2)
  fireEvent.click(screen.getByRole('button', { name: '撤销', exact: true }))
  expect(operations()).toEqual(before)
  expect(screen.getByLabelText('Nilo 的灰色虚线描摹底图')).toBeTruthy()
  expect(readStoredDraft('guest-child', null)?.canvas.document?.operations).toEqual(before)
  expect(readStoredDraft('guest-child', null)?.tracingGuide).toBeTruthy()
})

test('drawing during reveal completes the guide without discarding it or inserting model ink', async () => {
  localStorage.setItem('luma_companion_mode:guest-child', 'together')
  const canvas = prepare(); draw(canvas)
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Nilo，你来画' })))
  expect(document.querySelector('.nilo-turn-drawing')).toBeTruthy()
  draw(canvas)
  expect(document.querySelector('.nilo-turn-drawing')).toBeNull()
  await act(async () => vi.advanceTimersByTimeAsync(1500))
  expect(screen.getByLabelText('Nilo 的灰色虚线描摹底图')).toBeTruthy()
  expect(operations()).toHaveLength(2)
  expect(operations().every(op => op.owner === 'child')).toBe(true)
})

test('a prose-only claim does not fabricate drawing or alter the saved child ink', async () => {
  localStorage.setItem('luma_companion_mode:guest-child', 'together')
  const caption = '我在右边的形状上加了一个小翻页，它看起来更像一本打开的书了。'
  companionReply = async () => ({ status: 'clarify', reply: caption })
  draw(prepare())
  const before = structuredClone(operations())
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Nilo，你来画' })))
  await act(async () => vi.advanceTimersByTimeAsync(1500))
  expect(screen.queryByText(caption)).toBeNull()
  expect(screen.queryByRole('button',{name:'留下来'})).toBeNull()
  expect(operations().filter(op => op.owner === 'child')).toEqual(before)
  expect(operations().filter(op => op.owner === 'nilo').length).toBe(0)
  expect(readStoredDraft('guest-child', null)?.canvas.document?.operations).toEqual(operations())
  expect(operations()).toEqual(before)
})

test('refresh restores the guide separately from authored strokes; clearing preserves every stroke', async () => {
  localStorage.setItem('luma_companion_mode:guest-child', 'together')
  const canvas = prepare(); draw(canvas); await project(); draw(canvas)
  const before = structuredClone(operations()), guide = structuredClone(getChildDraft('guest-child').tracingGuide)
  cleanup(); clearChildDraft(); prepare()
  expect(screen.getByRole('dialog', { name: '要接着上次的画继续吗？' })).toBeTruthy()
  expect(screen.queryByLabelText('自由绘画画布')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '继续上次画布' }))
  expect(operations()).toEqual(before)
  expect(getChildDraft('guest-child').tracingGuide).toEqual(guide)
  expect(screen.getByLabelText('Nilo 的灰色虚线描摹底图')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '清除底图' }))
  expect(operations()).toEqual(before)
  expect(readStoredDraft('guest-child', null)?.tracingGuide).toBeUndefined()
  expect(screen.queryByLabelText('Nilo 的灰色虚线描摹底图')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '撤销', exact: true }))
  expect(operations()).toHaveLength(1)
})

test('a high-resolution illustration can be traced, inspected and restored without entering saved ink', async () => {
  localStorage.setItem('luma_companion_mode:guest-child', 'together')
  companionReply = async () => ({ reply: '看看书页和手的位置，再画出你的版本。', proposal: {
    ...proposed.proposal!, template: 'illustration', illustrationId: 'illustration-reading-child', subject: '读书的孩子',
    contribution: 'object', x: .2, y: .2, width: .55, height: .65,
  } })
  const canvas = prepare(); draw(canvas)
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Nilo，你来画' })))
  const overlay = screen.getByLabelText('Nilo 的插画参考底图')
  const reference = overlay.querySelector('img')!
  expect(reference.getAttribute('src')).toMatch(/^\/nilo-illustrations\//)
  expect(screen.queryByRole('button', { name: '留下来' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '看原图' }))
  expect(reference.classList.contains('nilo-illustration-original')).toBe(true)
  draw(canvas)
  const inkBefore = structuredClone(operations())
  expect(inkBefore.every(operation => operation.owner === 'child')).toBe(true)
  expect(readStoredDraft('guest-child', null)?.tracingGuide?.proposal.illustrationId).toBe('illustration-reading-child')
  cleanup(); clearChildDraft(); prepare()
  fireEvent.click(screen.getByRole('button', { name: '继续上次画布' }))
  expect(screen.getByLabelText('Nilo 的插画参考底图')).toBeTruthy()
  expect(screen.getByRole('button', { name: '看原图' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '清除底图' }))
  expect(screen.queryByLabelText('Nilo 的插画参考底图')).toBeNull()
  expect(operations()).toEqual(inkBefore)
  expect(readStoredDraft('guest-child', null)?.tracingGuide).toBeUndefined()
})

test('starting over explicitly discards the recovery rather than restoring it again on the next refresh', () => {
  draw(prepare())
  cleanup(); clearChildDraft(); prepare()
  fireEvent.click(screen.getByRole('button',{name:'重新开始'}))
  expect(operations()).toHaveLength(0)
  expect(getChildDraft('guest-child').artworkId).toBeUndefined()
  expect(readStoredDraft('guest-child',null)).toBeNull()
})

test.each(['继续上次画布', '打开已保存版本'])('refreshing an edited album artwork respects the choice %s without overwriting the saved version', async choice => {
  draw(prepare())
  await act(async () => fireEvent.click(screen.getByRole('button',{name:'保存'})))
  const saved: Artwork = JSON.parse(localStorage.getItem('luma_guest_artworks_v1')!)[0]
  cleanup(); clearChildDraft()
  const path = `/child/create?artwork=${encodeURIComponent(saved.id)}`
  prepare(path)
  await act(async () => {})
  const canvas = screen.getByLabelText('自由绘画画布') as HTMLCanvasElement
  canvas.setPointerCapture = vi.fn(); canvas.hasPointerCapture = vi.fn().mockReturnValue(true); canvas.releasePointerCapture = vi.fn()
  draw(canvas)
  expect(operations()).toHaveLength(2)
  cleanup(); clearChildDraft(); prepare(path)
  expect(screen.getByRole('dialog')).toBeTruthy()
  await act(async () => fireEvent.click(screen.getByRole('button',{name:choice})))
  expect(operations()).toHaveLength(choice === '继续上次画布' ? 2 : 1)
  expect(JSON.parse(localStorage.getItem('luma_guest_artworks_v1')!)[0]).toEqual(saved)
})

test('refresh flushes an in-progress stroke; blocked storage warns and requests the browser leave confirmation', () => {
  const canvas = prepare()
  pointer(canvas,'pointerdown')
  fireEvent(window,new Event('beforeunload',{cancelable:true}))
  expect(readStoredDraft('guest-child',null)?.canvas.document?.operations).toHaveLength(1)
  vi.spyOn(Storage.prototype,'setItem').mockImplementation(() => { throw new DOMException('full','QuotaExceededError') })
  draw(canvas)
  expect(screen.getByRole('alert').textContent).toContain('草稿暂存失败')
  const leave = new Event('beforeunload',{cancelable:true})
  fireEvent(window,leave)
  expect(leave.defaultPrevented).toBe(true)
})
const requests = () => vi.mocked(authFetch).mock.calls.filter(([path]) => path === '/nilo/companion')
const operations = () => getChildDraft('guest-child').canvas.document!.operations
async function project() {
  await act(async () => fireEvent.click(screen.getByRole('button', { name: '和 Nilo 说话' })))
  await act(async () => {
    PreviewRecognition.current.onresult?.({ results: [{ isFinal: true, 0: { transcript: '请帮我画一个有关的小主意' } }] })
    await vi.advanceTimersByTimeAsync(2800)
  })
  expect(screen.getByLabelText('Nilo 的灰色虚线描摹底图')).toBeTruthy()
  expect(screen.getByRole('button', { name: '清除底图' })).toBeTruthy()
  expect(screen.queryByRole('button', { name: '留下来' })).toBeNull()
}

test('the guide survives saving and tab hiding without entering the saved artwork', async () => {
  localStorage.setItem('luma_companion_mode:guest-child', 'together')
  const canvas = prepare(); draw(canvas); await project(); draw(canvas)
  const guide = structuredClone(getChildDraft('guest-child').tracingGuide)
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
  fireEvent(document, new Event('visibilitychange'))
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
  fireEvent(document, new Event('visibilitychange'))
  expect(getChildDraft('guest-child').tracingGuide).toEqual(guide)
  await act(async () => fireEvent.click(screen.getByRole('button', { name: '保存' })))
  const saved: Artwork = JSON.parse(localStorage.getItem('luma_guest_artworks_v1')!)[0]
  expect(saved.document?.operations).toEqual(operations())
  expect(saved.document?.operations.every(op => op.owner === 'child')).toBe(true)
  expect(screen.getByLabelText('Nilo 的灰色虚线描摹底图')).toBeTruthy()
})

test.each(['保存', '完成'])('%s during an unconfirmed click animation saves only committed child ink', async action => {
  localStorage.setItem('luma_companion_mode:guest-child', 'together')
  draw(prepare())
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Nilo，你来画' })))
  await act(async () => fireEvent.click(screen.getByRole('button', { name: action })))
  const saved: Artwork = JSON.parse(localStorage.getItem('luma_guest_artworks_v1')!)[0]
  const nilo = saved.document!.operations.filter(op => op.owner === 'nilo')
  expect(nilo).toHaveLength(0)
  expect(saved.provenance).toBe('co-created')
  await act(async () => vi.advanceTimersByTimeAsync(1500))
  expect(operations().filter(op => op.owner === 'nilo')).toEqual(nilo)
  if (action === '完成') expect(vi.mocked(analyzeDrawing).mock.calls[0][4]).toBe('co-created')
})

test('Nilo handoff speaks the preview without opening the microphone, and sends the child brush style', async () => {
  localStorage.setItem('luma_companion_mode:guest-child', 'together')
  localStorage.setItem('luma:voice-sound:guest-child', 'on')
  const speak = vi.fn(), microphone = vi.fn()
  vi.stubGlobal('speechSynthesis', { speak, cancel: vi.fn() })
  vi.stubGlobal('SpeechSynthesisUtterance', class { text: string; constructor(text: string) { this.text = text } })
  vi.stubGlobal('SpeechRecognition', class { start = microphone; abort = vi.fn() })
  const canvas = prepare()
  fireEvent.click(screen.getByRole('button', { name: '画笔工具' }))
  fireEvent.click(screen.getByRole('button', { name: '蜡笔' }))
  fireEvent.click(screen.getByRole('button', { name: '草莓红' }))
  fireEvent.change(screen.getByRole('slider', { name: '画笔粗细' }), { target: { value: '9' } })
  draw(canvas)
  companionReply = () => Promise.resolve({ ...proposed, proposal: { ...proposed.proposal!, brushKind: 'crayon', color: '#d74952', strokeWidth: 9 } })
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Nilo，你来画' })))
  const body = requests()[0][1]?.body as { context: { drawingStyle: unknown; takeTurn: boolean } }
  expect(body.context.takeTurn).toBe(true)
  expect(body.context.drawingStyle).toEqual({ brushKind: 'crayon', color: '#d74952', brushSize: 9 })
  expect(screen.queryByRole('button', { name: '留下来' })).toBeNull()
  expect(screen.getByLabelText('Nilo 的灰色虚线描摹底图')).toBeTruthy()
  expect(operations().every(operation => operation.owner === 'child')).toBe(true)
  await act(async () => vi.advanceTimersByTimeAsync(1200))
  expect(screen.queryByRole('button', { name: '留下来' })).toBeNull()
  expect(operations().every(op => op.owner === 'child')).toBe(true)
  expect(getChildDraft('guest-child').tracingGuide?.proposal).toMatchObject({ brushKind: 'crayon', color: '#d74952', strokeWidth: 9 })
  expect(speak).toHaveBeenCalledOnce()
  const spoken = speak.mock.calls[0][0].text
  expect(spoken).toContain(proposed.reply)
  expect(spoken).toContain('虚线')
  expect(screen.getByText(spoken)).toBeTruthy()
  expect(microphone).not.toHaveBeenCalled()
})

test.each(['这是小船，请帮我画水波', '你帮我再换一个星星吧'])('the microphone delivers %s as a retained tracing guide', async utterance => {
  if (utterance.includes('星星')) {
    // Exercise the real server planner and validators, not a canned model reply.
    const { generateNiloDialogue } = await import('../../server/src/services/niloDialogue.js')
    companionReply = body => generateNiloDialogue(body)
  }
  class Recognition {
    static current: Recognition
    onresult?: (event: { results: { isFinal: boolean; 0: { transcript: string } }[] }) => void
    onend?: () => void
    onstart?: () => void
    start = vi.fn(() => this.onstart?.()); stop = vi.fn(); abort = vi.fn()
    constructor() { Recognition.current = this }
  }
  vi.stubGlobal('SpeechRecognition', Recognition)
  localStorage.setItem('luma_companion_mode:guest-child', 'together')
  const canvas = prepare()
  draw(canvas)
  await act(async () => { await Promise.resolve() })
  fireEvent.click(screen.getByRole('button', { name: '和 Nilo 说话' }))
  expect(Recognition.current.start).toHaveBeenCalledOnce()
  await act(async () => {
    Recognition.current.onresult?.({ results: [{ isFinal: true, 0: { transcript: utterance } }] })
    await vi.advanceTimersByTimeAsync(2200)
  })
  const body = requests()[0][1]?.body as { context: { utterance: string; requestDrawing: boolean; inferDrawingIntent: boolean } }
  expect(body.context.utterance).toBe(utterance)
  expect(body.context.requestDrawing || body.context.inferDrawingIntent).toBe(true)
  await act(async () => vi.advanceTimersByTimeAsync(550))
  expect(operations().filter(op=>op.owner==='nilo')).toHaveLength(0)
  expect(screen.queryByText(new RegExp(`你说：${utterance}`))).toBeNull()
  expect(screen.queryByLabelText('Nilo 的投影，尚未加入画作')).toBeNull()
  expect(screen.getByLabelText('Nilo 的灰色虚线描摹底图')).toBeTruthy()
  expect(screen.getByRole('button', { name: '撤销', exact: true })).toBeTruthy()
  if (utterance.includes('星星')) {
    expect(getChildDraft('guest-child').tracingGuide?.proposal).toBeTruthy()
    expect(screen.queryByLabelText('Nilo 的投影，尚未加入画作')).toBeNull()
    expect(screen.getByRole('button', { name: '撤销', exact: true })).toBeTruthy()
  }
})

test.each([['我自己画', 'off'], ['和 Nilo 一起画', 'together']] as const)('one-screen welcome really selects %s without a forced tour or semicircle', async (label, mode) => {
  clearChildDraft()
  const canvas = prepare()
  const welcome = screen.getByRole('dialog', { name: '今天想自己画，还是和我一起画？' })
  expect(within(welcome).getByRole('button', { name: '和 Nilo 一起画' })).toBeTruthy()
  expect(within(welcome).getByRole('button', { name: '我自己画' })).toBeTruthy()
  expect(screen.queryByText('继续听～')).toBeNull()
  fireEvent.click(within(welcome).getByRole('button', { name: label }))
  expect(screen.queryByRole('dialog', { name: '今天想自己画，还是和我一起画？' })).toBeNull()
  expect(screen.getByRole('button', { name: label }).getAttribute('aria-pressed')).toBe('true')
  expect(localStorage.getItem('luma_companion_mode:guest-child')).toBe(mode)
  expect(screen.queryByRole('dialog', { name: '告诉 Nilo 你的想法' })).toBeNull()
  expect(within(screen.getByRole('group', { name: '引导图形' })).getByRole('button', { name: '换图形' }).getAttribute('title')).toBe('换图形 · 自由画')
  expect(operations()).toEqual([])
  draw(canvas)
  await act(async () => vi.advanceTimersByTimeAsync(120000))
  expect(startTour).not.toHaveBeenCalled()
  expect(requests()).toHaveLength(0)
  expect(requestNiloPraise).not.toHaveBeenCalled()
  expect(requestNiloStroke).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '怎么玩' }))
  expect(startTour).toHaveBeenCalledOnce()
})

test('drag and resize a gray guide, then save and reopen exactly the chosen position and size',async()=>{
  const recipe=getDrawingRecipe('rabbit-2')!
  companionReply=()=>Promise.resolve({reply:'来一只小兔子',geometryReviewed:true,proposal:{template:'custom',subject:recipe.name,recipeId:recipe.id,
    contribution:'object',placementPolicy:'free',sketch:recipe.sketch,x:.3,y:.25,width:.15,height:.25,rotation:0,color:'#ab6986',strokeWidth:4,target:'画面',relation:'小伙伴'}})
  const canvas=prepare();draw(canvas)
  fireEvent.click(screen.getByRole('button',{name:'和 Nilo 一起画'}))
  const child=structuredClone(operations())
  await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Nilo，你来画'})))
  await act(async()=>vi.advanceTimersByTimeAsync(1200))
  const interact=(name:string,start:[number,number],end:[number,number])=>{
    const button=screen.getByRole('button',{name})
    button.setPointerCapture=vi.fn();button.hasPointerCapture=vi.fn(()=>true);button.releasePointerCapture=vi.fn()
    for(const [type,point] of [['pointerdown',start],['pointermove',end],['pointerup',end]] as const){
      const event=new Event(type,{bubbles:true,cancelable:true});Object.assign(event,{pointerId:5,isPrimary:true,button:0,clientX:point[0],clientY:point[1]});fireEvent(button,event)
    }
  }
  interact('拖动 Nilo 的投影',[100,80],[132,104])
  interact('调整 Nilo 投影大小',[160,120],[168,126])
  expect(operations()).toEqual(child)
  const selected=getChildDraft('guest-child').tracingGuide?.proposal
  expect(selected?.x).toBeCloseTo(.4);expect(selected?.y).toBeCloseTo(.35)
  expect(selected!.width/selected!.height).toBeCloseTo(.15/.25)
  expect(selected!.width).toBeGreaterThan(.15);expect(selected?.color).toBe('#ab6986')
  await act(async()=>fireEvent.click(screen.getByRole('button',{name:'保存'})))
  cleanup();clearChildDraft();prepare();fireEvent.click(screen.getByRole('button',{name:'继续上次画布'}))
  expect(getChildDraft('guest-child').tracingGuide?.proposal).toEqual(selected)
  fireEvent.click(screen.getByRole('button',{name:'清除底图'}))
  expect(operations()).toEqual(child)
})

test('multi-element guides are uniformly gray and excluded from authored image and scene context', async () => {
  const colors = ['#4aa5d8', '#d74952', '#168a78', '#edcd70']
  const elements = [[.18, .16], [.62, .16], [.18, .61], [.62, .61]].map(([x, y], index) => ({
    ...proposed.proposal!, template: 'sun' as const, x, y, width: .17, height: .22, color: colors[index], brushKind: 'pencil' as const, strokeWidth: 3,
  }))
  companionReply = () => Promise.resolve({ ...proposed, proposal: elements[0], additions: elements.slice(1) })
  const canvas = prepare(); draw(canvas)
  fireEvent.click(screen.getByRole('button', { name: '和 Nilo 一起画' })); await project()
  expect(getChildDraft('guest-child').tracingGuide?.additions).toHaveLength(3)
  expect(ink.get(document.querySelector<HTMLCanvasElement>('.nilo-projection canvas')!)).toEqual(new Set(['#9ca3af']))
  expect(ink.get(canvas)).toEqual(new Set(['#20352f']))
  companionReply = () => Promise.resolve({ reply: '慢慢描，我陪着你。' })
  await sayToNilo('你觉得我的画怎么样')
  const body = requests().at(-1)![1]?.body as { imageBase64: string; context: { tracingGuide: boolean; currentAdditions: unknown[]; imageProvenance: string; scene: { recentContributions: { owner: string }[] } } }
  expect(JSON.parse(atob(body.imageBase64))).toEqual(['#20352f'])
  expect(body.context.tracingGuide).toBe(true)
  expect(body.context.currentAdditions).toHaveLength(3)
  expect(body.context.imageProvenance).toBe('composite')
  expect(body.context.scene.recentContributions.map(op => op.owner)).toEqual(['child'])
  expect(screen.getByLabelText('Nilo 的灰色虚线描摹底图')).toBeTruthy()
})

test('custom paths recover losslessly as a guide without entering analysis or authored images', async () => {
  localStorage.setItem('luma_companion_mode:guest-child', 'together')
  companionReply = () => Promise.resolve({ status: 'ready', reply: '机器人、火箭和恐龙，先给你看看。', proposal: customSketchExamples[0], additions: customSketchExamples.slice(1) })
  const canvas = prepare(); draw(canvas); await project()
  const guide = structuredClone(getChildDraft('guest-child').tracingGuide)
  expect(guide?.additions).toHaveLength(2)
  cleanup(); clearChildDraft(); prepare()
  fireEvent.click(screen.getByRole('button', { name: '继续上次画布' }))
  expect(getChildDraft('guest-child').tracingGuide).toEqual(guide)
  await act(async () => fireEvent.click(screen.getByRole('button', { name: '完成' })))
  const [image, , , , provenance, display] = vi.mocked(analyzeDrawing).mock.calls[0]
  expect(JSON.parse(atob(image))).toEqual(['#20352f'])
  expect(provenance).toBe('co-created')
  expect(JSON.parse(atob(display!.displayImageBase64!))).toEqual(['#20352f'])
  expect(screen.getByLabelText('Nilo 的灰色虚线描摹底图')).toBeTruthy()
})

test('dismissing a projection and saving it never adds the projected content to the document or image', async () => {
  const canvas = prepare(); draw(canvas)
  fireEvent.click(screen.getByRole('button', { name: '和 Nilo 一起画' }))
  await project()
  fireEvent.click(screen.getByRole('button', { name: '清除底图' }))
  expect(operations().map(operation => operation.owner)).toEqual(['child'])
  await act(async () => fireEvent.click(screen.getByRole('button', { name: '保存' })))
  const saved: Artwork = JSON.parse(localStorage.getItem('luma_guest_artworks_v1')!)[0]
  expect(saved.document?.operations.map(operation => operation.owner)).toEqual(['child'])
  expect(JSON.parse(atob(saved.image.split(',')[1]))).toEqual(['#20352f'])
})

test('drawing keeps the guide while invalidating a pending replacement', async () => {
  const canvas = prepare(); draw(canvas)
  fireEvent.click(screen.getByRole('button', { name: '和 Nilo 一起画' })); await project(); draw(canvas)
  const guide = structuredClone(getChildDraft('guest-child').tracingGuide)
  await act(async () => vi.advanceTimersByTimeAsync(1600))
  let finish!: (reply: CompanionReply) => void
  companionReply = () => new Promise(resolve => { finish = resolve })
  await sayToNilo('换个画法')
  const pending = requests().at(-1)![1]
  draw(canvas)
  expect(pending?.signal?.aborted).toBe(true)
  await act(async () => { finish(proposed); await vi.advanceTimersByTimeAsync(600) })
  expect(screen.getByLabelText('Nilo 的灰色虚线描摹底图')).toBeTruthy()
  expect(getChildDraft('guest-child').tracingGuide).toEqual(guide)
  expect(operations().every(op => op.owner === 'child')).toBe(true)
})

test('choose-another opens a concrete subject gallery and a clicked raster replaces only the guide', async () => {
  const canvas = prepare(); draw(canvas)
  companionReply = async () => ({ reply: '小猫的底图来啦。', proposal: { ...proposed.proposal!, x: .3, y: .3, width: .28, height: .3,
    template: 'custom', subject: '小猫', recipeId: 'cat-0', sketch: getDrawingRecipe('cat-0')!.sketch } })
  fireEvent.click(screen.getByRole('button', { name: '和 Nilo 一起画' })); await project()
  const childInk = structuredClone(operations())
  const guide = structuredClone(getChildDraft('guest-child').tracingGuide)
  await act(async () => fireEvent.click(screen.getByRole('button', { name: '换一个' })))
  expect(screen.getByRole('heading', { name: '小猫' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '关闭，不换底图' }))
  expect(getChildDraft('guest-child').tracingGuide).toEqual(guide)
  await act(async () => fireEvent.click(screen.getByRole('button', { name: '换一个' })))
  fireEvent.change(screen.getByLabelText('找找想画什么'), { target: { value: '学校' } })
  const cards = within(screen.getByRole('region', { name: '可选画法' })).getAllByRole('button')
  const schoolCard = cards.find(card => card.querySelector('img')?.getAttribute('src') === '/nilo-illustrations/illustration-medium-school.png')!
  await act(async () => fireEvent.click(schoolCard))
  expect(screen.queryByRole('dialog', { name: '挑一张来画' })).toBeNull()
  expect(getChildDraft('guest-child').tracingGuide?.proposal).toMatchObject({ template: 'illustration', illustrationId: 'illustration-medium-school' })
  expect(operations()).toEqual(childInk)
  expect(requests()).toHaveLength(1)
  await act(async () => fireEvent.click(screen.getByRole('button', { name: '保存' })))
  const saved: Artwork = JSON.parse(localStorage.getItem('luma_guest_artworks_v1')!)[0]
  expect(saved.document?.operations).toEqual(childInk)
  expect(JSON.parse(atob(saved.image.split(',')[1]))).toEqual(['#20352f'])
})

test('finish and download export child strokes without the gray guide', async () => {
  const canvas = prepare(); draw(canvas)
  fireEvent.click(screen.getByRole('button', { name: '和 Nilo 一起画' })); await project(); draw(canvas)
  let download = ''
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { download = this.href })
  fireEvent.click(screen.getByRole('button', { name: '下载' }))
  expect(JSON.parse(atob(download.split(',')[1]))).toEqual(['#20352f'])
  await act(async () => fireEvent.click(screen.getByRole('button', { name: '完成' })))
  const saved: Artwork = JSON.parse(localStorage.getItem('luma_guest_artworks_v1')!)[0]
  expect(saved.document?.operations).toHaveLength(2)
  expect(new Set(saved.document?.operations.map(op => op.owner))).toEqual(new Set(['child']))
  expect(saved.provenance).toBe('co-created')
  expect(JSON.parse(atob(saved.image.split(',')[1]))).toEqual(['#20352f'])
  expect(analyzeDrawing).toHaveBeenCalledOnce()
  expect(vi.mocked(analyzeDrawing).mock.calls[0][4]).toBe('co-created')
})

test('without a microphone, clicking Nilo supplies a tracing guide', async () => {
  vi.stubGlobal('SpeechRecognition', undefined)
  const canvas = prepare(); draw(canvas)
  fireEvent.click(screen.getByRole('button', { name: '和 Nilo 一起画' }))
  await act(async () => {})
  expect(screen.getByRole('button', { name: '和 Nilo 说话' }).hasAttribute('disabled')).toBe(false)
  fireEvent.click(screen.getByRole('button', { name: '和 Nilo 说话' }))
  expect(screen.getByText('这个浏览器暂时不能听你说话，可以换个浏览器，或用按钮继续。')).toBeTruthy()
  expect(screen.queryByRole('textbox')).toBeNull()
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Nilo，你来画' })))
  expect(requests()[0][1]?.body).toMatchObject({ context: { requestDrawing: true, takeTurn: true } })
  expect(screen.queryByLabelText('Nilo 的投影，尚未加入画作')).toBeNull()
  expect(requests()).toHaveLength(1)
  expect(screen.getByLabelText('Nilo 的灰色虚线描摹底图')).toBeTruthy()
  await act(async () => vi.advanceTimersByTimeAsync(1200))
  expect(screen.queryByRole('button', { name: '留下来' })).toBeNull()
  expect(screen.getByRole('button', { name: '清除底图' })).toBeTruthy()
  expect(operations().every(op => op.owner === 'child')).toBe(true)
})

test('model-selected objects stay by default and clear removes only the guide', async () => {
  vi.stubGlobal('SpeechRecognition', undefined)
  const canvas = prepare(); draw(canvas); draw(canvas); draw(canvas)
  const before = structuredClone(operations())
  fireEvent.click(screen.getByRole('button', { name: '和 Nilo 一起画' }))
  companionReply = () => Promise.resolve({ reply: '添一个机器人', geometryReviewed: true, proposal: { ...customSketchExamples[0], contribution: 'object', placementPolicy: 'free' } })
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Nilo，你来画' })))
  await act(async () => vi.advanceTimersByTimeAsync(1200))
  expect(screen.getByLabelText('Nilo 的灰色虚线描摹底图')).toBeTruthy()
  expect(operations()).toEqual(before)
  expect(requests()).toHaveLength(1)
  fireEvent.click(screen.getByRole('button', { name: '清除底图' }))
  expect(operations()).toEqual(before)
  expect(screen.queryByLabelText('Nilo 的灰色虚线描摹底图')).toBeNull()
})

test('a restored legacy work skips onboarding and is saved without inventing a child-only analysis', async () => {
  const image = 'data:image/png;base64,b2xkLWltYWdl'
  localStorage.setItem('luma_guest_artworks_v1', JSON.stringify([{ id: 'legacy', image, revision: 1, createdAt: '2026-09-01', updatedAt: '2026-09-01' }]))
  prepare('/child/create?artwork=legacy')
  await act(async () => {})
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(startTour).not.toHaveBeenCalled()
  await act(async () => fireEvent.click(screen.getByRole('button', { name: '完成' })))
  expect(analyzeDrawing).not.toHaveBeenCalled()
  expect(screen.getByText('画已保存。这幅旧画没有笔迹来源记录，暂不生成成长分析。')).toBeTruthy()
})

test('voice remains in the bottom strip and music in the header, with no text box or chat popup', async () => {
  const canvas = prepare()
  await act(async () => {})
  const dock = screen.getByRole('group', { name: 'Nilo 与声音' })
  const footer = screen.getByRole('contentinfo').parentElement!
  expect(within(dock).queryByRole('button', { name: '开启连续对话' })).toBeNull()
  fireEvent.click(within(dock).getByRole('button', { name: '声音选项' }))
  for (const name of ['Nilo，你来画', '和 Nilo 说话', '开启 Nilo 声音', '开启连续对话']) {
    const button = within(dock).getByRole('button', { name })
    expect(footer.contains(button)).toBe(true)
    expect(button.closest('[data-onboarding="canvas-paper"]')).toBeNull()
    expect(button.closest('header')).toBeNull()
  }
  const header = screen.getByRole('banner')
  expect(within(header).getByRole('button', { name: '开启背景音乐' })).toBeTruthy()
  expect(within(header).getByRole('button', { name: '选择音乐和音量' })).toBeTruthy()
  expect(screen.queryByRole('textbox')).toBeNull()
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(screen.getByRole('button', { name: '画笔工具' })).toBeTruthy()
  expect(screen.queryByRole('button', { name: '星星笔' })).toBeNull()
  expect(document.querySelector('canvas')).toBe(canvas)
})

async function sayToNilo(text:string) {
  fireEvent.click(screen.getByRole('button',{name:'和 Nilo 说话'}))
  await act(async()=>{
    PreviewRecognition.current.onresult?.({results:[{isFinal:true,0:{transcript:text}}]})
    await vi.advanceTimersByTimeAsync(2800)
  })
}