import { afterEach, expect, test, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'

import { encourageLines } from '@/features/child/components/otter'
import { useIdleEncouragement } from '@/features/child/hooks/useIdleEncouragement'

function Harness({ describe }: { describe?: () => { praise: string; suggestion: string } } = {}) {
  const { line, lineKind, onStrokeStart, onStrokeEnd } = useIdleEncouragement({ idleDelayMs: 1000, minGapMs: 3000, describe })
  return (
    <div>
      <span data-testid="line">{line ?? '-'}</span>
      <span data-testid="kind">{lineKind}</span>
      <button type="button" onClick={onStrokeStart}>start</button>
      <button type="button" onClick={onStrokeEnd}>end</button>
    </div>
  )
}

function useFakeClock() {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

test('停笔一小会儿之后才说一句鼓励语', () => {
  useFakeClock()
  render(<Harness />)
  fireEvent.click(screen.getByText('end'))
  act(() => { vi.advanceTimersByTime(999) })
  expect(screen.getByTestId('line').textContent).toBe('-')
  act(() => { vi.advanceTimersByTime(1) })
  expect(screen.getByTestId('line').textContent).toBe(encourageLines[0])
})

test('连续作画时保持安静，重新落笔会取消待说的话', () => {
  useFakeClock()
  render(<Harness />)
  fireEvent.click(screen.getByText('end'))
  act(() => { vi.advanceTimersByTime(600) })
  fireEvent.click(screen.getByText('start'))
  fireEvent.click(screen.getByText('end'))
  act(() => { vi.advanceTimersByTime(900) })
  expect(screen.getByTestId('line').textContent).toBe('-')
  act(() => { vi.advanceTimersByTime(100) })
  expect(screen.getByTestId('line').textContent).toBe(encourageLines[0])
})

test('夸奖与建议交替出现：第一次夸，第二次给建议', () => {
  useFakeClock()
  render(<Harness />)
  fireEvent.click(screen.getByText('end'))
  act(() => { vi.advanceTimersByTime(1000) })
  const first = screen.getByTestId('line').textContent
  expect(first).toBe(encourageLines[0])

  fireEvent.click(screen.getByText('start'))
  fireEvent.click(screen.getByText('end'))
  // 距上一句还没到最小间隔：先不说话
  act(() => { vi.advanceTimersByTime(1000) })
  expect(screen.getByTestId('line').textContent).toBe('-')
  // 间隔满 3s 后自动顺延说下一句
  act(() => { vi.advanceTimersByTime(2000) })
  const second = screen.getByTestId('line').textContent
  expect(screen.getByTestId('kind').textContent).toBe('suggestion')
  expect(second).not.toBe(first)
  expect(second && second.length).toBeGreaterThan(0)
})

test('本地分析可用时，夸奖和建议都来自"看孩子这一笔"的结果', () => {
  useFakeClock()
  render(<Harness describe={() => ({ praise: '这条线弯弯的，好像一条小路～', suggestion: '可以试着画一条小鱼。' })} />)
  fireEvent.click(screen.getByText('end'))
  act(() => { vi.advanceTimersByTime(1000) })
  expect(screen.getByTestId('line').textContent).toBe('这条线弯弯的，好像一条小路～')
  expect(screen.getByTestId('kind').textContent).toBe('praise')

  fireEvent.click(screen.getByText('start'))
  fireEvent.click(screen.getByText('end'))
  act(() => { vi.advanceTimersByTime(3000) })
  expect(screen.getByTestId('line').textContent).toBe('可以试着画一条小鱼。')
  expect(screen.getByTestId('kind').textContent).toBe('suggestion')
})

test('鼓励语库足够丰富，覆盖多种表达', () => {
  expect(encourageLines.length).toBeGreaterThanOrEqual(12)
  expect(new Set(encourageLines).size).toBe(encourageLines.length)
})
