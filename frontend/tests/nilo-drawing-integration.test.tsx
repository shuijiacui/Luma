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
import type { CompanionReply } from '@/features/child/companion/proposals'
import { setLocale } from '@/i18n'
import { customSketchExamples } from './fixtures/customSketches'

const { startTour } = vi.hoisted(() => ({ startTour: vi.fn() }))
vi.mock('@/features/auth/AuthContext', () => ({
  useAuth: () => ({ session: { id: 'guest-child', role: 'child', displayName: '小朋友', isGuest: true } }),
}))
vi.mock('@/features/onboarding/OnboardingContext', () => ({ useOnboarding: () => ({ active: false, completeInteraction: vi.fn() }) }))
vi.mock('@/features/onboarding/useOnboardingTour', () => ({ useOnboardingTour: () => startTour }))
vi.mock('@/lib/api/authFetch', () => ({ authFetch: vi.fn() }))
vi.mock('../../server/src/services/tracing.js', () => ({ traceLLM: vi.fn(), traceNode: vi.fn() }))
vi.mock('@/lib/api/lumaApi', () => ({ analyzeDrawing: vi.fn(), requestNiloPraise: vi.fn(), requestNiloStroke: vi.fn() }))
vi.mock('framer-motion', async original => ({
  ...await original<typeof import('framer-motion')>(),
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
}))

const proposed: CompanionReply = {
  reply: '我给水面添两条波纹，喜欢再留下。', theme: '去旅行的小船',
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
        beginPath: vi.fn(), closePath: vi.fn(), arc: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), setLineDash: vi.fn(), stroke: vi.fn(),
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
  if(screen.queryByRole('button',{name:'留下来'}))fireEvent.click(screen.getByRole('button',{name:'留下来'}))
  expect(operations().some(op => op.owner === 'nilo')).toBe(false)
  expect((screen.getByRole('button', { name: 'Nilo，你来画' }) as HTMLButtonElement).disabled).toBe(false)
  companionReply = async () => proposed
  await act(async () => vi.advanceTimersByTimeAsync(1600))
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Nilo，你来画' })))
  await act(async () => vi.advanceTimersByTimeAsync(1200))
  if(screen.queryByRole('button',{name:'留下来'}))fireEvent.click(screen.getByRole('button',{name:'留下来'}))
  expect(operations().some(op => op.owner === 'nilo')).toBe(true)
})

test('ordinary undo removes the latest contribution in order, including all of Nilo’s paths, and persists it', async () => {
  localStorage.setItem('luma_companion_mode:guest-child', 'together')
  const canvas = prepare()
  draw(canvas)
  const childOnly = structuredClone(operations())
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Nilo，你来画' })))
  await act(async () => vi.advanceTimersByTimeAsync(1200))
  if(screen.queryByRole('button',{name:'留下来'}))fireEvent.click(screen.getByRole('button',{name:'留下来'}))
  expect(operations().filter(op => op.owner === 'nilo').length).toBeGreaterThan(1)
  const both = structuredClone(operations())
  draw(canvas)
  fireEvent.click(screen.getByRole('button', { name: '撤销', exact: true }))
  expect(operations()).toEqual(both)
  fireEvent.click(screen.getByRole('button', { name: '撤销', exact: true }))
  expect(operations()).toEqual(childOnly)
  expect(readStoredDraft('guest-child', null)?.canvas.document?.operations).toEqual(childOnly)
  cleanup(); clearChildDraft(); prepare()
  fireEvent.click(screen.getByRole('button', { name: '继续上次画布' }))
  expect(operations()).toEqual(childOnly)
  fireEvent.click(screen.getByRole('button', { name: '撤销', exact: true }))
  expect(operations()).toHaveLength(0)
})

test('undo during Nilo animation cancels the temporary drawing without erasing the child’s previous stroke', async () => {
  localStorage.setItem('luma_companion_mode:guest-child', 'together')
  draw(prepare())
  const before = structuredClone(operations())
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Nilo，你来画' })))
  expect(screen.getByLabelText('Nilo 正在画，接着你的这一笔')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '撤销', exact: true }))
  await act(async () => vi.advanceTimersByTimeAsync(1500))
  expect(screen.queryByLabelText('Nilo 正在画，接着你的这一笔')).toBeNull()
  expect(operations()).toEqual(before)
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

