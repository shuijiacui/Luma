import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { ChildCreatePage } from '@/features/child/pages/ChildCreatePage'
import { clearChildDraft, getChildDraft } from '@/features/child/draft'
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
let ink: WeakMap<HTMLCanvasElement, Set<string>>
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
  vi.clearAllMocks()
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
const requests = () => vi.mocked(authFetch).mock.calls.filter(([path]) => path === '/nilo/companion')
const operations = () => getChildDraft('guest-child').canvas.document!.operations
async function project() {
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Nilo，你来画' })))
  expect(screen.getByText('我画好一个小主意，先放给你看看。')).toBeTruthy()
  expect(screen.queryByLabelText('Nilo 的投影，尚未加入画作')).toBeNull()
  await act(async () => vi.advanceTimersByTimeAsync(550))
  expect(screen.getByLabelText('Nilo 的投影，尚未加入画作')).toBeTruthy()
}

test('Nilo handoff stays silent even when reply sound is enabled, and sends the child brush style', async () => {
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
  await project()
  const body = requests()[0][1]?.body as { context: { drawingStyle: unknown } }
  expect(body.context.drawingStyle).toEqual({ brushKind: 'crayon', color: '#d74952', brushSize: 9 })
  fireEvent.click(screen.getByRole('button', { name: '留下来' }))
  expect(operations().filter(op => op.type === 'stroke' && op.owner === 'nilo')).toEqual(expect.arrayContaining([expect.objectContaining({ brushKind: 'crayon', color: '#d74952', size: 9 })]))
  expect(speak).not.toHaveBeenCalled()
  expect(microphone).not.toHaveBeenCalled()
})

test('the microphone delivers a final child utterance into co-creation when cloud voice is unavailable', async () => {
  class Recognition {
    static current: Recognition
    onresult?: (event: { results: { isFinal: boolean; 0: { transcript: string } }[] }) => void
    onend?: () => void
    start = vi.fn(); stop = vi.fn(); abort = vi.fn()
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
    Recognition.current.onresult?.({ results: [{ isFinal: true, 0: { transcript: '这是小船，请帮我画水波' } }] })
    await Promise.resolve()
  })
  const body = requests()[0][1]?.body as { context: { utterance: string; requestDrawing: boolean } }
  expect(body.context.utterance).toBe('这是小船，请帮我画水波')
  expect(body.context.requestDrawing).toBe(true)
  await act(async () => vi.advanceTimersByTimeAsync(550))
  expect(screen.getByText(/你说：这是小船，请帮我画水波/)).toBeTruthy()
  expect(screen.getByLabelText('Nilo 的投影，尚未加入画作')).toBeTruthy()
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

test('mode switching changes the invitation while preserving the canvas and keeping every stroke child-owned', async () => {
  const canvas = prepare(); draw(canvas)
  fireEvent.click(screen.getByRole('button', { name: '和 Nilo 一起画' }))
  expect((screen.getByRole('button', { name: 'Nilo，你来画' }) as HTMLButtonElement).disabled).toBe(false)
  draw(canvas)
  await act(async () => vi.advanceTimersByTimeAsync(60000))
  expect(requests()).toHaveLength(0)
  expect(operations().map(operation => operation.owner)).toEqual(['child', 'child'])
  fireEvent.click(screen.getByRole('button', { name: '我自己画' }))
  expect((screen.getByRole('button', { name: 'Nilo，你来画' }) as HTMLButtonElement).disabled).toBe(true)
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
  fireEvent.click(screen.getByRole('button', { name: '撤销 Nilo 的创作' }))
  expect(operations().map(operation => operation.owner)).toEqual(['child'])
  expect(ink.get(canvas)).toEqual(new Set(['#20352f']))
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
  fireEvent.click(screen.getByRole('button', { name: '撤销 Nilo 的创作' }))
  expect(operations()).toEqual(childOperations)
  expect(ink.get(canvas)).toEqual(new Set(['#20352f']))
})

test('custom robot, rocket and dinosaur paths remain preview-only, reopen losslessly, and undo together without contaminating child analysis or starting voice', async () => {
  localStorage.setItem('luma_companion_mode:guest-child', 'together')
  localStorage.setItem('luma:voice-sound:guest-child', 'on')
  const speak = vi.fn(), microphone = vi.fn()
  vi.stubGlobal('speechSynthesis', { speak, cancel: vi.fn() })
  vi.stubGlobal('SpeechSynthesisUtterance', class { text: string; constructor(text: string) { this.text = text } })
  vi.stubGlobal('SpeechRecognition', class { start = microphone; abort = vi.fn() })
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
  fireEvent.click(screen.getByRole('button', { name: '撤销 Nilo 的创作' }))
  expect(operations()).toEqual(childOperations)
  expect(ink.get(reopened)).toEqual(new Set(['#20352f']))
  expect(speak).not.toHaveBeenCalled()
  expect(microphone).not.toHaveBeenCalled()
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

test('without a microphone, invitation and local projection controls still edit and accept a contribution', async () => {
  const canvas = prepare(); draw(canvas)
  fireEvent.click(screen.getByRole('button', { name: '和 Nilo 一起画' }))
  await act(async () => {})
  expect(screen.getByRole('button', { name: '和 Nilo 说话' }).hasAttribute('disabled')).toBe(false)
  fireEvent.click(screen.getByRole('button', { name: '和 Nilo 说话' }))
  expect(screen.getByText('这个浏览器暂时不能听你说话，可以换个浏览器，或用按钮继续。')).toBeTruthy()
  expect(screen.queryByRole('textbox')).toBeNull()
  await project()
  expect(requests()[0][1]?.body).toMatchObject({ context: { requestDrawing: true } })
  expect(screen.getByLabelText('Nilo 的投影，尚未加入画作')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '调整' }))
  fireEvent.click(screen.getByRole('button', { name: '向左' }))
  fireEvent.click(screen.getByRole('button', { name: '小一点' }))
  fireEvent.change(screen.getByLabelText('投影颜色'), { target: { value: '#d74952' } })
  expect(operations().every(operation => operation.owner === 'child')).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: '留下来' }))
  expect(requests()).toHaveLength(1)
  const contribution = operations().filter(operation => operation.owner === 'nilo')
  expect(contribution.length).toBeGreaterThan(0)
  expect(contribution.every(operation => operation.type === 'stroke' && operation.color === '#d74952')).toBe(true)
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
