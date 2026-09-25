import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { MaterialPicker } from '@/features/child/components/MaterialPicker'
import { listMaterialSubjects } from '../../shared/niloMaterialLibrary.mjs'
import { getMaterialCuration, setMaterialCuration } from '../../shared/niloCuration.mjs'

afterEach(cleanup)

test('opens on the concrete subject with real SVG previews and changes nothing until a card is chosen', () => {
  const choose = vi.fn(), close = vi.fn()
  render(<MaterialPicker subjects={listMaterialSubjects()} initialSubject="cat" currentMaterialId="cat-0" onChoose={choose} onClose={close} />)
  expect(screen.getByRole('heading', { name: '小猫' })).toBeTruthy()
  const options = screen.getByRole('region', { name: '可选画法' })
  expect(options.querySelector('svg polyline')?.getAttribute('points')?.length).toBeGreaterThan(20)
  expect(choose).not.toHaveBeenCalled()
  fireEvent.click(within(options).getByRole('button', { name: '选择小猫画法 2' }))
  expect(choose).toHaveBeenCalledWith('cat-2')
  expect(choose).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('button', { name: '关闭，不换底图' }))
  expect(close).toHaveBeenCalledOnce()
})

test('search finds a concrete subject alias and displays real raster choices without professional style labels', () => {
  const choose = vi.fn()
  render(<MaterialPicker subjects={listMaterialSubjects()} initialSubject="cat" onChoose={choose} onClose={() => {}} />)
  fireEvent.change(screen.getByLabelText('找找想画什么'), { target: { value: '校舍' } })
  expect(screen.getByRole('heading', { name: '学校' })).toBeTruthy()
  const options = screen.getByRole('region', { name: '可选画法' })
  expect(options.querySelector('img')?.getAttribute('src')).toBe('/nilo-illustrations/illustration-library-school-beginner-01.png')
  expect(options.textContent).toContain('线条少一些')
  expect(options.textContent).toContain('细节多一些')
  expect(options.textContent).not.toMatch(/realistic|storybook|写实|精美/)
  expect(choose).not.toHaveBeenCalled()
  fireEvent.click(within(options).getAllByRole('button')[0])
  expect(choose).toHaveBeenCalledWith('illustration-library-school-beginner-01')
})

test('rejected materials stay out of the picker and no search match has a useful empty state', () => {
  const previous = getMaterialCuration()
  try {
    const originalCount = listMaterialSubjects().find(item => item.subject === 'cat')!.materials.length
    setMaterialCuration({ version: 1, decisions: { 'cat-2': 'reject' } })
    render(<MaterialPicker subjects={listMaterialSubjects()} initialSubject="cat" onChoose={() => {}} onClose={() => {}} />)
    expect(within(screen.getByRole('region', { name: '可选画法' })).getAllByRole('button')).toHaveLength(originalCount - 1)
    fireEvent.change(screen.getByLabelText('找找想画什么'), { target: { value: 'not-a-drawing-subject' } })
    expect(screen.getByRole('status').textContent).toContain('换个词')
  } finally { setMaterialCuration(previous) }
})

test('keyboard focus stays in the dialog, Escape closes it, and focus returns to the opener', () => {
  const opener = document.createElement('button'); opener.textContent = 'open'; document.body.appendChild(opener); opener.focus()
  const close = vi.fn()
  const view = render(<MaterialPicker subjects={listMaterialSubjects().filter(item => item.subject === 'cat').map(item => ({ ...item, materials: item.materials.filter(material => ['cat-0', 'cat-2'].includes(material.id)) }))} initialSubject="cat" onChoose={() => {}} onClose={close} />)
  const dialog = screen.getByRole('dialog')
  expect(document.activeElement).toBe(dialog)
  fireEvent.keyDown(dialog, { key: 'Tab' })
  expect(document.activeElement).toBe(screen.getByRole('button', { name: '关闭，不换底图' }))
  fireEvent.keyDown(document.activeElement!, { key: 'Tab', shiftKey: true })
  expect(document.activeElement).toBe(screen.getByRole('button', { name: '选择小猫画法 2' }))
  fireEvent.keyDown(dialog, { key: 'Escape' })
  expect(close).toHaveBeenCalledOnce()
  view.unmount()
  expect(document.activeElement).toBe(opener)
  expect(opener.inert).not.toBe(true)
  opener.remove()
})