test('refresh offers a choice before mounting the canvas, then restores child and Nilo strokes with independent undo', async () => {
  localStorage.setItem('luma_companion_mode:guest-child', 'together')
  draw(prepare())
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Nilo，你来画' })))
  await act(async () => vi.advanceTimersByTimeAsync(1200))
  if(screen.queryByRole('button',{name:'留下来'}))fireEvent.click(screen.getByRole('button',{name:'留下来'}))
  const before = structuredClone(operations())
  expect(before.some(op => op.owner === 'nilo')).toBe(true)
  expect(readStoredDraft('guest-child',null)?.canvas.document?.operations).toEqual(before)
  cleanup(); clearChildDraft()
  prepare()
  expect(screen.getByRole('dialog', {name:'要接着上次的画继续吗？'})).toBeTruthy()
  expect(screen.queryByLabelText('自由绘画画布')).toBeNull()
  fireEvent.click(screen.getByRole('button',{name:'继续上次画布'}))
  expect(operations()).toEqual(before)
  fireEvent.click(screen.getByRole('button',{name:'撤销',exact:true}))
  expect(operations().every(op => op.owner === 'child')).toBe(true)
  expect(operations().length).toBe(before.filter(op => op.owner === 'child').length)
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
async function project(preview = true) {
  await act(async () => fireEvent.click(screen.getByRole('button', { name: '和 Nilo 说话' })))
  await act(async () => {
    PreviewRecognition.current.onresult?.({ results: [{ isFinal: true, 0: { transcript: preview ? '请先画一个有关的小主意给我看看' : '请帮我画一个有关的小主意' } }] })
    await vi.advanceTimersByTimeAsync(2200)
  })
  if (!preview) {
    await act(async()=>vi.advanceTimersByTimeAsync(550))
    expect(operations().filter(op=>op.owner==='nilo')).toHaveLength(0)
    fireEvent.click(screen.getByRole('button',{name:'留下来'}));return
  }
  expect(screen.getByText(/我画好一个小主意，先放给你看看。/)).toBeTruthy()
  expect(screen.queryByLabelText('Nilo 的投影，尚未加入画作')).toBeNull()
  await act(async () => vi.advanceTimersByTimeAsync(550))
  expect(screen.getByLabelText('Nilo 的投影，尚未加入画作')).toBeTruthy()
}

test('voice drawing is retained through the next child stroke, saving and refresh after explicit acceptance', async () => {
  localStorage.setItem('luma_companion_mode:guest-child', 'together')
  const canvas = prepare(); draw(canvas)
  await project(false)
  const nilo = structuredClone(operations().filter(op => op.owner === 'nilo'))
  expect(nilo.length).toBeGreaterThan(0)
  draw(canvas)
  expect(operations().filter(op => op.owner === 'nilo')).toEqual(nilo)
  await act(async () => fireEvent.click(screen.getByRole('button', { name: '保存' })))
  const saved: Artwork = JSON.parse(localStorage.getItem('luma_guest_artworks_v1')!)[0]
  expect(saved.document?.operations.filter(op => op.owner === 'nilo')).toEqual(nilo)
  cleanup(); clearChildDraft(); prepare()
  fireEvent.click(screen.getByRole('button', { name: '继续上次画布' }))
  expect(operations().filter(op => op.owner === 'nilo')).toEqual(nilo)
  fireEvent.click(screen.getByRole('button', { name: '撤销', exact: true }))
  expect(operations().filter(op => op.owner === 'nilo')).toEqual(nilo)
  fireEvent.click(screen.getByRole('button', { name: '撤销', exact: true }))
  expect(operations().filter(op => op.owner === 'nilo')).toHaveLength(0)
})

test.each(['保存', '完成'])('%s during an unconfirmed click animation saves only committed child ink', async action => {
  localStorage.setItem('luma_companion_mode:guest-child', 'together')
  draw(prepare())
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Nilo，你来画' })))
  await act(async () => fireEvent.click(screen.getByRole('button', { name: action })))
  const saved: Artwork = JSON.parse(localStorage.getItem('luma_guest_artworks_v1')!)[0]
  const nilo = saved.document!.operations.filter(op => op.owner === 'nilo')
  expect(nilo).toHaveLength(0)
  expect(saved.provenance).toBe('child')
  await act(async () => vi.advanceTimersByTimeAsync(1500))
  expect(operations().filter(op => op.owner === 'nilo')).toEqual(nilo)
  if (action === '完成') expect(vi.mocked(analyzeDrawing).mock.calls[0][4]).toBe('child')
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
  expect(screen.getByLabelText('Nilo 正在画，接着你的这一笔')).toBeTruthy()
  expect(operations().every(operation => operation.owner === 'child')).toBe(true)
  await act(async () => vi.advanceTimersByTimeAsync(1200))
  if(screen.queryByRole('button',{name:'留下来'}))fireEvent.click(screen.getByRole('button',{name:'留下来'}))
  expect(operations().filter(op => op.type === 'stroke' && op.owner === 'nilo')).toEqual(expect.arrayContaining([expect.objectContaining({ brushKind: 'crayon', color: '#d74952', size: 9 })]))
  expect(speak).toHaveBeenCalledOnce()
  expect(speak.mock.calls[0][0].text).toBe('先看看这个小主意，喜欢的话就留下来。')
  expect(microphone).not.toHaveBeenCalled()
})

test.each(['这是小船，请帮我画水波', '你帮我再换一个星星吧'])('the microphone delivers %s into retained, undoable ink', async utterance => {
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
  fireEvent.click(screen.getByRole('button',{name:'留下来'}))
  expect(screen.queryByText(new RegExp(`你说：${utterance}`))).toBeNull()
  expect(screen.queryByLabelText('Nilo 的投影，尚未加入画作')).toBeNull()
  expect(operations().some(op => op.owner === 'nilo')).toBe(true)
  expect(screen.getByRole('button', { name: '撤销', exact: true })).toBeTruthy()
  if (utterance.includes('星星')) {
    expect(operations().filter(op => op.type === 'stroke' && op.owner === 'nilo')).toHaveLength(1)
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

test('an HTTP-page invitation switches mode and keeps Nilo temporary until the child accepts', async () => {
  vi.stubGlobal('crypto', { getRandomValues: globalThis.crypto.getRandomValues.bind(globalThis.crypto) })
  const canvas = prepare(); draw(canvas)
  fireEvent.click(screen.getByRole('button', { name: '和 Nilo 一起画' }))
  expect((screen.getByRole('button', { name: 'Nilo，你来画' }) as HTMLButtonElement).disabled).toBe(false)
  draw(canvas)
  await act(async () => vi.advanceTimersByTimeAsync(60000))
  expect(requests()).toHaveLength(0)
  expect(operations().map(operation => operation.owner)).toEqual(['child', 'child'])
  fireEvent.click(screen.getByRole('button', { name: '我自己画' }))
  expect((screen.getByRole('button', { name: 'Nilo，你来画' }) as HTMLButtonElement).disabled).toBe(false)
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Nilo，你来画' })))
  expect(screen.getByRole('button', { name: '和 Nilo 一起画' }).getAttribute('aria-pressed')).toBe('true')
  await act(async () => vi.advanceTimersByTimeAsync(1200))
  expect(screen.getByLabelText('Nilo 的投影，尚未加入画作')).toBeTruthy()
  expect(operations().map(operation => operation.owner)).toEqual(['child', 'child'])
  fireEvent.click(screen.getByRole('button', { name: '留下来' }))
  expect(operations().some(operation => operation.owner === 'nilo')).toBe(true)
  expect(screen.getByRole('button', { name: '开启背景音乐' })).toBeTruthy()
  expect(document.querySelector('canvas')).toBe(canvas)
})

test('a complete projection is temporary until accepted, and Nilo undo removes the whole contribution', async () => {
  const canvas = prepare(); draw(canvas)
  fireEvent.click(screen.getByRole('button', { name: '和 Nilo 一起画' }))
  await project()
  expect(operations().map(operation => operation.owner)).toEqual(['child'])
  expect(ink.get(canvas)).toEqual(new Set(['#20352f']))
  fireEvent.click(screen.getByRole('button', { name: '留下来' }))
  expect(screen.queryByLabelText('Nilo 的投影，尚未加入画作')).toBeNull()
  const contribution = operations().filter(operation => operation.owner === 'nilo')
  expect(contribution.length).toBeGreaterThan(1)
  expect(new Set(contribution.map(operation => operation.groupId)).size).toBe(1)
  expect(ink.get(canvas)).toEqual(new Set(['#20352f', '#4aa5d8']))
  fireEvent.click(screen.getByRole('button', { name: '撤销', exact: true }))
  expect(operations().map(operation => operation.owner)).toEqual(['child'])
  expect(ink.get(canvas)).toEqual(new Set(['#20352f']))
})

test('drag and resize a colored preview, then save and reopen exactly the chosen position and size',async()=>{
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
  fireEvent.click(screen.getByRole('button',{name:'留下来'}))
  const contribution=operations().filter(op=>op.type==='stroke'&&op.owner==='nilo')
  const selected=contribution[0].type==='stroke'?contribution[0].object!.proposals[0]:null
  expect(selected?.x).toBeCloseTo(.4);expect(selected?.y).toBeCloseTo(.35)
  expect(selected!.width/selected!.height).toBeCloseTo(.15/.25)
  expect(selected!.width).toBeGreaterThan(.15);expect(selected?.color).toBe('#ab6986')
  await act(async()=>fireEvent.click(screen.getByRole('button',{name:'保存'})))
  cleanup();clearChildDraft();prepare();fireEvent.click(screen.getByRole('button',{name:'继续上次画布'}))
  expect(operations().filter(op=>op.owner==='nilo')).toEqual(contribution)
  fireEvent.click(screen.getByRole('button',{name:'撤销',exact:true}))
  expect(operations()).toEqual(child)
})

test('four projected elements commit and save as one contribution; the next turn sees both authors and undo removes all additions', async () => {
  const colors = ['#4aa5d8', '#d74952', '#168a78', '#edcd70']
  const elements = [[.18, .16], [.62, .16], [.18, .61], [.62, .61]].map(([x, y], index) => ({
    ...proposed.proposal!, template: 'sun' as const, x, y, width: .17, height: .22,
    color: colors[index], brushKind: 'pencil' as const, strokeWidth: 3,
  }))
  companionReply = () => Promise.resolve({ ...proposed, proposal: elements[0], additions: elements.slice(1) })
  const canvas = prepare(); draw(canvas)
  const childOperations = [...operations()]
  fireEvent.click(screen.getByRole('button', { name: '和 Nilo 一起画' }))
  await project()
  const previewColors = new Set<string>()
  document.querySelectorAll<HTMLCanvasElement>('.nilo-projection canvas').forEach(preview => ink.get(preview)?.forEach(color => previewColors.add(color)))
  expect(previewColors).toEqual(new Set(colors))
  expect(operations()).toEqual(childOperations)
  expect(ink.get(canvas)).toEqual(new Set(['#20352f']))
  fireEvent.click(screen.getByRole('button', { name: '留下来' }))
  const contribution = operations().filter(operation => operation.owner === 'nilo')
  expect(contribution).toHaveLength(36) // Four complete suns exceed the former 32-path limit.
  expect(new Set(contribution.map(operation => operation.groupId)).size).toBe(1)
  expect(ink.get(canvas)).toEqual(new Set(['#20352f', ...colors]))
  await act(async () => fireEvent.click(screen.getByRole('button', { name: '保存' })))
  const saved: Artwork = JSON.parse(localStorage.getItem('luma_guest_artworks_v1')!)[0]
  expect(saved.document?.operations.filter(operation => operation.owner === 'nilo')).toHaveLength(36)
  expect(saved.provenance).toBe('co-created')

  companionReply = () => Promise.resolve({ status: 'clarify', reply: '看到了我们一起画的内容。' })
  await act(async () => vi.advanceTimersByTimeAsync(1600))
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Nilo，你来画' })))
  const body = requests().at(-1)![1]?.body as { imageBase64: string; context: { imageProvenance: string; canvasSize: unknown; scene: { recentContributions: { owner: string; strokeCount: number }[] } } }
  expect(JSON.parse(atob(body.imageBase64))).toEqual(['#20352f', ...colors].sort())
  expect(body.context.imageProvenance).toBe('composite')
  expect(body.context.canvasSize).toEqual({ width: 320, height: 240 })
  expect(body.context.scene.recentContributions.map(group => ({ owner: group.owner, strokeCount: group.strokeCount })))
    .toEqual([{ owner: 'child', strokeCount: 1 }, { owner: 'nilo', strokeCount: 36 }])
  expect(JSON.stringify(body.context.scene)).not.toMatch(/groupId|points|referenceWidth/)
  // No local fallback was inserted, so one undo removes the previous Nilo group.
  fireEvent.click(screen.getByRole('button', { name: '撤销', exact: true }))
  expect(operations()).toEqual(childOperations)
  expect(ink.get(canvas)).toEqual(new Set(['#20352f']))
})

test('voice-requested custom paths preview, reopen losslessly and undo without contaminating child analysis', async () => {
  localStorage.setItem('luma_companion_mode:guest-child', 'together')
  const speak = vi.fn()
  vi.stubGlobal('speechSynthesis', { speak, cancel: vi.fn() })
  vi.stubGlobal('SpeechSynthesisUtterance', class { text: string; constructor(text: string) { this.text = text } })
  companionReply = () => Promise.resolve({ status: 'ready', reply: '机器人、火箭和恐龙，先给你看看。',
    proposal: customSketchExamples[0], additions: customSketchExamples.slice(1) })
  const canvas = prepare(); draw(canvas)
  const childOperations = structuredClone(operations())
  await project()
  expect(operations()).toEqual(childOperations)
  expect(ink.get(canvas)).toEqual(new Set(['#20352f']))
  const preview = document.querySelector<HTMLCanvasElement>('.nilo-projection canvas')!
  expect(ink.get(preview)).toEqual(new Set(customSketchExamples.map(item => item.color)))
  fireEvent.click(screen.getByRole('button', { name: '留下来' }))
  const contribution = operations().filter(operation => operation.owner === 'nilo')
  expect(contribution).toHaveLength(24)
  expect(new Set(contribution.map(operation => operation.groupId)).size).toBe(1)
  for (const example of customSketchExamples) {
    const parts = contribution.filter(operation => operation.type === 'stroke' && operation.color === example.color)
    expect(parts).toHaveLength(example.sketch!.paths.length)
    expect(parts.every(operation => operation.type === 'stroke' && operation.brushKind === example.brushKind)).toBe(true)
  }
  await act(async () => fireEvent.click(screen.getByRole('button', { name: '保存' })))
  const saved: Artwork = JSON.parse(localStorage.getItem('luma_guest_artworks_v1')!)[0]
  const accepted = structuredClone(operations())
  expect(saved.document?.operations).toEqual(accepted)
  expect(saved.provenance).toBe('co-created')
  cleanup(); clearChildDraft()
  prepare(`/child/create?artwork=${encodeURIComponent(saved.id)}`)
  await act(async () => {})
  expect(operations()).toEqual(accepted)
  const reopened = screen.getByLabelText('自由绘画画布') as HTMLCanvasElement
  expect(ink.get(reopened)).toEqual(new Set(['#20352f', ...customSketchExamples.map(item => item.color)]))
  await act(async () => fireEvent.click(screen.getByRole('button', { name: '完成' })))
  const [image, , , , provenance, display] = vi.mocked(analyzeDrawing).mock.calls[0]
  expect(JSON.parse(atob(image))).toEqual(['#20352f'])
  expect(provenance).toBe('co-created')
  expect(JSON.parse(atob(display!.displayImageBase64!))).toEqual(['#20352f', ...customSketchExamples.map(item => item.color)].sort())
  fireEvent.click(screen.getByRole('button', { name: '撤销', exact: true }))
  expect(operations()).toEqual(childOperations)
  expect(ink.get(reopened)).toEqual(new Set(['#20352f']))
  expect(speak).not.toHaveBeenCalled()
  expect(requests()).toHaveLength(1)
})

test('dismissing a projection and saving it never adds the projected content to the document or image', async () => {
  const canvas = prepare(); draw(canvas)
  fireEvent.click(screen.getByRole('button', { name: '和 Nilo 一起画' }))
  await project()
  fireEvent.click(screen.getByRole('button', { name: '先不要' }))
  expect(operations().map(operation => operation.owner)).toEqual(['child'])
  await act(async () => fireEvent.click(screen.getByRole('button', { name: '保存' })))
  const saved: Artwork = JSON.parse(localStorage.getItem('luma_guest_artworks_v1')!)[0]
  expect(saved.document?.operations.map(operation => operation.owner)).toEqual(['child'])
  expect(JSON.parse(atob(saved.image.split(',')[1]))).toEqual(['#20352f'])
})

test('drawing removes a visible projection and invalidates a pending response', async () => {
  const canvas = prepare(); draw(canvas)
  fireEvent.click(screen.getByRole('button', { name: '和 Nilo 一起画' }))
  await project()
  draw(canvas)
  expect(screen.queryByRole('button', { name: '留下来' })).toBeNull()
  await act(async () => vi.advanceTimersByTimeAsync(1600))
  let finish!: (reply: CompanionReply) => void
  companionReply = () => new Promise(resolve => { finish = resolve })
  fireEvent.click(screen.getByRole('button', { name: 'Nilo，你来画' }))
  const pending = requests().at(-1)![1]
  draw(canvas)
  expect(pending?.signal?.aborted).toBe(true)
  await act(async () => { finish(proposed); await vi.advanceTimersByTimeAsync(600) })
  expect(screen.queryByLabelText('Nilo 的投影，尚未加入画作')).toBeNull()
  expect(operations().every(operation => operation.owner === 'child')).toBe(true)
})

test('finish saves both authors and sends only the child image with co-created provenance for analysis', async () => {
  const canvas = prepare(); draw(canvas)
  fireEvent.click(screen.getByRole('button', { name: '和 Nilo 一起画' }))
  await project()
  fireEvent.click(screen.getByRole('button', { name: '留下来' }))
  await act(async () => fireEvent.click(screen.getByRole('button', { name: '完成' })))
  const saved: Artwork = JSON.parse(localStorage.getItem('luma_guest_artworks_v1')!)[0]
  expect(saved.document?.version).toBe(1)
  expect(new Set(saved.document?.operations.map(operation => operation.owner))).toEqual(new Set(['child', 'nilo']))
  expect(saved.provenance).toBe('co-created')
  expect(JSON.parse(atob(saved.image.split(',')[1]))).toEqual(['#20352f', '#4aa5d8'])
  expect(analyzeDrawing).toHaveBeenCalledOnce()
  const [image, prior, token, submission, provenance] = vi.mocked(analyzeDrawing).mock.calls[0]
  expect(JSON.parse(atob(image))).toEqual(['#20352f'])
  expect(prior).toBeNull(); expect(token).toBeUndefined(); expect(submission).toBeTruthy(); expect(provenance).toBe('co-created')
})

test('without a microphone, clicking Nilo draws one undoable contribution directly', async () => {
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
  expect(screen.getByLabelText('Nilo 正在画，接着你的这一笔')).toBeTruthy()
  await act(async () => vi.advanceTimersByTimeAsync(1200))
  if(screen.queryByRole('button',{name:'留下来'}))fireEvent.click(screen.getByRole('button',{name:'留下来'}))
  const contribution = operations().filter(operation => operation.owner === 'nilo')
  expect(contribution.length).toBeGreaterThan(0)
  expect(new Set(contribution.map(op => op.groupId)).size).toBe(1)
  fireEvent.click(screen.getByRole('button', { name: '撤销', exact: true }))
  expect(operations().every(operation => operation.owner === 'child')).toBe(true)
})

test('a model-selected complete idea skips stock choices, previews without a microphone and undoes as one group',async()=>{
  vi.stubGlobal('SpeechRecognition',undefined)
  const canvas=prepare();draw(canvas);draw(canvas);draw(canvas)
  const before=JSON.stringify(operations())
  fireEvent.click(screen.getByRole('button',{name:'和 Nilo 一起画'}))
  companionReply=()=>Promise.resolve({reply:'添一个机器人',geometryReviewed:true,proposal:{...customSketchExamples[0],contribution:'object',placementPolicy:'free'}})
  await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Nilo，你来画'})))
  expect(screen.queryByRole('group',{name:'一起选个小主意'})).toBeNull()
  await act(async()=>vi.advanceTimersByTimeAsync(1200))
  expect(screen.getByLabelText('Nilo 的投影，尚未加入画作')).toBeTruthy()
  expect(JSON.stringify(operations())).toBe(before)
  fireEvent.click(screen.getByRole('button',{name:'留下来'}))
  const contribution=operations().filter(op=>op.owner==='nilo')
  expect(contribution.length).toBeGreaterThan(0)
  expect(new Set(contribution.map(op=>op.groupId)).size).toBe(1)
  expect(requests()).toHaveLength(1)
  fireEvent.click(screen.getByRole('button',{name:'撤销',exact:true}))
  expect(JSON.stringify(operations())).toBe(before)
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
test('complete object requires confirmation; voice edits committed object locally, cancels safely, survives save and undo',async()=>{
  localStorage.setItem('luma_companion_mode:guest-child','together')
  const canvas=prepare();draw(canvas)
  const original=structuredClone(operations())
  companionReply=async()=>({reply:'在树旁画一只松鼠',geometryReviewed:true,proposal:{template:'custom',subject:'松鼠',contribution:'object',recipeId:'squirrel-1',sketch:getDrawingRecipe('squirrel-1')!.sketch,x:.6,y:.5,width:.25,height:.3,rotation:0,color:'#203b34',strokeWidth:3,brushKind:'pencil',target:'树',relation:'树旁的小伙伴'}})
  await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Nilo，你来画'})))
  await act(async()=>vi.advanceTimersByTimeAsync(1200))
  expect(operations()).toEqual(original)
  expect(screen.getByLabelText('Nilo 的投影，尚未加入画作')).toBeTruthy()
  fireEvent.click(screen.getByRole('button',{name:'留下来'}))
  const accepted=structuredClone(operations()),niloId=accepted.find(op=>op.owner==='nilo')!.groupId
  expect(accepted.filter(op=>op.owner==='nilo').length).toBeGreaterThan(4)
  await sayToNilo('把松鼠改成蓝色')
  expect(requests()).toHaveLength(1)
  expect(operations()).toEqual(accepted)
  expect(screen.getByRole('button',{name:'确认修改'})).toBeTruthy()
  fireEvent.click(screen.getByRole('button',{name:'先不要'}))
  expect(operations()).toEqual(accepted)
  await sayToNilo('把松鼠改成蓝色')
  fireEvent.click(screen.getByRole('button',{name:'确认修改'}))
  const edited=getChildDraft('guest-child').canvas.document!
  expect(edited.operations.at(-1)).toMatchObject({type:'edit',targetId:niloId})
  expect(visibleOperations(edited).filter(op=>op.owner==='child')).toEqual(original)
  expect(visibleOperations(edited).filter(op=>op.type==='stroke'&&op.owner==='nilo').every(op=>op.type==='stroke'&&op.color==='#459fd1')).toBe(true)
  await act(async()=>fireEvent.click(screen.getByRole('button',{name:'保存'})))
  const saved:Artwork=JSON.parse(localStorage.getItem('luma_guest_artworks_v1')!)[0]
  expect(saved.document).toEqual(edited)
  cleanup();clearChildDraft();prepare()
  fireEvent.click(screen.getByRole('button',{name:'继续上次画布'}))
  await sayToNilo('刚才那个小一点')
  expect(screen.getByRole('button',{name:'确认修改'})).toBeTruthy()
  fireEvent.click(screen.getByRole('button',{name:'先不要'}))
  fireEvent.click(screen.getByRole('button',{name:'撤销',exact:true}))
  expect(operations()).toEqual(accepted)
})
